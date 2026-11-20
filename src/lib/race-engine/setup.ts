import type { JsonValue } from "./contracts";

export const CAR_SETUP_SCHEMA_VERSION = 1;

export const CAR_SETUP_KEYS = [
  "aeroSetting",
  "suspensionSetting",
  "brakeBalanceFrontPercent",
  "frontTyrePressurePsi",
  "rearTyrePressurePsi"
] as const;

export type CarSetupKey = (typeof CAR_SETUP_KEYS)[number];

/**
 * Immutable pre-race setup snapshot. Numeric bounds and performance effects
 * are supplied by the versioned calibration profile, never guessed here.
 */
export interface CarSetupSnapshot {
  readonly schemaVersion: typeof CAR_SETUP_SCHEMA_VERSION;
  readonly aeroSetting: number;
  readonly suspensionSetting: number;
  readonly brakeBalanceFrontPercent: number;
  readonly frontTyrePressurePsi: number;
  readonly rearTyrePressurePsi: number;
}

export interface CarSetupRange {
  readonly minimum: number;
  readonly maximum: number;
  readonly baseline: number;
}

export interface CarSetupCalibration {
  readonly schemaVersion: typeof CAR_SETUP_SCHEMA_VERSION;
  readonly ranges: Readonly<Record<CarSetupKey, CarSetupRange>>;
  readonly influences: Readonly<Record<CarSetupKey, Readonly<Record<string, number>>>>;
}

export interface CarSetupValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateCarSetupSnapshot(
  setup: CarSetupSnapshot,
  calibration?: CarSetupCalibration
): CarSetupValidationResult {
  const errors: string[] = [];
  if (setup.schemaVersion !== CAR_SETUP_SCHEMA_VERSION) errors.push("Unsupported car setup schema version");
  for (const key of CAR_SETUP_KEYS) {
    const value = setup[key];
    if (!Number.isFinite(value)) errors.push(`Car setup ${key} must be finite`);
    if (calibration) {
      const range = calibration.ranges[key];
      if (!range) {
        errors.push(`Car setup calibration is missing range for ${key}`);
      } else if (Number.isFinite(value) && (value < range.minimum || value > range.maximum)) {
        errors.push(`Car setup ${key} must be between ${range.minimum} and ${range.maximum}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function cloneCarSetupSnapshot(setup: CarSetupSnapshot): CarSetupSnapshot {
  return Object.freeze({ ...setup });
}

export function carSetupToJson(setup: CarSetupSnapshot): JsonValue {
  return {
    schemaVersion: setup.schemaVersion,
    aeroSetting: setup.aeroSetting,
    suspensionSetting: setup.suspensionSetting,
    brakeBalanceFrontPercent: setup.brakeBalanceFrontPercent,
    frontTyrePressurePsi: setup.frontTyrePressurePsi,
    rearTyrePressurePsi: setup.rearTyrePressurePsi
  };
}
