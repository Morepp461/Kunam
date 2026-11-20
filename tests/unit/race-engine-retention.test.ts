import { describe, expect, it } from "vitest";
import {
  RACE_REPLAY_RETENTION_HOURS,
  resolveRaceRetention
} from "../../src/lib/race-engine/retention";
import type { RaceRetentionInput } from "../../src/lib/race-engine/retention";

function input(overrides: Partial<RaceRetentionInput> = {}): RaceRetentionInput {
  return {
    raceCompletedAt: "2026-11-20T12:00:00.000Z",
    now: "2026-11-21T12:00:00.000Z",
    offSeasonEndsAt: "2026-12-01T00:00:00.000Z",
    disputeHold: false,
    ...overrides
  };
}

describe("Race replay and archive retention policy", () => {
  it("locks replay retention to 48 hours and keeps full details until off-season ends", () => {
    expect(RACE_REPLAY_RETENTION_HOURS).toBe(48);
    expect(resolveRaceRetention(input())).toMatchObject({
      replay: "retain",
      fullDetails: "retain",
      archiveKeyFacts: false,
      replayExpiresAt: "2026-11-22T12:00:00.000Z"
    });
  });

  it("makes replay purge-eligible at the 48-hour boundary", () => {
    expect(resolveRaceRetention(input({
      now: "2026-11-22T12:00:00.000Z"
    })).replay).toBe("purge_eligible");
  });

  it("requires key-fact archive before full-detail purge after off-season", () => {
    const archiveRequired = resolveRaceRetention(input({
      now: "2026-12-01T00:00:00.000Z"
    }));
    const purgeEligible = resolveRaceRetention(input({
      now: "2026-12-01T00:00:00.000Z",
      keyFactsArchivedAt: "2026-12-01T00:00:00.000Z"
    }));
    expect(archiveRequired).toMatchObject({ fullDetails: "archive_required", archiveKeyFacts: true });
    expect(purgeEligible).toMatchObject({ fullDetails: "purge_eligible", archiveKeyFacts: false });
  });

  it("preserves replay and full details during dispute, legal, or operational hold", () => {
    expect(resolveRaceRetention(input({
      now: "2027-01-01T00:00:00.000Z",
      disputeHold: true
    })).toMatchObject({
      replay: "hold",
      fullDetails: "hold",
      archiveKeyFacts: false
    });
  });

  it("does not re-process records already purged", () => {
    expect(resolveRaceRetention(input({
      replayPurgedAt: "2026-11-22T12:00:00.000Z",
      detailsPurgedAt: "2026-12-01T00:00:00.000Z"
    })).toMatchObject({
      replay: "already_purged",
      fullDetails: "already_purged"
    }));
  });

  it("rejects premature purge markers and future archive/purge timestamps", () => {
    expect(() => resolveRaceRetention(input({
      now: "2026-11-21T12:00:00.000Z",
      replayPurgedAt: "2026-11-21T12:00:00.000Z"
    }))).toThrow(/before the 48-hour retention window/i);
    expect(() => resolveRaceRetention(input({
      now: "2026-12-02T00:00:00.000Z",
      detailsPurgedAt: "2026-12-02T00:00:00.000Z"
    }))).toThrow(/before off-season key-fact archive/i);
    expect(() => resolveRaceRetention(input({
      keyFactsArchivedAt: "2026-12-02T00:00:00.000Z"
    }))).toThrow(/cannot be in the future/i);
  });

  it("rejects invalid timestamps and off-season dates before race completion", () => {
    expect(() => resolveRaceRetention(input({ now: "invalid" })).toThrow(/timestamps must be valid/i);
    expect(() => resolveRaceRetention(input({
      offSeasonEndsAt: "2026-11-19T00:00:00.000Z"
    })).toThrow(/cannot precede race completion/i);
  });
});
