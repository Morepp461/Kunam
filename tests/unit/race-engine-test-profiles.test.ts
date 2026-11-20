import { describe, expect, it } from "vitest";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { createRaceEngineTestModels } from "../../src/lib/race-engine/test-profiles";

describe("Race Engine Lab synthetic service profiles", () => {
  it("applies configured safety-car pace effects to the next deterministic simulation tick", () => {
    const snapshot = createSyntheticRaceFixture({
      seed: 61122,
      driverCount: 4,
      teamCount: 2,
      totalLaps: 3
    });
    const models = createRaceEngineTestModels(snapshot);
    const baseline = new RaceSimulation(snapshot, models);
    const controlled = new RaceSimulation(snapshot, models);

    controlled.applyExternalRaceControlFlag("safety_car", "rc-safety-car", 1_000_000);
    baseline.advanceOneSegment();
    controlled.advanceOneSegment();

    const baselineElapsed = baseline.entrantStates.reduce((sum, entry) => sum + entry.elapsedMs, 0);
    const controlledElapsed = controlled.entrantStates.reduce((sum, entry) => sum + entry.elapsedMs, 0);
    expect(controlledElapsed).toBeGreaterThan(baselineElapsed);
  });

  it("projects external flags and penalty decisions into replay exactly once", () => {
    const snapshot = createSyntheticRaceFixture({
      seed: 61124,
      driverCount: 4,
      teamCount: 2,
      totalLaps: 3
    });
    const models = createRaceEngineTestModels(snapshot);
    const simulation = new RaceSimulation(snapshot, models);

    simulation.recordExternalRaceControlEvent({
      id: "rc-flag-1",
      action: "flag_deployed",
      flag: "safety_car",
      flagDurationMs: 5000
    });
    simulation.recordExternalRaceControlEvent({
      id: "rc-penalty-2",
      action: "penalty_issued"
    });
    simulation.recordExternalRaceControlEvent({
      id: "rc-flag-1",
      action: "flag_deployed",
      flag: "safety_car",
      flagDurationMs: 5000
    });

    expect(simulation.events.filter((event) => event.incidentId === "manual-control:rc-flag-1")).toHaveLength(1);
    expect(simulation.events.find((event) => event.incidentId === "manual-control:rc-flag-1")).toMatchObject({
      type: "race_control",
      raceControlFlag: "safety_car",
      durationMs: 5000,
      controlAction: "flag_deployed"
    });
    expect(simulation.events.find((event) => event.incidentId === "manual-control:rc-penalty-2")?.controlAction).toBe("penalty_issued");
  });

  it("records standing and rolling restarts in the replay event timeline without changing the last valid order", () => {
    const snapshot = createSyntheticRaceFixture({
      seed: 61123,
      driverCount: 4,
      teamCount: 2,
      totalLaps: 3
    });
    const models = createRaceEngineTestModels(snapshot);
    const simulation = new RaceSimulation(snapshot, models);
    const before = simulation.classification;

    simulation.recordRaceRestart("rolling", "rc-restart-1");
    const restartEvent = simulation.events.find((event) => event.incidentId === "manual-restart:rc-restart-1");

    expect(restartEvent).toMatchObject({
      type: "race_control",
      raceControlFlag: "green",
      restartMode: "rolling",
      restartPolicy: "last_valid_classification"
    });
    expect(simulation.classification).toEqual(before);
    simulation.recordRaceRestart("rolling", "rc-restart-1");
    expect(simulation.events.filter((event) => event.incidentId === "manual-restart:rc-restart-1")).toHaveLength(1);
  });

  it("applies and checkpoints externally commanded yellow flags without deleting incident flags", () => {
    const snapshot = createSyntheticRaceFixture({
      seed: 61121,
      driverCount: 4,
      teamCount: 2,
      totalLaps: 3
    });
    const models = createRaceEngineTestModels(snapshot);
    const simulation = new RaceSimulation(snapshot, models);
    const expiresAt = simulation.simulationClockMs + 5000;

    simulation.applyExternalRaceControlFlag("full_course_yellow", "rc-command-1", expiresAt);
    expect(simulation.activeRaceControlFlags).toContainEqual({
      flag: "full_course_yellow",
      incidentId: "manual:rc-command-1",
      expiresAtSimulationTimeMs: expiresAt
    });

    const checkpoint = simulation.createCheckpoint();
    const restored = RaceSimulation.restore(
      checkpoint,
      models.performanceModel,
      models.tyreModel,
      models.weatherModel,
      models.pitModel,
      models.incidentModel,
      models.raceControlProfile
    );
    expect(restored.activeRaceControlFlags).toEqual(simulation.activeRaceControlFlags);
    restored.clearExternalRaceControlFlags();
    expect(restored.activeRaceControlFlags.some((flag) => flag.incidentId.startsWith("manual:"))).toBe(false);
  });

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
