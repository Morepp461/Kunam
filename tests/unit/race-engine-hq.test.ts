import { describe, expect, it } from "vitest";
import { createCalibratedPerformanceModel } from "../../src/lib/race-engine/calibration";
import type { RacePhysicsCalibrationProfile } from "../../src/lib/race-engine/calibration";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { createRaceEngineTestModels } from "../../src/lib/race-engine/test-profiles";
import {
  resolveTeamHqRaceEffects,
  validateTeamHqRaceEffectSnapshot
} from "../../src/lib/race-engine/hq";
import type { TeamHqFacilityConfigInput } from "../../src/lib/race-engine/hq";

const updatedAt = "2026-11-20T12:00:00.000Z";

function configs(): TeamHqFacilityConfigInput[] {
  return [
    {
      facilityKey: "engineering_department",
      isEnabled: true,
      maxLevelPremio: 8,
      maxLevelZwei: 6,
      updatedAt,
      effectsByLevel: { "8": { reliability_bonus: 4 } }
    },
    {
      facilityKey: "rd_center",
      isEnabled: true,
      maxLevelPremio: 8,
      maxLevelZwei: 6,
      updatedAt,
      effectsByLevel: { "8": { aero_power_bonus: 4 } }
    },
    {
      facilityKey: "simulator_facility",
      isEnabled: true,
      maxLevelPremio: 8,
      maxLevelZwei: 6,
      updatedAt,
      effectsByLevel: { "8": { race_pace_bonus: 2, qualifying_pace_bonus: 4 } }
    },
    {
      facilityKey: "pit_crew_training_center",
      isEnabled: true,
      maxLevelPremio: 8,
      maxLevelZwei: 6,
      updatedAt,
      effectsByLevel: { "8": {} }
    }
  ];
}

describe("Race Engine team HQ effect snapshots", () => {
  it("resolves configured race effects and reports a facility with no measurable race effect", () => {
    const result = resolveTeamHqRaceEffects("premio", [
      { facilityKey: "engineering_department", level: 8 },
      { facilityKey: "rd_center", level: 8 },
      { facilityKey: "simulator_facility", level: 8 },
      { facilityKey: "pit_crew_training_center", level: 8 }
    ], configs(), updatedAt);

    expect(result.snapshot.effects).toEqual({
      reliability_bonus: 4,
      aero_power_bonus: 4,
      race_pace_bonus: 2
    });
    expect(result.unresolvedFacilityKeys).toEqual(["pit_crew_training_center"]);
    expect(validateTeamHqRaceEffectSnapshot(result.snapshot)).toEqual([]);
  });

  it("enforces division-specific facility limits and required configuration", () => {
    expect(() => resolveTeamHqRaceEffects("zwei", [
      { facilityKey: "engineering_department", level: 7 }
    ], configs(), updatedAt)).toThrow(/configured division limit/i);
    expect(() => resolveTeamHqRaceEffects("premio", [
      { facilityKey: "engineering_department", level: 1 }
    ], [], updatedAt)).toThrow(/config is missing/i);
  });

  it("persists resolved HQ effects with the entrant and applies only explicitly calibrated effects", () => {
    const fixture = createSyntheticRaceFixture({ driverCount: 2, teamCount: 1, totalLaps: 1 });
    const result = resolveTeamHqRaceEffects("premio", [
      { facilityKey: "engineering_department", level: 8 },
      { facilityKey: "rd_center", level: 8 },
      { facilityKey: "simulator_facility", level: 8 },
      { facilityKey: "pit_crew_training_center", level: 8 }
    ], configs(), updatedAt);
    const resolvedForRace = resolveTeamHqRaceEffects("premio", [
      { facilityKey: "engineering_department", level: 8 },
      { facilityKey: "rd_center", level: 8 },
      { facilityKey: "simulator_facility", level: 8 }
    ], configs(), updatedAt);
    const snapshot = {
      ...fixture,
      entrants: fixture.entrants.map((entrant) => ({
        ...entrant,
        hqEffects: resolvedForRace.snapshot.effects,
        hqFacilitySnapshot: resolvedForRace.snapshot
      }))
    };
    const models = createRaceEngineTestModels(snapshot);
    const simulation = new RaceSimulation(snapshot, models);
    expect(simulation.createCheckpoint().snapshot.entrants[0].hqFacilitySnapshot).toEqual(result.snapshot);

    const baseProfile = models.performanceModel.snapshot as unknown as RacePhysicsCalibrationProfile;
    const uncalibrated = createCalibratedPerformanceModel({ ...baseProfile, hqEffects: {} });
    expect(() => new RaceSimulation(snapshot, { performanceModel: uncalibrated }))
      .toThrow(/requires an explicit calibration mapping/i);
  });
});
