export type RaceStartSource = "scheduled" | "manual";
export type RaceStartActorKind = "system" | "admin" | "fia" | "driver" | "team_owner" | "spectator";
export type RaceStartStatus = "queued" | "running" | "suspended" | "completed" | "cancelled";

export interface RaceStartReadiness {
  readonly ready: boolean;
  readonly blockers: readonly string[];
}

export interface RaceStartRequest {
  readonly raceId: string;
  readonly source: RaceStartSource;
  readonly actor: { readonly id: string; readonly kind: RaceStartActorKind };
  readonly requestedAt: string;
  readonly scheduledAt: string;
  readonly status: RaceStartStatus;
  readonly readiness: RaceStartReadiness;
  readonly idempotencyKey: string;
  readonly manualReason?: string;
  readonly existingStartIdempotencyKey?: string | null;
  readonly existingStartActorId?: string | null;
}

export interface RaceStartDecision {
  readonly accepted: boolean;
  readonly shouldStart: boolean;
  readonly idempotentReplay: boolean;
  readonly reason: string | null;
  readonly audit: {
    readonly raceId: string;
    readonly source: RaceStartSource;
    readonly actorId: string;
    readonly actorKind: RaceStartActorKind;
    readonly requestedAt: string;
    readonly scheduledAt: string;
    readonly idempotencyKey: string;
    readonly manualReason: string | null;
    readonly blockers: readonly string[];
  };
}

/** Pure start gate. The adapter must load status/readiness and persist the idempotency key atomically. */
export function authorizeRaceStart(request: RaceStartRequest): RaceStartDecision {
  const blockers = Object.freeze([...request.readiness.blockers]);
  let accepted = false;
  let shouldStart = false;
  let idempotentReplay = false;
  let reason: string | null = null;

  if (!request.raceId.trim() || !request.actor.id.trim() || !request.idempotencyKey.trim()) {
    reason = "Race, actor, and idempotency identities are required";
  } else if (!Number.isFinite(Date.parse(request.requestedAt)) || !Number.isFinite(Date.parse(request.scheduledAt))) {
    reason = "Race start timestamps are invalid";
  } else if (request.status === "running" && request.existingStartIdempotencyKey === request.idempotencyKey) {
    if (request.existingStartActorId !== request.actor.id) reason = "Idempotency key belongs to a different start actor";
    else {
      accepted = true;
      idempotentReplay = true;
    }
  } else if (request.status !== "queued") {
    reason = "Race can only start from the queued state";
  } else if (!request.readiness.ready || blockers.length > 0) {
    reason = blockers.length > 0 ? `Race is not ready: ${blockers.join("; ")}` : "Race readiness checks have not passed";
  } else if (request.source === "scheduled") {
    if (request.actor.kind !== "system") reason = "Scheduled starts must be initiated by the trusted scheduler";
    else if (Date.parse(request.requestedAt) < Date.parse(request.scheduledAt)) reason = "Scheduled start time has not arrived";
    else {
      accepted = true;
      shouldStart = true;
    }
  } else if (request.source === "manual") {
    if (request.actor.kind !== "admin") reason = "Only Admin may manually start a race";
    else if (!request.manualReason?.trim()) reason = "Manual race start requires an operational reason";
    else {
      accepted = true;
      shouldStart = true;
    }
  } else {
    reason = "Unsupported race start source";
  }

  return Object.freeze({
    accepted,
    shouldStart,
    idempotentReplay,
    reason,
    audit: Object.freeze({
      raceId: request.raceId,
      source: request.source,
      actorId: request.actor.id,
      actorKind: request.actor.kind,
      requestedAt: request.requestedAt,
      scheduledAt: request.scheduledAt,
      idempotencyKey: request.idempotencyKey,
      manualReason: request.source === "manual" ? request.manualReason?.trim() ?? null : null,
      blockers
    })
  });
}
