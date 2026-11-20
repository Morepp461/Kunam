import { describe, expect, it } from "vitest";
import {
  authorizeRaceCancellation,
  authorizeResultGovernance
} from "../../src/lib/race-engine/result-governance";
import type { OfficialRaceResult, ResultGovernanceRequest } from "../../src/lib/race-engine/result-governance";

const provisional: OfficialRaceResult = {
  id: "result-1",
  raceId: "race-1",
  version: 1,
  status: "provisional"
};

function request(overrides: Partial<ResultGovernanceRequest> = {}): ResultGovernanceRequest {
  return {
    action: "ratify",
    actor: { id: "fia-1", role: "fia" },
    occurredAt: "2026-11-20T20:00:00.000Z",
    currentResult: provisional,
    ...overrides
  };
}

describe("Official race result governance", () => {
  it("allows FIA to ratify a provisional result", () => {
    expect(authorizeResultGovernance(request())).toMatchObject({
      accepted: true,
      resultStatus: "ratified",
      supersedingResult: null
    });
  });

  it("rejects result ratification by Admin or other roles", () => {
    const result = authorizeResultGovernance(request({
      actor: { id: "admin-1", role: "admin" }
    }));
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/Only FIA/i);
  });

  it("allows only Admin to correct a ratified result by creating a superseding version", () => {
    const ratified = { ...provisional, status: "ratified" as const };
    const corrected = authorizeResultGovernance(request({
      action: "correct",
      actor: { id: "admin-1", role: "admin" },
      currentResult: ratified,
      replacementResultId: "result-2",
      reason: "Verified timing correction"
    }));
    expect(corrected).toMatchObject({
      accepted: true,
      resultStatus: "superseded",
      supersedingResult: {
        id: "result-2",
        raceId: "race-1",
        version: 2,
        supersedesResultId: "result-1"
      }
    });
  });

  it("rejects FIA correction and does not overwrite the original result", () => {
    const result = authorizeResultGovernance(request({
      action: "correct",
      currentResult: { ...provisional, status: "ratified" },
      actor: { id: "fia-1", role: "fia" },
      replacementResultId: "result-2",
      reason: "Correction"
    }));
    expect(result.accepted).toBe(false);
    expect(result.resultStatus).toBe("ratified");
    expect(result.supersedingResult).toBeNull();
    expect(result.reason).toMatch(/Only Admin/i);
  });

  it("rejects corrections without a distinct replacement and reason", () => {
    const ratified = { ...provisional, status: "ratified" as const };
    expect(authorizeResultGovernance(request({
      action: "correct",
      actor: { id: "admin-1", role: "admin" },
      currentResult: ratified,
      replacementResultId: "result-1",
      reason: "Correction"
    })).reason).toMatch(/distinct replacement/i);
    expect(authorizeResultGovernance(request({
      action: "correct",
      actor: { id: "admin-1", role: "admin" },
      currentResult: ratified,
      replacementResultId: "result-2"
    })).reason).toMatch(/auditable reason/i);
  });

  it("preserves immutable result audit records and excludes financial operations", () => {
    const result = authorizeResultGovernance(request());
    expect(result.audit).toMatchObject({
      action: "ratify",
      actorId: "fia-1",
      previousResultId: "result-1"
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.audit)).toBe(true);
    expect(result).not.toHaveProperty("wallet");
    expect(result).not.toHaveProperty("settlement");
  });
});

describe("Race cancellation authority", () => {
  it("allows FIA and Admin to cancel a race with an auditable reason", () => {
    for (const role of ["fia", "admin"] as const) {
      expect(authorizeRaceCancellation({
        raceId: "race-1",
        raceStatus: "running",
        actor: { id: `${role}-1`, role },
        occurredAt: "2026-11-20T20:00:00.000Z",
        reason: "Operational cancellation"
      }).accepted).toBe(true);
    }
  });

  it("rejects ordinary users, missing reasons, and already-cancelled races", () => {
    const base = {
      raceId: "race-1",
      raceStatus: "queued" as const,
      occurredAt: "2026-11-20T20:00:00.000Z",
      reason: "Cancel"
    };
    expect(authorizeRaceCancellation({ ...base, actor: { id: "driver-1", role: "driver" } }).reason)
      .toMatch(/Only FIA or Admin/i);
    expect(authorizeRaceCancellation({ ...base, actor: { id: "fia-1", role: "fia" }, reason: "" }).reason)
      .toMatch(/auditable reason/i);
    expect(authorizeRaceCancellation({ ...base, raceStatus: "cancelled", actor: { id: "fia-1", role: "fia" } }).reason)
      .toMatch(/already cancelled/i);
  });
});
