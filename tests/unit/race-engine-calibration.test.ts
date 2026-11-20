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
  attributes["driver.aggression"] = {
    overtake_advantage_per_point: 0.5,
    defense_advantage_per_point: 0.5
  };
  attributes["driver.mistake_rate"] = { mistake_probability_per_point: 0.01 };

  return {
    schemaVersion: 2,
    attributeSchemaVersion: 1,
    id: "calibration-test",
    version: "1.0.0",
    baselineAttributeValue: 50,
    battleDetectionGapMs: 5000,
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

  it("keeps Aggression focused on attack/defence duels and independent from Mistake Rate", () => {
    const profile = createProfile();
    expect(validatePhysicsCalibrationProfile(profile).valid).toBe(true);

    const noDuelEffect = {
      ...profile,
      attributes: {
        ...profile.attributes,
        "driver.aggression": { segment_pace_ms_per_point: -0.01 }
      }
    };
    expect(validatePhysicsCalibrationProfile(noDuelEffect).errors.some((error) => error.includes("Aggression"))).toBe(true);

    const conflated = {
      ...profile,
      attributes: {
        ...profile.attributes,
        "driver.aggression": {
          overtake_advantage_per_point: 0.5,
          mistake_probability_per_point: 0.01
        }
      }
    };
    expect(validatePhysicsCalibrationProfile(conflated).errors.some((error) => error.includes("separate from Mistake Rate"))).toBe(true);
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


  it("enforces higher Reliability as a protective factor for mechanical failures", () => {
    const profile = createProfile();
    const invalid = {
      ...profile,
      attributes: {
        ...profile.attributes,
        "car_team.reliability": { mechanical_failure_probability_per_point: 0.01 }
      }
    };
    expect(validatePhysicsCalibrationProfile(invalid).errors.some((error) => error.includes("Reliability"))).toBe(true);
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
        drsAvailable: true,
        ersAvailable: true,
        overtakingOpportunity: true,
        defendingOpportunity: true
      },
      baseSegmentTimeMs: 14400,
      tyreState: null
    };

    expect(model.calculateAdjustmentMs(context)).toBe(-15);
    expect(Object.isFrozen(model.snapshot)).toBe(true);
  });


  it("applies calibrated ERS, tyre wear, wet grip, overtaking, and defending effects only in eligible contexts", () => {
    const fixture = createSyntheticRaceFixture({ driverCount: 2, teamCount: 1, totalLaps: 1 });
    const profile = createProfile();
    const weights = { ...profile.attributes };
    weights["car_team.ers_efficiency"] = { ers_efficiency_per_point: -2 };
    weights["car_team.car_tyre_wear"] = { tyre_degradation_per_point: 0.5 };
    weights["car_team.mechanical_grip"] = { wet_grip_per_point: -4 };
    weights["driver.overtake_skill"] = { overtake_advantage_per_point: -3 };
    weights["driver.defensive_strength"] = { defense_advantage_per_point: 5 };
    const calibrated = { ...profile, attributes: weights };
    const model = createCalibratedPerformanceModel(calibrated);
    const entrant = {
      ...fixture.entrants[0],
      driverAttributes: {
        ...fixture.entrants[0].driverAttributes,
        overtake_skill: 60,
        defensive_strength: 60
      },
      carTeamAttributes: {
        ...fixture.entrants[0].carTeamAttributes,
        ers_efficiency: 60,
        car_tyre_wear: 60,
        mechanical_grip: 60
      }
    };
    const totals = evaluateAttributeInfluences(entrant, calibrated);
    const segment = {
      ...fixture.circuit.segments[2],
      drsAvailable: false,
      ersAvailable: true,
      overtakingOpportunity: true,
      defendingOpportunity: true
    };
    const baseContext = {
      entrant, lapNumber: 1, segmentIndex: 2, segmentDistanceMeters: segment.distanceMeters,
      segment, baseSegmentTimeMs: 10000, tyreState: { compound: "soft" as const, wearPercent: 10,
        distanceDrivenMeters: 1000, surfaceTempC: 90, carcassTempC: 90, gripPercent: 90 },
      weatherState: { trackWaterDepthMm: 1, trackWetness: 0.5, gripPercent: 80, airTempC: 25,
        surfaceTempC: 25, relativeHumidityPercent: 70, rainfallMmPerHour: 0, windSpeedMps: 0,
        windDirectionDeg: 0, visibilityMeters: 10000 }
    };
    const withoutBattle = model.calculateAdjustmentMs({
      ...baseContext,
      segment: { ...segment, ersAvailable: false, overtakingOpportunity: false, defendingOpportunity: false }
    });
    const withBattle = model.calculateAdjustmentMs({
      ...baseContext,
      battleContext: { attackingGapMs: 100, defendingGapMs: 150 }
    });
    expect(withBattle - withoutBattle).toBeCloseTo(
      totals.ers_efficiency_per_point - totals.overtake_advantage_per_point +
      totals.defense_advantage_per_point, 8
    );
  });


  it("exposes Strategy Quality and Pit Stop Efficiency adjustments to the pit decision engine", () => {
    const fixture = createSyntheticRaceFixture({ driverCount: 1, teamCount: 1, totalLaps: 1 });
    const profile = createProfile();
    const attributes = {
      ...profile.attributes,
      "car_team.strategy_quality": { strategy_quality_per_point: -0.03 },
      "car_team.pit_stop_efficiency": { pit_stop_time_ms_per_point: -5 }
    };
    const model = createCalibratedPerformanceModel({ ...profile, attributes });
    const entrant = {
      ...fixture.entrants[0],
      carTeamAttributes: {
        ...fixture.entrants[0].carTeamAttributes,
        strategy_quality: 60,
        pit_stop_efficiency: 70
      }
    };
    expect(model.calculatePitStrategyAdjustments?.(entrant)).toEqual({
      strategyQualityRiskMultiplier: -0.3,
      pitStopTimeAdjustmentMs: -100
    });
  });

  it("validates immutable setup bounds and applies calibrated aero, suspension, brake, and tyre-pressure effects", () => {
    const fixture = createSyntheticRaceFixture({ driverCount: 1, teamCount: 1, totalLaps: 1 });
    const profile = createProfile();
    const carSetup = {
      schemaVersion: 1 as const,
      aeroSetting: 60,
      suspensionSetting: 40,
      brakeBalanceFrontPercent: 55,
      frontTyrePressurePsi: 26,
      rearTyrePressurePsi: 24
    };
    const setupCalibration = {
      schemaVersion: 1 as const,
      ranges: {
        aeroSetting: { minimum: 0, maximum: 100, baseline: 50 },
        suspensionSetting: { minimum: 0, maximum: 100, baseline: 50 },
        brakeBalanceFrontPercent: { minimum: 40, maximum: 60, baseline: 50 },
        frontTyrePressurePsi: { minimum: 15, maximum: 35, baseline: 25 },
        rearTyrePressurePsi: { minimum: 15, maximum: 35, baseline: 25 }
      },
      influences: {
        aeroSetting: { low_speed_pace_ms_per_point: -1, high_speed_pace_ms_per_point: 2 },
        suspensionSetting: { traction_pace_ms_per_point: 0.5 },
        brakeBalanceFrontPercent: { braking_pace_ms_per_point: 3 },
        frontTyrePressurePsi: { tyre_degradation_per_point: 2 },
        rearTyrePressurePsi: { tyre_degradation_per_point: 1 }
      }
    };
    const calibrated = { ...profile, carSetup: setupCalibration };
    const model = createCalibratedPerformanceModel(calibrated);
    const entrant = { ...fixture.entrants[0], carSetup };
    const totals = evaluateAttributeInfluences(entrant, calibrated);
    expect(totals.low_speed_pace_ms_per_point).toBe(-10);
    expect(totals.high_speed_pace_ms_per_point).toBe(20);
    expect(totals.traction_pace_ms_per_point).toBe(-5);
    expect(totals.braking_pace_ms_per_point).toBe(15);
    expect(totals.tyre_degradation_per_point).toBe(1);
    expect(() => model.validateEntrant?.({ ...entrant, carSetup: { ...carSetup, frontTyrePressurePsi: 50 } }))
      .toThrow(/frontTyrePressurePsi must be between 15 and 35/i);
    expect(() => createCalibratedPerformanceModel(profile).validateEntrant?.(entrant))
      .toThrow(/requires a calibrated carSetup profile/i);

    const simulation = new RaceSimulation({ ...fixture, entrants: [entrant] }, { performanceModel: model });
    const checkpoint = simulation.createCheckpoint();
    expect(checkpoint.snapshot.entrants[0].carSetup).toEqual(carSetup);
    expect(checkpoint.config.performanceModelSnapshot).toEqual(calibrated);
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
