import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://calerismasters.com",
  "https://www.calerismasters.com",
  "https://calerismastersnewgen-mu.vercel.app",
]);
const allowedOrigin = (origin: string) =>
  allowedOrigins.has(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "https://calerismastersnewgen-mu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After",
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

const resolveClientIp = (req: Request): string | null => {
  const isIpLiteral = (value: string) => value.length <= 64 && /^[0-9a-f:.]+$/i.test(value);
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp && isIpLiteral(cloudflareIp)) return cloudflareIp;

  // Supabase edge proxy appends the connecting address to X-Forwarded-For.
  // Use the last entry, not the client-controlled first entry.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const candidates = forwarded.split(",").map((value) => value.trim()).filter(isIpLiteral);
    if (candidates.length) return candidates[candidates.length - 1];
  }
  return null;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = cors(origin);
  const respond = (status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, ...extraHeaders } });

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
    // Prefer the legacy service-role JWT when available. A new sb_secret key is
    // not a JWT and must only be sent as the apikey header, never as Bearer.
    const secretKey = secretKeys ? JSON.parse(secretKeys).default : null;
    const serviceKey = serviceRoleKey || secretKey;
    if (!supabaseUrl || !publishableKey || !serviceKey) {
      return respond(500, { error: "Member directory is not configured." });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
    });
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
    const clientIp = resolveClientIp(req);
    const hmacBucketKey = async (value: string) => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(serviceKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
      return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
    };
    const consumeRateLimit = async (bucketKey: string, limit: number, windowSeconds: number) => {
      const { data, error } = await admin.rpc("consume_member_directory_rate_limit", {
        p_bucket_key: bucketKey,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) {
        // Fail open to preserve public directory availability if the limiter
        // is temporarily unavailable; emit an operational signal for follow-up.
        console.error("Member directory rate limiter unavailable:", error.message);
        return { allowed: true, retryAfterSeconds: 0 };
      }
      const result = Array.isArray(data) ? data[0] : data;
      return {
        allowed: result?.allowed === true,
        retryAfterSeconds: Math.max(1, Number(result?.retry_after_seconds ?? 1)),
      };
    };
    const enforceIpLimit = async (actionName: string, limit: number, windowSeconds: number) => {
      if (!clientIp) {
        console.warn("Member directory request has no trusted client IP header; IP rate limit skipped.");
        return null;
      }
      const ipHash = await hmacBucketKey(`ip:${clientIp}`);
      const result = await consumeRateLimit(`member-directory:${actionName}:ip:${ipHash}`, limit, windowSeconds);
      if (result.allowed) return null;
      return respond(429, { error: "Terlalu banyak permintaan. Coba lagi sebentar." }, {
        "Retry-After": String(result.retryAfterSeconds),
      });
    };

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
    if (action === "profile") {
      const limited = await enforceIpLimit("profile", 60, 60);
      if (limited) return limited;
    } else if (action === "team_profile") {
      const limited = await enforceIpLimit("team_profile", 60, 60);
      if (limited) return limited;
    } else if (action === "search") {
      const limited = await enforceIpLimit("search", 120, 60);
      if (limited) return limited;
    } else if (action === "update_member_id") {
      // Keep the existing authorization boundary ahead of the admin quota.
      if (!userId || !isAdmin) return respond(403, { error: "Akses administrator diperlukan." });
      const ipLimited = await enforceIpLimit("update_member_id", 30, 300);
      if (ipLimited) return ipLimited;
      const adminHash = await hmacBucketKey(`admin:${userId}`);
      const adminLimit = await consumeRateLimit(`member-directory:update_member_id:admin:${adminHash}`, 10, 300);
      if (!adminLimit.allowed) {
        return respond(429, { error: "Batas perubahan Member ID administrator tercapai. Coba lagi nanti." }, {
          "Retry-After": String(adminLimit.retryAfterSeconds),
        });
      }
    }


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
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      const isInternalMemberUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId);
      const isPublicMemberId = /^[A-Z0-9]{12,16}$/.test(memberId.toUpperCase());
      if (!isInternalMemberUuid && !isPublicMemberId) return respond(400, { error: "Member ID tidak valid." });
      let profileQuery = admin.from("profiles")
        .select("public_member_id,first_name,last_name,web_nickname,driver_nickname,avatar_path,member_id")
        .in("account_status", ["public", "active", "admin"]);
      const { data: p, error } = isInternalMemberUuid
        ? await profileQuery.eq("member_id", memberId).maybeSingle()
        : await profileQuery.eq("public_member_id", memberId.toUpperCase()).maybeSingle();
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
          let marketValueEur: number | null = null;
          if (m.role === "Driver") {
            const { data: marketValueRow, error: marketValueError } = await admin
              .from("caleris_driver_market_values").select("market_value_eur").eq("member_id", p.member_id).maybeSingle();
            if (marketValueError) {
              console.error("Public driver market value lookup failed:", marketValueError.message);
              return respond(500, { error: "Market Value Driver gagal dimuat." });
            }
            marketValueEur = marketValueRow?.market_value_eur == null ? null : Number(marketValueRow.market_value_eur);
          }
          character = { character_name: m.character_name, role: m.role, license: m.license, team_name: teamName, team_id: m.team_id, market_value_eur: marketValueEur };
        }
      }
      return respond(200, { profile: publicProfile, character });
    }

    if (action === "team_profile") {
      const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId)) {
        return respond(400, { error: "Team ID tidak valid." });
      }
      const { data: team, error: teamError } = await admin.from("teams")
        .select("id,name,division_key").eq("id", teamId).maybeSingle();
      if (teamError) return respond(500, { error: "Profil tim gagal dimuat." });
      if (!team) return respond(404, { error: "Tim tidak ditemukan." });
      const { data: roster, error: rosterError } = await admin.from("members")
        .select("id,character_name,role,license,team_id")
        .eq("team_id", teamId).in("role", ["Owner","Principal","Driver"])
        .order("role").order("character_name");
      if (rosterError) return respond(500, { error: "Roster tim gagal dimuat." });
      const memberIds = (roster || []).map((member) => member.id);
      const { data: profiles, error: profilesError } = memberIds.length
        ? await admin.from("profiles").select("public_member_id,first_name,last_name,web_nickname,driver_nickname,avatar_path,member_id")
            .in("member_id", memberIds).in("account_status", ["public","active","admin"])
        : { data: [], error: null };
      if (profilesError) return respond(500, { error: "Identitas publik roster gagal dimuat." });
      const profileByMember = new Map((profiles || []).map((profile) => [profile.member_id, profile]));
      const publicRoster = await Promise.all((roster || []).map(async (member) => {
        const profile = profileByMember.get(member.id);
        const publicProfile = profile ? await withAvatar(profile as ProfileRow) : null;
        return {
          member_id: member.id, character_name: member.character_name, role: member.role,
          license: member.license, public_member_id: publicProfile?.public_member_id ?? null,
          display_name: publicProfile?.display_name ?? member.character_name ?? "Member",
          avatar_url: publicProfile?.avatar_url ?? null
        };
      }));
      const [{ data: liveryRow, error: liveryError }, { data: activeContracts, error: sponsorContractsError }] = await Promise.all([
        admin.from("caleris_team_liveries").select("livery_data").eq("team_id", teamId).maybeSingle(),
        admin.from("caleris_sponsorship_contracts").select("sponsor_id")
          .eq("target_team_id", teamId).eq("target_kind", "team").eq("status", "active"),
      ]);
      if (liveryError || sponsorContractsError) {
        console.error("Public team identity lookup failed:", {
          livery: liveryError?.message,
          sponsors: sponsorContractsError?.message,
        });
        return respond(500, { error: "Identitas visual tim gagal dimuat." });
      }
      const sponsorIds = [...new Set((activeContracts ?? []).map((row) => row.sponsor_id).filter(Boolean))];
      const { data: sponsors, error: sponsorsError } = sponsorIds.length
        ? await admin.from("caleris_sponsors").select("id,name,logo_url,tier_key")
            .in("id", sponsorIds).eq("is_active", true).order("name")
        : { data: [], error: null };
      if (sponsorsError) {
        console.error("Public team sponsor lookup failed:", sponsorsError.message);
        return respond(500, { error: "Sponsor tim gagal dimuat." });
      }
      return respond(200, {
        team,
        roster: publicRoster,
        livery: liveryRow?.livery_data ?? null,
        sponsors: sponsors ?? [],
      });
    }

    if (action === "search") {
      const raw = typeof body.query === "string" ? body.query : "";
      const term = raw.replace(/[^\p{L}\p{N} _-]/gu, " ").trim().replace(/\s+/g, " ").slice(0, 64);
      if (term.length < 1) return respond(200, { members: [], teams: [], pages: [] });
      const pattern = `%${term}%`;

      const [profileMatches, memberMatches, teamMatches] = await Promise.all([
        admin.from("profiles")
          .select("public_member_id,first_name,last_name,web_nickname,driver_nickname,avatar_path,member_id")
          .in("account_status", ["public", "active", "admin"])
          .or([
            `public_member_id.ilike.${pattern}`,
            `first_name.ilike.${pattern}`,
            `last_name.ilike.${pattern}`,
            `web_nickname.ilike.${pattern}`,
            `driver_nickname.ilike.${pattern}`,
          ].join(","))
          .limit(20),
        admin.from("members")
          .select("id,team_id,character_name,member_code,role")
          .or([`character_name.ilike.${pattern}`, `member_code.ilike.${pattern}`, `role.ilike.${pattern}`].join(","))
          .limit(50),
        admin.from("teams").select("id,name").ilike("name", pattern).limit(20),
      ]);
      if (profileMatches.error || memberMatches.error || teamMatches.error) {
        console.error("Member directory search query failed:", {
          profiles: profileMatches.error?.message,
          members: memberMatches.error?.message,
          teams: teamMatches.error?.message,
        });
        return respond(500, { error: "Pencarian member dan tim gagal dimuat." });
      }

      const matchingTeams = (teamMatches.data ?? []) as { id: string; name: string }[];
      const matchingTeamIds = matchingTeams.map((team) => team.id);
      const teamRoster = matchingTeamIds.length
        ? await admin.from("members").select("id,team_id").in("team_id", matchingTeamIds).limit(100)
        : { data: [], error: null };
      if (teamRoster.error) {
        console.error("Team roster search failed:", teamRoster.error.message);
        return respond(500, { error: "Daftar anggota tim gagal dimuat." });
      }

      const matchedMemberIds = new Set<string>([
        ...(memberMatches.data ?? []).map((row) => row.id),
        ...((teamRoster.data ?? []).map((row) => row.id)),
      ]);
      const linkedMemberIds = (profileMatches.data ?? []).map((row) => row.member_id).filter(Boolean) as string[];
      const searchMemberIds = [...matchedMemberIds].filter((id) => !linkedMemberIds.includes(id));
      let linkedProfiles: ProfileRow[] = [];
      if (searchMemberIds.length) {
        const { data: matches, error: linkedError } = await admin.from("profiles")
          .select("public_member_id,first_name,last_name,web_nickname,driver_nickname,avatar_path,member_id")
          .in("account_status", ["public", "active", "admin"])
          .in("member_id", searchMemberIds);
        if (linkedError) {
          console.error("Linked member profile search failed:", linkedError.message);
          return respond(500, { error: "Profil anggota tim gagal dimuat." });
        }
        linkedProfiles = (matches ?? []) as ProfileRow[];
      }

      const mergedProfiles = [...(profileMatches.data ?? []), ...linkedProfiles]
        .filter((row, index, rows) => rows.findIndex((item) => item.public_member_id === row.public_member_id) === index)
        .slice(0, 20);
      const linkedIds = mergedProfiles.map((row) => row.member_id).filter(Boolean) as string[];
      const { data: memberDetails, error: memberDetailsError } = linkedIds.length
        ? await admin.from("members").select("id,role,character_name").in("id", linkedIds)
        : { data: [], error: null };
      if (memberDetailsError) {
        console.error("Member role lookup failed:", memberDetailsError.message);
        return respond(500, { error: "Informasi driver gagal dimuat." });
      }
      const memberDetailMap = new Map((memberDetails ?? []).map((row) => [row.id, row]));
      const members = await Promise.all(mergedProfiles.map(async (p) => {
        const profile = await withAvatar(p as ProfileRow);
        const detail = p.member_id ? memberDetailMap.get(p.member_id) : null;
        return { ...profile, role: detail?.role ?? null, character_name: detail?.character_name ?? null };
      }));
      const teams = matchingTeams.map((team) => ({
        id: team.id,
        name: team.name,
        member_count: (teamRoster.data ?? []).filter((member) => member.team_id === team.id).length,
      }));

      let contentQuery = admin.from("site_content").select("slug,content,published");
      if (!isAdmin) contentQuery = contentQuery.eq("published", true);
      const { data: content, error: contentError } = await contentQuery.limit(100);
      if (contentError) {
        console.error("Site content search failed:", contentError.message);
        return respond(500, { error: "Pencarian halaman gagal dimuat." });
      }
      const needle = term.toLocaleLowerCase("id-ID");
      const [announcements, stories] = await Promise.all([
        admin.from("caleris_announcements").select("id,title,body,published_at,created_at").eq("is_published", true)
          .or("title.ilike." + pattern + ",body.ilike." + pattern).order("published_at", { ascending: false }).limit(8),
        admin.from("caleris_sponsorship_story_events").select("id,headline,body,created_at").eq("visibility", "public")
          .or("headline.ilike." + pattern + ",body.ilike." + pattern).order("created_at", { ascending: false }).limit(8),
      ]);
      if (announcements.error || stories.error) {
        console.error("Published content search failed:", { announcements: announcements.error?.message, stories: stories.error?.message });
      }
      const sitePages = (content ?? []).flatMap((row) => {
        const value = row.content as Record<string, unknown>;
        const title = typeof value?.title === "string" ? value.title : row.slug;
        const searchableText = JSON.stringify(value ?? {}).replace(/[{}":,]/g, " ");
        if (!(title + " " + searchableText).toLocaleLowerCase("id-ID").includes(needle)) return [];
        const routes: Record<string, string> = { rules: "/rules", newsroom: "/main-event/newsroom", "privacy-policy": "/privacy-policy", "terms-and-conditions": "/terms-and-conditions" };
        return [{ title, slug: row.slug, excerpt: searchableText.trim().slice(0, 150), href: routes[row.slug] ?? "/dashboard" }];
      });
      const contentResults = [
        ...(announcements.data ?? []).map((row) => ({ title: row.title, slug: "announcement-" + row.id, excerpt: String(row.body ?? "").replace(/\s+/g, " ").slice(0, 150), href: "/main-event/newsroom" })),
        ...(stories.data ?? []).map((row) => ({ title: row.headline, slug: "paddock-story-" + row.id, excerpt: String(row.body ?? "").replace(/\s+/g, " ").slice(0, 150), href: "/main-event/newsroom" })),
      ];
      const pages = [...contentResults, ...sitePages].filter((item, index, all) => all.findIndex((candidate) => candidate.slug === item.slug) === index).slice(0, 20);
      return respond(200, { members, teams, pages });
    }

    if (action === "update_member_id") {
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
