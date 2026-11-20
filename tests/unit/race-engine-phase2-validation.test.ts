import { describe, expect, it } from "vitest";
import { createIncidentModel, evaluateSegmentIncident } from "../../src/lib/race-engine/incidents";
import { createCalibratedPerformanceModel } from "../../src/lib/race-engine/calibration";
import type { RacePhysicsCalibrationProfile } from "../../src/lib/race-engine/calibration";
import { RACE_ATTRIBUTE_DEFINITIONS } from "../../src/lib/race-engine/attributes";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import type { IncidentCalibrationProfile, IncidentType } from "../../src/lib/race-engine/incidents";

const incidentTypes: readonly IncidentType[] = ["spin", "off_track", "collision", "crash", "mechanical_failure", "engine_failure"];

function profile(rate: number): IncidentCalibrationProfile {
  return {
    schemaVersion: 1, id: "monte-carlo-validation", version: "1.0.0",
    baselineAttributeValue: 50, maximumRatePerKm: 1,
    incidents: Object.fromEntries(incidentTypes.map((type) => [type, {
      baseRatePerKm: type === "spin" ? rate : 0,
      attributeRatePerPoint: type === "spin" ? { "driver.mistake_rate": 0.002 } : {},
      timeLossMs: 1000
    }])) as IncidentCalibrationProfile["incidents"]
  };
}

describe("Phase 2 deterministic Monte Carlo validation", () => {
  it("replays 1,000 seeded samples exactly and produces a bounded event distribution", () => {
    const model = createIncidentModel(profile(0.02));
    const run = () => Array.from({ length: 1000 }, (_, seed) =>
      evaluateSegmentIncident({
        model, raceSeed: seed + 1, raceId: "mc-race", driverId: "driver-1",
        lapNumber: 1, segmentId: "segment-1", distanceMeters: 1000,
        attributes: { "driver.mistake_rate": 50 }
      })?.type ?? null
    );
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    const incidents = first.filter(Boolean).length;
    expect(incidents).toBeGreaterThan(0);
    expect(incidents).toBeLessThan(100);
  });

  it("passes the Mistake Rate sensitivity direction over the same 1,000 seeds", () => {
    const lowModel = createIncidentModel(profile(0.02));
    const highModel = createIncidentModel(profile(0.02));
    const count = (model: typeof lowModel, rating: number) =>
      Array.from({ length: 1000 }, (_, seed) =>
        evaluateSegmentIncident({
          model, raceSeed: seed + 1, raceId: "sensitivity", driverId: "driver-1",
          lapNumber: 1, segmentId: "segment-1", distanceMeters: 1000,
          attributes: { "driver.mistake_rate": rating }
        })
      ).filter(Boolean).length;
    expect(count(highModel, 100)).toBeGreaterThan(count(lowModel, 50));
  });
});
