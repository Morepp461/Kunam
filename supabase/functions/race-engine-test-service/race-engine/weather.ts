import type { JsonValue } from "./contracts.ts";

export const WEATHER_MODEL_SCHEMA_VERSION = 1;

export interface WeatherInput {
  readonly airTempC: number;
  readonly surfaceTempC: number;
  readonly relativeHumidityPercent: number;
  readonly rainfallMmPerHour: number;
  readonly windSpeedMps: number;
  readonly windDirectionDeg: number;
  readonly visibilityMeters: number;
  readonly baseGripPercent: number;
  readonly rubberingInPercent: number;
}

export interface WeatherEvolutionProfile {
  readonly schemaVersion: typeof WEATHER_MODEL_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly waterRetentionMultiplier: number;
  readonly evaporationMmPerHourPerSurfaceDegree: number;
  readonly windDryingMmPerHourPerMps: number;
  readonly maximumWaterDepthMm: number;
  readonly gripLossPercentPerMmWater: number;
  readonly rubberingGripGainPercentAtFull: number;
  readonly minimumGripPercent: number;
  readonly maximumGripPercent: number;
}

export interface WeatherState {
  readonly trackWaterDepthMm: number;
  readonly trackWetness: number;
  readonly gripPercent: number;
  readonly airTempC: number;
  readonly surfaceTempC: number;
  readonly relativeHumidityPercent: number;
  readonly rainfallMmPerHour: number;
  readonly windSpeedMps: number;
  readonly windDirectionDeg: number;
  readonly visibilityMeters: number;
}

export interface WeatherSimulationModel {
  readonly id: string;
  readonly version: string;
  readonly snapshot: JsonValue;
  readonly profile: WeatherEvolutionProfile;
  readonly inputsByLapSegment: Readonly<Record<string, WeatherInput>>;
}

export interface WeatherValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const finite = (value: number) => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function validateWeatherInput(input: WeatherInput): WeatherValidationResult {
  const errors: string[] = [];
  for (const key of ["airTempC", "surfaceTempC", "windDirectionDeg"] as const) {
    if (!finite(input[key])) errors.push(`${key} must be finite`);
  }
  for (const [key, value, min, max] of [
    ["relativeHumidityPercent", input.relativeHumidityPercent, 0, 100],
    ["rainfallMmPerHour", input.rainfallMmPerHour, 0, 500],
    ["windSpeedMps", input.windSpeedMps, 0, 150],
    ["visibilityMeters", input.visibilityMeters, 0, 100_000],
    ["baseGripPercent", input.baseGripPercent, 0, 100],
    ["rubberingInPercent", input.rubberingInPercent, 0, 1]
  ] as const) {
    if (!finite(value) || value < min || value > max) errors.push(`${key} must be between ${min} and ${max}`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateWeatherEvolutionProfile(profile: WeatherEvolutionProfile): WeatherValidationResult {
  const errors: string[] = [];
  if (profile.schemaVersion !== WEATHER_MODEL_SCHEMA_VERSION) errors.push("Unsupported weather model schema version");
  if (!profile.id.trim() || !profile.version.trim()) errors.push("Weather profile ID and version are required");
  for (const [key, value] of [
    ["waterRetentionMultiplier", profile.waterRetentionMultiplier],
    ["evaporationMmPerHourPerSurfaceDegree", profile.evaporationMmPerHourPerSurfaceDegree],
    ["windDryingMmPerHourPerMps", profile.windDryingMmPerHourPerMps],
    ["maximumWaterDepthMm", profile.maximumWaterDepthMm],
    ["gripLossPercentPerMmWater", profile.gripLossPercentPerMmWater],
    ["rubberingGripGainPercentAtFull", profile.rubberingGripGainPercentAtFull]
  ] as const) {
    if (!finite(value) || value < 0) errors.push(`${key} must be a non-negative finite calibration value`);
  }
  if (!finite(profile.minimumGripPercent) || !finite(profile.maximumGripPercent) ||
      profile.minimumGripPercent < 0 || profile.maximumGripPercent > 100 ||
      profile.minimumGripPercent > profile.maximumGripPercent) {
    errors.push("Weather grip bounds must satisfy 0 <= minimum <= maximum <= 100");
  }
  return { valid: errors.length === 0, errors };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

/** All physical coefficients and weather samples are supplied by the caller and frozen into the race model. */
export function createWeatherSimulationModel(
  profile: WeatherEvolutionProfile,
  inputsByLapSegment: Readonly<Record<string, WeatherInput>>
): WeatherSimulationModel {
  const profileResult = validateWeatherEvolutionProfile(profile);
  if (!profileResult.valid) throw new Error(`Invalid weather profile: ${profileResult.errors.join("; ")}`);
  const entries = Object.entries(inputsByLapSegment);
  if (entries.length === 0 || entries.some(([key]) => !key.trim())) {
    throw new Error("Weather model requires at least one lap/segment input");
  }
  for (const [key, input] of entries) {
    const result = validateWeatherInput(input);
    if (!result.valid) throw new Error(`Invalid weather input ${key}: ${result.errors.join("; ")}`);
  }
  const snapshot = deepFreeze(JSON.parse(JSON.stringify({ profile, inputsByLapSegment })) as JsonValue);
  return Object.freeze({
    id: `weather.${profile.id}`,
    version: profile.version,
    snapshot,
    profile: deepFreeze(JSON.parse(JSON.stringify(profile)) as WeatherEvolutionProfile),
    inputsByLapSegment: deepFreeze(JSON.parse(JSON.stringify(inputsByLapSegment)) as Record<string, WeatherInput>)
  });
}

export function getWeatherInput(model: WeatherSimulationModel, lapNumber: number, segmentId: string): WeatherInput {
  const input = model.inputsByLapSegment[`${lapNumber}:${segmentId}`] ?? model.inputsByLapSegment[segmentId];
  if (!input) throw new Error(`Missing weather input for lap ${lapNumber}, segment ${segmentId}`);
  return input;
}

export function createInitialWeatherState(input: WeatherInput, profile: WeatherEvolutionProfile): WeatherState {
  const validation = validateWeatherInput(input);
  if (!validation.valid) throw new RangeError(`Invalid initial weather: ${validation.errors.join("; ")}`);
  const profileValidation = validateWeatherEvolutionProfile(profile);
  if (!profileValidation.valid) throw new RangeError(`Invalid weather profile: ${profileValidation.errors.join("; ")}`);
  return Object.freeze({
    trackWaterDepthMm: 0,
    trackWetness: 0,
    gripPercent: clamp(input.baseGripPercent + input.rubberingInPercent * profile.rubberingGripGainPercentAtFull,
      profile.minimumGripPercent, profile.maximumGripPercent),
    airTempC: input.airTempC,
    surfaceTempC: input.surfaceTempC,
    relativeHumidityPercent: input.relativeHumidityPercent,
    rainfallMmPerHour: input.rainfallMmPerHour,
    windSpeedMps: input.windSpeedMps,
    windDirectionDeg: input.windDirectionDeg,
    visibilityMeters: input.visibilityMeters
  });
}

/** Advances track water and grip for one simulation interval. No implicit weather forecast or coefficients are generated. */
export function advanceWeatherState(
  previous: WeatherState,
  input: WeatherInput,
  elapsedSeconds: number,
  profile: WeatherEvolutionProfile
): WeatherState {
  const inputValidation = validateWeatherInput(input);
  const profileValidation = validateWeatherEvolutionProfile(profile);
  if (!inputValidation.valid) throw new RangeError(`Invalid weather input: ${inputValidation.errors.join("; ")}`);
  if (!profileValidation.valid) throw new RangeError(`Invalid weather profile: ${profileValidation.errors.join("; ")}`);
  if (!finite(elapsedSeconds) || elapsedSeconds <= 0) throw new RangeError("elapsedSeconds must be positive and finite");
  if (!finite(previous.trackWaterDepthMm) || previous.trackWaterDepthMm < 0 ||
      previous.trackWaterDepthMm > profile.maximumWaterDepthMm) {
    throw new RangeError("Previous track water depth is invalid");
  }

  const hours = elapsedSeconds / 3600;
  const rainAdded = input.rainfallMmPerHour * hours * profile.waterRetentionMultiplier;
  const surfaceTemperatureFactor = Math.max(0, input.surfaceTempC);
  const evaporation = (
    surfaceTemperatureFactor * profile.evaporationMmPerHourPerSurfaceDegree +
    input.windSpeedMps * profile.windDryingMmPerHourPerMps
  ) * hours;
  const trackWaterDepthMm = clamp(previous.trackWaterDepthMm + rainAdded - evaporation, 0, profile.maximumWaterDepthMm);
  const trackWetness = profile.maximumWaterDepthMm === 0 ? 0 : trackWaterDepthMm / profile.maximumWaterDepthMm;
  const gripPercent = clamp(
    input.baseGripPercent -
      trackWaterDepthMm * profile.gripLossPercentPerMmWater +
      input.rubberingInPercent * profile.rubberingGripGainPercentAtFull,
    profile.minimumGripPercent,
    profile.maximumGripPercent
  );

  return Object.freeze({
    trackWaterDepthMm,
    trackWetness,
    gripPercent,
    airTempC: input.airTempC,
    surfaceTempC: input.surfaceTempC,
    relativeHumidityPercent: input.relativeHumidityPercent,
    rainfallMmPerHour: input.rainfallMmPerHour,
    windSpeedMps: input.windSpeedMps,
    windDirectionDeg: input.windDirectionDeg,
    visibilityMeters: input.visibilityMeters
  });
}
