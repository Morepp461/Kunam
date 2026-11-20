import { describe, expect, it } from "vitest";
import { RACE_ATTRIBUTE_DEFINITIONS } from "../../src/lib/race-engine/attributes";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import type { SegmentPerformanceModel } from "../../src/lib/race-engine/simulation";
import {
  createTyreSimulationModel,
  TYRE_COMPOUNDS
} from "../../src/lib/race-engine/tyres";
import type { TyreDegradationProfile, TyreSegmentEnvironment } from "../../src/lib/race-engine/tyres";

function createProfile(): TyreDegradationProfile {
  const compounds = Object.fromEntries(TYRE_COMPOUNDS.map((compound) => [
    compound,
    {
      baseWearPercentPerKm: compound === "soft" ? 1.2 : 0.8,
      optimalSurfaceTempMinC: 80,
      optimalSurfaceTempMaxC: 100,
      temperatureWearPercentPerDegreeC: 0.02,
      surfaceAbrasionWearMultiplier: 0.2,
      loadWearMultiplier: 0.2,
      wetnessMismatchWearMultiplier: 0.5,
      wetnessAffinity: compound === "intermediate" ? 0.5 : compound === "full_wet" ? 1 : 0,
      wearGripLossPercentAtFullWear: 20,
      wetnessMismatchGripLossPercent: 10
    }
  ])) as TyreDegradationProfile["compounds"];

  return {
    schemaVersion: 1,
    id: "tyre-checkpoint-test",
    version: "1.0.0",
    baselineAttributeValue: 50,
    minimumWearMultiplier: 0.5,
    maximumWearMultiplier: 2,
    driverTyreManagementWearCoefficient: -0.01,
    teamTyreManagementWearCoefficient: -0.005,
    carTyreWearWearCoefficient: 0.01,
    compounds
  };
}

const environment: TyreSegmentEnvironment = {
  surfaceTempC: 95,
  carcassTempC: 90,
  trackWetness: 0.1,
  surfaceAbrasion: 0.4,
  loadFactor: 0.6
};

const tyreAwarePerformanceModel: SegmentPerformanceModel = {
  id: "tyre-aware-test",
  version: "1",
  snapshot: { model: "tyre-aware-test", version: 1 },
  calculateAdjustmentMs: ({ tyreState }) => tyreState ? -tyreState.gripPercent : 0
};

function createSetup(totalLaps = 3) {
  const snapshot = createSyntheticRaceFixture({
    seed: 8080,
    driverCount: 4,
    teamCount: 2,
    totalLaps
  });
  const startingCompounds = Object.fromEntries(
    snapshot.entrants.map((entrant, index) => [
      entrant.driverId,
      index % 2 === 0 ? "soft" : "medium"
    ])
  ) as Record<string, "soft" | "medium">;
  const environments = Object.fromEntries(
    snapshot.circuit.segments.map((segment) => [segment.id, environment])
  );
  const tyreModel = createTyreSimulationModel(createProfile(), startingCompounds, environments);
  return { snapshot, tyreModel };
}

describe("Tyre state integration with race simulation checkpoints", () => {
  it("initializes a tyre set per entrant and advances it after each completed segment", () => {
    const { snapshot, tyreModel } = createSetup();
    const simulation = new RaceSimulation(snapshot, { tyreModel });
    const before = simulation.entrantStates;

    expect(before.every((state) => state.tyreState?.wearPercent === 0)).toBe(true);
    simulation.advanceOneSegment();

    const after = simulation.entrantStates;
    expect(after.every((state) => state.tyreState?.distanceDrivenMeters === snapshot.circuit.segments[0].distanceMeters)).toBe(true);
    expect(after.every((state) => (state.tyreState?.wearPercent ?? 0) > 0)).toBe(true);
    expect(before.every((state) => state.tyreState?.distanceDrivenMeters === 0)).toBe(true);
  });

  it("exposes the pre-segment tyre state to the injected performance model", () => {
    const { snapshot, tyreModel } = createSetup(1);
    const simulation = new RaceSimulation(snapshot, {
      tyreModel,
      performanceModel: tyreAwarePerformanceModel
    });
    simulation.advanceOneSegment();
    expect(simulation.entrantStates.every((state) => state.elapsedMs > 0)).toBe(true);
  });

  it("restores tyre states and replays identical events, classification, and tyre wear", () => {
    const { snapshot, tyreModel } = createSetup();
    const uninterrupted = new RaceSimulation(snapshot, {
      tyreModel,
      performanceModel: tyreAwarePerformanceModel,
      config: { noiseAmplitudeMs: 2 }
    });
    for (let index = 0; index < 13; index += 1) uninterrupted.advanceOneSegment();

    const checkpoint = uninterrupted.createCheckpoint();
    expect(checkpoint.config.tyreModelId).toBe(tyreModel.id);
    expect(checkpoint.config.tyreModelSnapshot).toEqual(tyreModel.snapshot);
    expect(checkpoint.entrants.every((state) => Boolean(state.tyreState))).toBe(true);

    const restored = RaceSimulation.restore(checkpoint, tyreAwarePerformanceModel, tyreModel);
    uninterrupted.runToCompletion();
    restored.runToCompletion();

    expect(restored.events).toEqual(uninterrupted.events);
    expect(restored.classification).toEqual(uninterrupted.classification);
    expect(restored.entrantStates).toEqual(uninterrupted.entrantStates);
  });

  it("rejects a checkpoint with a different tyre calibration even when its ID and version are unchanged", () => {
    const { snapshot, tyreModel } = createSetup();
    const simulation = new RaceSimulation(snapshot, { tyreModel });
    simulation.advanceOneSegment();
    const checkpoint = simulation.createCheckpoint();
    const changedProfile = {
      ...createProfile(),
      compounds: {
        ...createProfile().compounds,
        soft: {
          ...createProfile().compounds.soft,
          baseWearPercentPerKm: 9
        }
      }
    };
    const changedModel = createTyreSimulationModel(
      changedProfile,
      tyreModel.startingCompounds,
      tyreModel.environmentByLapSegment
    );
    expect(() => RaceSimulation.restore(checkpoint, undefined, changedModel)).toThrow(/tyre model/i);
  });

  it("requires a complete environment for every lap and segment before starting", () => {
    const { snapshot } = createSetup();
    const compounds = Object.fromEntries(snapshot.entrants.map((entrant) => [entrant.driverId, "soft"])) as Record<string, "soft">;
    const incompleteModel = createTyreSimulationModel(createProfile(), compounds, {
      [snapshot.circuit.segments[0].id]: environment
    });
    expect(() => new RaceSimulation(snapshot, { tyreModel: incompleteModel })).toThrow(/missing tyre environment/i);
  });

  it("rejects corrupted tyre state in a checkpoint", () => {
    const { snapshot, tyreModel } = createSetup();
    const simulation = new RaceSimulation(snapshot, { tyreModel });
    simulation.advanceOneSegment();
    const checkpoint = simulation.createCheckpoint();
    const corrupted = {
      ...checkpoint,
      entrants: checkpoint.entrants.map((state, index) =>
        index === 0 ? { ...state, tyreState: { ...state.tyreState!, wearPercent: 101 } } : state
      )
    };
    expect(() => RaceSimulation.restore(corrupted, undefined, tyreModel)).toThrow(/tyre state.*invalid/i);
  });

  it("keeps races without tyre integration backwards within the new checkpoint schema", () => {
    const snapshot = createSyntheticRaceFixture({ driverCount: 2, teamCount: 1, totalLaps: 1 });
    const simulation = new RaceSimulation(snapshot);
    simulation.advanceOneSegment();
    const checkpoint = simulation.createCheckpoint();
    expect(checkpoint.entrants.every((state) => state.tyreState === undefined)).toBe(true);
    const restored = RaceSimulation.restore(checkpoint);
    restored.runToCompletion();
    expect(restored.classification.every((state) => state.finished)).toBe(true);
  });
});
