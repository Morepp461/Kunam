export interface ReplayScenePoint {
  readonly x: number;
  readonly z: number;
  readonly headingRadians: number;
}

/**
 * Maps normalized replay coordinates onto the flat 3D schematic and estimates
 * heading from the nearest centerline edge. Segment IDs and layout-point IDs
 * are separate namespaces, so heading must not join them by identifier.
 */
export function projectReplayScenePoint(
  layout: readonly { readonly id: string; readonly x: number; readonly y: number }[],
  point: { readonly x: number; readonly y: number }
): ReplayScenePoint {
  if (layout.length < 2 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Replay scene requires finite coordinates and a circuit path");
  }
  let bestDistance = Number.POSITIVE_INFINITY;
  let headingRadians = 0;
  for (let index = 0; index < layout.length - 1; index += 1) {
    const start = layout[index];
    const end = layout[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) continue;
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const nearestX = start.x + ratio * dx;
    const nearestY = start.y + ratio * dy;
    const distance = (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      headingRadians = Math.atan2(dx, -dy);
    }
  }
  if (!Number.isFinite(bestDistance)) throw new Error("Replay circuit path has no usable edge");
  return Object.freeze({
    x: (point.x - 0.5) * 120,
    z: (point.y - 0.5) * 120,
    headingRadians
  });
}
