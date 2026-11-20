import { describe, expect, it } from "vitest";
import {
  authorizeStrategyCommand,
  resolveStrategyAuthority
} from "../../src/lib/race-engine/strategy-authority";
import type { StrategyCommandRequest } from "../../src/lib/race-engine/strategy-authority";

function request(overrides: Partial<StrategyCommandRequest> = {}): StrategyCommandRequest {
  return {
    commandId: "strategy-1",
    issuedAt: "2026-11-20T15:00:00.000Z",
    actor: { id: "owner-1", kind: "team_owner" },
    target: { teamId: "team-1", driverId: "driver-1", teamOwnerId: "owner-1" },
    raceStatus: "running",
    presence: { ownerOnline: true, driverOnline: true },
    ...overrides
  };
}

describe("Race strategy authority", () => {
  it("uses owner, then driver, then AI as the default authority hierarchy", () => {
    const target = request().target;
    expect(resolveStrategyAuthority(target, { ownerOnline: true, driverOnline: true })).toBe("team_owner");
    expect(resolveStrategyAuthority(target, { ownerOnline: false, driverOnline: true })).toBe("driver");
    expect(resolveStrategyAuthority(target, { ownerOnline: false, driverOnline: false })).toBe("ai");
  });

  it("allows a verified team owner to command either driver on their own team", () => {
    const result = authorizeStrategyCommand(request({
      target: { teamId: "team-1", driverId: "driver-2", teamOwnerId: "owner-1" }
    }));
    expect(result).toMatchObject({ authorized: true, decision: "accepted", authority: "team_owner" });
  });

  it("rejects an owner trying to command another team's driver", () => {
    const result = authorizeStrategyCommand(request({
      target: { teamId: "team-2", driverId: "driver-9", teamOwnerId: "owner-2" }
    }));
    expect(result).toMatchObject({ authorized: false, decision: "rejected" });
  });

  it("allows a driver to command only their own car when the owner is absent", () => {
    const result = authorizeStrategyCommand(request({
      actor: { id: "driver-1", kind: "driver" },
      presence: { ownerOnline: false, driverOnline: true }
    }));
    expect(result).toMatchObject({ authorized: true, decision: "accepted", authority: "driver" });
  });

  it("downgrades a driver's command to a suggestion when the owner is present", () => {
    const result = authorizeStrategyCommand(request({
      actor: { id: "driver-1", kind: "driver" },
      presence: { ownerOnline: true, driverOnline: true }
    }));
    expect(result).toMatchObject({ authorized: false, decision: "suggestion", authority: "team_owner" });
    expect(result.audit.actorId).toBe("driver-1");
  });

  it("rejects a driver targeting a teammate and rejects non-strategy roles", () => {
    const wrongDriver = authorizeStrategyCommand(request({
      actor: { id: "driver-1", kind: "driver" },
      target: { teamId: "team-1", driverId: "driver-2", teamOwnerId: "owner-1" },
      presence: { ownerOnline: false, driverOnline: true }
    }));
    const fia = authorizeStrategyCommand(request({
      actor: { id: "fia-1", kind: "fia" }
    }));
    expect(wrongDriver.reason).toMatch(/own car/i);
    expect(fia.reason).toMatch(/not permitted/i);
  });

  it("rejects commands outside the running state and invalid timestamps", () => {
    expect(authorizeStrategyCommand(request({ raceStatus: "suspended" })).reason).toMatch(/only while the race is running/i);
    expect(authorizeStrategyCommand(request({ issuedAt: "invalid" })).reason).toMatch(/timestamp is invalid/i);
  });

  it("records immutable audit metadata for every accepted or rejected decision", () => {
    const result = authorizeStrategyCommand(request());
    expect(result.audit).toMatchObject({
      commandId: "strategy-1",
      actorId: "owner-1",
      actorKind: "team_owner",
      targetTeamId: "team-1",
      targetDriverId: "driver-1",
      decision: "accepted"
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.audit)).toBe(true);
  });
});
