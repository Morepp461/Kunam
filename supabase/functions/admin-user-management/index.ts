import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigin = (origin: string) =>
  origin === "http://localhost:5173" ||
  origin === "https://calerismastersnewgen-mu.vercel.app" ||
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "https://calerismastersnewgen-mu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

const preferredRoles = new Set(["FIA", "Team Owner", "Driver"]);
const assignedRoles = new Set(["Driver", "Principal", "Owner", "Agent", "FIA"]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = cors(origin);
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
      return respond(500, { error: "Admin user service is not configured." });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return respond(401, { error: "Authentication required." });

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return respond(401, { error: "Invalid session." });
    const actorId = authData.user.id;

    const isSecretApiKey = serviceKey.startsWith("sb_secret_");
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(isSecretApiKey ? {
        global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            const requestHeaders = new Headers(request.headers);
            requestHeaders.delete("Authorization");
            requestHeaders.set("apikey", serviceKey);
            return fetch(new Request(request, { headers: requestHeaders }));
          },
        },
      } : {}),
    });

    const { data: adminRecord, error: adminError } = await admin
      .from("site_admins").select("user_id").eq("user_id", actorId).maybeSingle();
    if (adminError || !adminRecord) return respond(403, { error: "Akses administrator diperlukan." });

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "list_users") {
      const users: Record<string, unknown>[] = [];
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 1000) break;
      }

      const readAll = async (table: string, columns: string) => {
        const rows: Record<string, unknown>[] = [];
        for (let start = 0; start < 100000; start += 1000) {
          const { data, error } = await admin.from(table).select(columns).range(start, start + 999);
          if (error) throw error;
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        return rows;
      };

      const [profiles, members, teams] = await Promise.all([
        readAll("profiles", "user_id,member_id,public_member_id,avatar_path,web_nickname,driver_nickname,first_name,last_name,date_of_birth,nationality,hometown,preferred_role,account_status,onboarding_completed,privacy_accepted_at,updated_at"),
        readAll("members", "id,member_code,character_name,role,license,team_id,balance,created_at"),
        readAll("teams", "id,name"),
      ]);
      const profileByUser = new Map(profiles.map((row) => [String(row.user_id), row]));
      const memberById = new Map(members.map((row) => [String(row.id), row]));
      const teamById = new Map(teams.map((row) => [String(row.id), row]));
      const adminIds = new Set<string>();
      for (let start = 0; start < 100000; start += 1000) {
        const { data, error } = await admin.from("site_admins").select("user_id").range(start, start + 999);
        if (error) throw error;
        for (const row of data ?? []) adminIds.add(String(row.user_id));
        if ((data ?? []).length < 1000) break;
      }

      const result = await Promise.all(users.map(async (user) => {
        const profile = profileByUser.get(user.id) ?? null;
        const member = profile?.member_id ? memberById.get(String(profile.member_id)) ?? null : null;
        const team = member?.team_id ? teamById.get(String(member.team_id)) ?? null : null;
        let avatarUrl: string | null = null;
        if (profile?.avatar_path) {
          const { data } = await admin.storage.from("profile-avatars").createSignedUrl(String(profile.avatar_path), 900);
          avatarUrl = data?.signedUrl ?? null;
        }
        return {
          user_id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          email_confirmed_at: user.email_confirmed_at ?? null,
          provider: user.app_metadata?.provider ?? null,
          providers: Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : [],
          user_metadata: {
            full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
            username: user.user_metadata?.user_name ?? user.user_metadata?.preferred_username ?? null,
          },
          is_admin: adminIds.has(user.id),
          profile: profile ? { ...profile, avatar_url: avatarUrl } : null,
          member,
          team_name: team?.name ?? null,
        };
      }));
      result.sort((a, b) => String(a.email ?? "").localeCompare(String(b.email ?? "")));
      return respond(200, { users: result, total: result.length });
    }

    if (action === "update_roles") {
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      const preferredRole = body.preferredRole === null ? null : String(body.preferredRole ?? "");
      const assignedRole = body.assignedRole === null ? null : String(body.assignedRole ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return respond(400, { error: "Target user tidak valid." });
      if (preferredRole !== null && !preferredRoles.has(preferredRole)) {
        return respond(400, { error: "Preferensi role tidak valid." });
      }
      if (assignedRole !== null && !assignedRoles.has(assignedRole)) {
        return respond(400, { error: "Role aktif tidak valid." });
      }

      const { data: profile, error: profileError } = await admin.from("profiles")
        .select("user_id,member_id,preferred_role").eq("user_id", targetUserId).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return respond(404, { error: "Profil akun belum tersedia." });

      let member: Record<string, unknown> | null = null;
      if (profile.member_id) {
        const { data, error } = await admin.from("members")
          .select("id,role,team_id,character_name").eq("id", profile.member_id).maybeSingle();
        if (error) throw error;
        member = data;
      }
      if (!member && assignedRole !== null) {
        return respond(409, { error: "Akun ini belum memiliki karakter/member. Atur preferensi role terlebih dahulu atau tautkan member melalui proses onboarding." });
      }
      if (member && member.role === "Owner" && assignedRole !== "Owner" && member.team_id) {
        return respond(409, { error: "Role Owner tidak dapat dilepas selama member masih menjadi pemilik tim. Selesaikan proses Take Over/perpindahan kepemilikan terlebih dahulu." });
      }
      if (member && assignedRole === "Owner" && !member.team_id) {
        return respond(409, { error: "Role Owner memerlukan tim yang sudah terhubung." });
      }

      const { error: updateProfileError } = await admin.from("profiles")
        .update({ preferred_role: preferredRole, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);
      if (updateProfileError) throw updateProfileError;

      if (member) {
        const { error: updateMemberError } = await admin.from("members")
          .update({ role: assignedRole }).eq("id", member.id);
        if (updateMemberError) {
          await admin.from("profiles").update({ preferred_role: profile.preferred_role }).eq("user_id", targetUserId);
          throw updateMemberError;
        }
      }
      return respond(200, {
        ok: true,
        targetUserId,
        preferredRole,
        assignedRole: member ? assignedRole : null,
      });
    }

    return respond(400, { error: "Unknown action." });
  } catch (error) {
    console.error("admin-user-management error:", error);
    return respond(500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
});
