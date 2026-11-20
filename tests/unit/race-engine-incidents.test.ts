import { describe, expect, it } from "vitest";
import {
  createIncidentModel,
  evaluateSegmentIncident,
  validateRaceControlProfile,
  resolveRaceControl
} from "../../src/lib/race-engine/incidents";
import type { IncidentCalibrationProfile, IncidentType, RaceControlProfile } from "../../src/lib/race-engine/incidents";

const types: readonly IncidentType[] = ["spin", "off_track", "collision", "crash", "mechanical_failure", "engine_failure"];
function makeProfile(activeType: IncidentType = "spin", baseRatePerKm = 100): IncidentCalibrationProfile {
  return {
    schemaVersion: 1, id: "incident-test", version: "1.0.0",
    baselineAttributeValue: 50, maximumRatePerKm: 100,
    incidents: Object.fromEntries(types.map((type) => [type, {
      baseRatePerKm: type === activeType ? baseRatePerKm : 0,
      attributeRatePerPoint: type === activeType ? { "driver.mistake_rate": 0.01 } : {},
      timeLossMs: 12_000
    }])) as IncidentCalibrationProfile["incidents"]
  };
}
const control: RaceControlProfile = {
  id: "control-test", version: "1.0.0",
  flagByIncident: {
    spin: "yellow", off_track: "yellow", collision: "double_yellow",
    crash: "safety_car", mechanical_failure: "virtual_safety_car", engine_failure: "red_flag"
  },
  durationMsByFlag: {
    yellow: 10_000, double_yellow: 20_000, full_course_yellow: 25_000, virtual_safety_car: 30_000,
    safety_car: 40_000, red_flag: 50_000
  }
};
function evaluate(model: ReturnType<typeof createIncidentModel>, seed: number) {
  return evaluateSegmentIncident({
    model, raceSeed: seed, raceId: "race-1", driverId: "driver-1",
    lapNumber: 1, segmentId: "segment-1", distanceMeters: 1000,
    attributes: { "driver.mistake_rate": 50 }
  });
}

describe("Deterministic incident and race control models", () => {
  it("reproduces the same incident for the same race seed and segment identity", () => {
    const model = createIncidentModel(makeProfile());
    expect(evaluate(model, 42)).toEqual(evaluate(model, 42));
  });

  it("changes incident outcomes when the seed changes and keeps incident IDs stable", () => {
    const model = createIncidentModel(makeProfile());
    const results = Array.from({ length: 20 }, (_, index) => evaluate(model, index + 1));
    expect(results.some(Boolean)).toBe(true);
    for (const incident of results.filter((item) => item !== null)) {
      expect(incident.id).toContain("race-1:driver-1:1:segment-1");
    }
  });

  it("marks only mechanical failure, engine failure, and crash as maintenance-cost eligible", () => {
    for (const type of types) {
      const model = createIncidentModel(makeProfile(type));
      const incident = evaluate(model, 99);
      expect(incident).not.toBeNull();
      expect(incident!.maintenanceCostEligible).toBe(
        type === "mechanical_failure" || type === "engine_failure" || type === "crash"
      );
    }
  });

  it("uses explicitly configured race-control flags and durations", () => {
    const incident = evaluate(createIncidentModel(makeProfile("crash")), 99)!;
    expect(resolveRaceControl(incident, control)).toEqual({
      flag: "safety_car", durationMs: 40_000, incidentId: incident.id
    });
  });

  it("enforces higher Reliability as a protective factor for mechanical and engine failures", () => {
    const profile = makeProfile("mechanical_failure");
    const invalid = {
      ...profile,
      incidents: {
        ...profile.incidents,
        mechanical_failure: {
          ...profile.incidents.mechanical_failure,
          attributeRatePerPoint: { "car_team.reliability": 0.01 }
        }
      }
    };
    expect(() => createIncidentModel(invalid)).toThrow(/Higher Reliability/);
  });

  it("validates optional race-control pace multipliers without inventing defaults", () => {
    expect(validateRaceControlProfile({
      ...control,
      paceTimeMultiplierByFlag: { red_flag: 1.4 }
    }).valid).toBe(true);
    expect(validateRaceControlProfile({
      ...control,
      paceTimeMultiplierByFlag: { red_flag: 0.9 }
    }).valid).toBe(false);
  });

  it("rejects invalid calibration and enforces higher-is-riskier Mistake Rate", () => {
    const profile = makeProfile();
    expect(() => createIncidentModel({
      ...profile,
      incidents: {
        ...profile.incidents,
        spin: { ...profile.incidents.spin, attributeRatePerPoint: { "driver.mistake_rate": -0.01 } }
      }
    })).toThrow(/must not reduce incident probability/);
  });
});
