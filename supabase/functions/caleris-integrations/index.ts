import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const ALLOWED_SCOPES = ["circuits:read", "seasons:read", "teams:read", "drivers:read", "rounds:read"] as const;
type Scope = typeof ALLOWED_SCOPES[number];

const tools = [
  { name: "list_circuits", description: "List official Caleris Masters circuit records.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "list_seasons", description: "List official Caleris Masters seasons.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "list_teams", description: "List registered Caleris Masters teams.", inputSchema: { type: "object", properties: { division: { type: "string", enum: ["premio", "zwei"] }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "list_drivers", description: "List registered Caleris Masters drivers using public competition fields only.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "list_rounds", description: "List scheduled and processed competition rounds.", inputSchema: { type: "object", properties: { season_division_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
] as const;

const allowedOrigin = (origin: string) =>
  !origin || origin === "https://calerismastersnewgen-mu.vercel.app";

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretSet = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacySecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let secret = legacySecret;
  if (secretSet) {
    try { secret = JSON.parse(secretSet).default || secret; } catch { /* use legacy secret when present */ }
  }
  if (!url || !secret) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticate(req: Request, requiredScope?: Scope) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^cm_live_[A-Za-z0-9_-]{40,}$/.test(token)) return { error: "API key missing or invalid.", status: 401 } as const;
  const db = serviceClient();
  const hash = await sha256(token);
  const { data: owner, error: ownerError } = await db.from("caleris_developer_api_owner").select("owner_user_id").eq("singleton", true).maybeSingle();
  if (ownerError || !owner?.owner_user_id) return { error: "Developer API owner is not configured.", status: 503 } as const;
  const { data: key, error } = await db.from("caleris_api_keys")
    .select("id,owner_user_id,scopes,expires_at,revoked_at")
    .eq("key_hash", hash).maybeSingle();
  if (error || !key || key.owner_user_id !== owner.owner_user_id || key.revoked_at ||
      (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())) {
    return { error: "API key is invalid, expired, or revoked.", status: 401 } as const;
  }
  if (requiredScope && !(key.scopes as string[]).includes(requiredScope)) {
    return { error: "This API key does not have the required scope.", status: 403 } as const;
  }
  await db.from("caleris_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { db, key } as const;
}

function boundedLimit(value: unknown) {
  const n = Number(value ?? 50);
  return Number.isInteger(n) ? Math.min(100, Math.max(1, n)) : 50;
}

async function readTool(db: ReturnType<typeof serviceClient>, name: string, args: Record<string, unknown>) {
  const limit = boundedLimit(args.limit);
  if (name === "list_circuits") {
    const { data, error } = await db.from("caleris_circuits")
      .select("id,name,country_code,total_laps,avg_track_temp_c,drs_zones,straights,low_speed_corners,high_speed_corners,grip_level,initial_lap_record_ms")
      .order("name").limit(limit);
    if (error) throw error;
    return data;
  }
  if (name === "list_seasons") {
    const { data, error } = await db.from("license_seasons")
      .select("id,season_key,title,starts_on,ends_on,status")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }
  if (name === "list_teams") {
    let query = db.from("teams").select("id,name,division_key,created_at").order("name").limit(limit);
    if (args.division === "premio" || args.division === "zwei") query = query.eq("division_key", args.division);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  if (name === "list_drivers") {
    const { data, error } = await db.from("members")
      .select("id,member_code,character_name,license,team_id,created_at")
      .eq("role", "Driver").order("character_name").limit(limit);
    if (error) throw error;
    return data;
  }
  if (name === "list_rounds") {
    let query = db.from("license_rounds")
      .select("id,season_division_id,round_number,title,status,processed_at,circuit_name,circuit_country_code,session_type,checkin_opens_at,checkin_closes_at")
      .order("round_number").limit(limit);
    if (typeof args.season_division_id === "string" && /^[0-9a-f-]{36}$/i.test(args.season_division_id)) {
      query = query.eq("season_division_id", args.season_division_id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  throw new Error("Unknown tool.");
}

async function rest(req: Request, db: ReturnType<typeof serviceClient>, scopeMap: Record<string, Scope>, path: string) {
  const resource = path.replace(/^\/v1\/?/, "").replace(/\/$/, "");
  const scope = scopeMap[resource];
  if (!scope) return json({ error: "Endpoint not found." }, 404);
  const auth = await authenticate(req, scope);
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const url = new URL(req.url);
  const args: Record<string, unknown> = { limit: url.searchParams.get("limit") };
  if (resource === "teams") args.division = url.searchParams.get("division");
  if (resource === "rounds") args.season_division_id = url.searchParams.get("season_division_id");
  const toolName = ({ circuits: "list_circuits", seasons: "list_seasons", teams: "list_teams", drivers: "list_drivers", rounds: "list_rounds" } as Record<string, string>)[resource];
  try {
    return json({ data: await readTool(auth.db, toolName, args) });
  } catch (error) {
    console.error("Caleris API read failed:", error);
    return json({ error: "Unable to read the requested Caleris resource." }, 500);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (!allowedOrigin(origin)) return json({ error: "Origin is not allowed." }, 403);
  const url = new URL(req.url);
  const path = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed." }, 405);

  if (path.endsWith("/mcp")) {
    if (req.method !== "POST") return json({ error: "MCP endpoint accepts POST only." }, 405);
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, auth.status);
    let message: Record<string, unknown>;
    try { message = await req.json(); } catch { return json({ error: "Invalid JSON-RPC request." }, 400); }
    const id = message.id ?? null;
    const method = message.method;
    if (typeof method !== "string" || message.jsonrpc !== "2.0") {
      return json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } }, 400);
    }
    if (method === "notifications/initialized" || method.startsWith("notifications/")) return new Response(null, { status: 202 });
    if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });
    if (method === "initialize") {
      return json({ jsonrpc: "2.0", id, result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "caleris-masters", version: "1.0.0" },
        instructions: "Read-only Caleris Masters integration. Tools expose curated competition data only."
      } });
    }
    if (method === "tools/list") {
      const scoped = tools.filter((tool) => {
        const scope = ({ list_circuits: "circuits:read", list_seasons: "seasons:read", list_teams: "teams:read", list_drivers: "drivers:read", list_rounds: "rounds:read" } as Record<string, string>)[tool.name];
        return (auth.key.scopes as string[]).includes(scope);
      });
      return json({ jsonrpc: "2.0", id, result: { tools: scoped } });
    }
    if (method === "tools/call") {
      const params = (message.params || {}) as Record<string, unknown>;
      const name = typeof params.name === "string" ? params.name : "";
      const definition = tools.find((tool) => tool.name === name);
      if (!definition) return json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool." } });
      const scope = ({ list_circuits: "circuits:read", list_seasons: "seasons:read", list_teams: "teams:read", list_drivers: "drivers:read", list_rounds: "rounds:read" } as Record<string, Scope>)[name];
      if (!(auth.key.scopes as string[]).includes(scope)) return json({ jsonrpc: "2.0", id, error: { code: -32003, message: "API key scope does not permit this tool." } });
      try {
        const result = await readTool(auth.db, name, (params.arguments || {}) as Record<string, unknown>);
        return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: { data: result }, isError: false } });
      } catch (error) {
        console.error("Caleris MCP tool failed:", error);
        return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Unable to read the requested Caleris resource." }], isError: true } });
      }
    }
    return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found." } });
  }

  if (path.includes("/v1/")) {
    if (req.method !== "GET") return json({ error: "REST API accepts GET only." }, 405);
    const resource = path.slice(path.indexOf("/v1/"));
    const scopeMap: Record<string, Scope> = {
      "/v1/circuits": "circuits:read",
      "/v1/seasons": "seasons:read",
      "/v1/teams": "teams:read",
      "/v1/drivers": "drivers:read",
      "/v1/rounds": "rounds:read",
    };
    return await rest(req, serviceClient(), scopeMap, resource);
  }
  return json({ error: "Endpoint not found." }, 404);
});
