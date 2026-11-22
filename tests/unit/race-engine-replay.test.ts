import { describe, expect, it } from "vitest";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { buildRaceReplayProjection } from "../../src/lib/race-engine/replay";
import type { RaceReplayEvent } from "../../src/lib/race-engine/replay";

function segmentEvent(
  sequence: number,
  driverId: string,
  segmentId: string,
  simulationTimeMs: number
): RaceReplayEvent {
  return {
    sequence,
    event_type: "segment_completed",
    driver_id: driverId,
    lap_number: 1,
    simulation_time_ms: simulationTimeMs,
    payload: { segmentId }
  };
}

describe("Race Engine segment-level replay projection", () => {
  const snapshot = createSyntheticRaceFixture({
    seed: 23001,
    driverCount: 3,
    teamCount: 2,
    totalLaps: 2
  });

  it("rebuilds marker positions and classification at the selected event cursor", () => {
    const [first, second] = snapshot.circuit.segments;
    const [driverA, driverB] = snapshot.entrants;
    const events = [
      segmentEvent(1, driverA.driverId, first.id, 1000),
      segmentEvent(2, driverB.driverId, first.id, 1100),
      segmentEvent(3, driverA.driverId, second.id, 2000)
    ];

    const before = buildRaceReplayProjection(snapshot, events, 1);
    const after = buildRaceReplayProjection(snapshot, events, 2);

    expect(before.sequence).toBe(2);
    expect(before.points).toHaveLength(2);
    expect(before.points.map((point) => point.position)).toEqual([1, 2]);
    expect(after.points[0].driverId).toBe(driverA.driverId);
    expect(after.points[0].position).toBe(1);
    expect(after.points[0].segmentId).toBe(second.id);
    expect(after.points[0].distanceCompletedMeters).toBeGreaterThan(before.points[0].distanceCompletedMeters);
    expect(after.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
  });

  it("produces the same projection for the same snapshot, event history, and cursor", () => {
    const [segment] = snapshot.circuit.segments;
    const [driver] = snapshot.entrants;
    const events = [segmentEvent(1, driver.driverId, segment.id, 1000)];

    expect(buildRaceReplayProjection(snapshot, events, 0))
      .toEqual(buildRaceReplayProjection(snapshot, events, 0));
  });

  it("rejects a segment event that does not belong to the immutable circuit snapshot", () => {
    const [driver] = snapshot.entrants;
    const events = [segmentEvent(1, driver.driverId, "unknown-segment", 1000)];

    expect(() => buildRaceReplayProjection(snapshot, events, 0))
      .toThrow("unknown circuit geometry");
  });

  it("rejects duplicate or out-of-order event sequences", () => {
    const [segment] = snapshot.circuit.segments;
    const [driver] = snapshot.entrants;
    const events = [
      segmentEvent(2, driver.driverId, segment.id, 1000),
      segmentEvent(2, driver.driverId, segment.id, 2000)
    ];

    expect(() => buildRaceReplayProjection(snapshot, events, 1))
      .toThrow("strictly increasing");
  });
});
