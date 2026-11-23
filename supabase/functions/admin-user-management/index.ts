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

      const [profiles, members, teams, moderationResult] = await Promise.all([
        readAll("profiles", "user_id,member_id,public_member_id,avatar_path,web_nickname,driver_nickname,first_name,last_name,date_of_birth,nationality,hometown,preferred_role,account_status,onboarding_completed,privacy_accepted_at,updated_at"),
        readAll("members", "id,member_code,character_name,role,license,team_id,created_at"),
        readAll("teams", "id,name"),
        admin.from("caleris_user_moderation_actions").select("id,target_user_id,action_type,reason,duration_days,expires_at,created_at,created_by").order("created_at",{ascending:false}).limit(1000),
      ]);
      if (moderationResult.error) throw moderationResult.error;
      const moderationByUser = new Map<string, Record<string, unknown>[]>();
      for (const action of moderationResult.data ?? []) {
        const key = String(action.target_user_id);
        const rows = moderationByUser.get(key) ?? [];
        if (rows.length < 10) rows.push(action as Record<string, unknown>);
        moderationByUser.set(key, rows);
      }
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
          moderation: moderationByUser.get(user.id) ?? [],
        };
      }));
      result.sort((a, b) => String(a.email ?? "").localeCompare(String(b.email ?? "")));
      return respond(200, { users: result, total: result.length, teams });
    }

    if (action === "update_roles") {
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      const preferredRole = body.preferredRole === null ? null : String(body.preferredRole ?? "");
      const assignedRole = body.assignedRole === null ? null : String(body.assignedRole ?? "");
      const characterName = typeof body.characterName === "string" ? body.characterName.trim() : null;
      if (characterName && characterName.length > 80) return respond(400, { error: "Nama karakter maksimal 80 karakter." });
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return respond(400, { error: "Target user tidak valid." });
      if (preferredRole !== null && !preferredRoles.has(preferredRole)) {
        return respond(400, { error: "Preferensi role tidak valid." });
      }
      if (assignedRole !== null && !assignedRoles.has(assignedRole)) {
        return respond(400, { error: "Role aktif tidak valid." });
      }

      const { data: result, error: updateError } = await authClient.rpc("admin_update_user_roles", {
        p_target_user_id: targetUserId,
        p_preferred_role: preferredRole,
        p_assigned_role: assignedRole,
        p_character_name: characterName,
      });
      if (updateError) {
        return respond(409, { error: updateError.message });
      }
      return respond(200, result ?? { ok: true, targetUserId, preferredRole, assignedRole });
    }

    if (action === "assign_team") {
      const targetMemberId = typeof body.targetMemberId === "string" ? body.targetMemberId : "";
      const teamId = body.teamId === null || body.teamId === "" ? null : String(body.teamId);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(targetMemberId)) return respond(400, { error: "Member tujuan tidak valid." });
      if (teamId !== null && !/^[0-9a-f-]{36}$/i.test(teamId)) return respond(400, { error: "Tim tujuan tidak valid." });
      if (reason.length < 3 || reason.length > 2000) return respond(400, { error: "Alasan wajib diisi (3–2000 karakter)." });
      const { data, error } = await authClient.rpc("admin_assign_member_team", { p_member_id: targetMemberId, p_team_id: teamId, p_reason: reason });
      if (error) return respond(409, { error: error.message });
      return respond(200, data ?? { ok: true });
    }

    if (action === "warn_user") {
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId) || targetUserId === actorId) return respond(400, { error: "Target akun tidak valid." });
      if (reason.length < 3 || reason.length > 2000) return respond(400, { error: "Alasan peringatan wajib diisi (3–2000 karakter)." });
      const { data: targetAdmin, error: targetAdminError } = await admin.from("site_admins").select("user_id").eq("user_id",targetUserId).maybeSingle();
      if (targetAdminError) throw targetAdminError;
      if (targetAdmin) return respond(403, { error: "Akun administrator tidak dapat dimoderasi melalui Manage User." });
      const { data: targetProfile, error: targetProfileError } = await admin.from("profiles").select("member_id").eq("user_id",targetUserId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      const { error } = await admin.from("caleris_user_moderation_actions").insert({
        target_user_id:targetUserId,target_member_id:targetProfile?.member_id??null,
        action_type:"warning",reason,created_by:actorId
      });
      if (error) throw error;
      return respond(200,{ok:true});
    }

    if (action === "ban_user") {
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      const banType = body.banType === "permanent" ? "permanent" : "temporary";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const durationDays = Number(body.durationDays);
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId) || targetUserId === actorId) return respond(400, { error: "Target akun tidak valid." });
      if (reason.length < 3 || reason.length > 2000) return respond(400, { error: "Alasan ban wajib diisi (3–2000 karakter)." });
      if (banType === "temporary" && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) return respond(400, { error: "Durasi ban sementara harus 1–365 hari." });
      const { data: targetAdmin, error: targetAdminError } = await admin.from("site_admins").select("user_id").eq("user_id",targetUserId).maybeSingle();
      if (targetAdminError) throw targetAdminError;
      if (targetAdmin) return respond(403, { error: "Akun administrator tidak dapat diblokir melalui Manage User." });
      const { data: targetProfile, error: targetProfileError } = await admin.from("profiles").select("member_id,account_status").eq("user_id",targetUserId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      const { data: existingBan, error: existingBanError } = await admin.from("caleris_user_moderation_actions").select("id").eq("target_user_id",targetUserId).in("action_type",["temporary_ban","permanent_ban"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (existingBanError) throw existingBanError;
      const { data: latestAction, error: latestError } = await admin.from("caleris_user_moderation_actions").select("action_type").eq("target_user_id",targetUserId).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (latestError) throw latestError;
      if (latestAction && ["temporary_ban","permanent_ban"].includes(String(latestAction.action_type)) && existingBan) return respond(409,{error:"Akun sudah memiliki sanksi ban aktif. Cabut ban sebelumnya sebelum membuat ban baru."});
      const expiresAt = banType === "temporary" ? new Date(Date.now()+durationDays*86400000).toISOString() : null;
      const banDuration = banType === "temporary" ? `${durationDays}d` : "876000h";
      const { error: authBanError } = await admin.auth.admin.updateUserById(targetUserId,{ban_duration:banDuration});
      if (authBanError) throw authBanError;
      if (targetProfile) {
        const { error: profileError } = await admin.from("profiles").update({account_status:"suspended",updated_at:new Date().toISOString()}).eq("user_id",targetUserId);
        if (profileError) {
          await admin.auth.admin.updateUserById(targetUserId,{ban_duration:"none"});
          throw profileError;
        }
      }
      const { error: logError } = await admin.from("caleris_user_moderation_actions").insert({
        target_user_id:targetUserId,target_member_id:targetProfile?.member_id??null,
        action_type:banType==="temporary"?"temporary_ban":"permanent_ban",reason,
        duration_days:banType==="temporary"?durationDays:null,expires_at:expiresAt,
        previous_account_status:targetProfile?.account_status??null,created_by:actorId
      });
      if (logError) {
        await admin.auth.admin.updateUserById(targetUserId,{ban_duration:"none"});
        if (targetProfile) await admin.from("profiles").update({account_status:targetProfile.account_status}).eq("user_id",targetUserId);
        throw logError;
      }
      return respond(200,{ok:true,banType,expiresAt});
    }

    if (action === "unban_user") {
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "Ban dicabut oleh administrator.";
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId) || targetUserId === actorId) return respond(400, { error: "Target akun tidak valid." });
      const { data: targetAdmin, error: targetAdminError } = await admin.from("site_admins").select("user_id").eq("user_id",targetUserId).maybeSingle();
      if (targetAdminError) throw targetAdminError;
      if (targetAdmin) return respond(403, { error: "Akun administrator tidak dapat dimoderasi melalui Manage User." });
      const { data: latestBan, error: banError } = await admin.from("caleris_user_moderation_actions").select("previous_account_status,action_type,created_at").eq("target_user_id",targetUserId).in("action_type",["temporary_ban","permanent_ban"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (banError) throw banError;
      const { data: latestAction, error: latestError } = await admin.from("caleris_user_moderation_actions").select("action_type").eq("target_user_id",targetUserId).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (latestError) throw latestError;
      if (!latestBan || !latestAction || !["temporary_ban","permanent_ban"].includes(String(latestAction.action_type))) return respond(409,{error:"Tidak ada ban aktif yang dapat dicabut."});
      const { error: authUnbanError } = await admin.auth.admin.updateUserById(targetUserId,{ban_duration:"none"});
      if (authUnbanError) throw authUnbanError;
      const restoredStatus = ["public","active","admin"].includes(String(latestBan.previous_account_status)) ? latestBan.previous_account_status : "active";
      const { error: profileError } = await admin.from("profiles").update({account_status:restoredStatus,updated_at:new Date().toISOString()}).eq("user_id",targetUserId);
      if (profileError) throw profileError;
      const { data: targetProfile } = await admin.from("profiles").select("member_id").eq("user_id",targetUserId).maybeSingle();
      const { error: logError } = await admin.from("caleris_user_moderation_actions").insert({
        target_user_id:targetUserId,target_member_id:targetProfile?.member_id??null,
        action_type:"unban",reason:reason.slice(0,2000),created_by:actorId
      });
      if (logError) throw logError;
      return respond(200,{ok:true,restoredStatus});
    }

    return respond(400, { error: "Unknown action." });
  } catch (error) {
    console.error("admin-user-management error:", error);
    return respond(500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
});
