import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { RACE_ENGINE_VERSION } from "./race-engine/contracts.ts";
import type { RaceStartSnapshot } from "./race-engine/contracts.ts";
import { RaceSimulation } from "./race-engine/simulation.ts";
import type { RaceSimulationCheckpoint } from "./race-engine/simulation.ts";
import { createSyntheticRaceFixture } from "./race-engine/synthetic-fixture.ts";
import { createRaceEngineTestModels } from "./race-engine/test-profiles.ts";
import {
  authorizeRaceRestart,
  clearRaceControlFlag,
  createInitialRaceControlState,
  deployRaceControlFlag,
  issueRacePenalty,
  ratifyRacePenalty,
  reverseRacePenalty,
  resolveRaceClassificationWithPenalties,
  resolveStartingGridWithPenalties,
  validateRaceControlAuditTrail
} from "./race-engine/race-control.ts";
import { resolveTeamHqRaceEffects } from "./race-engine/hq.ts";
import { buildRaceTimingProjection } from "./race-engine/projection.ts";
import type { RaceTimingProjectionClassificationEntry } from "./race-engine/projection.ts";
import { summarizeRaceEngineBatch } from "./race-engine/runtime-metrics.ts";
import type { TeamHqDivision, TeamHqFacilityConfigInput } from "./race-engine/hq.ts";
import type {
  RaceControlAuditEvent,
  RaceControlCommandContext,
  RaceControlEvidence,
  RaceControlFlag,
  RaceControlPenalty,
  RaceControlState,
  RacePenaltyType,
  RaceRestartMode
} from "./race-engine/race-control.ts";

const TEST_URL = Deno.env.get("SUPABASE_URL")!;
const TEST_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRODUCTION_URL = "https://asltczqrmoxnayusvjta.supabase.co";
const PRODUCTION_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzbHRjenFybW94bmF5dXN2anRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MjY0NDksImV4cCI6MjExMDAwMjQ0OX0.IQQijox_4_s8wMM_7mK998AXIXy42k1d8yH1Oe2cCCQ";
const ALLOWED_ORIGINS = new Set([
  "https://calerismasters.com",
  "https://www.calerismasters.com",
  "https://calerismastersnewgen-mu.vercel.app"
]);

const service = createClient(TEST_URL, TEST_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function responseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin) });
}

async function requireProductionAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sesi admin diperlukan.");

  const userClient = createClient(PRODUCTION_URL, PRODUCTION_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Sesi login tidak valid atau sudah kedaluwarsa.");

  const { data: adminRow, error: adminError } = await userClient
    .from("site_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError || !adminRow) throw new Error("Akses Race Engine Lab hanya untuk Admin.");

  return { user: userData.user, token };
}

function restoreSimulation(checkpoint: RaceSimulationCheckpoint) {
  const models = createRaceEngineTestModels(checkpoint.snapshot);
  return RaceSimulation.restore(
    checkpoint,
    models.performanceModel,
    models.tyreModel,
    models.weatherModel,
    models.pitModel,
    models.incidentModel,
    models.raceControlProfile
  );
}

async function persistTimingProjection(
  sessionId: string,
  simulation: RaceSimulation,
  classification: readonly RaceTimingProjectionClassificationEntry[] = simulation.classification
) {
  const checkpoint = simulation.createCheckpoint();
  const projection = buildRaceTimingProjection(checkpoint, classification, new Date().toISOString());
  const { error } = await service.from("race_engine_test_projections").upsert({
    session_id: sessionId,
    schema_version: projection.schemaVersion,
    engine_version: projection.engineVersion,
    tick: projection.tick,
    status: projection.status,
    simulation_time_ms: projection.simulationTimeMs,
    projection,
    generated_at: projection.generatedAt,
    updated_at: new Date().toISOString()
  }, { onConflict: "session_id" });
  if (error) throw error;
  return projection;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payload request tidak valid.");
  }
  return value as Record<string, unknown>;
}

async function processBackgroundBatch() {
  const { data: sessions, error: listError } = await service
    .from("race_engine_test_sessions")
     .select("id,created_by,speed_multiplier,created_at,updated_at")
    .in("status", ["queued", "running"])
    // Rotate work by last update so the first three long races cannot starve later sessions.
    .order("updated_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(3);
  if (listError) throw listError;

  const processed: Array<Record<string, unknown>> = [];
  for (const session of sessions ?? []) {
    const { data: controlRows, error: controlError } = await service
      .from("race_engine_test_control_events")
      .select("payload")
      .eq("session_id", session.id)
      .order("sequence", { ascending: true });
    if (controlError) throw controlError;
    const controlEvents = (controlRows ?? []).map((row) => row.payload as RaceControlAuditEvent);
    const lastSuspension = [...controlEvents].reverse().find((event) =>
      event.action === "race_suspended" || event.action === "restart_authorized" || event.action === "race_resumed"
    );
    if (lastSuspension?.action === "race_suspended") {
      // Suspended sessions still occupy the active queue; rotate their scheduling timestamp to avoid starvation.
      const { error: rotateError } = await service
        .from("race_engine_test_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .in("status", ["queued", "running"]);
      if (rotateError) throw rotateError;
      processed.push({ sessionId: session.id, status: "suspended_by_red_flag" });
      continue;
    }

    const workerId = crypto.randomUUID();
    const { data: claim, error: claimError } = await service.rpc("race_engine_claim_test_session", {
      p_session_id: session.id,
      p_worker_id: workerId,
      p_lease_seconds: 60
    });
    if (claimError) throw claimError;
    if (!claim) {
      processed.push({ sessionId: session.id, status: "busy" });
      continue;
    }

    try {
      const checkpoint = claim.checkpoint as RaceSimulationCheckpoint;
      const simulation = restoreSimulation(checkpoint);
      const latestFlag = [...controlEvents].reverse().find((event) => event.flag !== undefined);
      simulation.clearExternalRaceControlFlags();
      if (
        latestFlag?.flag &&
        latestFlag.flag !== "green" &&
        latestFlag.flag !== "red_flag" &&
        Number.isFinite(latestFlag.flagExpiresAtSimulationTimeMs) &&
        Number(latestFlag.flagExpiresAtSimulationTimeMs) > simulation.simulationClockMs
      ) {
        simulation.applyExternalRaceControlFlag(
          latestFlag.flag as Exclude<RaceControlFlag, "green" | "red_flag">,
          latestFlag.id,
          Number(latestFlag.flagExpiresAtSimulationTimeMs)
        );
      }
      const previousEventCount = simulation.events.length;
      for (const controlEvent of controlEvents) {
        simulation.recordExternalRaceControlEvent({
          id: controlEvent.id,
          action: controlEvent.action,
          ...(controlEvent.flag ? { flag: controlEvent.flag } : {}),
          ...(controlEvent.flagDurationMs !== undefined ? { flagDurationMs: controlEvent.flagDurationMs } : {}),
          ...(controlEvent.restartMode ? { restartMode: controlEvent.restartMode } : {}),
          ...(controlEvent.restartPolicy ? { restartPolicy: controlEvent.restartPolicy } : {})
        });
      }
      const maxSteps = Math.max(1, Math.min(15, Number(session.speed_multiplier ?? 1)));
      for (let index = 0; index < maxSteps && simulation.status !== "completed"; index += 1) {
        simulation.advanceOneSegment();
      }

      const nextCheckpoint = simulation.createCheckpoint();
      const eventsAdded = simulation.events.slice(previousEventCount);
      const resolvedClassification = simulation.status === "completed"
        ? resolveRaceClassificationWithPenalties(simulation.classification, deriveRaceControlPenalties(session.id, controlEvents))
        : null;
      const { data: committed, error: commitError } = await service.rpc("race_engine_commit_test_step", {
        p_session_id: session.id,
        p_worker_id: workerId,
        p_expected_tick: Number(claim.tick),
        p_checkpoint: nextCheckpoint,
        p_events: eventsAdded,
        p_classification: resolvedClassification,
        p_status: simulation.status,
        p_command_id: crypto.randomUUID(),
        p_actor_id: session.created_by
      });
      if (commitError) throw commitError;
      if (committed?.ok === true) {
        await persistTimingProjection(
          session.id,
          simulation,
          resolvedClassification ?? simulation.classification
        );
      }
      processed.push({
        sessionId: session.id,
        status: simulation.status,
        tick: simulation.tick,
        eventsAdded: eventsAdded.length,
        committed
      });
    } catch (error) {
      // The lease expires naturally. A later invocation resumes from the last committed checkpoint.
      processed.push({
        sessionId: session.id,
        status: "retry_pending",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const checkedAt = new Date().toISOString();
  const [{ count: activeQueueDepth, error: queueCountError }] = await Promise.all([
    service.from("race_engine_test_sessions")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "running"])
  ]);
  if (queueCountError) throw queueCountError;
  const metrics = summarizeRaceEngineBatch(
    processed,
    activeQueueDepth ?? 0,
    (sessions ?? []).map((session) => session.created_at),
    checkedAt
  );
  return { processed, metrics, checkedAt };
}


function deriveRaceControlPenalties(sessionId: string, events: readonly RaceControlAuditEvent[]): RaceControlPenalty[] {
  const penaltiesById = new Map<string, RaceControlPenalty>();
  for (const event of events) {
    if (event.action === "penalty_issued" && event.penaltyId && event.driverId && event.penaltyType) {
      penaltiesById.set(event.penaltyId, {
        id: event.penaltyId,
        raceId: sessionId,
        driverId: event.driverId,
        type: event.penaltyType,
        durationMs: event.penaltyDurationMs ?? null,
        gridPositions: event.penaltyGridPositions ?? null,
        reason: event.reason,
        evidence: event.evidence,
        issuedBy: event.actorId,
        issuedAt: event.occurredAt,
        ratifiedByAdminId: null,
        reversedByEventId: null
      });
    } else if (event.action === "penalty_ratified" && event.penaltyId) {
      const previous = penaltiesById.get(event.penaltyId);
      if (previous) penaltiesById.set(event.penaltyId, { ...previous, ratifiedByAdminId: event.actorId, gridPenaltyApplied: event.gridPenaltyApplied ?? previous.gridPenaltyApplied });
    } else if (event.action === "penalty_reversed" && event.penaltyId) {
      const previous = penaltiesById.get(event.penaltyId);
      if (previous) penaltiesById.set(event.penaltyId, { ...previous, reversedByEventId: event.id });
    }
  }
  return [...penaltiesById.values()];
}

async function loadRaceControlContext(sessionId: string, userId: string) {
  const { data: session, error: sessionError } = await service
    .from("race_engine_test_sessions")
    .select("id,created_by,checkpoint,status,tick,lease_owner,lease_expires_at")
    .eq("id", sessionId)
    .eq("created_by", userId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("Sesi simulasi tidak ditemukan.");

  const { data: eventRows, error: eventError } = await service
    .from("race_engine_test_control_events")
    .select("sequence,payload")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });
  if (eventError) throw eventError;

  const events = (eventRows ?? []).map((row) => row.payload as RaceControlAuditEvent);
  const penalties = deriveRaceControlPenalties(sessionId, events);

  const simulation = restoreSimulation(session.checkpoint as RaceSimulationCheckpoint);
  const initial = createInitialRaceControlState(sessionId, simulation.classification);
  const lastFlagEvent = [...events].reverse().find((event) => event.flag !== undefined);
  const lastSuspensionEvent = [...events].reverse().find((event) =>
    event.action === "race_suspended" || event.action === "restart_authorized" || event.action === "race_resumed"
  );
  const suspended = lastSuspensionEvent?.action === "race_suspended";
  const state: RaceControlState = Object.freeze({
    ...initial,
    flag: lastFlagEvent?.flag ?? "green",
    suspended,
    restartPending: suspended,
    penalties: Object.freeze(penalties),
    events: Object.freeze(events)
  });
  return { session, simulation, state };
}

async function persistRaceControlEvent(sessionId: string, state: RaceControlState) {
  const event = state.events[state.events.length - 1];
  if (!event) throw new Error("Race-control event was not produced.");
  const { error } = await service.from("race_engine_test_control_events").insert({
    session_id: sessionId,
    sequence: event.sequence,
    action: event.action,
    actor_id: event.actorId,
    actor_role: event.actorRole,
    occurred_at: event.occurredAt,
    simulation_time_ms: event.simulationTimeMs,
    reason: event.reason,
    payload: event,
    evidence: event.evidence,
    supersedes_event_id: null,
    requires_admin_ratification: event.requiresAdminRatification
  });
  if (error) throw error;
  return event;
}

function raceControlContext(
  sessionId: string,
  userId: string,
  simulation: RaceSimulation,
  state: RaceControlState,
  body: Record<string, unknown>
): RaceControlCommandContext {
  const evidence = Array.isArray(body.evidence) ? body.evidence as RaceControlEvidence[] : [];
  const simulationTimeMs = simulation.simulationClockMs;
  return {
    raceId: sessionId,
    actorId: userId,
    actorRole: "admin",
    occurredAt: new Date().toISOString(),
    simulationTimeMs,
    sequence: state.events.length + 1,
    reason: String(body.reason ?? ""),
    evidence
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("Origin tidak diizinkan", { status: 403 });
    return new Response("ok", { headers: responseHeaders(origin) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin tidak diizinkan" }, 403, origin);

  try {
    const body = asRecord(await req.json());
    const action = body.action;

    if (action === "background_tick") {
      const token = req.headers.get("x-race-worker-token") ?? "";
      if (token.length < 32) return json({ error: "Worker authentication failed." }, 401, origin);
      const { data: authorized, error: authError } = await service.rpc("race_engine_validate_worker_token", {
        p_token: token
      });
      if (authError) throw authError;
      if (authorized !== true) return json({ error: "Worker authentication failed." }, 401, origin);
      return json({ ok: true, ...(await processBackgroundBatch()) }, 200, origin);
    }

    const { user } = await requireProductionAdmin(req);

    if (action === "list") {
      const { data, error } = await service
        .from("race_engine_test_sessions")
        .select("id,status,seed,driver_count,team_count,total_laps,engine_version,tick,total_ticks,speed_multiplier,created_at,updated_at,completed_at,last_error")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return json({ sessions: data ?? [] }, 200, origin);
    }

    if (action === "create") {
      const driverCount = Number(body.driverCount ?? 20);
      const teamCount = Number(body.teamCount ?? 10);
      const totalLaps = Number(body.totalLaps ?? 5);
      const seed = Number(body.seed ?? 20261120);
      if (!Number.isInteger(driverCount) || driverCount < 2 || driverCount > 25) throw new Error("Jumlah driver harus 2 sampai 25.");
      if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 10 || teamCount > driverCount) throw new Error("Jumlah team harus 1 sampai 10 dan tidak melebihi driver.");
      if (!Number.isInteger(totalLaps) || totalLaps < 1 || totalLaps > 10) throw new Error("Jumlah lap harus 1 sampai 10.");
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed harus berupa integer 32-bit unsigned.");

      const id = crypto.randomUUID();
      const fixture = createSyntheticRaceFixture({ seed, driverCount, teamCount, totalLaps });
      const division = String(body.division ?? "premio") as TeamHqDivision;
      if (division !== "premio" && division !== "zwei") throw new Error("Division HQ tidak valid.");
      const hqInput = body.hqFacilityLevels === undefined ? {} : asRecord(body.hqFacilityLevels);
      const hqFacilityKeys = ["engineering_department", "rd_center", "simulator_facility", "pit_crew_training_center"] as const;
      const { data: hqConfigRows, error: hqConfigError } = await service
        .from("caleris_team_hq_facility_configs")
        .select("facility_key,is_enabled,max_level_premio,max_level_zwei,effects_by_level,updated_at")
        .in("facility_key", [...hqFacilityKeys]);
      if (hqConfigError) throw hqConfigError;
      const hqConfigs: TeamHqFacilityConfigInput[] = (hqConfigRows ?? []).map((row) => ({
        facilityKey: row.facility_key,
        isEnabled: row.is_enabled,
        maxLevelPremio: row.max_level_premio,
        maxLevelZwei: row.max_level_zwei,
        effectsByLevel: row.effects_by_level as Record<string, Record<string, number>>,
        updatedAt: row.updated_at
      }));
      const hqLevels = hqFacilityKeys.map((facilityKey) => ({
        facilityKey,
        level: Number(hqInput[facilityKey] ?? 0)
      }));
      const hqResolution = resolveTeamHqRaceEffects(division, hqLevels, hqConfigs, new Date().toISOString());
      if (hqResolution.unresolvedFacilityKeys.length > 0) {
        throw new Error(`HQ belum siap untuk simulasi: ${hqResolution.unresolvedFacilityKeys.join(", ")} belum memiliki efek balap terkonfigurasi.`);
      }
      const setupInput = body.carSetup === undefined ? null : asRecord(body.carSetup);
      const carSetup = setupInput ? {
        schemaVersion: 1 as const,
        aeroSetting: Number(setupInput.aeroSetting),
        suspensionSetting: Number(setupInput.suspensionSetting),
        brakeBalanceFrontPercent: Number(setupInput.brakeBalanceFrontPercent),
        frontTyrePressurePsi: Number(setupInput.frontTyrePressurePsi),
        rearTyrePressurePsi: Number(setupInput.rearTyrePressurePsi)
      } : undefined;
      const snapshot: RaceStartSnapshot = {
        ...fixture,
        raceId: id,
        entrants: fixture.entrants.map((entrant) => ({
          ...entrant,
          hqEffects: hqResolution.snapshot.effects,
          hqFacilitySnapshot: hqResolution.snapshot,
          ...(carSetup ? { carSetup } : {})
        }))
      };
      const models = createRaceEngineTestModels(snapshot);
      const simulation = new RaceSimulation(snapshot, models);
      const checkpoint = simulation.createCheckpoint();
      const { data, error } = await service
        .from("race_engine_test_sessions")
        .insert({
          id,
          created_by: user.id,
          status: "queued",
          seed,
          driver_count: driverCount,
          team_count: teamCount,
          total_laps: totalLaps,
          engine_version: RACE_ENGINE_VERSION,
          snapshot,
          checkpoint,
          tick: 0,
          total_ticks: totalLaps * snapshot.circuit.segments.length
        })
        .select("id,status,seed,driver_count,team_count,total_laps,engine_version,tick,total_ticks,created_at")
        .single();
      if (error) throw error;
      const { error: checkpointError } = await service
        .from("race_engine_test_checkpoints")
        .insert({ session_id: id, tick: 0, engine_version: RACE_ENGINE_VERSION, checkpoint });
      if (checkpointError) throw checkpointError;
      await persistTimingProjection(id, simulation);
      return json({ session: data, syntheticOnly: true, productionCalibration: false }, 201, origin);
    }

    const sessionId = String(body.sessionId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Session ID tidak valid.");

    if (action === "control_state") {
      const { simulation, state } = await loadRaceControlContext(sessionId, user.id);
      return json({
        controlState: state,
        classification: simulation.classification,
        resolvedClassification: resolveRaceClassificationWithPenalties(simulation.classification, state.penalties),
        startingGrid: simulation.entrantStates.map((entrant) => ({ driverId: entrant.driverId, gridPosition: entrant.startingGridPosition ?? 1 })).sort((a, b) => a.gridPosition - b.gridPosition),
        audit: validateRaceControlAuditTrail(state)
      }, 200, origin);
    }

    if (action === "control_flag") {
      const { simulation, state } = await loadRaceControlContext(sessionId, user.id);
      const context = raceControlContext(sessionId, user.id, simulation, state, body);
      const flag = String(body.flag ?? "") as RaceControlFlag;
      const allowedFlags: RaceControlFlag[] = ["green", "yellow", "double_yellow", "full_course_yellow", "virtual_safety_car", "safety_car", "red_flag"];
      if (!allowedFlags.includes(flag)) throw new Error("Unsupported race-control flag.");
      const durationMs = body.durationMs === undefined ? undefined : Number(body.durationMs);
      const next = flag === "green"
        ? clearRaceControlFlag(state, context)
        : deployRaceControlFlag(state, context, flag as Exclude<RaceControlFlag, "green">, durationMs);
      const event = await persistRaceControlEvent(sessionId, next);
      return json({ event, controlState: next }, 200, origin);
    }

    if (action === "control_restart") {
      const { simulation, state } = await loadRaceControlContext(sessionId, user.id);
      const context = raceControlContext(sessionId, user.id, simulation, state, body);
      const mode = String(body.mode ?? "") as RaceRestartMode;
      if (mode !== "standing" && mode !== "rolling") throw new Error("Restart mode must be standing or rolling.");
      const next = authorizeRaceRestart(state, context, mode);
      const event = await persistRaceControlEvent(sessionId, next);
      return json({ event, controlState: next }, 200, origin);
    }

    if (action === "control_penalty") {
      const { simulation, state } = await loadRaceControlContext(sessionId, user.id);
      const context = raceControlContext(sessionId, user.id, simulation, state, body);
      const penaltyType = String(body.penaltyType ?? "") as RacePenaltyType;
      const durationMs = body.durationMs === undefined ? undefined : Number(body.durationMs);
      const gridPositions = body.gridPositions === undefined ? undefined : Number(body.gridPositions);
      const next = issueRacePenalty(state, context, {
        driverId: String(body.driverId ?? ""),
        type: penaltyType,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(gridPositions !== undefined ? { gridPositions } : {})
      });
      const event = await persistRaceControlEvent(sessionId, next);
      return json({ event, controlState: next }, 201, origin);
    }

    if (action === "control_ratify_penalty") {
      const { session, simulation, state } = await loadRaceControlContext(sessionId, user.id);
      const context = raceControlContext(sessionId, user.id, simulation, state, body);
      const penaltyId = String(body.penaltyId ?? "");
      const issuedPenalty = state.penalties.find((penalty) => penalty.id === penaltyId);
      const next = ratifyRacePenalty(state, context, penaltyId);
      const event = next.events[next.events.length - 1];
      const canApplyGridNow = issuedPenalty?.type === "grid_penalty"
        && session.status === "queued"
        && Number(session.tick) === 0
        && session.lease_owner === null
        && session.lease_expires_at === null;

      if (canApplyGridNow) {
        const grid = resolveStartingGridWithPenalties(
          simulation.entrantStates.map((entrant) => ({
            driverId: entrant.driverId,
            gridPosition: entrant.startingGridPosition ?? 1
          })),
          next.penalties
        );
        simulation.applyStartingGridOrder(grid);
        const appliedEvent: RaceControlAuditEvent = { ...event, gridPenaltyApplied: true };
        const rpcResult = await service.rpc("race_engine_test_commit_grid_penalty_ratification", {
          p_session_id: sessionId,
          p_created_by: user.id,
          p_checkpoint: simulation.createCheckpoint(),
          p_event: appliedEvent
        });
        if (rpcResult.error) throw rpcResult.error;
        const appliedState: RaceControlState = {
          ...next,
          events: Object.freeze([...next.events.slice(0, -1), appliedEvent]),
          penalties: Object.freeze(next.penalties.map((penalty) => penalty.id === penaltyId
            ? { ...penalty, gridPenaltyApplied: true }
            : penalty))
        };
        return json({ event: appliedEvent, controlState: appliedState, startingGrid: grid, gridPenaltyApplied: true }, 200, origin);
      }

      const persistedEvent = await persistRaceControlEvent(sessionId, next);
      return json({ event: persistedEvent, controlState: next, gridPenaltyApplied: false }, 200, origin);
    }

    if (action === "control_reverse_penalty") {
      const { simulation, state } = await loadRaceControlContext(sessionId, user.id);
      const context = raceControlContext(sessionId, user.id, simulation, state, body);
      const penaltyId = String(body.penaltyId ?? "");
      const supersedesEventId = String(body.supersedesEventId ?? "");
      const next = reverseRacePenalty(state, context, penaltyId, supersedesEventId);
      const event = await persistRaceControlEvent(sessionId, next);
      return json({ event, controlState: next }, 200, origin);
    }

    if (action === "detail" || action === "recover") {
      const { data: session, error } = await service
        .from("race_engine_test_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("created_by", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!session) return json({ error: "Sesi tidak ditemukan." }, 404, origin);

      const checkpoint = session.checkpoint as RaceSimulationCheckpoint;
      const simulation = restoreSimulation(checkpoint);
      if (action === "recover") {
        return json({
          restored: true,
          sessionId,
          tick: simulation.tick,
          totalTicks: session.total_ticks,
          status: simulation.status,
          eventCount: simulation.events.length,
          classification: simulation.classification
        }, 200, origin);
      }
      const { data: events, error: eventError } = await service
        .from("race_engine_test_events")
        .select("sequence,event_type,driver_id,lap_number,simulation_time_ms,payload")
        .eq("session_id", sessionId)
        .order("sequence", { ascending: false })
        .limit(150);
      if (eventError) throw eventError;
      const { data: projectionRow, error: projectionError } = await service
        .from("race_engine_test_projections")
        .select("projection")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (projectionError) throw projectionError;
      const { data: commands, error: commandError } = await service
        .from("race_engine_test_commands")
        .select("id,command_type,result,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (commandError) throw commandError;
      return json({ session, projection: projectionRow?.projection ?? null, events: events ?? [], commands: commands ?? [] }, 200, origin);
    }

    if (action === "replay") {
      const offset = Number(body.offset ?? 0);
      const limit = Number(body.limit ?? 250);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Replay offset tidak valid.");
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("Replay page size harus 1 sampai 500.");
      const { data: session, error: sessionError } = await service
        .from("race_engine_test_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("created_by", user.id)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) return json({ error: "Sesi tidak ditemukan." }, 404, origin);
      const { data: events, error: replayError } = await service
        .from("race_engine_test_events")
        .select("sequence,event_type,driver_id,lap_number,simulation_time_ms,payload")
        .eq("session_id", sessionId)
        .order("sequence", { ascending: true })
        .range(offset, offset + limit - 1);
      if (replayError) throw replayError;
      return json({ events: events ?? [], offset, limit }, 200, origin);
    }

    if (action === "set_speed") {
      const speedMultiplier = Number(body.speedMultiplier);
      if (![1, 5, 10, 15].includes(speedMultiplier)) throw new Error("Kecepatan hanya mendukung 1x, 5x, 10x, atau 15x.");
      const { data: result, error } = await service.rpc("race_engine_set_test_speed", {
        p_session_id: sessionId,
        p_actor_id: user.id,
        p_speed_multiplier: speedMultiplier,
        p_command_id: crypto.randomUUID()
      });
      if (error) throw error;
      return json({ result }, 200, origin);
    }

    if (action === "advance") {
      const { data: controlRows, error: controlError } = await service
        .from("race_engine_test_control_events")
        .select("payload")
        .eq("session_id", sessionId)
        .order("sequence", { ascending: true });
      if (controlError) throw controlError;
      const controlEvents = (controlRows ?? []).map((row) => row.payload as RaceControlAuditEvent);
      const lastSuspension = [...controlEvents].reverse().find((event) =>
        event.action === "race_suspended" || event.action === "restart_authorized" || event.action === "race_resumed"
      );
      if (lastSuspension?.action === "race_suspended") {
        return json({ error: "Race ditangguhkan oleh red flag. FIA/Admin harus mengesahkan restart terlebih dahulu.", suspended: true }, 409, origin);
      }

      const workerId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await service.rpc("race_engine_claim_test_session", {
        p_session_id: sessionId,
        p_worker_id: workerId,
        p_lease_seconds: 60
      });
      if (claimError) throw claimError;
      if (!claimed) return json({ error: "Sesi sedang diproses worker lain atau sudah selesai.", busy: true }, 409, origin);

      const checkpoint = claimed.checkpoint as RaceSimulationCheckpoint;
      const simulation = restoreSimulation(checkpoint);
      const latestFlag = [...controlEvents].reverse().find((event) => event.flag !== undefined);
      simulation.clearExternalRaceControlFlags();
      if (
        latestFlag?.flag &&
        latestFlag.flag !== "green" &&
        latestFlag.flag !== "red_flag" &&
        Number.isFinite(latestFlag.flagExpiresAtSimulationTimeMs) &&
        Number(latestFlag.flagExpiresAtSimulationTimeMs) > simulation.simulationClockMs
      ) {
        simulation.applyExternalRaceControlFlag(
          latestFlag.flag as Exclude<RaceControlFlag, "green" | "red_flag">,
          latestFlag.id,
          Number(latestFlag.flagExpiresAtSimulationTimeMs)
        );
      }
      const previousEventCount = simulation.events.length;
      for (const controlEvent of controlEvents) {
        simulation.recordExternalRaceControlEvent({
          id: controlEvent.id,
          action: controlEvent.action,
          ...(controlEvent.flag ? { flag: controlEvent.flag } : {}),
          ...(controlEvent.flagDurationMs !== undefined ? { flagDurationMs: controlEvent.flagDurationMs } : {}),
          ...(controlEvent.restartMode ? { restartMode: controlEvent.restartMode } : {}),
          ...(controlEvent.restartPolicy ? { restartPolicy: controlEvent.restartPolicy } : {})
        });
      }
      const expectedTick = Number(claimed.tick);
      const steps = Number(claimed.speed_multiplier ?? 1);
      for (let index = 0; index < steps && simulation.status !== "completed"; index += 1) {
        simulation.advanceOneSegment();
      }
      const nextCheckpoint = simulation.createCheckpoint();
      const eventsAdded = simulation.events.slice(previousEventCount);
      const status = simulation.status;
      const classification = status === "completed"
        ? resolveRaceClassificationWithPenalties(simulation.classification, deriveRaceControlPenalties(sessionId, controlEvents))
        : null;
      const commandId = crypto.randomUUID();
      const { data: committed, error: commitError } = await service.rpc("race_engine_commit_test_step", {
        p_session_id: sessionId,
        p_worker_id: workerId,
        p_expected_tick: expectedTick,
        p_checkpoint: nextCheckpoint,
        p_events: eventsAdded,
        p_classification: classification,
        p_status: status,
        p_command_id: commandId,
        p_actor_id: user.id
      });
      if (commitError) throw commitError;
      if (committed?.conflict) return json({ error: "Checkpoint berubah karena worker lain.", conflict: true }, 409, origin);
      const timingProjection = committed?.ok === true
        ? await persistTimingProjection(sessionId, simulation, classification ?? simulation.classification)
        : null;
      return json({
        result: committed,
        sessionId,
        tick: simulation.tick,
        totalTicks: checkpoint.snapshot.circuit.totalLaps * checkpoint.snapshot.circuit.segments.length,
        status,
        eventsAdded,
        classification,
        projection: timingProjection,
        checkpointSchema: nextCheckpoint.schemaVersion
      }, 200, origin);
    }

    return json({ error: "Action tidak dikenal." }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = /Sesi admin|Akses Race Engine|Sesi login/i.test(message) ? 401 : 400;
    return json({ error: message }, status, origin);
  }
});
