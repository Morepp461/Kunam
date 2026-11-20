export const RACE_REPLAY_RETENTION_HOURS = 48;

export type RetentionAction = "retain" | "archive_required" | "purge_eligible" | "already_purged" | "hold";

export interface RaceRetentionInput {
  readonly raceCompletedAt: string;
  readonly now: string;
  readonly offSeasonEndsAt: string;
  readonly disputeHold: boolean;
  readonly replayPurgedAt?: string | null;
  readonly keyFactsArchivedAt?: string | null;
  readonly detailsPurgedAt?: string | null;
}

export interface RaceRetentionDecision {
  readonly replay: RetentionAction;
  readonly fullDetails: RetentionAction;
  readonly archiveKeyFacts: boolean;
  readonly replayExpiresAt: string;
  readonly audit: {
    readonly evaluatedAt: string;
    readonly disputeHold: boolean;
    readonly replayRetentionHours: typeof RACE_REPLAY_RETENTION_HOURS;
    readonly offSeasonEndsAt: string;
  };
}

export function resolveRaceRetention(input: RaceRetentionInput): RaceRetentionDecision {
  const completedAtMs = Date.parse(input.raceCompletedAt);
  const nowMs = Date.parse(input.now);
  const offSeasonEndMs = Date.parse(input.offSeasonEndsAt);
  if (![completedAtMs, nowMs, offSeasonEndMs].every(Number.isFinite)) {
    throw new Error("Race retention timestamps must be valid");
  }
  if (offSeasonEndMs < completedAtMs) throw new Error("Off-season end cannot precede race completion");

  const replayExpiresAtMs = completedAtMs + RACE_REPLAY_RETENTION_HOURS * 60 * 60 * 1000;
  const replayExpiresAt = new Date(replayExpiresAtMs).toISOString();
  if (input.replayPurgedAt && !Number.isFinite(Date.parse(input.replayPurgedAt))) {
    throw new Error("replayPurgedAt must be a valid timestamp");
  }
  if (input.keyFactsArchivedAt && !Number.isFinite(Date.parse(input.keyFactsArchivedAt))) {
    throw new Error("keyFactsArchivedAt must be a valid timestamp");
  }
  if (input.detailsPurgedAt && !Number.isFinite(Date.parse(input.detailsPurgedAt))) {
    throw new Error("detailsPurgedAt must be a valid timestamp");
  }

  let replay: RetentionAction;
  let fullDetails: RetentionAction;
  let archiveKeyFacts = false;

  if (input.disputeHold) {
    replay = input.replayPurgedAt ? "already_purged" : "hold";
    fullDetails = input.detailsPurgedAt ? "already_purged" : "hold";
  } else {
    replay = input.replayPurgedAt
      ? "already_purged"
      : nowMs >= replayExpiresAtMs ? "purge_eligible" : "retain";

    if (input.detailsPurgedAt) {
      fullDetails = "already_purged";
    } else if (nowMs < offSeasonEndMs) {
      fullDetails = "retain";
    } else if (!input.keyFactsArchivedAt) {
      fullDetails = "archive_required";
      archiveKeyFacts = true;
    } else {
      fullDetails = "purge_eligible";
    }
  }

  return Object.freeze({
    replay,
    fullDetails,
    archiveKeyFacts,
    replayExpiresAt,
    audit: Object.freeze({
      evaluatedAt: input.now,
      disputeHold: input.disputeHold,
      replayRetentionHours: RACE_REPLAY_RETENTION_HOURS,
      offSeasonEndsAt: input.offSeasonEndsAt
    })
  });
}
