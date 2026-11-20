import { describe, expect, it } from "vitest";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { createRaceEngineTestModels } from "../../src/lib/race-engine/test-profiles";

describe("Race Engine Lab synthetic service profiles", () => {
  it("runs Phase 1/2 systems and restores an identical persisted checkpoint", () => {
    const snapshot = createSyntheticRaceFixture({
      seed: 61120,
      driverCount: 4,
      teamCount: 2,
      totalLaps: 3
    });
    const models = createRaceEngineTestModels(snapshot);
    const uninterrupted = new RaceSimulation(snapshot, models);
    const interrupted = new RaceSimulation(snapshot, models);

    for (let index = 0; index < 11; index += 1) {
      uninterrupted.advanceOneSegment();
      interrupted.advanceOneSegment();
    }

    const checkpoint = interrupted.createCheckpoint();
    const restored = RaceSimulation.restore(
      checkpoint,
      models.performanceModel,
      models.tyreModel,
      models.weatherModel,
      models.pitModel,
      models.incidentModel,
      models.raceControlProfile
    );

    uninterrupted.runToCompletion();
    restored.runToCompletion();

    expect(restored.status).toBe("completed");
    expect(restored.events).toEqual(uninterrupted.events);
    expect(restored.classification).toEqual(uninterrupted.classification);
    expect(restored.entrantStates).toEqual(uninterrupted.entrantStates);
    expect(restored.events.some((event) => event.type === "pit_stop")).toBe(true);
    expect(restored.events.some((event) => event.type === "lap_completed")).toBe(true);
    expect(restored.weatherState).not.toBeNull();
    expect(restored.entrantStates.every((entry) => (entry.tyreState?.distanceDrivenMeters ?? 0) > 0)).toBe(true);
  });
});
