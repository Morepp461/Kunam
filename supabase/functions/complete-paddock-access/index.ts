import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const requestOrigin = (req: Request) => req.headers.get("Origin") ?? "";
const isAllowedOrigin = (origin: string) => origin === "http://localhost:5173" || origin === "https://calerismastersnewgen-mu.vercel.app" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
const corsHeadersFor = (origin: string) => ({
  "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://calerismastersnewgen-mu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

function ageOnToday(dateOfBirth: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== dateOfBirth) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(requestOrigin(req));
  const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
  if (!isAllowedOrigin(requestOrigin(req))) return respond(403, { error: "Origin not allowed." });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!supabaseUrl || !turnstileSecret) {
      return respond(500, { error: "Paddock Access verification is not configured." });
    }

    const bearer = req.headers.get("Authorization") ?? "";
    const jwt = bearer.replace(/^Bearer\s+/i, "");
    if (!jwt) return respond(401, { error: "Authentication required." });

    const publishableKey = publishableKeys ? JSON.parse(publishableKeys).default : anonKey;
    const adminKey = secretKeys ? JSON.parse(secretKeys).default : serviceRoleKey;
    if (!publishableKey || !adminKey) return respond(500, { error: "Supabase function keys are unavailable." });

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return respond(401, { error: "Invalid or expired session." });
    const user = authData.user;

    const body = await req.json();
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    const preferredRole = typeof body.preferredRole === "string" ? body.preferredRole : "";
    const privacyAccepted = body.privacyAccepted === true;

    if (!token || token.length > 2048) return respond(400, { error: "Complete Cloudflare verification first." });
    if (!avatarUrl || !nickname || nickname.length > 32 || !dateOfBirth) {
      return respond(400, { error: "Complete all required Paddock Access fields." });
    }
    if (firstName.length > 80 || lastName.length > 80) return respond(400, { error: "Name is too long." });
    if (!["FIA", "Team Owner", "Driver"].includes(preferredRole)) {
      return respond(400, { error: "Choose a valid role preference." });
    }
    if (!privacyAccepted) return respond(400, { error: "Privacy consent is required." });
    const age = ageOnToday(dateOfBirth);
    if (age === null) return respond(400, { error: "Enter a valid date of birth." });
    if (age < 13) return respond(403, { error: "Paddock Access is unavailable for users under 13." });

    const avatar = new URL(avatarUrl);
    const expectedAvatarPrefix = `/storage/v1/object/public/profile-avatars/${user.id}/`;
    if (avatar.origin !== new URL(supabaseUrl).origin || !avatar.pathname.startsWith(expectedAvatarPrefix)) {
      return respond(400, { error: "Profile photo URL is not valid for this account." });
    }

    const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: turnstileSecret, response: token }),
    });
    if (!verifyResponse.ok) return respond(502, { error: "Cloudflare verification service is unavailable." });
    const verification = await verifyResponse.json();
    if (verification.success !== true || (verification.action && verification.action !== "paddock_access")) {
      return respond(403, { error: "Cloudflare verification failed. Please try again." });
    }
    const allowedHostnames = (Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") ?? "calerismastersnewgen-mu.vercel.app,localhost").split(",").map((host) => host.trim()).filter(Boolean);
    if (verification.hostname && !allowedHostnames.includes(verification.hostname)) {
      return respond(403, { error: "Cloudflare verification hostname is not allowed." });
    }

    const adminClient = createClient(supabaseUrl, adminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: saveError } = await adminClient.from("profiles").upsert({
      user_id: user.id,
      avatar_url: avatarUrl,
      first_name: firstName || null,
      last_name: lastName || null,
      date_of_birth: dateOfBirth,
      web_nickname: nickname,
      preferred_role: preferredRole,
      privacy_accepted_at: new Date().toISOString(),
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (saveError) {
      console.error("Paddock Access profile save failed:", saveError.message);
      return respond(500, { error: "Unable to save Paddock Access profile." });
    }

    return respond(200, { success: true });
  } catch (error) {
    console.error("Paddock Access request failed:", error);
    return respond(500, { error: "Unexpected Paddock Access error." });
  }
});
