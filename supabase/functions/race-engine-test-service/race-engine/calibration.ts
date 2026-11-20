import {
  ATTRIBUTE_SCHEMA_VERSION,
  RACE_ATTRIBUTE_DEFINITIONS
} from "./attributes.ts";
import type { JsonValue, RaceEntrantSnapshot } from "./contracts.ts";
import type { SegmentPerformanceContext, SegmentPerformanceModel } from "./simulation.ts";
import { CAR_SETUP_KEYS, validateCarSetupSnapshot } from "./setup.ts";
import type { CarSetupCalibration, CarSetupKey } from "./setup.ts";

export const PHYSICS_CALIBRATION_SCHEMA_VERSION = 2;

export const ATTRIBUTE_INFLUENCE_CHANNELS = [
  "segment_pace_ms_per_point",
  "low_speed_pace_ms_per_point",
  "high_speed_pace_ms_per_point",
  "traction_pace_ms_per_point",
  "drs_pace_ms_per_point",
  "tyre_degradation_per_point",
  "consistency_variance_ms_per_point",
  "overtake_advantage_per_point",
  "defense_advantage_per_point",
  "mistake_probability_per_point",
  "mechanical_failure_probability_per_point",
  "pit_stop_time_ms_per_point",
  "ers_efficiency_per_point",
  "wet_grip_per_point",
  "strategy_quality_per_point",
  "morale_consistency_per_point"
] as const;

export type AttributeInfluenceChannel = (typeof ATTRIBUTE_INFLUENCE_CHANNELS)[number];
export type AttributeInfluenceWeights = Readonly<Partial<Record<AttributeInfluenceChannel, number>>>;

export interface RacePhysicsCalibrationProfile {
  readonly schemaVersion: typeof PHYSICS_CALIBRATION_SCHEMA_VERSION;
  readonly attributeSchemaVersion: typeof ATTRIBUTE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly baselineAttributeValue: number;
  /** Maximum elapsed-time gap for an adjacent attack/defence interaction; supplied by calibration. */
  readonly battleDetectionGapMs: number;
  /** One coefficient map for every stable attribute ID. Values are intentionally supplied by calibration, not guessed here. */
  readonly attributes: Readonly<Record<string, AttributeInfluenceWeights>>;
  /** Optional effects not already folded into effective car/team attribute values. */
  readonly hqEffects: Readonly<Record<string, AttributeInfluenceWeights>>;
}

export interface CalibrationValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export type AttributeInfluenceTotals = Readonly<Record<AttributeInfluenceChannel, number>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateWeightMap(
  label: string,
  weights: unknown,
  requireNonZero: boolean,
  errors: string[]
): void {
  if (!isRecord(weights)) {
    errors.push(`${label} must be an object of influence coefficients`);
    return;
  }
  const entries = Object.entries(weights);
  if (entries.length === 0) {
    errors.push(`${label} must define at least one influence channel`);
    return;
  }
  let hasNonZero = false;
  for (const [channel, value] of entries) {
    if (!(ATTRIBUTE_INFLUENCE_CHANNELS as readonly string[]).includes(channel)) {
      errors.push(`${label} contains unknown influence channel: ${channel}`);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) {
      errors.push(`${label}.${channel} must be a finite coefficient within the supported numeric range`);
      continue;
    }
    if (value !== 0) hasNonZero = true;
  }
  if (requireNonZero && !hasNonZero) {
    errors.push(`${label} must have at least one non-zero influence`);
  }
}

/**
 * Validates a calibration profile against the active stable-ID attribute catalog.
 * Coefficient signs and magnitudes are data, not hardcoded gameplay assumptions.
 */
export function validatePhysicsCalibrationProfile(
  profile: RacePhysicsCalibrationProfile
): CalibrationValidationResult {
  const errors: string[] = [];
  if (profile.schemaVersion !== PHYSICS_CALIBRATION_SCHEMA_VERSION) {
    errors.push("Unsupported physics calibration schema version");
  }
  if (profile.attributeSchemaVersion !== ATTRIBUTE_SCHEMA_VERSION) {
    errors.push("Calibration attribute schema version does not match the engine catalog");
  }
  if (!profile.id.trim() || !profile.version.trim()) {
    errors.push("Calibration profile ID and version are required");
  }
  if (!Number.isFinite(profile.battleDetectionGapMs) || profile.battleDetectionGapMs < 0) {
    errors.push("battleDetectionGapMs must be a non-negative finite calibration value");
  }
  if (
    !Number.isFinite(profile.baselineAttributeValue) ||
    profile.baselineAttributeValue < 50 ||
    profile.baselineAttributeValue > 100
  ) {
    errors.push("Baseline attribute value must be between 50 and 100");
  }

  const attributeWeights = isRecord(profile.attributes) ? profile.attributes : {};
  const hqWeights = isRecord(profile.hqEffects) ? profile.hqEffects : {};
  if (!isRecord(profile.attributes)) errors.push("attributes must be an object");
  if (!isRecord(profile.hqEffects)) errors.push("hqEffects must be an object");

  const expectedIds = new Set<string>(RACE_ATTRIBUTE_DEFINITIONS.map((definition) => definition.id));
  for (const definition of RACE_ATTRIBUTE_DEFINITIONS) {
    const weights = attributeWeights[definition.id] as AttributeInfluenceWeights | undefined;
    if (!weights) {
      errors.push(`Missing calibration for attribute ${definition.id}`);
      continue;
    }
    validateWeightMap(`attributes.${definition.id}`, weights, true, errors);
    if (
      definition.id === "driver.mistake_rate" &&
      typeof weights.mistake_probability_per_point === "number" &&
      weights.mistake_probability_per_point < 0
    ) {
      errors.push("Mistake Rate must not reduce mistake probability when its rating increases");
    }
    if (
      definition.id === "car_team.reliability" &&
      typeof weights.mechanical_failure_probability_per_point === "number" &&
      weights.mechanical_failure_probability_per_point > 0
    ) {
      errors.push("Higher Reliability must not increase mechanical failure probability");
    }
  }

  for (const id of Object.keys(attributeWeights)) {
    if (!expectedIds.has(id)) errors.push(`Unknown calibration attribute ID: ${id}`);
  }
  if (profile.carSetup) {
    const setup = profile.carSetup;
    if (setup.schemaVersion !== 1) errors.push("Unsupported car setup calibration schema version");
    for (const key of CAR_SETUP_KEYS) {
      const range = setup.ranges?.[key];
      if (!range) {
        errors.push(`Car setup calibration is missing range for ${key}`);
      } else {
        if (!Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.minimum >= range.maximum) {
          errors.push(`Car setup range for ${key} must have finite minimum below maximum`);
        }
        if (!Number.isFinite(range.baseline) || range.baseline < range.minimum || range.baseline > range.maximum) {
          errors.push(`Car setup baseline for ${key} must be inside its configured range`);
        }
      }
      const weights = setup.influences?.[key];
      if (!weights) errors.push(`Car setup calibration is missing influence map for ${key}`);
      else validateWeightMap(`carSetup.influences.${key}`, weights, true, errors);
    }
    for (const key of Object.keys(setup.ranges ?? {})) {
      if (!(CAR_SETUP_KEYS as readonly string[]).includes(key)) errors.push(`Unknown car setup range: ${key}`);
    }
    for (const key of Object.keys(setup.influences ?? {})) {
      if (!(CAR_SETUP_KEYS as readonly string[]).includes(key)) errors.push(`Unknown car setup influence: ${key}`);
    }
  }

  for (const [key, weights] of Object.entries(hqWeights)) {
    if (!key.trim()) {
      errors.push("HQ effect keys must not be empty");
      continue;
    }
    validateWeightMap(`hqEffects.${key}`, weights, false, errors);
  }

  return { valid: errors.length === 0, errors };
}

function evaluateAttributeInfluencesUnchecked(
  entrant: RaceEntrantSnapshot,
  profile: RacePhysicsCalibrationProfile
): AttributeInfluenceTotals {
  const totals = Object.fromEntries(
    ATTRIBUTE_INFLUENCE_CHANNELS.map((channel) => [channel, 0])
  ) as Record<AttributeInfluenceChannel, number>;

  for (const definition of RACE_ATTRIBUTE_DEFINITIONS) {
    const value = definition.scope === "driver"
      ? entrant.driverAttributes[definition.key as keyof typeof entrant.driverAttributes]
      : entrant.carTeamAttributes[definition.key as keyof typeof entrant.carTeamAttributes];
    const delta = value - profile.baselineAttributeValue;
    const weights = profile.attributes[definition.id];
    for (const [channel, coefficient] of Object.entries(weights) as [AttributeInfluenceChannel, number][]) {
      totals[channel] += delta * coefficient;
    }
  }

  if (entrant.carSetup) {
    if (!profile.carSetup) throw new Error("Car setup snapshot requires a calibrated carSetup profile");
    const validation = validateCarSetupSnapshot(entrant.carSetup, profile.carSetup);
    if (!validation.valid) throw new Error(`Invalid car setup for ${entrant.driverId}: ${validation.errors.join("; ")}`);
    for (const key of CAR_SETUP_KEYS as readonly CarSetupKey[]) {
      const delta = entrant.carSetup[key] - profile.carSetup.ranges[key].baseline;
      const weights = profile.carSetup.influences[key];
      for (const [channel, coefficient] of Object.entries(weights) as [AttributeInfluenceChannel, number][]) {
        totals[channel] += delta * coefficient;
      }
    }
  }

  for (const [effectKey, effectValue] of Object.entries(entrant.hqEffects)) {
    const weights = profile.hqEffects[effectKey];
    if (!weights) continue;
    for (const [channel, coefficient] of Object.entries(weights) as [AttributeInfluenceChannel, number][]) {
      totals[channel] += effectValue * coefficient;
    }
  }

  return totals;
}

export function evaluateAttributeInfluences(
  entrant: RaceEntrantSnapshot,
  profile: RacePhysicsCalibrationProfile
): AttributeInfluenceTotals {
  const validation = validatePhysicsCalibrationProfile(profile);
  if (!validation.valid) {
    throw new Error(`Invalid physics calibration profile: ${validation.errors.join("; ")}`);
  }
  return evaluateAttributeInfluencesUnchecked(entrant, profile);
}

function calculateSegmentPaceAdjustmentUnchecked(
  context: SegmentPerformanceContext,
  profile: RacePhysicsCalibrationProfile
): number {
  const totals = evaluateAttributeInfluencesUnchecked(context.entrant, profile);
  const segment = context.segment;
  const tyreWearAdjustment = context.tyreState
    ? context.tyreState.wearPercent * totals.tyre_degradation_per_point
    : 0;
  const wetGripAdjustment = context.weatherState
    ? context.weatherState.trackWetness * totals.wet_grip_per_point
    : 0;
  const attackAdjustment = context.battleContext?.attackingGapMs !== undefined && segment.overtakingOpportunity
    ? -totals.overtake_advantage_per_point
    : 0;
  const defenseAdjustment = context.battleContext?.defendingGapMs !== undefined && segment.defendingOpportunity
    ? totals.defense_advantage_per_point
    : 0;
  const consistencyAdjustment = (context.consistencySample ?? 0) *
    (totals.consistency_variance_ms_per_point + totals.morale_consistency_per_point);
  return (
    totals.segment_pace_ms_per_point +
    totals.low_speed_pace_ms_per_point * segment.lowSpeedDemand +
    totals.high_speed_pace_ms_per_point * segment.highSpeedDemand +
    totals.traction_pace_ms_per_point * segment.tractionDemand +\n    totals.braking_pace_ms_per_point * (segment.brakingDemand ?? 0) +
    (segment.drsAvailable ? totals.drs_pace_ms_per_point : 0) +
    (segment.ersAvailable ? totals.ers_efficiency_per_point : 0) +
    tyreWearAdjustment + wetGripAdjustment + attackAdjustment + defenseAdjustment + consistencyAdjustment
  );
}

/**
 * Builds a deterministic, versioned performance model from an explicit profile.
 * The profile is included in the model snapshot and persisted in race checkpoints.
 */
export function createCalibratedPerformanceModel(
  profile: RacePhysicsCalibrationProfile
): SegmentPerformanceModel {
  const validation = validatePhysicsCalibrationProfile(profile);
  if (!validation.valid) {
    throw new Error(`Invalid physics calibration profile: ${validation.errors.join("; ")}`);
  }
  const snapshot = deepFreeze(JSON.parse(JSON.stringify(profile)) as RacePhysicsCalibrationProfile);
  return Object.freeze({
    id: `calibration.${profile.id}`,
    version: profile.version,
    snapshot: snapshot as unknown as JsonValue,
    battleDetectionGapMs: snapshot.battleDetectionGapMs,
    validateEntrant: (entrant: RaceEntrantSnapshot) => { evaluateAttributeInfluencesUnchecked(entrant, snapshot); },
    calculateAdjustmentMs: (context: SegmentPerformanceContext) =>
      calculateSegmentPaceAdjustmentUnchecked(context, snapshot),
    calculatePitStrategyAdjustments: (entrant: RaceEntrantSnapshot) => {
      const totals = evaluateAttributeInfluencesUnchecked(entrant, snapshot);
      return {
        strategyQualityRiskMultiplier: totals.strategy_quality_per_point,
        pitStopTimeAdjustmentMs: totals.pit_stop_time_ms_per_point
      };
    }
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}
