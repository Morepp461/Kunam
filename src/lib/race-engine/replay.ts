import type { RaceStartSnapshot } from "./contracts";

export interface RaceReplayEvent {
  readonly sequence: number;
  readonly event_type: string;
  readonly driver_id: string | null;
  readonly lap_number: number;
  readonly simulation_time_ms: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RaceReplayMapPoint {
  readonly driverId: string;
  readonly driverName: string;
  readonly teamName: string;
  readonly position: number;
  readonly lapNumber: number;
  readonly segmentId: string;
  readonly distanceCompletedMeters: number;
  readonly simulationTimeMs: number;
  readonly x: number;
  readonly y: number;
}

export interface RaceReplayProjection {
  readonly sequence: number;
  readonly layout: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly points: readonly RaceReplayMapPoint[];
}

/**
 * Rebuilds replay markers from committed segment-completion events.
 * This is intentionally segment-resolution playback, not GPS or continuous telemetry.
 */
export function buildRaceReplayProjection(
  snapshot: RaceStartSnapshot,
  events: readonly RaceReplayEvent[],
  cursor: number
): RaceReplayProjection {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= events.length) {
    throw new RangeError("Replay cursor is outside the persisted event timeline");
  }

  const circuit = snapshot.circuit;
  if (!circuit || circuit.layout.length < 2 || circuit.segments.length === 0) {
    throw new Error("Replay requires a circuit layout and segment geometry");
  }
  if (!Number.isFinite(circuit.trackLengthMeters) || circuit.trackLengthMeters <= 0) {
    throw new Error("Replay circuit length must be positive");
  }

  const pathLengths = circuit.layout.slice(1).map((point, index) =>
    Math.hypot(point.x - circuit.layout[index].x, point.y - circuit.layout[index].y)
  );
  const pathLength = pathLengths.reduce((total, length) => total + length, 0);
  if (!Number.isFinite(pathLength) || pathLength <= 0) {
    throw new Error("Replay circuit layout must have a positive path length");
  }

  const segmentOffsets = new Map<string, { start: number; distance: number }>();
  let segmentDistance = 0;
  for (const segment of circuit.segments) {
    if (!segment.id.trim() || segmentOffsets.has(segment.id)) {
      throw new Error("Replay circuit segment IDs must be present and unique");
    }
    if (!Number.isFinite(segment.distanceMeters) || segment.distanceMeters <= 0) {
      throw new Error("Replay circuit segment distances must be positive");
    }
    segmentOffsets.set(segment.id, { start: segmentDistance, distance: segment.distanceMeters });
    segmentDistance += segment.distanceMeters;
  }
  if (Math.abs(segmentDistance - circuit.trackLengthMeters) > Math.max(1, circuit.trackLengthMeters * 0.001)) {
    throw new Error("Replay segment distances do not match the circuit length");
  }

  const entrants = new Map(snapshot.entrants.map((entrant, index) => [
    entrant.driverId,
    {
      driverName: entrant.driverNameSnapshot,
      teamName: entrant.teamNameSnapshot,
      gridPosition: entrant.startingGridPosition ?? index + 1
    }
  ]));
  const latestProgress = new Map<string, {
    distance: number;
    lapNumber: number;
    segmentId: string;
    simulationTimeMs: number;
  }>();

  let previousSequence = 0;
  for (const event of events.slice(0, cursor + 1)) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= previousSequence) {
      throw new Error("Replay event sequence must be strictly increasing");
    }
    previousSequence = event.sequence;
    if (event.event_type !== "segment_completed") continue;

    const driverId = event.driver_id;
    if (!driverId || !entrants.has(driverId)) {
      throw new Error("Replay segment event references an unknown driver");
    }
    if (!Number.isInteger(event.lap_number) || event.lap_number < 1) {
      throw new Error("Replay segment event has an invalid lap number");
    }
    if (!Number.isFinite(event.simulation_time_ms) || event.simulation_time_ms < 0) {
      throw new Error("Replay segment event has an invalid simulation timestamp");
    }
    const segmentId = typeof event.payload.segmentId === "string" ? event.payload.segmentId : "";
    const segment = segmentOffsets.get(segmentId);
    if (!segment) throw new Error("Replay segment event references unknown circuit geometry");

    const distance = (event.lap_number - 1) * circuit.trackLengthMeters + segment.start + segment.distance;
    const previous = latestProgress.get(driverId);
    if (previous && distance < previous.distance) {
      throw new Error("Replay driver distance cannot move backwards");
    }
    latestProgress.set(driverId, {
      distance,
      lapNumber: event.lap_number,
      segmentId,
      simulationTimeMs: event.simulation_time_ms
    });
  }

  const resolvePoint = (distanceCompletedMeters: number) => {
    const lapDistance = (distanceCompletedMeters % circuit.trackLengthMeters) / circuit.trackLengthMeters * pathLength;
    let traversed = 0;
    for (let index = 0; index < pathLengths.length; index += 1) {
      const length = pathLengths[index];
      const start = circuit.layout[index];
      const end = circuit.layout[index + 1];
      if (lapDistance <= traversed + length || index === pathLengths.length - 1) {
        const ratio = length > 0 ? Math.min(1, Math.max(0, (lapDistance - traversed) / length)) : 0;
        return {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio
        };
      }
      traversed += length;
    }
    return { x: circuit.layout[0].x, y: circuit.layout[0].y };
  };

  const ranked = [...latestProgress.entries()].sort(([driverA, a], [driverB, b]) => {
    if (a.distance !== b.distance) return b.distance - a.distance;
    if (a.simulationTimeMs !== b.simulationTimeMs) return a.simulationTimeMs - b.simulationTimeMs;
    return (entrants.get(driverA)?.gridPosition ?? Number.MAX_SAFE_INTEGER) -
      (entrants.get(driverB)?.gridPosition ?? Number.MAX_SAFE_INTEGER);
  });

  const points = ranked.map(([driverId, progress], index) => {
    const entrant = entrants.get(driverId)!;
    const position = resolvePoint(progress.distance);
    return Object.freeze({
      driverId,
      driverName: entrant.driverName,
      teamName: entrant.teamName,
      position: index + 1,
      lapNumber: progress.lapNumber,
      segmentId: progress.segmentId,
      distanceCompletedMeters: progress.distance,
      simulationTimeMs: progress.simulationTimeMs,
      x: position.x,
      y: position.y
    });
  });

  return Object.freeze({
    sequence: events[cursor].sequence,
    layout: Object.freeze(circuit.layout.map((point) => Object.freeze({
      id: point.id,
      x: point.x,
      y: point.y
    }))),
    points: Object.freeze(points)
  });
}
