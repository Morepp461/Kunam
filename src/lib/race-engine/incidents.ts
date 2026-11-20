import type { JsonValue } from "./contracts";
import { SeededRandom } from "./random";

export const INCIDENT_MODEL_SCHEMA_VERSION = 1;

export const INCIDENT_TYPES = [
  "spin", "off_track", "collision", "crash", "mechanical_failure", "engine_failure"
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];
export type RaceControlFlag = "green" | "yellow" | "double_yellow" | "full_course_yellow" | "virtual_safety_car" | "safety_car" | "red_flag";

export interface IncidentCalibration {
  readonly baseRatePerKm: number;
  readonly attributeRatePerPoint: Readonly<Record<string, number>>;
  readonly timeLossMs: number;
  /** Retirement is an explicit calibrated outcome; absent means the incident does not retire the driver. */
  readonly retiresDriver?: boolean;
}

export interface IncidentCalibrationProfile {
  readonly schemaVersion: typeof INCIDENT_MODEL_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly baselineAttributeValue: number;
  readonly maximumRatePerKm: number;
  readonly incidents: Readonly<Record<IncidentType, IncidentCalibration>>;
}

export interface RaceIncident {
  readonly id: string;
  readonly type: IncidentType;
  readonly raceId: string;
  readonly driverId: string;
  readonly lapNumber: number;
  readonly segmentId: string;
  readonly timeLossMs: number;
  readonly maintenanceCostEligible: boolean;
  readonly retiresDriver: boolean;
}

export interface RaceControlProfile {
  readonly id: string;
  readonly version: string;
  readonly flagByIncident: Readonly<Record<IncidentType, RaceControlFlag>>;
  readonly durationMsByFlag: Readonly<Record<Exclude<RaceControlFlag, "green">, number>>;
  /** Optional calibrated segment-time multipliers while each flag is active; omitted flags have no pace effect. */
  readonly paceTimeMultiplierByFlag?: Readonly<Partial<Record<Exclude<RaceControlFlag, "green">, number>>>;
}

export interface RaceControlDecision {
  readonly flag: RaceControlFlag;
  readonly durationMs: number;
  readonly incidentId: string;
}

export interface IncidentModel {
  readonly id: string;
  readonly version: string;
  readonly snapshot: JsonValue;
  readonly profile: IncidentCalibrationProfile;
}

export interface IncidentValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const finite = (value: number) => typeof value === "number" && Number.isFinite(value);
const MAINTENANCE_COST_TYPES = new Set<IncidentType>(["mechanical_failure", "engine_failure", "crash"]);

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

export function validateIncidentCalibrationProfile(profile: IncidentCalibrationProfile): IncidentValidationResult {
  const errors: string[] = [];
  if (profile.schemaVersion !== INCIDENT_MODEL_SCHEMA_VERSION) errors.push("Unsupported incident schema version");
  if (!profile.id.trim() || !profile.version.trim()) errors.push("Incident profile ID and version are required");
  if (!finite(profile.baselineAttributeValue) || profile.baselineAttributeValue < 50 || profile.baselineAttributeValue > 100) errors.push("Incident baseline attribute value must be between 50 and 100");
  if (!finite(profile.maximumRatePerKm) || profile.maximumRatePerKm <= 0) errors.push("maximumRatePerKm must be positive");
  for (const type of INCIDENT_TYPES) {
    const calibration = profile.incidents[type];
    if (!calibration) {
      errors.push(`Missing incident calibration for ${type}`);
      continue;
    }
    if (!finite(calibration.baseRatePerKm) || calibration.baseRatePerKm < 0 || calibration.baseRatePerKm > profile.maximumRatePerKm) errors.push(`${type}.baseRatePerKm is invalid`);
    if (!finite(calibration.timeLossMs) || calibration.timeLossMs < 0) errors.push(`${type}.timeLossMs must be non-negative`);
    if (calibration.retiresDriver !== undefined && typeof calibration.retiresDriver !== "boolean") errors.push(`${type}.retiresDriver must be boolean when supplied`);
    for (const [attributeId, coefficient] of Object.entries(calibration.attributeRatePerPoint)) {
      if (!attributeId.trim() || !finite(coefficient) || Math.abs(coefficient) > 1_000_000) errors.push(`${type} has an invalid attribute coefficient`);
      if (attributeId === "driver.mistake_rate" && coefficient < 0) errors.push("Higher Mistake Rate must not reduce incident probability");
      if ((type === "mechanical_failure" || type === "engine_failure") &&
          attributeId === "car_team.reliability" && coefficient > 0) {
        errors.push("Higher Reliability must not increase mechanical or engine failure probability");
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createIncidentModel(profile: IncidentCalibrationProfile): IncidentModel {
  const validation = validateIncidentCalibrationProfile(profile);
  if (!validation.valid) throw new Error(`Invalid incident profile: ${validation.errors.join("; ")}`);
  const snapshot = deepFreeze(JSON.parse(JSON.stringify(profile)) as JsonValue);
  return Object.freeze({
    id: `incident.${profile.id}`,
    version: profile.version,
    snapshot,
    profile: deepFreeze(JSON.parse(JSON.stringify(profile)) as IncidentCalibrationProfile)
  });
}

/** Uses race seed + stable participant/location identity, so retries and recovery reproduce the same incident. */
export function evaluateSegmentIncident(input: {
  readonly model: IncidentModel;
  readonly raceSeed: number;
  readonly raceId: string;
  readonly driverId: string;
  readonly lapNumber: number;
  readonly segmentId: string;
  readonly distanceMeters: number;
  readonly attributes: Readonly<Record<string, number>>;
}): RaceIncident | null {
  const { model, raceSeed, raceId, driverId, lapNumber, segmentId, distanceMeters, attributes } = input;
  if (!Number.isInteger(raceSeed) || raceSeed < 0 || raceSeed > 0xffff_ffff) throw new RangeError("raceSeed must be an unsigned 32-bit integer");
  if (!raceId.trim() || !driverId.trim() || !segmentId.trim()) throw new Error("Incident identity fields are required");
  if (!Number.isInteger(lapNumber) || lapNumber < 1 || !finite(distanceMeters) || distanceMeters <= 0) throw new RangeError("Incident lap and segment distance are invalid");

  const rates = INCIDENT_TYPES.map((type) => {
    const calibration = model.profile.incidents[type];
    let rate = calibration.baseRatePerKm;
    for (const [attributeId, coefficient] of Object.entries(calibration.attributeRatePerPoint)) {
      const value = attributes[attributeId];
      if (!finite(value)) throw new Error(`Missing finite incident attribute value: ${attributeId}`);
      rate += (value - model.profile.baselineAttributeValue) * coefficient;
    }
    return { type, rate: Math.max(0, Math.min(model.profile.maximumRatePerKm, rate)) };
  });
  const totalRate = rates.reduce((sum, entry) => sum + entry.rate, 0);
  if (totalRate <= 0) return null;

  const random = new SeededRandom(hashText(`${raceSeed}:${raceId}:${driverId}:${lapNumber}:${segmentId}`));
  const probability = 1 - Math.exp(-totalRate * distanceMeters / 1000);
  if (random.nextFloat() >= probability) return null;
  let selection = random.nextFloat() * totalRate;
  let selected = rates[rates.length - 1];
  for (const entry of rates) {
    selection -= entry.rate;
    if (selection < 0) {
      selected = entry;
      break;
    }
  }
  const id = `${raceId}:${driverId}:${lapNumber}:${segmentId}:${selected.type}`;
  return Object.freeze({
    id,
    type: selected.type,
    raceId,
    driverId,
    lapNumber,
    segmentId,
    timeLossMs: model.profile.incidents[selected.type].timeLossMs,
    maintenanceCostEligible: MAINTENANCE_COST_TYPES.has(selected.type),
    retiresDriver: model.profile.incidents[selected.type].retiresDriver ?? false
  });
}

export function validateRaceControlProfile(profile: RaceControlProfile): IncidentValidationResult {
  const errors: string[] = [];
  if (!profile.id.trim() || !profile.version.trim()) errors.push("Race-control profile ID and version are required");
  for (const type of INCIDENT_TYPES) {
    const flag = profile.flagByIncident[type];
    if (!flag || !["green", "yellow", "double_yellow", "full_course_yellow", "virtual_safety_car", "safety_car", "red_flag"].includes(flag)) {
      errors.push(`Race-control profile has an invalid flag for ${type}`);
      continue;
    }
    if (flag !== "green") {
      const duration = profile.durationMsByFlag[flag];
      if (!finite(duration) || duration < 0) errors.push(`Race-control duration for ${flag} must be non-negative`);
    }
  }
  for (const [flag, multiplier] of Object.entries(profile.paceTimeMultiplierByFlag ?? {})) {
    if (!["yellow", "double_yellow", "full_course_yellow", "virtual_safety_car", "safety_car", "red_flag"].includes(flag) ||
        !finite(multiplier) || multiplier < 1) {
      errors.push(`Race-control pace multiplier for ${flag} must be finite and at least 1`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function resolveRaceControl(
  incident: RaceIncident,
  profile: RaceControlProfile
): RaceControlDecision {
  const flag = profile.flagByIncident[incident.type];
  if (!flag) throw new Error(`Race control profile is missing a flag for ${incident.type}`);
  if (flag === "green") return Object.freeze({ flag, durationMs: 0, incidentId: incident.id });
  const durationMs = profile.durationMsByFlag[flag];
  if (!finite(durationMs) || durationMs < 0) throw new Error(`Race control duration for ${flag} is invalid`);
  return Object.freeze({ flag, durationMs, incidentId: incident.id });
}
