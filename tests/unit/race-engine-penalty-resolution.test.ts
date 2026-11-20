import { describe, expect, it } from "vitest";
import {
  resolveRaceClassificationWithPenalties,
  resolveStartingGridWithPenalties
} from "../../src/lib/race-engine/race-control";
import type { RaceControlPenalty } from "../../src/lib/race-engine/race-control";
import type { RaceClassificationEntry } from "../../src/lib/race-engine/simulation";

const classification: RaceClassificationEntry[] = [
  { position: 1, driverId: "driver-a", teamId: "team-a", lapCompleted: 10, elapsedMs: 100000, finished: true, retired: false, pitStopCount: 1 },
  { position: 2, driverId: "driver-b", teamId: "team-b", lapCompleted: 10, elapsedMs: 101000, finished: true, retired: false, pitStopCount: 1 },
  { position: 3, driverId: "driver-c", teamId: "team-c", lapCompleted: 10, elapsedMs: 102000, finished: true, retired: false, pitStopCount: 2 },
  { position: 4, driverId: "driver-d", teamId: "team-d", lapCompleted: 10, elapsedMs: 103000, finished: true, retired: false, pitStopCount: 1 }
];

function penalty(input: Partial<RaceControlPenalty> & Pick<RaceControlPenalty, "id" | "driverId" | "type">): RaceControlPenalty {
  return {
    id: input.id,
    raceId: "race-1",
    driverId: input.driverId,
    type: input.type,
    durationMs: input.durationMs ?? null,
    gridPositions: input.gridPositions ?? null,
    reason: input.reason ?? "Steward decision",
    evidence: input.evidence ?? [],
    issuedBy: input.issuedBy ?? "fia-1",
    issuedAt: input.issuedAt ?? "2026-11-20T10:00:00.000Z",
    ratifiedByAdminId: input.ratifiedByAdminId ?? "admin-1",
    reversedByEventId: input.reversedByEventId ?? null
  };
}

describe("Race-control penalty resolution", () => {
  it("applies only ratified, unreversed time penalties and recalculates classified order", () => {
    const penalties = [
      penalty({ id: "p5", driverId: "driver-a", type: "time_5s" }),
      penalty({ id: "p10", driverId: "driver-b", type: "time_10s" }),
      penalty({ id: "p30", driverId: "driver-c", type: "time_penalty", durationMs: 30000 }),
      penalty({ id: "pending", driverId: "driver-d", type: "time_10s", ratifiedByAdminId: null }),
      penalty({ id: "reversed", driverId: "driver-a", type: "time_penalty", durationMs: 60000, reversedByEventId: "rc-reversal" })
    ];
    const result = resolveRaceClassificationWithPenalties(classification, penalties);
    expect(result.map((entry) => entry.driverId)).toEqual(["driver-d", "driver-a", "driver-b", "driver-c"]);
    expect(result.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    expect(result.find((entry) => entry.driverId === "driver-a")?.elapsedMs).toBe(105000);
    expect(result.find((entry) => entry.driverId === "driver-b")?.elapsedMs).toBe(111000);
    expect(result.find((entry) => entry.driverId === "driver-c")?.elapsedMs).toBe(132000);
    expect(result.find((entry) => entry.driverId === "driver-d")?.elapsedMs).toBe(103000);
  });

  it("moves disqualified and race-banned drivers outside the classified positions", () => {
    const penalties = [
      penalty({ id: "dsq", driverId: "driver-a", type: "disqualification" }),
      penalty({ id: "ban", driverId: "driver-b", type: "race_ban" })
    ];
    const result = resolveRaceClassificationWithPenalties(classification, penalties);
    expect(result.slice(0, 2).map((entry) => entry.driverId)).toEqual(["driver-d", "driver-c"]);
    expect(result.find((entry) => entry.driverId === "driver-a")).toMatchObject({ position: null, status: "disqualified" });
    expect(result.find((entry) => entry.driverId === "driver-b")).toMatchObject({ position: null, status: "race_banned" });
  });

  it("does not apply grid penalties to race time, but moves the starting-grid order", () => {
    const penalties = [
      penalty({ id: "grid-2", driverId: "driver-b", type: "grid_penalty", gridPositions: 2 }),
      penalty({ id: "grid-pending", driverId: "driver-c", type: "grid_penalty", gridPositions: 1, ratifiedByAdminId: null })
    ];
    const result = resolveRaceClassificationWithPenalties(classification, penalties);
    expect(result.find((entry) => entry.driverId === "driver-b")?.elapsedMs).toBe(101000);
    expect(result.find((entry) => entry.driverId === "driver-b")?.pendingGridPenaltyPositions).toBe(2);

    const grid = resolveStartingGridWithPenalties([
      { driverId: "driver-a", gridPosition: 1 },
      { driverId: "driver-b", gridPosition: 2 },
      { driverId: "driver-c", gridPosition: 3 },
      { driverId: "driver-d", gridPosition: 4 }
    ], penalties);
    expect(grid.map((entry) => [entry.driverId, entry.gridPosition])).toEqual([
      ["driver-a", 1],
      ["driver-c", 2],
      ["driver-d", 3],
      ["driver-b", 4]
    ]);
    expect(grid[3].appliedGridPenaltyIds).toEqual(["grid-2"]);
  });
});
