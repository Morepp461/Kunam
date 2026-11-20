export type StrategyActorKind = "team_owner" | "driver" | "admin" | "fia" | "spectator" | "anonymous";
export type StrategyAuthority = "team_owner" | "driver" | "ai";
export type StrategyCommandDecision = "accepted" | "suggestion" | "rejected";

export interface StrategyPresenceSnapshot {
  readonly ownerOnline: boolean;
  readonly driverOnline: boolean;
}

export interface StrategyTarget {
  readonly teamId: string;
  readonly driverId: string;
  readonly teamOwnerId: string;
}

export interface StrategyActor {
  /** Must come from server-verified authentication, never directly from request payload. */
  readonly id: string;
  readonly kind: StrategyActorKind;
}

export interface StrategyCommandRequest {
  readonly commandId: string;
  readonly issuedAt: string;
  readonly actor: StrategyActor;
  readonly target: StrategyTarget;
  readonly raceStatus: "queued" | "running" | "suspended" | "completed" | "cancelled";
  readonly presence: StrategyPresenceSnapshot;
}

export interface StrategyCommandAudit {
  readonly commandId: string;
  readonly issuedAt: string;
  readonly actorId: string;
  readonly actorKind: StrategyActorKind;
  readonly targetTeamId: string;
  readonly targetDriverId: string;
  readonly decision: StrategyCommandDecision;
  readonly authority: StrategyAuthority;
  readonly reason: string | null;
}

export interface StrategyCommandAuthorization {
  readonly authorized: boolean;
  readonly decision: StrategyCommandDecision;
  readonly authority: StrategyAuthority;
  readonly reason: string | null;
  readonly audit: StrategyCommandAudit;
}

/** Owner has team-wide authority; otherwise a connected driver controls only their own car; AI is the fallback. */
export function resolveStrategyAuthority(
  presence: StrategyPresenceSnapshot
): StrategyAuthority {
  if (presence.ownerOnline) return "team_owner";
  if (presence.driverOnline) return "driver";
  return "ai";
}

export function authorizeStrategyCommand(request: StrategyCommandRequest): StrategyCommandAuthorization {
  const { actor, target, presence } = request;
  const authority = resolveStrategyAuthority(presence);
  let decision: StrategyCommandDecision = "rejected";
  let reason: string | null = null;

  if (!request.commandId.trim()) reason = "Strategy command ID is required";
  else if (!Number.isFinite(Date.parse(request.issuedAt))) reason = "Strategy command timestamp is invalid";
  else if (!actor.id.trim() || !target.teamId.trim() || !target.driverId.trim() || !target.teamOwnerId.trim()) {
    reason = "Strategy actor and target identities are required";
  } else if (request.raceStatus !== "running") {
    reason = "Strategy commands are accepted only while the race is running";
  } else if (actor.kind === "team_owner") {
    if (actor.id !== target.teamOwnerId) reason = "Actor does not own the target team";
    else if (!presence.ownerOnline) reason = "Team owner is not present in the live race";
    else decision = "accepted";
  } else if (actor.kind === "driver") {
    if (actor.id !== target.driverId) reason = "Driver may only target their own car";
    else if (!presence.driverOnline) reason = "Driver is not present in the live race";
    else decision = presence.ownerOnline ? "suggestion" : "accepted";
  } else {
    reason = "Actor role is not permitted to control race strategy";
  }

  const audit = Object.freeze({
    commandId: request.commandId,
    issuedAt: request.issuedAt,
    actorId: actor.id,
    actorKind: actor.kind,
    targetTeamId: target.teamId,
    targetDriverId: target.driverId,
    decision,
    authority,
    reason
  });
  return Object.freeze({
    authorized: decision === "accepted",
    decision,
    authority,
    reason,
    audit
  });
}
