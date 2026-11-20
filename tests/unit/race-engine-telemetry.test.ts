import { describe, expect, it } from "vitest";
import {
  createRaceTelemetrySample,
  validateRaceTelemetrySample
} from "../../src/lib/race-engine/telemetry";
import type { RaceTelemetrySample } from "../../src/lib/race-engine/telemetry";

function sample(): RaceTelemetrySample {
  return {
    schemaVersion: 1,
    raceId: "race-1",
    driverId: "driver-1",
    recordedAt: "2026-11-20T14:00:00.000Z",
    simulationTimeMs: 125000,
    lapNumber: 2,
    sectorNumber: 2,
    segmentId: "segment-4",
    speedKph: 287,
    throttlePercent: 94,
    brakingPercent: 0,
    gear: 8,
    tyre: {
      compound: "medium",
      wearPercent: 22,
      surfaceTempC: 91,
      carcassTempC: 88,
      gripPercent: 96
    },
    ersDeploymentPercent: 72,
    drsActive: true,
    racePosition: 3,
    trackPositionMeters: 1842.5
  };
}

describe("Race telemetry contract", () => {
  it("accepts the PRD minimum telemetry fields with separate race and track positions", () => {
    expect(validateRaceTelemetrySample(sample()).valid).toBe(true);
  });

  it("rejects invalid numeric ranges, missing identity, and invalid timestamps", () => {
    const invalid = {
      ...sample(),
      driverId: " ",
      recordedAt: "not-a-date",
      speedKph: 601,
      throttlePercent: -1,
      tyre: { ...sample().tyre, wearPercent: 101 },
      ersDeploymentPercent: Number.NaN,
      racePosition: 0
    };
    const result = validateRaceTelemetrySample(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(6);
  });

  it("rejects unsupported compounds and non-finite tyre/environment values", () => {
    const invalid = {
      ...sample(),
      tyre: { ...sample().tyre, compound: "ultra_soft" as "medium", surfaceTempC: Number.POSITIVE_INFINITY }
    };
    expect(validateRaceTelemetrySample(invalid).errors).toEqual(expect.arrayContaining([
      "tyre compound is unsupported",
      "tyre surfaceTempC must be finite"
    ]));
  });

  it("returns an immutable sample and immutable tyre snapshot", () => {
    const created = createRaceTelemetrySample(sample());
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.tyre)).toBe(true);
    expect(() => createRaceTelemetrySample({ ...sample(), lapNumber: 0 })).toThrow(/lapNumber/);
  });
});
