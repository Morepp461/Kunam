import { describe, expect, it } from "vitest";
import { RACE_ATTRIBUTE_DEFINITIONS } from "../../src/lib/race-engine/attributes";
import { evaluateAttributeInfluences } from "../../src/lib/race-engine/calibration";
import type { RacePhysicsCalibrationProfile } from "../../src/lib/race-engine/calibration";
import { createRaceEngineTestModels } from "../../src/lib/race-engine/test-profiles";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import type { RaceEntrantSnapshot } from "../../src/lib/race-engine/contracts";

function changeAttribute(
  entrant: RaceEntrantSnapshot,
  scope: "driver" | "car_team",
  key: string
): RaceEntrantSnapshot {
  const values = scope === "driver" ? entrant.driverAttributes : entrant.carTeamAttributes;
  const current = Number((values as Record<string, number>)[key]);
  const nextValue = current >= 100 ? current - 1 : current + 1;
  return scope === "driver"
    ? { ...entrant, driverAttributes: { ...entrant.driverAttributes, [key]: nextValue } }
    : { ...entrant, carTeamAttributes: { ...entrant.carTeamAttributes, [key]: nextValue } };
}

describe("24-attribute synthetic calibration sensitivity", () => {
  const snapshot = createSyntheticRaceFixture({ seed: 170024, driverCount: 2, teamCount: 1, totalLaps: 2 });
  const entrant = snapshot.entrants[0];
  const models = createRaceEngineTestModels(snapshot);
  const profile = models.performanceModel.snapshot as unknown as RacePhysicsCalibrationProfile;

  it("has an explicit, non-zero calibration mapping for every stable attribute ID", () => {
    expect(Object.keys(profile.attributes).sort()).toEqual(RACE_ATTRIBUTE_DEFINITIONS.map((item) => item.id).sort());
    for (const definition of RACE_ATTRIBUTE_DEFINITIONS) {
      const weights = profile.attributes[definition.id];
      expect(Object.values(weights).some((value) => typeof value === "number" && value !== 0), definition.id).toBe(true);
    }
  });

  it("changes at least one measurable influence channel when each of the 24 attributes changes", () => {
    const baseline = evaluateAttributeInfluences(entrant, profile);
    const unaffected: string[] = [];
    for (const definition of RACE_ATTRIBUTE_DEFINITIONS) {
      const changedEntrant = changeAttribute(entrant, definition.scope, definition.key);
      const changed = evaluateAttributeInfluences(changedEntrant, profile);
      const channels = Object.keys(baseline) as Array<keyof typeof baseline>;
      if (!channels.some((channel) => changed[channel] !== baseline[channel])) unaffected.push(definition.id);
    }
    expect(unaffected).toEqual([]);
  });

  it("keeps Aggression duel influence separate from Mistake Rate risk", () => {
    const baseline = evaluateAttributeInfluences(entrant, profile);
    const aggression = evaluateAttributeInfluences(changeAttribute(entrant, "driver", "aggression"), profile);
    const mistakeRate = evaluateAttributeInfluences(changeAttribute(entrant, "driver", "mistake_rate"), profile);

    expect(aggression.overtake_advantage_per_point).not.toBe(baseline.overtake_advantage_per_point);
    expect(aggression.defense_advantage_per_point).not.toBe(baseline.defense_advantage_per_point);
    expect(aggression.mistake_probability_per_point).toBe(baseline.mistake_probability_per_point);
    expect(mistakeRate.mistake_probability_per_point).not.toBe(baseline.mistake_probability_per_point);
    expect(mistakeRate.overtake_advantage_per_point).toBe(baseline.overtake_advantage_per_point);
    expect(mistakeRate.defense_advantage_per_point).toBe(baseline.defense_advantage_per_point);
  });

  it("keeps higher Reliability and tyre-management ratings on protective channels", () => {
    expect(profile.attributes["car_team.reliability"].mechanical_failure_probability_per_point).toBeLessThan(0);
    expect(profile.attributes["driver.tyre_management"].tyre_degradation_per_point).toBeLessThan(0);
    expect(profile.attributes["car_team.team_tyre_management"].tyre_degradation_per_point).toBeLessThan(0);
    expect(profile.attributes["car_team.car_tyre_wear"].tyre_degradation_per_point).toBeGreaterThan(0);
  });
});
