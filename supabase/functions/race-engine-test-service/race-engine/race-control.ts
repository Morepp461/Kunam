import type { RaceClassificationEntry } from "./simulation.ts";

export const RACE_CONTROL_POLICY_VERSION = "1.0.0";

export type RaceControlActorRole = "admin" | "fia";
export type RaceControlFlag =
  | "green"
  | "yellow"
  | "double_yellow"
  | "full_course_yellow"
  | "virtual_safety_car"
  | "safety_car"
  | "red_flag";
export type RaceRestartMode = "standing" | "rolling";
export type RedFlagRestartPolicy = "last_valid_classification";
export type RacePenaltyType =
  | "warning"
  | "time_5s"
  | "time_10s"
  | "drive_through"
  | "stop_go"
  | "grid_penalty"
  | "time_penalty"
  | "disqualification"
  | "race_ban";
export type RaceControlAction =
  | "flag_deployed"
  | "flag_cleared"
  | "race_suspended"
  | "race_resumed"
  | "restart_authorized"
  | "penalty_issued"
  | "penalty_ratified"
  | "penalty_reversed";

export interface RaceControlEvidence {
  readonly id: string;
  readonly source: "telemetry" | "replay" | "marshal_report" | "race_director_report" | "steward_review";
  readonly capturedAt: string;
  readonly driverId?: string;
  readonly lapNumber: number;
  readonly segmentId?: string;
  readonly description: string;
  readonly artifactRef: string;
}

export interface RaceControlAuditEvent {
  readonly id: string;
  readonly raceId: string;
  readonly sequence: number;
  readonly action: RaceControlAction;
  readonly actorId: string;
  readonly actorRole: RaceControlActorRole;
  readonly occurredAt: string;
  readonly simulationTimeMs: number;
  readonly flag?: RaceControlFlag;
  readonly restartMode?: RaceRestartMode;
  readonly restartPolicy?: RedFlagRestartPolicy;
  readonly driverId?: string;
  readonly penaltyType?: RacePenaltyType;
  readonly penaltyId?: string;
  readonly penaltyDurationMs?: number;
  readonly penaltyGridPositions?: number;
  readonly reason: string;
  readonly evidence: readonly RaceControlEvidence[];
  readonly supersedesEventId?: string;
  readonly requiresAdminRatification: boolean;
}

export interface RaceControlPenalty {
  readonly id: string;
  readonly raceId: string;
  readonly driverId: string;
  readonly type: RacePenaltyType;
  readonly durationMs: number | null;
  readonly gridPositions: number | null;
  readonly reason: string;
  readonly evidence: readonly RaceControlEvidence[];
  readonly issuedBy: string;
  readonly issuedAt: string;
  readonly ratifiedByAdminId: string | null;
  readonly reversedByEventId: string | null;
}

export interface RaceControlState {
  readonly raceId: string;
  readonly flag: RaceControlFlag;
  readonly suspended: boolean;
  readonly restartPending: boolean;
  readonly lastValidClassification: readonly RaceClassificationEntry[];
  readonly penalties: readonly RaceControlPenalty[];
  readonly events: readonly RaceControlAuditEvent[];
}

export interface RaceControlCommandContext {
  readonly raceId: string;
  readonly actorId: string;
  readonly actorRole: RaceControlActorRole;
  readonly occurredAt: string;
  readonly simulationTimeMs: number;
  readonly sequence: number;
  readonly reason: string;
  readonly evidence: readonly RaceControlEvidence[];
}

export interface RaceControlValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const TIMED_PENALTIES = new Set<RacePenaltyType>(["time_5s", "time_10s", "time_penalty", "drive_through", "stop_go"]);

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validateEvidence(evidence: readonly RaceControlEvidence[], requireDriver = false): string[] {
  const errors: string[] = [];
  if (evidence.length === 0) errors.push("At least one evidence item is required");
  const ids = new Set<string>();
  for (const item of evidence) {
    if (!item.id.trim() || ids.has(item.id)) errors.push("Evidence IDs must be present and unique");
    ids.add(item.id);
    if (!validTimestamp(item.capturedAt)) errors.push(`Evidence ${item.id} has an invalid timestamp`);
    if (!Number.isInteger(item.lapNumber) || item.lapNumber < 0) errors.push(`Evidence ${item.id} has an invalid lap number`);
    if (!item.description.trim() || !item.artifactRef.trim()) errors.push(`Evidence ${item.id} must include description and artifact reference`);
    if (requireDriver && !item.driverId?.trim()) errors.push(`Evidence ${item.id} must identify the driver`);
  }
  return errors;
}

export function createInitialRaceControlState(
  raceId: string,
  lastValidClassification: readonly RaceClassificationEntry[]
): RaceControlState {
  if (!raceId.trim()) throw new Error("Race ID is required");
  if (lastValidClassification.length === 0) throw new Error("A valid classification snapshot is required");
  const ids = new Set<string>();
  for (const entry of lastValidClassification) {
    if (!entry.driverId.trim() || ids.has(entry.driverId)) throw new Error("Classification driver IDs must be present and unique");
    ids.add(entry.driverId);
  }
  return Object.freeze({
    raceId,
    flag: "green",
    suspended: false,
    restartPending: false,
    lastValidClassification: Object.freeze(lastValidClassification.map((entry) => Object.freeze({ ...entry }))),
    penalties: Object.freeze([]),
    events: Object.freeze([])
  });
}

function validateContext(context: RaceControlCommandContext): string[] {
  const errors: string[] = [];
  if (!context.raceId.trim() || !context.actorId.trim()) errors.push("Race and actor IDs are required");
  if (!validTimestamp(context.occurredAt)) errors.push("Command timestamp is invalid");
  if (!Number.isInteger(context.simulationTimeMs) || context.simulationTimeMs < 0) errors.push("Simulation timestamp must be a non-negative integer");
  if (!Number.isInteger(context.sequence) || context.sequence < 1) errors.push("Event sequence must be a positive integer");
  if (!context.reason.trim()) errors.push("A reason is required");
  return errors;
}

function createAuditEvent(
  context: RaceControlCommandContext,
  input: Omit<RaceControlAuditEvent, keyof RaceControlCommandContext | "raceId" | "sequence" | "actorId" | "actorRole" | "occurredAt" | "simulationTimeMs" | "reason" | "evidence" | "id" | "requiresAdminRatification">
    & { readonly id: string }
): RaceControlAuditEvent {
  return Object.freeze({
    ...input,
    raceId: context.raceId,
    sequence: context.sequence,
    actorId: context.actorId,
    actorRole: context.actorRole,
    occurredAt: context.occurredAt,
    simulationTimeMs: context.simulationTimeMs,
    reason: context.reason,
    evidence: Object.freeze(context.evidence.map((item) => Object.freeze({ ...item }))),
    requiresAdminRatification: input.action === "penalty_issued"
  });
}

function appendEvent(state: RaceControlState, event: RaceControlAuditEvent): RaceControlState {
  if (event.raceId !== state.raceId) throw new Error("Race-control event belongs to another race");
  if (state.events.some((item) => item.id === event.id)) throw new Error("Race-control event ID already exists");
  if (event.sequence !== state.events.length + 1) throw new Error("Race-control event sequence is not contiguous");
  return Object.freeze({ ...state, events: Object.freeze([...state.events, event]) });
}

export function deployRaceControlFlag(
  state: RaceControlState,
  context: RaceControlCommandContext,
  flag: Exclude<RaceControlFlag, "green">
): RaceControlState {
  const errors = [...validateContext(context), ...validateEvidence(context.evidence)];
  if (context.actorRole !== "fia" && context.actorRole !== "admin") errors.push("Only FIA or Admin may deploy race-control flags");
  if (context.raceId !== state.raceId) errors.push("Race ID does not match the active session");
  if (flag === "red_flag" && state.suspended) errors.push("Race is already suspended");
  if (errors.length) throw new Error(errors.join("; "));
  const suspended = flag === "red_flag";
  const event = createAuditEvent(context, { id: `rc-${context.sequence}`, action: suspended ? "race_suspended" : "flag_deployed", flag });
  const next = appendEvent(state, event);
  return Object.freeze({ ...next, flag, suspended, restartPending: suspended });
}

export function clearRaceControlFlag(
  state: RaceControlState,
  context: RaceControlCommandContext
): RaceControlState {
  const errors = [...validateContext(context), ...validateEvidence(context.evidence)];
  if (context.raceId !== state.raceId) errors.push("Race ID does not match the active session");
  if (state.suspended) errors.push("A red-flag suspension must be resumed through the restart procedure");
  if (state.flag === "green") errors.push("There is no active race-control flag to clear");
  if (errors.length) throw new Error(errors.join("; "));
  const event = createAuditEvent(context, { id: `rc-${context.sequence}`, action: "flag_cleared", flag: "green" });
  const next = appendEvent(state, event);
  return Object.freeze({ ...next, flag: "green" });
}

export function authorizeRaceRestart(
  state: RaceControlState,
  context: RaceControlCommandContext,
  mode: RaceRestartMode
): RaceControlState {
  const errors = [...validateContext(context), ...validateEvidence(context.evidence)];
  if (context.raceId !== state.raceId) errors.push("Race ID does not match the active session");
  if (!state.suspended || !state.restartPending) errors.push("Race restart is not pending");
  if (state.flag !== "red_flag") errors.push("Restart authorization requires a red-flag state");
  if (errors.length) throw new Error(errors.join("; "));
  const event = createAuditEvent(context, {
    id: `rc-${context.sequence}`,
    action: "restart_authorized",
    flag: "green",
    restartMode: mode,
    restartPolicy: "last_valid_classification"
  });
  const next = appendEvent(state, event);
  return Object.freeze({ ...next, flag: "green", suspended: false, restartPending: false });
}

export function issueRacePenalty(
  state: RaceControlState,
  context: RaceControlCommandContext,
  input: { readonly driverId: string; readonly type: RacePenaltyType; readonly durationMs?: number; readonly gridPositions?: number }
): RaceControlState {
  const errors = [...validateContext(context), ...validateEvidence(context.evidence, true)];
  if (context.raceId !== state.raceId) errors.push("Race ID does not match the active session");
  if (!input.driverId.trim()) errors.push("Penalty driver ID is required");
  if (!state.lastValidClassification.some((entry) => entry.driverId === input.driverId)) errors.push("Penalty driver is not part of the last valid classification");
  if (context.actorRole !== "fia" && context.actorRole !== "admin") errors.push("Only FIA or Admin may issue a penalty");
  if (context.evidence.some((item) => item.driverId && item.driverId !== input.driverId)) errors.push("Penalty evidence references a different driver");
  if (TIMED_PENALTIES.has(input.type)) {
    if (!Number.isInteger(input.durationMs) || (input.durationMs ?? 0) <= 0) errors.push("A positive integer duration is required for time, drive-through, and stop-go penalties");
    if (input.type === "time_5s" && input.durationMs !== 5000) errors.push("A 5-second penalty must equal 5000 milliseconds");
    if (input.type === "time_10s" && input.durationMs !== 10000) errors.push("A 10-second penalty must equal 10000 milliseconds");
  } else if (input.durationMs !== undefined) errors.push("This penalty type does not accept a time duration");
  if (input.type === "grid_penalty") {
    if (!Number.isInteger(input.gridPositions) || (input.gridPositions ?? 0) < 1 || (input.gridPositions ?? 0) > 20) errors.push("Grid penalty must be between 1 and 20 positions");
  } else if (input.gridPositions !== undefined) errors.push("Only grid penalties may specify grid positions");
  if (errors.length) throw new Error(errors.join("; "));
  const penalty: RaceControlPenalty = Object.freeze({
    id: `penalty-${context.sequence}`,
    raceId: context.raceId,
    driverId: input.driverId,
    type: input.type,
    durationMs: input.durationMs ?? null,
    gridPositions: input.gridPositions ?? null,
    reason: context.reason,
    evidence: Object.freeze(context.evidence.map((item) => Object.freeze({ ...item }))),
    issuedBy: context.actorId,
    issuedAt: context.occurredAt,
    ratifiedByAdminId: null,
    reversedByEventId: null
  });
  const event = createAuditEvent(context, {
    id: `rc-${context.sequence}`,
    action: "penalty_issued",
    penaltyId: penalty.id,
    driverId: input.driverId,
    penaltyType: input.type,
    ...(input.durationMs !== undefined ? { penaltyDurationMs: input.durationMs } : {}),
    ...(input.gridPositions !== undefined ? { penaltyGridPositions: input.gridPositions } : {})
  });
  const next = appendEvent(state, event);
  return Object.freeze({ ...next, penalties: Object.freeze([...state.penalties, penalty]) });
}

export function ratifyRacePenalty(
  state: RaceControlState,
  context: RaceControlCommandContext,
  penaltyId: string
): RaceControlState {
  const errors = [...validateContext(context), ...validateEvidence(context.evidence)];
  if (context.actorRole !== "admin") errors.push("Only Admin may ratify an FIA penalty");
  if (context.raceId !== state.raceId) errors.push("Race ID does not match the active session");
  const penalty = state.penalties.find((item) => item.id === penaltyId);
  if (!penalty) errors.push("Penalty does not exist");
  if (penalty?.ratifiedByAdminId) errors.push("Penalty is already ratified");
  if (penalty?.reversedByEventId) errors.push("A reversed penalty cannot be ratified");
  if (errors.length) throw new Error(errors.join("; "));
  const event = createAuditEvent(context, { id: `rc-${context.sequence}`, action: "penalty_ratified", penaltyId, driverId: penalty!.driverId, penaltyType: penalty!.type });
  const next = appendEvent(state, event);
  return Object.freeze({
    ...next,
    penalties: Object.freeze(state.penalties.map((item) => item.id === penaltyId
      ? Object.freeze({ ...item, ratifiedByAdminId: context.actorId })
      : item))
  });
}

export function reverseRacePenalty(
  state: RaceControlState,
  context: RaceControlCommandContext,
  penaltyId: string,
  supersedesEventId: string
): RaceControlState {
  const errors = [...validateContext(context), ...validateEvidence(context.evidence)];
  if (context.actorRole !== "admin") errors.push("Only Admin may reverse a penalty");
  if (context.raceId !== state.raceId) errors.push("Race ID does not match the active session");
  const penalty = state.penalties.find((item) => item.id === penaltyId);
  if (!penalty) errors.push("Penalty does not exist");
  if (!supersedesEventId.trim()) errors.push("A superseded event reference is required");
  if (penalty?.reversedByEventId) errors.push("Penalty is already reversed");
  if (errors.length) throw new Error(errors.join("; "));
  const event = createAuditEvent(context, {
    id: `rc-${context.sequence}`,
    action: "penalty_reversed",
    penaltyId,
    driverId: penalty!.driverId,
    penaltyType: penalty!.type,
    supersedesEventId
  });
  const next = appendEvent(state, event);
  return Object.freeze({
    ...next,
    penalties: Object.freeze(state.penalties.map((item) => item.id === penaltyId
      ? Object.freeze({ ...item, reversedByEventId: event.id })
      : item))
  });
}

export function validateRaceControlAuditTrail(
  state: RaceControlState
): RaceControlValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  state.events.forEach((event, index) => {
    if (event.sequence !== index + 1) errors.push("Race-control event sequence is not contiguous");
    if (ids.has(event.id)) errors.push("Race-control event IDs must be unique");
    ids.add(event.id);
    if (!event.actorId.trim() || !event.reason.trim() || !validTimestamp(event.occurredAt)) errors.push(`Race-control event ${event.id} has incomplete audit metadata`);
    errors.push(...validateEvidence(event.evidence).map((error) => `${event.id}: ${error}`));
    if (event.action === "penalty_issued" && !event.requiresAdminRatification) errors.push("Issued penalties must require Admin ratification");
  });
  return { valid: errors.length === 0, errors };
}
