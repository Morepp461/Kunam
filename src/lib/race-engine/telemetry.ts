import { TYRE_COMPOUNDS } from "./tyres";
import type { TyreCompound } from "./tyres";

export const RACE_TELEMETRY_SCHEMA_VERSION = 1;

export interface RaceTelemetrySample {
  readonly schemaVersion: typeof RACE_TELEMETRY_SCHEMA_VERSION;
  readonly raceId: string;
  readonly driverId: string;
  readonly recordedAt: string;
  readonly simulationTimeMs: number;
  readonly lapNumber: number;
  readonly sectorNumber: 1 | 2 | 3;
  readonly segmentId: string;
  readonly speedKph: number;
  readonly throttlePercent: number;
  readonly brakingPercent: number;
  readonly gear: number;
  readonly tyre: {
    readonly compound: TyreCompound;
    readonly wearPercent: number;
    readonly surfaceTempC: number;
    readonly carcassTempC: number;
    readonly gripPercent: number;
  };
  readonly ersDeploymentPercent: number;
  readonly drsActive: boolean;
  /** Classified race position, separate from physical track coordinates and distance. */
  readonly racePosition: number;
  readonly trackCoordinates: { readonly x: number; readonly y: number };
  readonly trackPositionMeters: number;
}

export interface RaceTelemetryValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function isFiniteInRange(value: number, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function validateRaceTelemetrySample(sample: RaceTelemetrySample): RaceTelemetryValidationResult {
  const errors: string[] = [];
  if (sample.schemaVersion !== RACE_TELEMETRY_SCHEMA_VERSION) errors.push("Unsupported race telemetry schema version");
  if (!sample.raceId.trim() || !sample.driverId.trim() || !sample.segmentId.trim()) {
    errors.push("Race telemetry identity fields are required");
  }
  if (!Number.isFinite(Date.parse(sample.recordedAt))) errors.push("Race telemetry recordedAt must be a valid timestamp");
  if (!Number.isFinite(sample.simulationTimeMs) || sample.simulationTimeMs < 0) errors.push("simulationTimeMs must be non-negative");
  if (!Number.isInteger(sample.lapNumber) || sample.lapNumber < 1) errors.push("lapNumber must be a positive integer");
  if (![1, 2, 3].includes(sample.sectorNumber)) errors.push("sectorNumber must be 1, 2, or 3");
  if (!Number.isFinite(sample.speedKph) || sample.speedKph < 0) errors.push("speedKph must be non-negative");
  if (!isFiniteInRange(sample.throttlePercent, 0, 100)) errors.push("throttlePercent must be between 0 and 100");
  if (!isFiniteInRange(sample.brakingPercent, 0, 100)) errors.push("brakingPercent must be between 0 and 100");
  if (!Number.isInteger(sample.gear) || sample.gear < 0) errors.push("gear must be a non-negative integer");
  if (!(TYRE_COMPOUNDS as readonly string[]).includes(sample.tyre.compound)) errors.push("tyre compound is unsupported");
  if (!isFiniteInRange(sample.tyre.wearPercent, 0, 100)) errors.push("tyre wearPercent must be between 0 and 100");
  if (!Number.isFinite(sample.tyre.surfaceTempC)) errors.push("tyre surfaceTempC must be finite");
  if (!Number.isFinite(sample.tyre.carcassTempC)) errors.push("tyre carcassTempC must be finite");
  if (!isFiniteInRange(sample.tyre.gripPercent, 0, 100)) errors.push("tyre gripPercent must be between 0 and 100");
  if (!isFiniteInRange(sample.ersDeploymentPercent, 0, 100)) errors.push("ersDeploymentPercent must be between 0 and 100");
  if (typeof sample.drsActive !== "boolean") errors.push("drsActive must be boolean");
  if (!Number.isInteger(sample.racePosition) || sample.racePosition < 1) errors.push("racePosition must be a positive integer");
  if (!isFiniteInRange(sample.trackCoordinates.x, 0, 1) || !isFiniteInRange(sample.trackCoordinates.y, 0, 1)) {
    errors.push("trackCoordinates must use normalized coordinates between 0 and 1");
  }
  if (!Number.isFinite(sample.trackPositionMeters) || sample.trackPositionMeters < 0) {
    errors.push("trackPositionMeters must be non-negative");
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function createRaceTelemetrySample(sample: RaceTelemetrySample): RaceTelemetrySample {
  const validation = validateRaceTelemetrySample(sample);
  if (!validation.valid) throw new Error(`Invalid race telemetry sample: ${validation.errors.join("; ")}`);
  return Object.freeze({
    ...sample,
    tyre: Object.freeze({ ...sample.tyre })
  });
}
