import { describe, expect, it } from "vitest";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import type { SegmentPerformanceModel } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { createWeatherSimulationModel } from "../../src/lib/race-engine/weather";

const seededModel: SegmentPerformanceModel = {
  id: "test-driver-order",
  version: "1",
  snapshot: { model: "test-driver-order", version: 1 },
  calculateAdjustmentMs: ({ entrant }) => {
    const number = Number(entrant.driverId.split("-").at(-1));
    return number * 2;
  }
};

describe("Race simulation kernel", () => {
  it("creates the 20-driver, 10-team synthetic benchmark fixture", () => {
    const snapshot = createSyntheticRaceFixture();
    expect(snapshot.entrants).toHaveLength(20);
    expect(new Set(snapshot.entrants.map((entrant) => entrant.teamId)).size).toBe(10);
    expect(snapshot.entrants.filter((entrant) => entrant.teamId === "synthetic-team-01")).toHaveLength(2);
    expect(snapshot.circuit.segments).toHaveLength(9);
  });

  it("generates an identical fixture for the same seed", () => {
    expect(createSyntheticRaceFixture({ seed: 77 })).toEqual(createSyntheticRaceFixture({ seed: 77 }));
    expect(createSyntheticRaceFixture({ seed: 77 })).not.toEqual(createSyntheticRaceFixture({ seed: 78 }));
  });

  it("advances segment, sector, lap, and race events until the configured distance is complete", () => {
    const simulation = new RaceSimulation(createSyntheticRaceFixture({ totalLaps: 3 }), {
      performanceModel: seededModel
    });
    const classification = simulation.runToCompletion();

    expect(simulation.status).toBe("completed");
    expect(simulation.tick).toBe(27);
    expect(classification).toHaveLength(20);
    expect(classification.every((entry) => entry.finished && entry.lapCompleted === 3)).toBe(true);
    expect(simulation.events.filter((event) => event.type === "lap_completed")).toHaveLength(60);
    expect(simulation.events.filter((event) => event.type === "race_completed")).toHaveLength(20);
    expect(simulation.events.filter((event) => event.type === "sector_completed")).toHaveLength(180);
  });

  it("uses an injected versioned model for deterministic classification without hardcoding physics weights", () => {
    const simulation = new RaceSimulation(createSyntheticRaceFixture({ driverCount: 3, teamCount: 1, totalLaps: 1 }), {
      performanceModel: seededModel
    });
    const result = simulation.runToCompletion();
    expect(result.map((entry) => entry.driverId)).toEqual([
      "synthetic-driver-01",
      "synthetic-driver-02",
      "synthetic-driver-03"
    ]);
    expect(result[0].elapsedMs).toBeLessThan(result[2].elapsedMs);
  });

  it("resumes from a checkpoint with the exact same final events and classification", () => {
    const snapshot = createSyntheticRaceFixture({ seed: 999, totalLaps: 4 });
    const uninterrupted = new RaceSimulation(snapshot, {
      config: { noiseAmplitudeMs: 3 },
      performanceModel: seededModel
    });
    const resumed = new RaceSimulation(snapshot, {
      config: { noiseAmplitudeMs: 3 },
      performanceModel: seededModel
    });

    for (let index = 0; index < 11; index += 1) {
      uninterrupted.advanceOneSegment();
      resumed.advanceOneSegment();
    }

    const checkpoint = resumed.createCheckpoint();
    const restored = RaceSimulation.restore(checkpoint, seededModel);
    uninterrupted.runToCompletion();
    restored.runToCompletion();

    expect(restored.classification).toEqual(uninterrupted.classification);
    expect(restored.events).toEqual(uninterrupted.events);
  });


  it("advances one shared weather clock and restores weather state exactly from checkpoints", () => {
    const snapshot = createSyntheticRaceFixture({ seed: 42, driverCount: 4, teamCount: 2, totalLaps: 2 });
    const weatherModel = createWeatherSimulationModel({
      schemaVersion: 1,
      id: "test-rain",
      version: "1",
      waterRetentionMultiplier: 1,
      evaporationMmPerHourPerSurfaceDegree: 0,
      windDryingMmPerHourPerMps: 0,
      maximumWaterDepthMm: 10,
      gripLossPercentPerMmWater: 1,
      rubberingGripGainPercentAtFull: 0,
      minimumGripPercent: 0,
      maximumGripPercent: 100
    }, Object.fromEntries(snapshot.circuit.segments.map((segment) => [segment.id, {
      airTempC: 25,
      surfaceTempC: 25,
      relativeHumidityPercent: 80,
      rainfallMmPerHour: 36,
      windSpeedMps: 0,
      windDirectionDeg: 0,
      visibilityMeters: 10000,
      baseGripPercent: 90,
      rubberingInPercent: 0
    }])));
    const simulation = new RaceSimulation(snapshot, { weatherModel });
    expect(simulation.weatherState?.trackWaterDepthMm).toBe(0);
    simulation.advanceOneSegment();
    expect(simulation.weatherState?.trackWaterDepthMm).toBeCloseTo(0.144, 8);
    const checkpoint = simulation.createCheckpoint();
    const restored = RaceSimulation.restore(checkpoint, undefined, undefined, weatherModel);
    expect(restored.weatherState).toEqual(simulation.weatherState);
    simulation.runToCompletion();
    restored.runToCompletion();
    expect(restored.events).toEqual(simulation.events);
    expect(restored.classification).toEqual(simulation.classification);
    expect(restored.weatherState).toEqual(simulation.weatherState);
  });

  it("does not mutate the input snapshot and keeps stable tie ordering", () => {
    const snapshot = createSyntheticRaceFixture({ driverCount: 4, teamCount: 2, totalLaps: 1 });
    const before = JSON.stringify(snapshot);
    const simulation = new RaceSimulation(snapshot);
    simulation.runToCompletion();

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(simulation.classification.map((entry) => entry.driverId)).toEqual([
      "synthetic-driver-01",
      "synthetic-driver-02",
      "synthetic-driver-03",
      "synthetic-driver-04"
    ]);
  });

  it("rolls back the entire segment tick if a model fails for one entrant", () => {
    let calls = 0;
    const unstableModel: SegmentPerformanceModel = {
      id: "atomic-test",
      version: "1",
      snapshot: { model: "atomic-test", version: 1 },
      calculateAdjustmentMs: () => {
        calls += 1;
        if (calls === 3) throw new Error("injected model failure");
        return 0;
      }
    };
    const simulation = new RaceSimulation(createSyntheticRaceFixture({ driverCount: 4, teamCount: 2 }), {
      config: { noiseAmplitudeMs: 5 },
      performanceModel: unstableModel
    });
    const beforeStates = simulation.entrantStates;
    const beforeEvents = simulation.events;
    const beforeRandom = simulation.createCheckpoint().randomState;

    expect(() => simulation.advanceOneSegment()).toThrow(/injected model failure/i);
    expect(simulation.tick).toBe(0);
    expect(simulation.entrantStates).toEqual(beforeStates);
    expect(simulation.events).toEqual(beforeEvents);
    expect(simulation.createCheckpoint().randomState).toEqual(beforeRandom);
  });

  it("rejects a checkpoint restored with a different performance model version", () => {
    const simulation = new RaceSimulation(createSyntheticRaceFixture(), { performanceModel: seededModel });
    simulation.advanceOneSegment();
    const checkpoint = simulation.createCheckpoint();
    expect(() => RaceSimulation.restore(checkpoint, {
      ...seededModel,
      version: "2"
    })).toThrow(/performance model/i);
  });

  it("rejects invalid noise configuration and a simulation that cannot complete within its tick budget", () => {
    const snapshot = createSyntheticRaceFixture({ driverCount: 2, teamCount: 1, totalLaps: 2 });
    expect(() => new RaceSimulation(snapshot, { config: { noiseAmplitudeMs: -1 } })).toThrow(RangeError);
    const simulation = new RaceSimulation(snapshot);
    expect(() => simulation.runToCompletion(1)).toThrow(/did not complete/i);
  });
});
