import { describe, expect, it } from "vitest";
import {
  authorizeRaceRestart,
  clearRaceControlFlag,
  createInitialRaceControlState,
  deployRaceControlFlag,
  issueRacePenalty,
  ratifyRacePenalty,
  reverseRacePenalty,
  validateRaceControlAuditTrail
} from "../../src/lib/race-engine/race-control";
import type { RaceControlCommandContext, RaceControlEvidence } from "../../src/lib/race-engine/race-control";
import type { RaceClassificationEntry } from "../../src/lib/race-engine/simulation";

const classification: RaceClassificationEntry[] = [
  { position: 1, driverId: "driver-1", teamId: "team-1", lapCompleted: 12, elapsedMs: 100000, finished: false },
  { position: 2, driverId: "driver-2", teamId: "team-2", lapCompleted: 12, elapsedMs: 100500, finished: false }
];

function evidence(driverId?: string): RaceControlEvidence[] {
  return [{
    id: "evidence-1",
    source: "replay",
    capturedAt: "2026-11-20T10:00:00.000Z",
    ...(driverId ? { driverId } : {}),
    lapNumber: 12,
    segmentId: "sector-3-segment-2",
    description: "Replay and timing evidence attached for steward review",
    artifactRef: "race-replay://race-1/event-12"
  }];
}

function context(sequence: number, actorRole: "admin" | "fia" = "fia", driverId?: string): RaceControlCommandContext {
  return {
    raceId: "race-1",
    actorId: actorRole === "admin" ? "admin-1" : "fia-1",
    actorRole,
    occurredAt: `2026-11-20T10:00:${String(sequence).padStart(2, "0")}.000Z`,
    simulationTimeMs: sequence * 1000,
    sequence,
    reason: "Documented race-control decision",
    evidence: evidence(driverId)
  };
}

describe("Audited race-control policy", () => {
  it("deploys and clears flags with immutable evidence-backed audit events", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    const yellow = deployRaceControlFlag(initial, context(1), "double_yellow");
    expect(yellow.flag).toBe("double_yellow");
    const green = clearRaceControlFlag(yellow, context(2));
    expect(green.flag).toBe("green");
    expect(validateRaceControlAuditTrail(green)).toEqual({ valid: true, errors: [] });
    expect(green.events.map((event) => event.action)).toEqual(["flag_deployed", "flag_cleared"]);
  });

  it("requires evidence and keeps red-flag suspension pending until an explicit restart", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    expect(() => deployRaceControlFlag(initial, { ...context(1), evidence: [] }, "red_flag"))
      .toThrow(/evidence/i);
    const suspended = deployRaceControlFlag(initial, context(1), "red_flag");
    expect(suspended.suspended).toBe(true);
    expect(suspended.restartPending).toBe(true);
    expect(() => clearRaceControlFlag(suspended, context(2))).toThrow(/restart procedure/i);
    const restarted = authorizeRaceRestart(suspended, context(2), "standing");
    expect(restarted.flag).toBe("green");
    expect(restarted.suspended).toBe(false);
    expect(restarted.restartPending).toBe(false);
    expect(restarted.events[1].restartPolicy).toBe("last_valid_classification");
    expect(restarted.events[1].restartMode).toBe("standing");
  });

  it("supports rolling restarts while preserving the last valid classification policy", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    const suspended = deployRaceControlFlag(initial, context(1), "red_flag");
    const restarted = authorizeRaceRestart(suspended, context(2), "rolling");
    expect(restarted.events[1].restartMode).toBe("rolling");
    expect(restarted.lastValidClassification).toEqual(classification);
  });

  it("requires FIA/Admin authority and driver-specific evidence to issue penalties", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    expect(() => issueRacePenalty(initial, { ...context(1), actorRole: "fia", evidence: evidence("driver-2") }, {
      driverId: "driver-1", type: "time_5s", durationMs: 5000
    })).toThrow(/different driver/i);
    expect(() => issueRacePenalty(initial, context(1), {
      driverId: "driver-1", type: "time_5s"
    })).toThrow(/duration/i);
    const issued = issueRacePenalty(initial, context(1, "fia", "driver-1"), {
      driverId: "driver-1", type: "time_5s", durationMs: 5000
    });
    expect(issued.penalties[0].ratifiedByAdminId).toBeNull();
    expect(issued.events[0].requiresAdminRatification).toBe(true);
    expect(() => ratifyRacePenalty(issued, context(2, "fia"), issued.penalties[0].id))
      .toThrow(/only admin/i);
  });

  it("enforces exact 5s/10s penalties and explicit grid-position penalties", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    expect(() => issueRacePenalty(initial, context(1, "fia", "driver-1"), {
      driverId: "driver-1", type: "time_5s", durationMs: 4000
    })).toThrow(/5000 milliseconds/i);
    expect(() => issueRacePenalty(initial, context(1, "fia", "driver-1"), {
      driverId: "driver-1", type: "grid_penalty", gridPositions: 0
    })).toThrow(/between 1 and 20 positions/i);
    const issued = issueRacePenalty(initial, context(1, "fia", "driver-1"), {
      driverId: "driver-1", type: "grid_penalty", gridPositions: 3
    });
    expect(issued.penalties[0].gridPositions).toBe(3);
    expect(issued.penalties[0].durationMs).toBeNull();
    const stopGo = issueRacePenalty(initial, context(1, "fia", "driver-1"), {
      driverId: "driver-1", type: "stop_go", durationMs: 30000
    });
    expect(stopGo.penalties[0].durationMs).toBe(30000);
  });

  it("requires Admin ratification and records reversals as superseding audit events", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    const issued = issueRacePenalty(initial, context(1, "fia", "driver-1"), {
      driverId: "driver-1", type: "drive_through", durationMs: 30000
    });
    const ratified = ratifyRacePenalty(issued, context(2, "admin"), issued.penalties[0].id);
    expect(ratified.penalties[0].ratifiedByAdminId).toBe("admin-1");
    const reversed = reverseRacePenalty(ratified, context(3, "admin"), ratified.penalties[0].id, "rc-1");
    expect(reversed.penalties[0].reversedByEventId).toBe("rc-3");
    expect(reversed.events[2].supersedesEventId).toBe("rc-1");
    expect(validateRaceControlAuditTrail(reversed).valid).toBe(true);
  });

  it("rejects sequence gaps and duplicate command events", () => {
    const initial = createInitialRaceControlState("race-1", classification);
    const deployed = deployRaceControlFlag(initial, context(1), "yellow");
    expect(() => clearRaceControlFlag(deployed, context(3))).toThrow(/sequence/i);
  });
});
