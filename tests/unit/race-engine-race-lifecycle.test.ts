import { describe, expect, it } from "vitest";
import { authorizeRaceStart } from "../../src/lib/race-engine/race-lifecycle";
import type { RaceStartRequest } from "../../src/lib/race-engine/race-lifecycle";

function request(overrides: Partial<RaceStartRequest> = {}): RaceStartRequest {
  return {
    raceId: "race-1",
    source: "scheduled" as const,
    actor: { id: "scheduler", kind: "system" as const },
    requestedAt: "2026-11-20T19:00:00.000Z",
    scheduledAt: "2026-11-20T19:00:00.000Z",
    status: "queued" as const,
    readiness: { ready: true, blockers: [] as string[] },
    idempotencyKey: "race-1-start-v1",
    ...overrides
  };
}

describe("Race lifecycle start authorization", () => {
  it("accepts an automatic scheduled start when due and ready", () => {
    expect(authorizeRaceStart(request())).toMatchObject({
      accepted: true,
      shouldStart: true,
      idempotentReplay: false
    });
  });

  it("rejects an early scheduled start", () => {
    expect(authorizeRaceStart(request({
      requestedAt: "2026-11-20T18:59:59.000Z"
    })).reason).toMatch(/has not arrived/i);
  });

  it("rejects a scheduled start initiated by a non-system actor", () => {
    expect(authorizeRaceStart(request({
      actor: { id: "admin-1", kind: "admin" }
    })).reason).toMatch(/trusted scheduler/i);
  });

  it("allows manual start only for Admin with a reason", () => {
    const allowed = authorizeRaceStart(request({
      source: "manual",
      actor: { id: "admin-1", kind: "admin" },
      manualReason: "Operational coordination for live broadcast"
    }));
    const missingReason = authorizeRaceStart(request({
      source: "manual",
      actor: { id: "admin-1", kind: "admin" }
    }));
    const fia = authorizeRaceStart(request({
      source: "manual",
      actor: { id: "fia-1", kind: "fia" },
      manualReason: "test"
    }));
    expect(allowed.shouldStart).toBe(true);
    expect(missingReason.reason).toMatch(/requires an operational reason/i);
    expect(fia.reason).toMatch(/Only Admin/i);
  });

  it("rejects a race with readiness blockers or an invalid state", () => {
    expect(authorizeRaceStart(request({
      readiness: { ready: false, blockers: ["Circuit revision is unverified"] }
    })).reason).toMatch(/Circuit revision is unverified/);
    expect(authorizeRaceStart(request({ status: "completed" })).reason).toMatch(/queued state/i);
  });

  it("treats the same start idempotency key as a replay and rejects a different key", () => {
    const replay = authorizeRaceStart(request({
      status: "running",
      existingStartIdempotencyKey: "race-1-start-v1",
      existingStartActorId: "scheduler"
    }));
    const duplicate = authorizeRaceStart(request({
      status: "running",
      existingStartIdempotencyKey: "different-key"
    }));
    expect(replay).toMatchObject({ accepted: true, shouldStart: false, idempotentReplay: true });
    expect(duplicate.reason).toMatch(/queued state/i);
    const wrongActor = authorizeRaceStart(request({
      status: "running",
      existingStartIdempotencyKey: "race-1-start-v1",
      existingStartActorId: "admin-2"
    }));
    expect(wrongActor.reason).toMatch(/different start actor/i);
  });

  it("records immutable audit metadata and readiness blockers", () => {
    const result = authorizeRaceStart(request({
      source: "manual",
      actor: { id: "admin-1", kind: "admin" },
      manualReason: "Approved operational start"
    }));
    expect(result.audit).toMatchObject({
      raceId: "race-1",
      source: "manual",
      actorId: "admin-1",
      manualReason: "Approved operational start"
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.audit)).toBe(true);
    expect(Object.isFrozen(result.audit.blockers)).toBe(true);
  });
});
