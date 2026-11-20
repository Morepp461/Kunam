import { describe, expect, it } from "vitest";
import { buildRaceTimingProjection } from "../../src/lib/race-engine/projection";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";

describe("Race timing projection", () => {
  it("builds a versioned read model from checkpoint state without inventing telemetry", () => {
    const simulation = new RaceSimulation(createSyntheticRaceFixture({
      seed: 2201, driverCount: 6, teamCount: 3, totalLaps: 2
    }));
    simulation.advanceOneSegment();
    const projection = buildRaceTimingProjection(
      simulation.createCheckpoint(),
      simulation.classification,
      "2026-11-20T10:00:00.000Z"
    );
    expect(projection).toMatchObject({
      schemaVersion: 1,
      raceId: simulation.snapshot.raceId,
      engineVersion: simulation.createCheckpoint().engineVersion,
      tick: 1,
      status: "running"
    });
    expect(projection.circuitLayout.length).toBeGreaterThanOrEqual(4);
    expect(projection.timingRows).toHaveLength(6);
    expect(projection.timingRows.every((row) =>
      row.trackPosition.x >= 0 && row.trackPosition.x <= 1 &&
      row.trackPosition.y >= 0 && row.trackPosition.y <= 1
    )).toBe(true);
    expect(projection.segmentTelemetry.length).toBeGreaterThan(0);
    expect(projection.segmentTelemetry.every((point) =>
      Number.isFinite(point.averageSpeedKph) && point.averageSpeedKph > 0 &&
      Number.isFinite(point.trackPositionMeters) && point.segmentDurationMs > 0
    )).toBe(true);
    expect(projection.timingRows.map((row) => row.position)).toEqual([1,2,3,4,5,6]);
    expect(projection.timingRows.every((row) =>
      Number.isFinite(row.elapsedMs) && Number.isFinite(row.segmentDistanceCompletedMeters)
    )).toBe(true);
    expect(projection).not.toHaveProperty("speedKph");
    expect(projection).not.toHaveProperty("throttlePercent");
    expect(projection.segmentTelemetry[0]).toHaveProperty("averageSpeedKph");
  });

  it("keeps the same race projection data deterministic across checkpoint restore", () => {
    const simulation = new RaceSimulation(createSyntheticRaceFixture({
      seed: 2202, driverCount: 4, teamCount: 2, totalLaps: 2
    }));
    for (let i = 0; i < 5; i += 1) simulation.advanceOneSegment();
    const checkpoint = simulation.createCheckpoint();
    const restored = RaceSimulation.restore(checkpoint);
    const first = buildRaceTimingProjection(checkpoint, simulation.classification, "2026-11-20T10:00:00.000Z");
    const second = buildRaceTimingProjection(restored.createCheckpoint(), restored.classification, "2026-11-20T10:00:00.000Z");
    expect(second).toEqual(first);
  });

  it("rejects missing, duplicate, or unknown classification entrants", () => {
    const simulation = new RaceSimulation(createSyntheticRaceFixture({
      seed: 2203, driverCount: 3, teamCount: 1, totalLaps: 1
    }));
    expect(() => buildRaceTimingProjection(
      simulation.createCheckpoint(), simulation.classification.slice(0, 2), "2026-11-20T10:00:00.000Z"
    )).toThrow(/every checkpoint entrant/i);
    expect(() => buildRaceTimingProjection(
      simulation.createCheckpoint(),
      [simulation.classification[0], simulation.classification[0], simulation.classification[2]],
      "2026-11-20T10:00:00.000Z"
    )).toThrow(/unknown or duplicate driver/i);
  });
});
