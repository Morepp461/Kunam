import type { JsonValue } from "./contracts";
import { TYRE_COMPOUNDS } from "./tyres";
import type { TyreCompound } from "./tyres";

export const PIT_STRATEGY_SCHEMA_VERSION = 1;

export interface PitStrategyProfile {
  readonly schemaVersion: typeof PIT_STRATEGY_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly pitWindowStartLap: number;
  readonly pitWindowEndLap: number;
  readonly wearTriggerPercent: number;
  readonly minimumLapsBetweenStops: number;
  readonly maximumStops: number;
}

export interface PitStopCandidate {
  readonly compound: TyreCompound;
  readonly pitLaneLossMs: number;
  readonly expectedLapTimeDeltaMs: number;
  readonly expectedDegradationMsPerLap: number;
  readonly riskPenaltyMs: number;
  readonly compatibleWetnessMin: number;
  readonly compatibleWetnessMax: number;
}

export interface PitDecisionInput {
  readonly currentLap: number;
  readonly totalLaps: number;
  readonly currentWearPercent: number;
  readonly currentCompound: TyreCompound;
  readonly currentStopCount: number;
  readonly lastStopLap: number | null;
  readonly trackWetness: number;
  readonly candidates: readonly PitStopCandidate[];
}

export interface PitDecision {
  readonly shouldPit: boolean;
  readonly reason: "outside_window" | "stop_limit" | "minimum_interval" | "wear_below_trigger" | "no_valid_candidate" | "optimal_candidate";
  readonly selectedCompound: TyreCompound | null;
  readonly expectedTimeCostMs: number | null;
  readonly candidateCostsMs: Readonly<Record<string, number>>;
}

export interface PitStrategyModel {
  readonly id: string;
  readonly version: string;
  readonly snapshot: JsonValue;
  readonly profile: PitStrategyProfile;
}

export interface PitStrategyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const finite = (value: number) => typeof value === "number" && Number.isFinite(value);

export function validatePitStrategyProfile(profile: PitStrategyProfile): PitStrategyValidationResult {
  const errors: string[] = [];
  if (profile.schemaVersion !== PIT_STRATEGY_SCHEMA_VERSION) errors.push("Unsupported pit strategy schema version");
  if (!profile.id.trim() || !profile.version.trim()) errors.push("Pit strategy ID and version are required");
  if (!Number.isInteger(profile.pitWindowStartLap) || profile.pitWindowStartLap < 1) errors.push("pitWindowStartLap must be a positive integer");
  if (!Number.isInteger(profile.pitWindowEndLap) || profile.pitWindowEndLap < profile.pitWindowStartLap) errors.push("pitWindowEndLap must be >= pitWindowStartLap");
  if (!finite(profile.wearTriggerPercent) || profile.wearTriggerPercent < 0 || profile.wearTriggerPercent > 100) errors.push("wearTriggerPercent must be between 0 and 100");
  if (!Number.isInteger(profile.minimumLapsBetweenStops) || profile.minimumLapsBetweenStops < 0) errors.push("minimumLapsBetweenStops must be a non-negative integer");
  if (!Number.isInteger(profile.maximumStops) || profile.maximumStops < 0) errors.push("maximumStops must be a non-negative integer");
  return { valid: errors.length === 0, errors };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

export function createPitStrategyModel(profile: PitStrategyProfile): PitStrategyModel {
  const validation = validatePitStrategyProfile(profile);
  if (!validation.valid) throw new Error(`Invalid pit strategy profile: ${validation.errors.join("; ")}`);
  const snapshot = deepFreeze(JSON.parse(JSON.stringify(profile)) as JsonValue);
  return Object.freeze({
    id: `pit.${profile.id}`,
    version: profile.version,
    snapshot,
    profile: deepFreeze(JSON.parse(JSON.stringify(profile)) as PitStrategyProfile)
  });
}

/** Chooses the lowest caller-calibrated total time cost; ties are stable by compound ID. */
export function choosePitDecision(model: PitStrategyModel, input: PitDecisionInput): PitDecision {
  const { profile } = model;
  if (!Number.isInteger(input.currentLap) || !Number.isInteger(input.totalLaps) ||
      input.currentLap < 1 || input.totalLaps < input.currentLap) throw new RangeError("Race lap progress is invalid");
  if (!finite(input.currentWearPercent) || input.currentWearPercent < 0 || input.currentWearPercent > 100) throw new RangeError("currentWearPercent must be between 0 and 100");
  if (!finite(input.trackWetness) || input.trackWetness < 0 || input.trackWetness > 1) throw new RangeError("trackWetness must be between 0 and 1");
  if (!(TYRE_COMPOUNDS as readonly string[]).includes(input.currentCompound)) throw new RangeError("Unsupported current tyre compound");
  if (!Number.isInteger(input.currentStopCount) || input.currentStopCount < 0) throw new RangeError("currentStopCount must be a non-negative integer");

  const result = (reason: PitDecision["reason"]): PitDecision => Object.freeze({
    shouldPit: false, reason, selectedCompound: null, expectedTimeCostMs: null, candidateCostsMs: Object.freeze({})
  });
  if (input.currentLap < profile.pitWindowStartLap || input.currentLap > profile.pitWindowEndLap) return result("outside_window");
  if (input.currentStopCount >= profile.maximumStops) return result("stop_limit");
  if (input.lastStopLap !== null && input.currentLap - input.lastStopLap < profile.minimumLapsBetweenStops) return result("minimum_interval");
  if (input.currentWearPercent < profile.wearTriggerPercent) return result("wear_below_trigger");

  const remainingLaps = input.totalLaps - input.currentLap + 1;
  const costs: Record<string, number> = {};
  for (const candidate of input.candidates) {
    const values = [
      candidate.pitLaneLossMs, candidate.expectedLapTimeDeltaMs,
      candidate.expectedDegradationMsPerLap, candidate.riskPenaltyMs,
      candidate.compatibleWetnessMin, candidate.compatibleWetnessMax
    ];
    if (values.some((value) => !finite(value))) throw new RangeError("Pit candidate values must be finite");
    if (candidate.pitLaneLossMs < 0 || candidate.riskPenaltyMs < 0 ||
        candidate.compatibleWetnessMin < 0 || candidate.compatibleWetnessMax > 1 ||
        candidate.compatibleWetnessMin > candidate.compatibleWetnessMax) {
      throw new RangeError("Pit candidate constraints are invalid");
    }
    if (!(TYRE_COMPOUNDS as readonly string[]).includes(candidate.compound)) throw new RangeError("Unsupported candidate tyre compound");
    if (candidate.compound === input.currentCompound) continue;
    if (input.trackWetness < candidate.compatibleWetnessMin || input.trackWetness > candidate.compatibleWetnessMax) continue;
    costs[candidate.compound] = candidate.pitLaneLossMs +
      remainingLaps * (candidate.expectedLapTimeDeltaMs + candidate.expectedDegradationMsPerLap) +
      candidate.riskPenaltyMs;
  }
  const selected = Object.entries(costs).sort(([compoundA, costA], [compoundB, costB]) =>
    costA - costB || compoundA.localeCompare(compoundB)
  )[0];
  if (!selected) return result("no_valid_candidate");
  return Object.freeze({
    shouldPit: true,
    reason: "optimal_candidate",
    selectedCompound: selected[0] as TyreCompound,
    expectedTimeCostMs: selected[1],
    candidateCostsMs: Object.freeze({ ...costs })
  });
}
