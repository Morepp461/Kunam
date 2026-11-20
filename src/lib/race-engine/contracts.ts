import {
  ATTRIBUTE_SCHEMA_VERSION,
  validateAttributeValues
} from "./attributes";
import { validateCircuitGeometryDefinition } from "./circuit-geometry";
import type { CircuitGeometryDefinition } from "./circuit-geometry";
import type {
  CarTeamAttributeValues,
  DriverAttributeValues
} from "./attributes";

export const RACE_ENGINE_VERSION = "0.5.0";
export const RACE_START_SNAPSHOT_SCHEMA_VERSION = 2;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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
  readonly circuit: CircuitGeometryDefinition;
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
  if (!value.engineVersion.trim()) errors.push("engineVersion is required");
  if (!value.raceId.trim()) errors.push("raceId is required");
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) {
    errors.push("seed must be an unsigned 32-bit integer");
  }
  if (!Number.isFinite(Date.parse(value.createdAt))) errors.push("createdAt must be a valid timestamp");
  const circuitValidation = validateCircuitGeometryDefinition(value.circuit);
  errors.push(...circuitValidation.errors.map((error) => `Circuit: ${error}`));

  if (value.entrants.length === 0) errors.push("Race must contain at least one entrant");
  const driverIds = new Set<string>();
  for (const entrant of value.entrants) {
    if (!entrant.driverId.trim() || driverIds.has(entrant.driverId)) {
      errors.push("Entrant driver IDs must be present and unique");
    }
    driverIds.add(entrant.driverId);
    if (!entrant.teamId.trim()) errors.push(`Entrant ${entrant.driverId} must have a teamId`);
    if (!entrant.driverNameSnapshot.trim()) errors.push(`Entrant ${entrant.driverId} must have a driver name snapshot`);
    if (!entrant.teamNameSnapshot.trim()) errors.push(`Entrant ${entrant.driverId} must have a team name snapshot`);
    errors.push(...validateAttributeValues("driver", entrant.driverAttributes).errors.map((error) => `${entrant.driverId}: ${error}`));
    errors.push(...validateAttributeValues("car_team", entrant.carTeamAttributes).errors.map((error) => `${entrant.driverId}: ${error}`));
    for (const [key, effect] of Object.entries(entrant.hqEffects)) {
      if (!Number.isFinite(effect)) errors.push(`${entrant.driverId}: HQ effect ${key} must be finite`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function cloneSnapshotValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSnapshotValue(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, cloneSnapshotValue(child)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

/**
 * Clones and deeply freezes the race-start inputs before the simulation begins.
 * Invalid snapshots fail closed rather than allowing partial race initialization.
 */
export function createImmutableRaceStartSnapshot(
  value: RaceStartSnapshot
): Readonly<RaceStartSnapshot> {
  const validation = validateRaceStartSnapshot(value);
  if (!validation.valid) {
    throw new Error(`Invalid race-start snapshot: ${validation.errors.join("; ")}`);
  }
  return deepFreeze(cloneSnapshotValue(value));
}
