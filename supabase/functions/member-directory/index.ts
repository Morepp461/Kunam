import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

type ProfileRow = {
  public_member_id: string;
  first_name: string | null;
  last_name: string | null;
  web_nickname: string | null;
  driver_nickname: string | null;
  avatar_path: string | null;
  member_id: string | null;
};

const displayName = (p: ProfileRow) =>
  p.web_nickname || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.driver_nickname || "Caleris Member";

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
    const serviceKey = secretKeys ? JSON.parse(secretKeys).default : serviceRoleKey;
    if (!supabaseUrl || !publishableKey || !serviceKey) {
      return respond(500, { error: "Member directory is not configured." });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId: string | null = null;
    if (jwt) {
      const { data } = await authClient.auth.getUser(jwt);
      userId = data.user?.id ?? null;
    }
    let isAdmin = false;
    if (userId) {
      const { data } = await admin.from("site_admins").select("user_id").eq("user_id", userId).maybeSingle();
      isAdmin = Boolean(data?.user_id);
    }

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    const withAvatar = async (p: ProfileRow) => {
      let avatarUrl: string | null = null;
      if (p.avatar_path) {
        const { data } = await admin.storage.from("profile-avatars").createSignedUrl(p.avatar_path, 900);
        avatarUrl = data?.signedUrl ?? null;
      }
      return {
        public_member_id: p.public_member_id,
        display_name: displayName(p),
        first_name: p.first_name,
        last_name: p.last_name,
        web_nickname: p.web_nickname,
        driver_nickname: p.driver_nickname,
        avatar_url: avatarUrl,
      };
    };

    if (action === "profile") {
      const memberId = typeof body.memberId === "string" ? body.memberId.trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{12,16}$/.test(memberId)) return respond(400, { error: "Member ID tidak valid." });
      const { data: p, error } = await admin.from("profiles")
        .select("public_member_id,first_name,last_name,web_nickname,driver_nickname,avatar_path,member_id")
        .eq("public_member_id", memberId).maybeSingle();
      if (error) return respond(500, { error: "Profil member gagal dimuat." });
      if (!p) return respond(404, { error: "Profil member tidak ditemukan." });
      const publicProfile = await withAvatar(p as ProfileRow);
      let character: Record<string, unknown> | null = null;
      if (p.member_id) {
        const { data: m } = await admin.from("members")
          .select("character_name,role,license,team_id").eq("id", p.member_id).maybeSingle();
        if (m) {
          let teamName: string | null = null;
          if (m.team_id) {
            const { data: team } = await admin.from("teams").select("name").eq("id", m.team_id).maybeSingle();
            teamName = team?.name ?? null;
          }
          character = { character_name: m.character_name, role: m.role, license: m.license, team_name: teamName };
        }
      }
      return respond(200, { profile: publicProfile, character });
    }

    if (action === "search") {
      const raw = typeof body.query === "string" ? body.query : "";
      const term = raw.replace(/[^\p{L}\p{N} _-]/gu, " ").trim().replace(/\s+/g, " ").slice(0, 64);
      if (term.length < 2) return respond(200, { members: [], pages: [] });
      const pattern = `%${term}%`;
      const { data: profiles, error } = await admin.from("profiles")
        .select("public_member_id,first_name,last_name,web_nickname,driver_nickname,avatar_path,member_id")
        .or([
          `public_member_id.ilike.${pattern}`,
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `web_nickname.ilike.${pattern}`,
          `driver_nickname.ilike.${pattern}`,
        ].join(","))
        .limit(10);
      if (error) return respond(500, { error: "Pencarian member gagal." });
      const members = await Promise.all((profiles ?? []).map((p) => withAvatar(p as ProfileRow)));

      let contentQuery = admin.from("site_content").select("slug,content,published");
      if (!isAdmin) contentQuery = contentQuery.eq("published", true);
      const { data: content, error: contentError } = await contentQuery.limit(40);
      if (contentError) return respond(500, { error: "Pencarian konten gagal." });
      const needle = term.toLocaleLowerCase("id-ID");
      const pages = (content ?? []).flatMap((row) => {
        const value = row.content as Record<string, unknown>;
        const title = typeof value?.title === "string" ? value.title : row.slug;
        const text = typeof value?.body === "string" ? value.body : "";
        if (!(title + " " + text).toLocaleLowerCase("id-ID").includes(needle)) return [];
        return [{ title, slug: row.slug, excerpt: text.slice(0, 150), href: row.slug === "rules" ? "/rules" : "/dashboard" }];
      }).slice(0, 6);
      return respond(200, { members, pages });
    }

    if (action === "update_member_id") {
      if (!userId || !isAdmin) return respond(403, { error: "Akses administrator diperlukan." });
      const targetMemberId = typeof body.targetMemberId === "string" ? body.targetMemberId.trim().toUpperCase() : "";
      const newMemberId = typeof body.newMemberId === "string" ? body.newMemberId.trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{12,16}$/.test(targetMemberId)) return respond(400, { error: "Member ID target tidak valid." });
      if (!/^[A-Z0-9]{12,16}$/.test(newMemberId) || !/[A-Z]/.test(newMemberId) || !/[0-9]/.test(newMemberId)) {
        return respond(400, { error: "Member ID baru harus 12–16 karakter dan berisi huruf serta angka." });
      }
      const { data, error } = await admin.rpc("admin_change_public_member_id", {
        p_target_member_id: targetMemberId,
        p_new_member_id: newMemberId,
        p_changed_by: userId,
      });
      if (error) {
        if (error.code === "23505") return respond(409, { error: "Member ID sudah digunakan member lain." });
        if (error.code === "P0002") return respond(404, { error: "Member ID target tidak ditemukan." });
        if (error.code === "42501") return respond(403, { error: "Akses administrator diperlukan." });
        if (error.code === "22023") return respond(400, { error: "Format Member ID tidak valid." });
        return respond(500, { error: "Member ID gagal diperbarui." });
      }
      return respond(200, { success: true, change: data?.[0] ?? null });
    }

    return respond(400, { error: "Action tidak dikenal." });
  } catch (error) {
    console.error("Member directory request failed:", error);
    return respond(500, { error: "Terjadi kesalahan pada member directory." });
  }
});
