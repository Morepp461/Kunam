export const TYRE_MODEL_SCHEMA_VERSION = 1;

export const TYRE_COMPOUNDS = [
  "soft",
  "medium",
  "hard",
  "intermediate",
  "full_wet"
] as const;

export type TyreCompound = (typeof TYRE_COMPOUNDS)[number];

export interface TyreCompoundCalibration {
  readonly baseWearPercentPerKm: number;
  readonly optimalSurfaceTempMinC: number;
  readonly optimalSurfaceTempMaxC: number;
  readonly temperatureWearPercentPerDegreeC: number;
  readonly surfaceAbrasionWearMultiplier: number;
  readonly loadWearMultiplier: number;
  readonly wetnessMismatchWearMultiplier: number;
  /** 0 represents a dry-track preference; 1 represents a fully wet-track preference. */
  readonly wetnessAffinity: number;
  readonly wearGripLossPercentAtFullWear: number;
  readonly wetnessMismatchGripLossPercent: number;
}

export interface TyreDegradationProfile {
  readonly schemaVersion: typeof TYRE_MODEL_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly baselineAttributeValue: number;
  readonly minimumWearMultiplier: number;
  readonly maximumWearMultiplier: number;
  /** Signed coefficients are calibrated data; no attribute direction is assumed here. */
  readonly driverTyreManagementWearCoefficient: number;
  readonly teamTyreManagementWearCoefficient: number;
  readonly carTyreWearWearCoefficient: number;
  readonly compounds: Readonly<Record<TyreCompound, TyreCompoundCalibration>>;
}

export interface TyreState {
  readonly compound: TyreCompound;
  readonly wearPercent: number;
  readonly distanceDrivenMeters: number;
  readonly surfaceTempC: number;
  readonly carcassTempC: number;
  readonly gripPercent: number;
}

export interface TyreSegmentInput {
  readonly segmentDistanceMeters: number;
  readonly surfaceTempC: number;
  readonly carcassTempC: number;
  readonly trackWetness: number;
  readonly surfaceAbrasion: number;
  readonly loadFactor: number;
  readonly driverTyreManagement: number;
  readonly teamTyreManagement: number;
  readonly carTyreWear: number;
}

export interface TyreProfileValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function assertUnitInterval(label: string, value: number, errors: string[]): void {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    errors.push(`${label} must be between 0 and 1`);
  }
}

export function validateTyreDegradationProfile(
  profile: TyreDegradationProfile
): TyreProfileValidationResult {
  const errors: string[] = [];
  if (profile.schemaVersion !== TYRE_MODEL_SCHEMA_VERSION) {
    errors.push("Unsupported tyre model schema version");
  }
  if (!profile.id.trim() || !profile.version.trim()) {
    errors.push("Tyre profile ID and version are required");
  }
  if (!isFiniteNumber(profile.baselineAttributeValue) || profile.baselineAttributeValue < 50 || profile.baselineAttributeValue > 100) {
    errors.push("Tyre profile baselineAttributeValue must be between 50 and 100");
  }
  if (!isFiniteNumber(profile.minimumWearMultiplier) || profile.minimumWearMultiplier <= 0) {
    errors.push("minimumWearMultiplier must be positive");
  }
  if (!isFiniteNumber(profile.maximumWearMultiplier) || profile.maximumWearMultiplier < profile.minimumWearMultiplier) {
    errors.push("maximumWearMultiplier must be greater than or equal to minimumWearMultiplier");
  }

  for (const [key, coefficient] of [
    ["driverTyreManagementWearCoefficient", profile.driverTyreManagementWearCoefficient],
    ["teamTyreManagementWearCoefficient", profile.teamTyreManagementWearCoefficient],
    ["carTyreWearWearCoefficient", profile.carTyreWearWearCoefficient]
  ] as const) {
    if (!isFiniteNumber(coefficient) || Math.abs(coefficient) > 1_000_000) {
      errors.push(`${key} must be a finite supported coefficient`);
    }
  }

  if (profile.compounds === null || typeof profile.compounds !== "object") {
    errors.push("compounds must define all supported tyre compounds");
    return { valid: false, errors };
  }

  for (const compound of TYRE_COMPOUNDS) {
    const calibration = profile.compounds[compound];
    if (!calibration) {
      errors.push(`Missing tyre calibration for ${compound}`);
      continue;
    }
    if (!isFiniteNumber(calibration.baseWearPercentPerKm) || calibration.baseWearPercentPerKm <= 0) {
      errors.push(`${compound}.baseWearPercentPerKm must be positive`);
    }
    if (
      !isFiniteNumber(calibration.optimalSurfaceTempMinC) ||
      !isFiniteNumber(calibration.optimalSurfaceTempMaxC) ||
      calibration.optimalSurfaceTempMinC >= calibration.optimalSurfaceTempMaxC
    ) {
      errors.push(`${compound} optimal surface temperature range is invalid`);
    }
    for (const [key, value] of [
      ["temperatureWearPercentPerDegreeC", calibration.temperatureWearPercentPerDegreeC],
      ["surfaceAbrasionWearMultiplier", calibration.surfaceAbrasionWearMultiplier],
      ["loadWearMultiplier", calibration.loadWearMultiplier],
      ["wetnessMismatchWearMultiplier", calibration.wetnessMismatchWearMultiplier]
    ] as const) {
      if (!isFiniteNumber(value) || value < 0) {
        errors.push(`${compound}.${key} must be a non-negative finite coefficient`);
      }
    }
    assertUnitInterval(`${compound}.wetnessAffinity`, calibration.wetnessAffinity, errors);
    for (const [key, value] of [
      ["wearGripLossPercentAtFullWear", calibration.wearGripLossPercentAtFullWear],
      ["wetnessMismatchGripLossPercent", calibration.wetnessMismatchGripLossPercent]
    ] as const) {
      if (!isFiniteNumber(value) || value < 0 || value > 100) {
        errors.push(`${compound}.${key} must be between 0 and 100`);
      }
    }
  }

  for (const key of Object.keys(profile.compounds)) {
    if (!(TYRE_COMPOUNDS as readonly string[]).includes(key)) {
      errors.push(`Unknown tyre compound: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function assertTyreProfile(profile: TyreDegradationProfile): void {
  const validation = validateTyreDegradationProfile(profile);
  if (!validation.valid) {
    throw new Error(`Invalid tyre degradation profile: ${validation.errors.join("; ")}`);
  }
}

function assertSegmentInput(input: TyreSegmentInput): void {
  if (!isFiniteNumber(input.segmentDistanceMeters) || input.segmentDistanceMeters <= 0) {
    throw new RangeError("segmentDistanceMeters must be positive");
  }
  if (!isFiniteNumber(input.surfaceTempC) || !isFiniteNumber(input.carcassTempC)) {
    throw new RangeError("Tyre temperatures must be finite");
  }
  for (const [key, value] of [
    ["trackWetness", input.trackWetness],
    ["surfaceAbrasion", input.surfaceAbrasion],
    ["loadFactor", input.loadFactor]
  ] as const) {
    if (!isFiniteNumber(value) || value < 0 || value > 1) {
      throw new RangeError(`${key} must be between 0 and 1`);
    }
  }
  for (const [key, value] of [
    ["driverTyreManagement", input.driverTyreManagement],
    ["teamTyreManagement", input.teamTyreManagement],
    ["carTyreWear", input.carTyreWear]
  ] as const) {
    if (!isFiniteNumber(value) || value < 50 || value > 100) {
      throw new RangeError(`${key} must be between 50 and 100`);
    }
  }
}

function calculateGripPercent(
  wearPercent: number,
  trackWetness: number,
  calibration: TyreCompoundCalibration
): number {
  const wetnessMismatch = Math.abs(trackWetness - calibration.wetnessAffinity);
  const wearGripLoss = wearPercent * calibration.wearGripLossPercentAtFullWear / 100;
  const wetnessGripLoss = wetnessMismatch * calibration.wetnessMismatchGripLossPercent;
  return Math.max(0, Math.min(100, 100 - wearGripLoss - wetnessGripLoss));
}

export function createInitialTyreState(
  compound: TyreCompound,
  trackWetness: number,
  surfaceTempC: number,
  carcassTempC: number,
  profile: TyreDegradationProfile
): TyreState {
  assertTyreProfile(profile);
  if (!(TYRE_COMPOUNDS as readonly string[]).includes(compound)) {
    throw new RangeError("Unsupported tyre compound");
  }
  if (!isFiniteNumber(trackWetness) || trackWetness < 0 || trackWetness > 1) {
    throw new RangeError("trackWetness must be between 0 and 1");
  }
  if (!isFiniteNumber(surfaceTempC) || !isFiniteNumber(carcassTempC)) {
    throw new RangeError("Tyre temperatures must be finite");
  }
  return Object.freeze({
    compound,
    wearPercent: 0,
    distanceDrivenMeters: 0,
    surfaceTempC,
    carcassTempC,
    gripPercent: calculateGripPercent(0, trackWetness, profile.compounds[compound])
  });
}

/**
 * Advances tyre degradation by one completed segment.
 * All gameplay coefficients come from the versioned profile; no compound defaults are embedded.
 */
export function advanceTyreState(
  state: TyreState,
  input: TyreSegmentInput,
  profile: TyreDegradationProfile
): TyreState {
  assertTyreProfile(profile);
  assertSegmentInput(input);
  if (!(TYRE_COMPOUNDS as readonly string[]).includes(state.compound)) {
    throw new RangeError("Tyre state contains an unsupported compound");
  }
  if (
    !isFiniteNumber(state.wearPercent) || state.wearPercent < 0 || state.wearPercent > 100 ||
    !isFiniteNumber(state.distanceDrivenMeters) || state.distanceDrivenMeters < 0 ||
    !isFiniteNumber(state.surfaceTempC) || !isFiniteNumber(state.carcassTempC) ||
    !isFiniteNumber(state.gripPercent) || state.gripPercent < 0 || state.gripPercent > 100
  ) {
    throw new RangeError("Tyre state wear and distance are invalid");
  }

  const calibration = profile.compounds[state.compound];
  const temperatureDeviationC =
    Math.max(0, calibration.optimalSurfaceTempMinC - input.surfaceTempC) +
    Math.max(0, input.surfaceTempC - calibration.optimalSurfaceTempMaxC);
  const wetnessMismatch = Math.abs(input.trackWetness - calibration.wetnessAffinity);
  const attributeAdjustment =
    (input.driverTyreManagement - profile.baselineAttributeValue) * profile.driverTyreManagementWearCoefficient +
    (input.teamTyreManagement - profile.baselineAttributeValue) * profile.teamTyreManagementWearCoefficient +
    (input.carTyreWear - profile.baselineAttributeValue) * profile.carTyreWearWearCoefficient;
  const rawWearMultiplier =
    1 +
    attributeAdjustment +
    temperatureDeviationC * calibration.temperatureWearPercentPerDegreeC +
    input.surfaceAbrasion * calibration.surfaceAbrasionWearMultiplier +
    input.loadFactor * calibration.loadWearMultiplier +
    wetnessMismatch * calibration.wetnessMismatchWearMultiplier;
  const wearMultiplier = Math.max(
    profile.minimumWearMultiplier,
    Math.min(profile.maximumWearMultiplier, rawWearMultiplier)
  );
  const wearIncrease =
    calibration.baseWearPercentPerKm * (input.segmentDistanceMeters / 1000) * wearMultiplier;
  const wearPercent = Math.min(100, state.wearPercent + wearIncrease);

  return Object.freeze({
    compound: state.compound,
    wearPercent,
    distanceDrivenMeters: state.distanceDrivenMeters + input.segmentDistanceMeters,
    surfaceTempC: input.surfaceTempC,
    carcassTempC: input.carcassTempC,
    gripPercent: calculateGripPercent(wearPercent, input.trackWetness, calibration)
  });
}

export function replaceTyreSet(
  compound: TyreCompound,
  trackWetness: number,
  surfaceTempC: number,
  carcassTempC: number,
  profile: TyreDegradationProfile
): TyreState {
  return createInitialTyreState(compound, trackWetness, surfaceTempC, carcassTempC, profile);
}
