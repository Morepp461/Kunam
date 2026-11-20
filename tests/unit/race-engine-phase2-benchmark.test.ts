import { describe, expect, it } from "vitest";
import { RACE_ATTRIBUTE_DEFINITIONS } from "../../src/lib/race-engine/attributes";
import { createCalibratedPerformanceModel } from "../../src/lib/race-engine/calibration";
import type { RacePhysicsCalibrationProfile } from "../../src/lib/race-engine/calibration";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";

function benchmarkProfile(): RacePhysicsCalibrationProfile {
  const attributes: Record<string, Record<string, number>> = Object.fromEntries(
    RACE_ATTRIBUTE_DEFINITIONS.map((definition) => [
      definition.id,
      { segment_pace_ms_per_point: -0.001 }
    ])
  );
  attributes["driver.mistake_rate"] = { mistake_probability_per_point: 0.0001 };
  attributes["driver.overtake_skill"] = { overtake_advantage_per_point: -0.002 };
  attributes["driver.defensive_strength"] = { defense_advantage_per_point: 0.002 };
  attributes["car_team.ers_efficiency"] = { ers_efficiency_per_point: -0.001 };
  attributes["car_team.car_tyre_wear"] = { tyre_degradation_per_point: 0.001 };
  attributes["car_team.mechanical_grip"] = { wet_grip_per_point: -0.001 };
  return {
    schemaVersion: 2,
    attributeSchemaVersion: 1,
    id: "phase2-benchmark",
    version: "2.0.0",
    baselineAttributeValue: 50,
    battleDetectionGapMs: 2500,
    attributes,
    hqEffects: {}
  };
}

describe("Phase 2 full-grid simulation validation", () => {
  it("runs 1,000 seeded 25-driver/10-team races with calibrated performance and stable classifications", () => {
    const model = createCalibratedPerformanceModel(benchmarkProfile());
    const winnerCounts = new Map<string, number>();

    for (let seed = 1; seed <= 1000; seed += 1) {
      const snapshot = createSyntheticRaceFixture({
        seed,
        driverCount: 25,
        teamCount: 10,
        totalLaps: 1
      });
      const simulation = new RaceSimulation(snapshot, { performanceModel: model });
      const classification = simulation.runToCompletion();

      expect(simulation.status).toBe("completed");
      expect(classification).toHaveLength(25);
      expect(classification.every((entry) => entry.finished && !entry.retired && Number.isFinite(entry.elapsedMs))).toBe(true);
      expect(new Set(classification.map((entry) => entry.driverId)).size).toBe(25);
      expect(new Set(classification.map((entry) => entry.teamId)).size).toBe(10);
      winnerCounts.set(classification[0].driverId, (winnerCounts.get(classification[0].driverId) ?? 0) + 1);
    }

    expect(winnerCounts.size).toBeGreaterThan(1);
  });

  it("keeps two interleaved race sessions isolated and replay-equivalent to independent execution", () => {
    const model = createCalibratedPerformanceModel(benchmarkProfile());
    const firstSnapshot = createSyntheticRaceFixture({ seed: 2026, driverCount: 20, teamCount: 10, totalLaps: 3 });
    const secondSnapshot = createSyntheticRaceFixture({ seed: 2027, driverCount: 20, teamCount: 10, totalLaps: 3 });
    const firstInterleaved = new RaceSimulation(firstSnapshot, { performanceModel: model });
    const secondInterleaved = new RaceSimulation(secondSnapshot, { performanceModel: model });
    const firstIndependent = new RaceSimulation(firstSnapshot, { performanceModel: model });
    const secondIndependent = new RaceSimulation(secondSnapshot, { performanceModel: model });

    while (firstInterleaved.status !== "completed" || secondInterleaved.status !== "completed") {
      if (firstInterleaved.status !== "completed") firstInterleaved.advanceOneSegment();
      if (secondInterleaved.status !== "completed") secondInterleaved.advanceOneSegment();
    }
    firstIndependent.runToCompletion();
    secondIndependent.runToCompletion();

    expect(firstInterleaved.events).toEqual(firstIndependent.events);
    expect(firstInterleaved.classification).toEqual(firstIndependent.classification);
    expect(secondInterleaved.events).toEqual(secondIndependent.events);
    expect(secondInterleaved.classification).toEqual(secondIndependent.classification);
  });
});
