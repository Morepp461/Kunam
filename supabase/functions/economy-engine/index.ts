import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigin = (origin: string) =>
  origin === "http://localhost:5173" ||
  origin === "https://calerismastersnewgen-mu.vercel.app" ||
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "https://calerismastersnewgen-mu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

const eventTypes = new Set([
  "checkin_reward", "prize", "bank_reward", "sponsor_payout", "bank_funding",
  "tax", "fine", "transfer", "admin_adjustment",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createServiceClient(url: string, key: string) {
  const isSecretApiKey = key.startsWith("sb_secret_");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(isSecretApiKey ? {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          const headers = new Headers(request.headers);
          headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(new Request(request, { headers }));
        },
      },
    } : {}),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = corsHeaders(origin);
  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed." });
  if (!allowedOrigin(origin)) return respond(403, { error: "Origin not allowed." });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publishableKey = publishableKeys ? JSON.parse(publishableKeys).default : anonKey;
    const secretKey = secretKeys ? JSON.parse(secretKeys).default : null;
    const serviceKey = serviceRoleKey || secretKey;
    if (!supabaseUrl || !publishableKey || !serviceKey) {
      return respond(500, { error: "Economy Engine gateway is not configured." });
    }

    const authorization = req.headers.get("Authorization") ?? "";
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    if (!jwt) return respond(401, { error: "Authentication required." });

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer " + jwt } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return respond(401, { error: "Invalid or expired session." });

    const userId = authData.user.id;
    const serviceClient = createServiceClient(supabaseUrl, serviceKey);
    const { data: adminRecord, error: adminError } = await serviceClient
      .from("site_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (adminError) {
      console.error("Economy admin verification failed:", adminError.message);
      return respond(500, { error: "Unable to verify administrator access." });
    }
    if (!adminRecord) return respond(403, { error: "Administrator access required." });

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "post") {
      const sourceAccountId = typeof body.sourceAccountId === "string" ? body.sourceAccountId : "";
      const destinationAccountId = typeof body.destinationAccountId === "string" ? body.destinationAccountId : "";
      const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
      const eventType = typeof body.eventType === "string" ? body.eventType : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
      const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

      if (!uuidPattern.test(sourceAccountId) || !uuidPattern.test(destinationAccountId) || sourceAccountId === destinationAccountId) {
        return respond(400, { error: "Wallet source or destination is invalid." });
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999999999.99 || Number(amount.toFixed(2)) !== amount) {
        return respond(400, { error: "Transaction amount is invalid." });
      }
      if (!eventTypes.has(eventType)) return respond(400, { error: "Transaction type is invalid." });
      if (!description || description.length > 240) return respond(400, { error: "Transaction description is invalid." });
      if (idempotencyKey.length < 8 || idempotencyKey.length > 180) return respond(400, { error: "Idempotency key is invalid." });

      const { data, error } = await serviceClient.rpc("admin_post_economy_transaction", {
        p_actor_id: userId,
        p_source_account_id: sourceAccountId,
        p_destination_account_id: destinationAccountId,
        p_amount: amount,
        p_event_type: eventType,
        p_description: description,
        p_idempotency_key: idempotencyKey,
        p_metadata: metadata,
      });
      if (error) {
        console.error("Economy transaction rejected:", error.message);
        return respond(422, { error: error.message });
      }
      return respond(200, { success: true, result: data });
    }

    if (action === "reverse") {
      const transactionId = typeof body.transactionId === "string" ? body.transactionId : "";
      if (!uuidPattern.test(transactionId)) return respond(400, { error: "Transaction id is invalid." });
      const { data, error } = await serviceClient.rpc("admin_reverse_economy_transaction", {
        p_transaction_id: transactionId,
        p_actor_id: userId,
      });
      if (error) {
        console.error("Economy reversal rejected:", error.message);
        return respond(422, { error: error.message });
      }
      return respond(200, { success: true, result: data });
    }

    if (action === "process_pending") {
      const { data, error } = await serviceClient.rpc("admin_process_pending_economy_rewards", {
        p_actor_id: userId,
      });
      if (error) {
        console.error("Pending economy rewards processing failed:", error.message);
        return respond(422, { error: error.message });
      }
      return respond(200, { success: true, result: data });
    }

    if (action === "process_payroll_pending") {
      const { data, error } = await serviceClient.rpc("admin_process_pending_economy_payroll", {
        p_actor_id: userId,
      });
      if (error) {
        console.error("Pending payroll processing failed:", error.message);
        return respond(422, { error: error.message });
      }
      return respond(200, { success: true, result: data });
    }

    return respond(400, { error: "Unknown Economy Engine action." });
  } catch (error) {
    console.error("Economy Engine gateway error:", error);
    return respond(500, { error: "Unexpected Economy Engine error." });
  }
});
