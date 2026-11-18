import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigins = new Set([
  "https://calerismastersnewgen-mu.vercel.app",
  "http://localhost:5173",
]);
const headers = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://calerismastersnewgen-mu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
});
const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretSet = Deno.env.get("SUPABASE_SECRET_KEYS");
  let secret = legacy;
  if (secretSet) {
    try { secret = JSON.parse(secretSet).default || secret; } catch { /* use legacy key */ }
  }
  if (!url || !secret) throw new Error("Server-side Supabase credentials are not configured.");
  const isSecret = secret.startsWith("sb_secret_");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(isSecret ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const requestHeaders = new Headers(request.headers);
      requestHeaders.delete("Authorization");
      requestHeaders.set("apikey", secret);
      return fetch(new Request(request, { headers: requestHeaders }));
    } } } : {}),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed." }, 403, origin);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!url || !anon || !token) return json({ error: "Authenticated session required." }, 401, origin);
    const anonKey = anon.startsWith("{") ? JSON.parse(anon).default : anon;
    const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Session invalid." }, 401, origin);

    const db = serviceClient();
    const [{ data: admin }, { data: memberProfile }] = await Promise.all([
      db.from("site_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
      db.from("profiles").select("member_id").eq("user_id", auth.user.id).maybeSingle(),
    ]);
    let isFia = false;
    if (memberProfile?.member_id) {
      const { data: member } = await db.from("members").select("role").eq("id", memberProfile.member_id).maybeSingle();
      isFia = member?.role === "FIA";
    }
    if (!admin?.user_id && !isFia) return json({ error: "FIA/Admin access required." }, 403, origin);

    const webhook = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhook) return json({ error: "Discord integration is not configured yet. Add DISCORD_WEBHOOK_URL to Supabase Function secrets." }, 503, origin);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid JSON body." }, 400, origin);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 3500) : "";
    const urlValue = typeof body.url === "string" ? body.url.trim() : "";
    const event = typeof body.event === "string" ? body.event.trim().slice(0, 48) : "caleris_update";
    if (!title || !description) return json({ error: "Title and description are required." }, 400, origin);
    let safeUrl: string | undefined;
    if (urlValue) {
      try {
        const parsed = new URL(urlValue);
        if (parsed.protocol !== "https:" || parsed.hostname !== "calerismastersnewgen-mu.vercel.app") {
          return json({ error: "Only the official Caleris HTTPS URL is allowed." }, 400, origin);
        }
        safeUrl = parsed.toString();
      } catch { return json({ error: "Invalid URL." }, 400, origin); }
    }
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title,
          description,
          url: safeUrl,
          color: 0x9B242B,
          footer: { text: "VREEO PEDIA · CALERIS MASTERS NEWSROOM" },
          timestamp: new Date().toISOString(),
          fields: [{ name: "Event", value: event, inline: true }],
        }],
      }),
    });
    if (!response.ok) {
      console.error("Discord webhook returned status", response.status);
      return json({ error: "Discord rejected the notification. Check webhook configuration." }, 502, origin);
    }
    return json({ success: true }, 200, origin);
  } catch (error) {
    console.error("Discord notification failed:", error);
    return json({ error: "Unable to send Discord notification." }, 500, origin);
  }
});
