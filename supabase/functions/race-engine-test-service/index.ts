import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { RACE_ENGINE_VERSION } from "https://raw.githubusercontent.com/Morepp461/Kunam/36a711140ce624eb256e42e06cb4f81997ae6008/supabase/functions/race-engine-test-service/race-engine/contracts.ts";
import type { RaceStartSnapshot } from "./race-engine/contracts.ts";
import { RaceSimulation } from "https://raw.githubusercontent.com/Morepp461/Kunam/36a711140ce624eb256e42e06cb4f81997ae6008/supabase/functions/race-engine-test-service/race-engine/simulation.ts";
import type { RaceSimulationCheckpoint } from "./race-engine/simulation.ts";
import { createSyntheticRaceFixture } from "https://raw.githubusercontent.com/Morepp461/Kunam/36a711140ce624eb256e42e06cb4f81997ae6008/supabase/functions/race-engine-test-service/race-engine/synthetic-fixture.ts";
import { createRaceEngineTestModels } from "https://raw.githubusercontent.com/Morepp461/Kunam/36a711140ce624eb256e42e06cb4f81997ae6008/supabase/functions/race-engine-test-service/race-engine/test-profiles.ts";

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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payload request tidak valid.");
  }
  return value as Record<string, unknown>;
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
    const { user } = await requireProductionAdmin(req);
    const body = asRecord(await req.json());
    const action = body.action;

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
      if (!Number.isInteger(driverCount) || driverCount < 2 || driverCount > 20) throw new Error("Jumlah driver harus 2 sampai 20.");
      if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 10 || teamCount > driverCount) throw new Error("Jumlah team harus 1 sampai 10 dan tidak melebihi driver.");
      if (!Number.isInteger(totalLaps) || totalLaps < 1 || totalLaps > 10) throw new Error("Jumlah lap harus 1 sampai 10.");
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed harus berupa integer 32-bit unsigned.");

      const id = crypto.randomUUID();
      const fixture = createSyntheticRaceFixture({ seed, driverCount, teamCount, totalLaps });
      const snapshot: RaceStartSnapshot = { ...fixture, raceId: id };
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
      return json({ session: data, syntheticOnly: true, productionCalibration: false }, 201, origin);
    }

    const sessionId = String(body.sessionId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Session ID tidak valid.");

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
      const { data: commands, error: commandError } = await service
        .from("race_engine_test_commands")
        .select("id,command_type,result,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (commandError) throw commandError;
      return json({ session, events: events ?? [], commands: commands ?? [] }, 200, origin);
    }

    if (action === "replay") {
      const offset = Math.max(0, Math.floor(Number(body.offset ?? 0)));
      const limit = Math.min(500, Math.max(1, Math.floor(Number(body.limit ?? 250))));
      if (!Number.isSafeInteger(offset)) throw new Error("Replay offset tidak valid.");
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
      const expectedTick = Number(claimed.tick);
      const steps = Number(claimed.speed_multiplier ?? 1);
      const previousEventCount = simulation.events.length;
      for (let index = 0; index < steps && simulation.status !== "completed"; index += 1) {
        simulation.advanceOneSegment();
      }
      const nextCheckpoint = simulation.createCheckpoint();
      const eventsAdded = simulation.events.slice(previousEventCount);
      const status = simulation.status;
      const classification = status === "completed" ? simulation.classification : null;
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
      return json({
        result: committed,
        sessionId,
        tick: simulation.tick,
        totalTicks: checkpoint.snapshot.circuit.totalLaps * checkpoint.snapshot.circuit.segments.length,
        status,
        eventsAdded,
        classification,
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
