export type ResultGovernanceActorRole = "fia" | "admin" | "driver" | "team_owner" | "spectator" | "anonymous";
export type OfficialResultStatus = "provisional" | "ratified" | "superseded" | "cancelled";
export type ResultGovernanceAction = "ratify" | "correct" | "cancel";

export interface OfficialRaceResult {
  readonly id: string;
  readonly raceId: string;
  readonly version: number;
  readonly status: OfficialResultStatus;
  readonly supersedesResultId?: string | null;
}

export interface ResultGovernanceRequest {
  readonly action: ResultGovernanceAction;
  readonly actor: { readonly id: string; readonly role: ResultGovernanceActorRole };
  readonly occurredAt: string;
  readonly currentResult: OfficialRaceResult;
  readonly replacementResultId?: string;
  readonly reason?: string;
}

export interface ResultGovernanceDecision {
  readonly accepted: boolean;
  readonly resultStatus: OfficialResultStatus;
  readonly supersedingResult: OfficialRaceResult | null;
  readonly reason: string | null;
  readonly audit: {
    readonly action: ResultGovernanceAction;
    readonly actorId: string;
    readonly actorRole: ResultGovernanceActorRole;
    readonly occurredAt: string;
    readonly previousResultId: string;
    readonly newResultId: string | null;
    readonly reason: string | null;
  };
}

/** Governance only: it never writes standings, wallet balances, or economy ledger entries. */
export function authorizeResultGovernance(request: ResultGovernanceRequest): ResultGovernanceDecision {
  const { actor, currentResult } = request;
  let accepted = false;
  let resultStatus = currentResult.status;
  let supersedingResult: OfficialRaceResult | null = null;
  let reason: string | null = null;
  let newResultId: string | null = null;

  if (!actor.id.trim() || !currentResult.id.trim() || !currentResult.raceId.trim()) {
    reason = "Result and actor identities are required";
  } else if (!Number.isInteger(currentResult.version) || currentResult.version < 1) {
    reason = "Official result version must be a positive integer";
  } else if (!Number.isFinite(Date.parse(request.occurredAt))) {
    reason = "Result governance timestamp is invalid";
  } else if (request.action === "ratify") {
    if (actor.role !== "fia") reason = "Only FIA may ratify a race result";
    else if (currentResult.status !== "provisional") reason = "Only a provisional result may be ratified";
    else {
      accepted = true;
      resultStatus = "ratified";
    }
  } else if (request.action === "cancel") {
    if (actor.role !== "fia" && actor.role !== "admin") reason = "Only FIA or Admin may cancel a race result";
    else if (currentResult.status === "cancelled") reason = "Race result is already cancelled";
    else if (!request.reason?.trim()) reason = "Result cancellation requires an auditable reason";
    else {
      accepted = true;
      resultStatus = "cancelled";
    }
  } else if (request.action === "correct") {
    if (actor.role !== "admin") reason = "Only Admin may correct an official race result";
    else if (currentResult.status !== "ratified") reason = "Only a ratified result may be corrected";
    else if (!request.replacementResultId?.trim() || request.replacementResultId === currentResult.id) {
      reason = "Correction requires a distinct replacement result ID";
    } else if (!request.reason?.trim()) {
      reason = "Result correction requires an auditable reason";
    } else {
      accepted = true;
      resultStatus = "superseded";
      newResultId = request.replacementResultId;
      supersedingResult = Object.freeze({
        id: request.replacementResultId,
        raceId: currentResult.raceId,
        version: currentResult.version + 1,
        status: "ratified",
        supersedesResultId: currentResult.id
      });
    }
  } else {
    reason = "Unsupported result governance action";
  }

  return Object.freeze({
    accepted,
    resultStatus,
    supersedingResult,
    reason,
    audit: Object.freeze({
      action: request.action,
      actorId: actor.id,
      actorRole: actor.role,
      occurredAt: request.occurredAt,
      previousResultId: currentResult.id,
      newResultId,
      reason: request.reason?.trim() ?? null
    })
  });
}
