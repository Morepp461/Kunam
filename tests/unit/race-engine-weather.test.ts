import { describe, expect, it } from "vitest";
import {
  advanceWeatherState,
  createInitialWeatherState,
  createWeatherSimulationModel,
  getWeatherInput,
  validateWeatherEvolutionProfile
} from "../../src/lib/race-engine/weather";
import type { WeatherEvolutionProfile, WeatherInput } from "../../src/lib/race-engine/weather";

const profile: WeatherEvolutionProfile = {
  schemaVersion: 1,
  id: "weather-test",
  version: "1.0.0",
  waterRetentionMultiplier: 1,
  evaporationMmPerHourPerSurfaceDegree: 0.001,
  windDryingMmPerHourPerMps: 0.01,
  maximumWaterDepthMm: 10,
  gripLossPercentPerMmWater: 2,
  rubberingGripGainPercentAtFull: 3,
  minimumGripPercent: 20,
  maximumGripPercent: 100
};
const dry: WeatherInput = {
  airTempC: 24, surfaceTempC: 30, relativeHumidityPercent: 40,
  rainfallMmPerHour: 0, windSpeedMps: 2, windDirectionDeg: 180,
  visibilityMeters: 10_000, baseGripPercent: 95, rubberingInPercent: 0.5
};
const wet: WeatherInput = { ...dry, rainfallMmPerHour: 60, surfaceTempC: 18, baseGripPercent: 90 };

describe("Weather evolution model", () => {
  it("requires explicit valid coefficients and samples", () => {
    expect(validateWeatherEvolutionProfile(profile).valid).toBe(true);
    expect(() => createWeatherSimulationModel(profile, { "1:S1": dry })).not.toThrow();
    expect(() => createWeatherSimulationModel({ ...profile, maximumWaterDepthMm: 0 }, { S1: dry })).not.toThrow();
    expect(() => createWeatherSimulationModel({ ...profile, gripLossPercentPerMmWater: -1 }, { S1: dry })).toThrow(/Invalid weather profile/);
  });

  it("freezes weather model inputs and resolves lap-specific overrides", () => {
    const model = createWeatherSimulationModel(profile, { S1: dry, "2:S1": wet });
    expect(getWeatherInput(model, 1, "S1")).toEqual(dry);
    expect(getWeatherInput(model, 2, "S1")).toEqual(wet);
    expect(Object.isFrozen(model.snapshot)).toBe(true);
  });

  it("accumulates rain, dries the track, and bounds wetness and grip", () => {
    const initial = createInitialWeatherState(dry, profile);
    const raining = advanceWeatherState(initial, wet, 600, profile);
    const drying = advanceWeatherState(raining, dry, 3600, profile);
    expect(raining.trackWaterDepthMm).toBeGreaterThan(initial.trackWaterDepthMm);
    expect(raining.trackWetness).toBeGreaterThan(0);
    expect(raining.gripPercent).toBeLessThan(wet.baseGripPercent);
    expect(drying.trackWaterDepthMm).toBeLessThan(raining.trackWaterDepthMm);
    expect(drying.trackWetness).toBeGreaterThanOrEqual(0);
    expect(drying.trackWetness).toBeLessThanOrEqual(1);
    expect(drying.gripPercent).toBeGreaterThanOrEqual(profile.minimumGripPercent);
    expect(drying.gripPercent).toBeLessThanOrEqual(profile.maximumGripPercent);
  });

  it("rejects invalid duration and missing segment conditions", () => {
    const model = createWeatherSimulationModel(profile, { S1: dry });
    expect(() => getWeatherInput(model, 2, "S2")).toThrow(/Missing weather input/);
    expect(() => advanceWeatherState(createInitialWeatherState(dry, profile), wet, 0, profile)).toThrow(/elapsedSeconds/);
  });
});
