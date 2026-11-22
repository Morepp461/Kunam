export interface ReplayScenePoint {
  readonly x: number;
  readonly z: number;
  readonly headingRadians: number;
}

/** Converts normalized circuit-map coordinates to the viewer's flat 3D plane. */
export function projectReplayScenePoint(
  layout: readonly { readonly id: string; readonly x: number; readonly y: number }[],
  point: { readonly x: number; readonly y: number; readonly segmentId: string }
): ReplayScenePoint {
  if (layout.length < 2 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Replay scene requires finite coordinates and a circuit path");
  }
  const index = layout.findIndex((entry) => entry.id === point.segmentId);
  if (index < 0) throw new Error("Replay scene point references an unknown segment");
  const start = layout[index];
  const end = layout[Math.min(index + 1, layout.length - 1)];
  const dx = end.x - start.x;
  const dz = -(end.y - start.y);
  return Object.freeze({
    x: (point.x - 0.5) * 120,
    z: (point.y - 0.5) * 120,
    headingRadians: Math.atan2(dx, dz)
  });
}
