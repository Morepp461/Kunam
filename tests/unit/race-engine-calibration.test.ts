import { describe, expect, it } from "vitest";
import {
  ATTRIBUTE_INFLUENCE_CHANNELS,
  createCalibratedPerformanceModel,
  evaluateAttributeInfluences,
  validatePhysicsCalibrationProfile
} from "../../src/lib/race-engine/calibration";
import type { RacePhysicsCalibrationProfile } from "../../src/lib/race-engine/calibration";
import { RACE_ATTRIBUTE_DEFINITIONS } from "../../src/lib/race-engine/attributes";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";

function createProfile(): RacePhysicsCalibrationProfile {
  const attributes: Record<string, Record<string, number>> = Object.fromEntries(
    RACE_ATTRIBUTE_DEFINITIONS.map((definition) => [
      definition.id,
      { consistency_variance_ms_per_point: 0.01 }
    ])
  );
  attributes["driver.race_pace"] = { segment_pace_ms_per_point: -1 };
  attributes["driver.mistake_rate"] = { mistake_probability_per_point: 0.01 };

  return {
    schemaVersion: 1,
    attributeSchemaVersion: 1,
    id: "calibration-test",
    version: "1.0.0",
    baselineAttributeValue: 50,
    attributes,
    hqEffects: {
      race_pace_bonus: { segment_pace_ms_per_point: -2 },
      simulator_quality: { low_speed_pace_ms_per_point: -0.5 }
    }
  };
}

describe("Race physics calibration profiles", () => {
  it("requires a unique stable-ID coefficient map for all 24 v1 attributes", () => {
    const profile = createProfile();
    expect(validatePhysicsCalibrationProfile(profile).valid).toBe(true);
    expect(Object.keys(profile.attributes)).toHaveLength(24);
    expect(ATTRIBUTE_INFLUENCE_CHANNELS).toContain("mistake_probability_per_point");
  });

  it("rejects missing and unknown attribute IDs and empty influence maps", () => {
    const profile = createProfile();
    const { "driver.race_pace": _pace, ...withoutPace } = profile.attributes;
    const missing = { ...profile, attributes: withoutPace };
    expect(validatePhysicsCalibrationProfile(missing).errors.some((error) => error.includes("Missing calibration"))).toBe(true);

    const unknown = {
      ...profile,
      attributes: { ...profile.attributes, "driver.future_stat": { segment_pace_ms_per_point: 1 } }
    };
    expect(validatePhysicsCalibrationProfile(unknown).errors.some((error) => error.includes("Unknown calibration"))).toBe(true);

    const zero = {
      ...profile,
      attributes: { ...profile.attributes, "driver.race_pace": { segment_pace_ms_per_point: 0 } }
    };
    expect(validatePhysicsCalibrationProfile(zero).valid).toBe(false);
  });

  it("enforces the confirmed higher-is-riskier direction for Mistake Rate", () => {
    const profile = createProfile();
    const invalid = {
      ...profile,
      attributes: {
        ...profile.attributes,
        "driver.mistake_rate": { mistake_probability_per_point: -0.01 }
      }
    };
    expect(validatePhysicsCalibrationProfile(invalid).errors.some((error) => error.includes("Mistake Rate"))).toBe(true);
  });

  it("calculates attribute and explicitly configured HQ influences from the profile", () => {
    const fixture = createSyntheticRaceFixture({ driverCount: 1, teamCount: 1, totalLaps: 1 });
    const entrant = {
      ...fixture.entrants[0],
      driverAttributes: {
        ...fixture.entrants[0].driverAttributes,
        race_pace: 60
      },
      hqEffects: {
        race_pace_bonus: 2,
        simulator_quality: 4,
        unconfigured_effect: 100
      }
    };
    const totals = evaluateAttributeInfluences(entrant, createProfile());

    expect(totals.segment_pace_ms_per_point).toBe(-14);
    expect(totals.low_speed_pace_ms_per_point).toBe(-2);
    expect(totals.mistake_probability_per_point).toBe(
      (entrant.driverAttributes.mistake_rate - 50) * 0.01
    );
  });

  it("uses track segment demands and DRS availability without hardcoded coefficient values", () => {
    const fixture = createSyntheticRaceFixture({ driverCount: 1, teamCount: 1, totalLaps: 1 });
    const entrant = {
      ...fixture.entrants[0],
      driverAttributes: {
        ...fixture.entrants[0].driverAttributes,
        race_pace: 60
      },
      hqEffects: { race_pace_bonus: 2, simulator_quality: 4 }
    };
    const profile = createProfile();
    const model = createCalibratedPerformanceModel(profile);
    const context = {
      entrant,
      lapNumber: 1,
      segmentIndex: 0,
      segmentDistanceMeters: 800,
      segment: {
        ...fixture.circuit.segments[0],
        lowSpeedDemand: 0.5,
        highSpeedDemand: 0,
        tractionDemand: 0,
        drsAvailable: true
      },
      baseSegmentTimeMs: 14400
    };

    expect(model.calculateAdjustmentMs(context)).toBe(-15);
    expect(Object.isFrozen(model.snapshot)).toBe(true);
  });

  it("persists the full calibration profile in checkpoints and requires the same profile to resume", () => {
    const profile = createProfile();
    const model = createCalibratedPerformanceModel(profile);
    const simulation = new RaceSimulation(createSyntheticRaceFixture({ totalLaps: 2 }), {
      performanceModel: model
    });
    simulation.advanceOneSegment();
    const checkpoint = simulation.createCheckpoint();

    expect(checkpoint.config.performanceModelSnapshot).toEqual(profile);
    expect(() => RaceSimulation.restore(checkpoint, createCalibratedPerformanceModel({
      ...profile,
      attributes: {
        ...profile.attributes,
        "driver.race_pace": { segment_pace_ms_per_point: -2 }
      }
    }))).toThrow(/performance model/i);

    const restored = RaceSimulation.restore(checkpoint, createCalibratedPerformanceModel(profile));
    const original = new RaceSimulation(createSyntheticRaceFixture({ totalLaps: 2 }), {
      performanceModel: model
    });
    original.advanceOneSegment();
    original.runToCompletion();
    restored.runToCompletion();
    expect(restored.events).toEqual(original.events);
    expect(restored.classification).toEqual(original.classification);
  });
});
