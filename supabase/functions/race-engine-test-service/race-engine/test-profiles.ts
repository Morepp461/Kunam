import { RACE_ATTRIBUTE_DEFINITIONS } from "./attributes.ts";
import { createCalibratedPerformanceModel } from "./calibration.ts";
import type { RacePhysicsCalibrationProfile } from "./calibration.ts";
import type { CarSetupCalibration } from "./setup.ts";
import { createIncidentModel } from "./incidents.ts";
import type { IncidentCalibrationProfile, IncidentType, RaceControlProfile } from "./incidents.ts";
import { createPitStrategyModel } from "./pit-strategy.ts";
import { createTyreSimulationModel, TYRE_COMPOUNDS } from "./tyres.ts";
import type { TyreDegradationProfile, TyreSegmentEnvironment } from "./tyres.ts";
import { createWeatherSimulationModel } from "./weather.ts";
import type { WeatherEvolutionProfile, WeatherInput } from "./weather.ts";
import type { RaceStartSnapshot } from "./contracts.ts";

/**
 * Synthetic-only profiles for the Admin Race Engine Lab.
 * These values are copied from the repository's validation fixtures or deliberately
 * constructed for non-production demonstration. They are NOT production calibration.
 */
export type TestWeatherScenario = "dry" | "wet" | "transition";

export function createRaceEngineTestModels(
  snapshot: RaceStartSnapshot,
  options: { readonly weatherScenario?: TestWeatherScenario } = {}
) {
  const weatherScenario = options.weatherScenario ?? "transition";
  // Synthetic-only sensitivity map. Coefficients are test fixtures, not production physics calibration.
  const attributes: Record<string, Record<string, number>> = {
    "driver.race_pace": { segment_pace_ms_per_point: -0.001 },
    "driver.qualifying_pace": { segment_pace_ms_per_point: -0.001 },
    "driver.experience": { consistency_variance_ms_per_point: -0.02 },
    "driver.aggression": {
      overtake_advantage_per_point: 0.001,
      defense_advantage_per_point: 0.001
    },
    "driver.defensive_strength": { defense_advantage_per_point: -0.002 },
    "driver.overtake_skill": { overtake_advantage_per_point: 0.002 },
    "driver.mistake_rate": { mistake_probability_per_point: 0.0001 },
    "driver.tyre_management": { tyre_degradation_per_point: -0.01 },
    "car_team.race_pace": { segment_pace_ms_per_point: -0.001 },
    "car_team.qualifying_pace": { segment_pace_ms_per_point: -0.001 },
    "car_team.engine_power": { high_speed_pace_ms_per_point: -0.002 },
    "car_team.aero_power": { high_speed_pace_ms_per_point: -0.002 },
    "car_team.low_speed_corners": { low_speed_pace_ms_per_point: -0.002 },
    "car_team.high_speed_corners": { high_speed_pace_ms_per_point: -0.002 },
    "car_team.traction": { traction_pace_ms_per_point: -0.002 },
    "car_team.mechanical_grip": { wet_grip_per_point: -0.001 },
    "car_team.team_tyre_management": { tyre_degradation_per_point: -0.005 },
    "car_team.strategy_quality": { strategy_quality_per_point: -0.03 },
    "car_team.team_morale": { morale_consistency_per_point: -0.01 },
    "car_team.reliability": { mechanical_failure_probability_per_point: -0.00002 },
    "car_team.car_tyre_wear": { tyre_degradation_per_point: 0.001 },
    "car_team.pit_stop_efficiency": { pit_stop_time_ms_per_point: -25 },
    "car_team.drs_efficiency": { drs_pace_ms_per_point: -0.002 },
    "car_team.ers_efficiency": { ers_efficiency_per_point: -0.001 }
  };
  if (Object.keys(attributes).length !== RACE_ATTRIBUTE_DEFINITIONS.length) {
    throw new Error("Synthetic calibration must define an explicit influence map for all 24 attributes");
  }
  const carSetupCalibration: CarSetupCalibration = {
    schemaVersion: 1,
    ranges: {
      aeroSetting: { minimum: 0, maximum: 100, baseline: 50 },
      suspensionSetting: { minimum: 0, maximum: 100, baseline: 50 },
      brakeBalanceFrontPercent: { minimum: 40, maximum: 60, baseline: 50 },
      frontTyrePressurePsi: { minimum: 15, maximum: 35, baseline: 25 },
      rearTyrePressurePsi: { minimum: 15, maximum: 35, baseline: 25 }
    },
    influences: {
      aeroSetting: { low_speed_pace_ms_per_point: 0.02, high_speed_pace_ms_per_point: -0.02 },
      suspensionSetting: { traction_pace_ms_per_point: -0.02, low_speed_pace_ms_per_point: -0.01 },
      brakeBalanceFrontPercent: { braking_pace_ms_per_point: 0.02 },
      frontTyrePressurePsi: { tyre_degradation_per_point: 0.02 },
      rearTyrePressurePsi: { tyre_degradation_per_point: 0.02 }
    }
  };
  const performanceProfile: RacePhysicsCalibrationProfile = {
    schemaVersion: 2,
    attributeSchemaVersion: 1,
    id: "race-engine-lab-synthetic",
    version: "1.1.0-test",
    baselineAttributeValue: 50,
    battleDetectionGapMs: 2500,
    attributes,
    hqEffects: {
      race_pace_bonus: { segment_pace_ms_per_point: -0.002 },
      reliability_bonus: { mechanical_failure_probability_per_point: -0.00002 },
      aero_power_bonus: { high_speed_pace_ms_per_point: -0.002 }
    },
    carSetup: carSetupCalibration
  };
  const performanceModel = createCalibratedPerformanceModel(performanceProfile);

  const compounds = Object.fromEntries(TYRE_COMPOUNDS.map((compound) => [
    compound,
    {
      baseWearPercentPerKm: compound === "soft" ? 5 : compound === "medium" ? 3.5 : compound === "hard" ? 2.5 : 3,
      optimalSurfaceTempMinC: 75,
      optimalSurfaceTempMaxC: 105,
      temperatureWearPercentPerDegreeC: 0.02,
      surfaceAbrasionWearMultiplier: 0.2,
      loadWearMultiplier: 0.2,
      wetnessMismatchWearMultiplier: 0.5,
      wetnessAffinity: compound === "intermediate" ? 0.5 : compound === "full_wet" ? 1 : 0,
      wearGripLossPercentAtFullWear: 20,
      wetnessMismatchGripLossPercent: 10
    }
  ])) as TyreDegradationProfile["compounds"];
  const tyreProfile: TyreDegradationProfile = {
    schemaVersion: 1,
    id: "race-engine-lab-synthetic-tyres",
    version: "1.0.0-test",
    baselineAttributeValue: 50,
    minimumWearMultiplier: 0.5,
    maximumWearMultiplier: 2,
    driverTyreManagementWearCoefficient: -0.01,
    teamTyreManagementWearCoefficient: -0.005,
    carTyreWearWearCoefficient: 0.01,
    compounds
  };

  const weatherProfile: WeatherEvolutionProfile = {
    schemaVersion: 1,
    id: "race-engine-lab-synthetic-weather",
    version: "1.0.0-test",
    waterRetentionMultiplier: 1,
    evaporationMmPerHourPerSurfaceDegree: 0.001,
    windDryingMmPerHourPerMps: 0.01,
    maximumWaterDepthMm: 10,
    gripLossPercentPerMmWater: 2,
    rubberingGripGainPercentAtFull: 3,
    minimumGripPercent: 20,
    maximumGripPercent: 100
  };
  const weatherInputs: Record<string, WeatherInput> = {};
  const tyreEnvironment: Record<string, TyreSegmentEnvironment> = {};
  const startingCompounds: Record<string, (typeof TYRE_COMPOUNDS)[number]> = {};
  snapshot.entrants.forEach((entrant, index) => {
    startingCompounds[entrant.driverId] = TYRE_COMPOUNDS[index % TYRE_COMPOUNDS.length];
  });
  for (let lap = 1; lap <= snapshot.circuit.totalLaps; lap += 1) {
    for (const segment of snapshot.circuit.segments) {
      const wet = weatherScenario === "wet" ||
        (weatherScenario === "transition" && lap > Math.max(1, Math.ceil(snapshot.circuit.totalLaps / 2)));
      weatherInputs[`${lap}:${segment.id}`] = {
        airTempC: wet ? 22 : 28,
        surfaceTempC: wet ? 20 : 34,
        relativeHumidityPercent: wet ? 88 : 45,
        rainfallMmPerHour: wet ? 24 : 0,
        windSpeedMps: 2,
        windDirectionDeg: 180,
        visibilityMeters: 10000,
        baseGripPercent: wet ? 88 : 96,
        rubberingInPercent: 0.35
      };
      tyreEnvironment[`${lap}:${segment.id}`] = {
        surfaceTempC: wet ? 20 : 34,
        carcassTempC: wet ? 45 : 85,
        trackWetness: wet ? 0.65 : 0.05,
        surfaceAbrasion: 0.4,
        loadFactor: 0.6
      };
    }
  }
  const tyreModel = createTyreSimulationModel(tyreProfile, startingCompounds, tyreEnvironment);
  const weatherModel = createWeatherSimulationModel(weatherProfile, weatherInputs);

  const pitModel = createPitStrategyModel({
    schemaVersion: 1,
    id: "race-engine-lab-synthetic-pit",
    version: "1.0.0-test",
    pitWindowStartLap: 1,
    pitWindowEndLap: Math.max(1, snapshot.circuit.totalLaps - 1),
    wearTriggerPercent: 8,
    minimumLapsBetweenStops: 1,
    maximumStops: 2
  }, {
    default: TYRE_COMPOUNDS.map((compound) => ({
      compound,
      pitLaneLossMs: 22000,
      expectedLapTimeDeltaMs: compound === "soft" ? -250 : 0,
      expectedDegradationMsPerLap: compound === "soft" ? 250 : compound === "medium" ? 150 : 80,
      riskPenaltyMs: 100,
      compatibleWetnessMin: compound === "full_wet" ? 0.55 : compound === "intermediate" ? 0.2 : 0,
      compatibleWetnessMax: compound === "full_wet" ? 1 : compound === "intermediate" ? 0.9 : 0.4
    }))
  });

  const incidentTypes: readonly IncidentType[] = [
    "spin", "off_track", "collision", "crash", "mechanical_failure", "engine_failure"
  ];
  const incidentProfile: IncidentCalibrationProfile = {
    schemaVersion: 1,
    id: "race-engine-lab-synthetic-incidents",
    version: "1.0.0-test",
    baselineAttributeValue: 50,
    maximumRatePerKm: 0.2,
    incidents: Object.fromEntries(incidentTypes.map((type) => [type, {
      baseRatePerKm: ({
        spin: 0.035,
        off_track: 0.018,
        collision: 0.006,
        crash: 0.002,
        mechanical_failure: 0.003,
        engine_failure: 0.001
      } as Record<IncidentType, number>)[type],
      attributeRatePerPoint: type === "spin" || type === "off_track"
        ? { "driver.mistake_rate": 0.0001 }
        : type === "mechanical_failure" || type === "engine_failure"
          ? { "car_team.reliability": -0.00002 }
          : {},
      timeLossMs: type === "crash" ? 12000 : type === "engine_failure" ? 18000 : 5000,
      ...(type === "engine_failure" ? { retiresDriver: true } : {})
    }])) as IncidentCalibrationProfile["incidents"]
  };
  const incidentModel = createIncidentModel(incidentProfile);
  const raceControlProfile: RaceControlProfile = {
    id: "race-engine-lab-synthetic-race-control",
    version: "1.0.0-test",
    flagByIncident: {
      spin: "yellow",
      off_track: "yellow",
      collision: "double_yellow",
      crash: "safety_car",
      mechanical_failure: "virtual_safety_car",
      engine_failure: "red_flag"
    },
    durationMsByFlag: {
      yellow: 2500,
      double_yellow: 4000,
      full_course_yellow: 4500,
      virtual_safety_car: 5000,
      safety_car: 7000,
      red_flag: 9000
    },
    paceTimeMultiplierByFlag: {
      yellow: 1.05,
      double_yellow: 1.08,
      full_course_yellow: 1.1,
      virtual_safety_car: 1.12,
      safety_car: 1.15,
      red_flag: 1.2
    }
  };

  return {
    performanceModel,
    tyreModel,
    weatherModel,
    pitModel,
    incidentModel,
    raceControlProfile,
    config: { noiseAmplitudeMs: 2 }
  };
}
