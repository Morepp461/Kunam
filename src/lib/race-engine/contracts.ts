import {
  ATTRIBUTE_SCHEMA_VERSION,
  validateAttributeValues
} from "./attributes";
import type {
  CarTeamAttributeValues,
  DriverAttributeValues
} from "./attributes";

export const RACE_ENGINE_VERSION = "0.1.0";
export const RACE_START_SNAPSHOT_SCHEMA_VERSION = 1;

export interface CircuitSegmentSnapshot {
  readonly id: string;
  readonly sectorNumber: number;
  readonly distanceMeters: number;
  readonly gripFactor: number;
  readonly lowSpeedDemand: number;
  readonly highSpeedDemand: number;
  readonly tractionDemand: number;
  readonly drsAvailable: boolean;
}

export interface RaceEntrantSnapshot {
  readonly driverId: string;
  readonly teamId: string;
  readonly driverNameSnapshot: string;
  readonly teamNameSnapshot: string;
  readonly driverAttributes: DriverAttributeValues;
  readonly carTeamAttributes: CarTeamAttributeValues;
  readonly hqEffects: Readonly<Record<string, number>>;
}

export interface RaceStartSnapshot {
  readonly schemaVersion: typeof RACE_START_SNAPSHOT_SCHEMA_VERSION;
  readonly engineVersion: string;
  readonly attributeSchemaVersion: typeof ATTRIBUTE_SCHEMA_VERSION;
  readonly raceId: string;
  readonly seed: number;
  readonly createdAt: string;
  readonly circuit: {
    readonly id: string;
    readonly revision: string;
    readonly name: string;
    readonly totalLaps: number;
    readonly targetLapTimeMs: number;
    readonly segments: readonly CircuitSegmentSnapshot[];
  };
  readonly entrants: readonly RaceEntrantSnapshot[];
}

export interface SnapshotValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateRaceStartSnapshot(
  value: RaceStartSnapshot
): SnapshotValidationResult {
  const errors: string[] = [];

  if (value.schemaVersion !== RACE_START_SNAPSHOT_SCHEMA_VERSION) {
    errors.push("Unsupported race-start snapshot schema version");
  }
  if (value.attributeSchemaVersion !== ATTRIBUTE_SCHEMA_VERSION) {
    errors.push("Unsupported attribute schema version");
  }
  if (!value.raceId.trim()) errors.push("raceId is required");
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) {
    errors.push("seed must be an unsigned 32-bit integer");
  }
  if (!Number.isFinite(Date.parse(value.createdAt))) errors.push("createdAt must be a valid timestamp");
  if (!value.circuit.id.trim() || !value.circuit.revision.trim()) {
    errors.push("Circuit ID and revision are required");
  }
  if (!Number.isInteger(value.circuit.totalLaps) || value.circuit.totalLaps < 1) {
    errors.push("Circuit totalLaps must be a positive integer");
  }
  if (!Number.isFinite(value.circuit.targetLapTimeMs) || value.circuit.targetLapTimeMs <= 0) {
    errors.push("Circuit targetLapTimeMs must be positive");
  }
  if (value.circuit.segments.length === 0) errors.push("Circuit must contain at least one segment");

  const segmentIds = new Set<string>();
  for (const segment of value.circuit.segments) {
    if (!segment.id.trim() || segmentIds.has(segment.id)) {
      errors.push("Circuit segment IDs must be present and unique");
    }
    segmentIds.add(segment.id);
    if (!Number.isInteger(segment.sectorNumber) || segment.sectorNumber < 1) {
      errors.push(`Segment ${segment.id} has an invalid sectorNumber`);
    }
    if (!Number.isFinite(segment.distanceMeters) || segment.distanceMeters <= 0) {
      errors.push(`Segment ${segment.id} distanceMeters must be positive`);
    }
    for (const [key, demand] of [
      ["gripFactor", segment.gripFactor],
      ["lowSpeedDemand", segment.lowSpeedDemand],
      ["highSpeedDemand", segment.highSpeedDemand],
      ["tractionDemand", segment.tractionDemand]
    ] as const) {
      if (!Number.isFinite(demand) || demand < 0) {
        errors.push(`Segment ${segment.id} ${key} must be a non-negative finite number`);
      }
    }
  }

  if (value.entrants.length === 0) errors.push("Race must contain at least one entrant");
  const driverIds = new Set<string>();
  for (const entrant of value.entrants) {
    if (!entrant.driverId.trim() || driverIds.has(entrant.driverId)) {
      errors.push("Entrant driver IDs must be present and unique");
    }
    driverIds.add(entrant.driverId);
    if (!entrant.teamId.trim()) errors.push(`Entrant ${entrant.driverId} must have a teamId`);
    errors.push(...validateAttributeValues("driver", entrant.driverAttributes).errors.map((error) => `${entrant.driverId}: ${error}`));
    errors.push(...validateAttributeValues("car_team", entrant.carTeamAttributes).errors.map((error) => `${entrant.driverId}: ${error}`));
    for (const [key, effect] of Object.entries(entrant.hqEffects)) {
      if (!Number.isFinite(effect)) errors.push(`${entrant.driverId}: HQ effect ${key} must be finite`);
    }
  }

  return { valid: errors.length === 0, errors };
}
