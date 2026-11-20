import { describe, expect, it } from "vitest";
import { findCircuitForRound, getScheduleRoundsForPeriod } from "../../src/lib/schedulePresentation";

describe("schedule presentation mapping", () => {
  const rounds = [
    { id: "p1", season_division_id: "premio", round_number: 1, status: "scheduled" },
    { id: "z1", season_division_id: "zwei", round_number: 1, status: "scheduled" },
    { id: "z2", season_division_id: "zwei", round_number: 2, status: "scheduled" },
    { id: "z3", season_division_id: "zwei", round_number: 3, status: "cancelled" },
  ];
  const mappings = [
    { period_id: "period-1", season_division_id: "premio", round_id: "p1" },
    { period_id: "period-1", season_division_id: "zwei", round_id: "z1" },
    { period_id: "period-1", season_division_id: "zwei", round_id: "z1" },
    { period_id: "period-1", season_division_id: "zwei", round_id: "z2" },
    { period_id: "period-1", season_division_id: "zwei", round_id: "z3" },
  ];

  it("filters by division and period and removes duplicate or cancelled rounds", () => {
    expect(getScheduleRoundsForPeriod(rounds, mappings, "period-1", new Set(["zwei"])).map((round) => round.id))
      .toEqual(["z1", "z2"]);
  });

  it("matches circuit pool entries by exact normalized name and country", () => {
    const circuits = [{ id: "c1", name: "Silverstone Circuit", country_code: "GB" }];
    expect(findCircuitForRound(circuits, { circuit_name: " silverstone circuit ", circuit_country_code: "gb" })?.id).toBe("c1");
    expect(findCircuitForRound(circuits, { circuit_name: null, circuit_country_code: null })).toBeNull();
    expect(findCircuitForRound(circuits, { circuit_name: "Silverstone Circuit", circuit_country_code: "US" })).toBeNull();
  });
});
