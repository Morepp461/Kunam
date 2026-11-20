import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { RaceSimulation } from "../../supabase/functions/race-engine-test-service/race-engine/simulation.ts";
import type { RaceSimulationCheckpoint } from "../../supabase/functions/race-engine-test-service/race-engine/simulation.ts";
import { createRaceEngineTestModels } from "../../supabase/functions/race-engine-test-service/race-engine/test-profiles.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const workerId = crypto.randomUUID();
const LEASE_SECONDS = 60;
const POLL_INTERVAL_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processSession(session: { id: string; created_by: string }) {
  const { data: claim, error: claimError } = await db.rpc("race_engine_claim_test_session", {
    p_session_id: session.id,
    p_worker_id: workerId,
    p_lease_seconds: LEASE_SECONDS
  });
  if (claimError) throw claimError;
  if (!claim) return false;

  const checkpoint = claim.checkpoint as RaceSimulationCheckpoint;
  const models = createRaceEngineTestModels(checkpoint.snapshot);
  const simulation = RaceSimulation.restore(
    checkpoint,
    models.performanceModel,
    models.tyreModel,
    models.weatherModel,
    models.pitModel,
    models.incidentModel,
    models.raceControlProfile
  );
  const previousEventCount = simulation.events.length;
  const maxTicksPerBatch = Math.max(1, Math.min(15, Number(claim.speed_multiplier ?? 1)));
  for (let index = 0; index < maxTicksPerBatch && simulation.status !== "completed"; index += 1) {
    simulation.advanceOneSegment();
  }

  const nextCheckpoint = simulation.createCheckpoint();
  const eventsAdded = simulation.events.slice(previousEventCount);
  const { data: result, error: commitError } = await db.rpc("race_engine_commit_test_step", {
    p_session_id: session.id,
    p_worker_id: workerId,
    p_expected_tick: Number(claim.tick),
    p_checkpoint: nextCheckpoint,
    p_events: eventsAdded,
    p_classification: simulation.status === "completed" ? simulation.classification : null,
    p_status: simulation.status,
    p_command_id: crypto.randomUUID(),
    p_actor_id: session.created_by
  });
  if (commitError) throw commitError;
  return Boolean(result?.ok);
}

console.info("Race Engine test worker started", { workerId, speedStepsPerBatch: "1x/5x/10x/15x session control" });

while (true) {
  try {
    const { data: sessions, error } = await db
      .from("race_engine_test_sessions")
      .select("id,created_by")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) throw error;

    for (const session of sessions ?? []) {
      try {
        await processSession(session);
      } catch (error) {
        console.error("Race Engine worker batch failed", {
          sessionId: session.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    console.error("Race Engine worker poll failed", error);
  }
  await wait(POLL_INTERVAL_MS);
}
