import { describe, expect, it } from "vitest";
import {
  advanceTyreState,
  createInitialTyreState,
  replaceTyreSet,
  TYRE_COMPOUNDS,
  validateTyreDegradationProfile
} from "../../src/lib/race-engine/tyres";
import type { TyreDegradationProfile, TyreSegmentInput } from "../../src/lib/race-engine/tyres";

function createProfile(): TyreDegradationProfile {
  const compounds = Object.fromEntries(TYRE_COMPOUNDS.map((compound) => [
    compound,
    {
      baseWearPercentPerKm: compound === "soft" ? 1.2 : 0.8,
      optimalSurfaceTempMinC: 80,
      optimalSurfaceTempMaxC: 100,
      temperatureWearPercentPerDegreeC: 0.02,
      surfaceAbrasionWearMultiplier: 0.2,
      loadWearMultiplier: 0.2,
      wetnessMismatchWearMultiplier: 0.5,
      wetnessAffinity: compound === "intermediate" ? 0.5 : compound === "full_wet" ? 1 : 0,
      wearGripLossPercentAtFullWear: 20,
      wetnessMismatchGripLossPercent: 10
    }
  ])) as TyreDegradationProfile["compounds"];

  return {
    schemaVersion: 1,
    id: "unit-test-tyre-profile",
    version: "1.0.0",
    baselineAttributeValue: 50,
    minimumWearMultiplier: 0.5,
    maximumWearMultiplier: 2,
    driverTyreManagementWearCoefficient: -0.01,
    teamTyreManagementWearCoefficient: -0.005,
    carTyreWearWearCoefficient: 0.01,
    compounds
  };
}

const segmentInput: TyreSegmentInput = {
  segmentDistanceMeters: 800,
  surfaceTempC: 105,
  carcassTempC: 92,
  trackWetness: 0.2,
  surfaceAbrasion: 0.5,
  loadFactor: 0.5,
  driverTyreManagement: 60,
  teamTyreManagement: 70,
  carTyreWear: 60
};

describe("Profile-driven tyre degradation", () => {
  it("requires a calibration entry for all five supported compounds", () => {
    const profile = createProfile();
    expect(validateTyreDegradationProfile(profile).valid).toBe(true);
    expect(Object.keys(profile.compounds)).toHaveLength(5);

    const { soft: _soft, ...missing } = profile.compounds;
    expect(validateTyreDegradationProfile({ ...profile, compounds: missing as TyreDegradationProfile["compounds"] }).valid).toBe(false);
  });

  it("rejects invalid coefficients, ranges, and unknown compounds", () => {
    const profile = createProfile();
    const invalid = {
      ...profile,
      compounds: {
        ...profile.compounds,
        soft: { ...profile.compounds.soft, baseWearPercentPerKm: 0 }
      }
    };
    expect(validateTyreDegradationProfile(invalid).valid).toBe(false);

    const unknown = {
      ...profile,
      compounds: { ...profile.compounds, experimental: profile.compounds.soft }
    };
    expect(validateTyreDegradationProfile(unknown).errors.some((error) => error.includes("Unknown tyre compound"))).toBe(true);
  });

  it("calculates segment wear from the supplied compound, track, weather, load, and attribute profile", () => {
    const profile = createProfile();
    const initial = createInitialTyreState("soft", 0.2, 90, 88, profile);
    const next = advanceTyreState(initial, segmentInput, profile);

    expect(next.wearPercent).toBeCloseTo(1.248);
    expect(next.distanceDrivenMeters).toBe(800);
    expect(next.surfaceTempC).toBe(105);
    expect(next.carcassTempC).toBe(92);
    expect(next.gripPercent).toBeCloseTo(97.7504);
    expect(initial.wearPercent).toBe(0);
  });

  it("keeps wear and grip within their physical percentage bounds", () => {
    const profile = createProfile();
    const initial = createInitialTyreState("medium", 0, 90, 90, profile);
    const worn = advanceTyreState(initial, {
      ...segmentInput,
      segmentDistanceMeters: 100_000,
      surfaceTempC: 200,
      trackWetness: 1
    }, profile);

    expect(worn.wearPercent).toBe(100);
    expect(worn.gripPercent).toBe(70);
  });

  it("creates a fresh immutable tyre set on replacement", () => {
    const profile = createProfile();
    const used = advanceTyreState(
      createInitialTyreState("soft", 0, 90, 90, profile),
      segmentInput,
      profile
    );
    const replacement = replaceTyreSet("hard", 0, 90, 90, profile);

    expect(used.wearPercent).toBeGreaterThan(0);
    expect(replacement).toMatchObject({
      compound: "hard",
      wearPercent: 0,
      distanceDrivenMeters: 0,
      gripPercent: 100
    });
    expect(Object.isFrozen(replacement)).toBe(true);
  });

  it("rejects invalid segment inputs and corrupted tyre states", () => {
    const profile = createProfile();
    const initial = createInitialTyreState("medium", 0.2, 90, 90, profile);
    expect(() => createInitialTyreState("medium", 2, 90, 90, profile)).toThrow(RangeError);
    expect(() => advanceTyreState(initial, { ...segmentInput, loadFactor: -1 }, profile)).toThrow(RangeError);
    expect(() => advanceTyreState({ ...initial, wearPercent: 120 }, segmentInput, profile)).toThrow(RangeError);
  });

  it("uses the same calibration profile and inputs to reproduce the same tyre state", () => {
    const profile = createProfile();
    const initial = createInitialTyreState("intermediate", 0.5, 90, 90, profile);
    const first = advanceTyreState(initial, segmentInput, profile);
    const second = advanceTyreState(initial, segmentInput, profile);
    expect(second).toEqual(first);
  });
});
