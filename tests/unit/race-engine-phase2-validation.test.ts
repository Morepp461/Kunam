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

  it("passes Reliability sensitivity direction over 1,000 identical seeds", () => {
    const base = profile(0);
    const reliabilityProfile: IncidentCalibrationProfile = {
      ...base,
      id: "reliability-sensitivity",
      incidents: {
        ...base.incidents,
        mechanical_failure: {
          baseRatePerKm: 0.2,
          attributeRatePerPoint: { "car_team.reliability": -0.002 },
          timeLossMs: 1000
        }
      }
    };
    const model = createIncidentModel(reliabilityProfile);
    const count = (reliability: number) =>
      Array.from({ length: 1000 }, (_, seed) =>
        evaluateSegmentIncident({
          model, raceSeed: seed + 1, raceId: "reliability-sensitivity",
          driverId: "driver-1", lapNumber: 1, segmentId: "segment-1",
          distanceMeters: 1000, attributes: { "car_team.reliability": reliability }
        })
      ).filter((incident) => incident?.type === "mechanical_failure").length;
    expect(count(100)).toBeLessThan(count(50));
  });

  it("passes Race Pace sensitivity direction over 1,000 seeded race simulations", () => {
    const attributes: Record<string, Record<string, number>> = Object.fromEntries(
      RACE_ATTRIBUTE_DEFINITIONS.map((definition) => [definition.id, { segment_pace_ms_per_point: -0.001 }])
    );
    attributes["driver.race_pace"] = { segment_pace_ms_per_point: -1 };
    const calibration: RacePhysicsCalibrationProfile = {
      schemaVersion: 2, attributeSchemaVersion: 1, id: "race-pace-sensitivity",
      version: "1.0.0", baselineAttributeValue: 50, battleDetectionGapMs: 0,
      attributes, hqEffects: {}
    };
    const model = createCalibratedPerformanceModel(calibration);
    for (let seed = 1; seed <= 1000; seed += 1) {
      const baseline = createSyntheticRaceFixture({ seed, driverCount: 2, teamCount: 1, totalLaps: 1 });
      const improved = {
        ...baseline,
        entrants: baseline.entrants.map((entrant, index) => index === 0
          ? { ...entrant, driverAttributes: { ...entrant.driverAttributes, race_pace: 100 } }
          : entrant)
      };
      const baselineRace = new RaceSimulation(baseline, { performanceModel: model, config: { noiseAmplitudeMs: 5 } });
      const improvedRace = new RaceSimulation(improved, { performanceModel: model, config: { noiseAmplitudeMs: 5 } });
      baselineRace.runToCompletion();
      improvedRace.runToCompletion();
      const baselineTime = baselineRace.classification.find((entry) => entry.driverId === "synthetic-driver-01")!.elapsedMs;
      const improvedTime = improvedRace.classification.find((entry) => entry.driverId === "synthetic-driver-01")!.elapsedMs;
      expect(improvedTime).toBeLessThan(baselineTime);
    }
  });

});
