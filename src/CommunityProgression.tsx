import { useEffect, useState } from "react";
import {
  Activity, Award, BookOpen, CheckCircle, Copy, Crown, Flag, Medal, Plus, Printer,
  RefreshCw, Save, Share2, ShieldCheck, Target, TrendingUp, Users, Vote
} from "lucide-react";
import { supabase } from "./lib/supabase";
import {
  buildYearbookPrintHtml,
  getCalerisLevel,
  simulateChampionship,
  type PredictorEvent,
} from "./lib/community-progression";
import "./community-progression.css";

type Toast = (kind: "success" | "error" | "warning" | "info", title: string, message?: string) => void;
type Props = { session: any; profile: any; toast: Toast };

const formatNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "0";
};

const isExpired = (poll: any) => new Date(poll.ends_at).getTime() <= Date.now();
const eventTypeLabel = (value: string) => ({
  race_result: "Official race result",
  checkin: "Race check-in",
  quest_completion: "Quest completed",
  shop_purchase: "Development purchase",
  xp_earned: "XP earned",
  xp_adjustment: "XP adjustment",
  milestone_completed: "Milestone achieved",
  milestone_reversed: "Milestone recalculated",
  race_result_voided: "Race result voided",
  team_transfer: "Team transfer",
  contract_status: "Driver contract update",
  sponsorship_status: "Sponsorship update",
  payroll_processed: "Payroll processed",
  merchandise_sales: "Merchandise sales",
  community_vote: "Community voting",
} as Record<string, string>)[value] ?? value.replace(/_/g, " ");
const badgeIcon = (value: string) => ({
  award: Award, medal: Medal, vote: Vote, target: Target, crown: Crown,
  "trending-up": TrendingUp, "shield-check": ShieldCheck, flag: Flag,
} as Record<string, any>)[value] ?? Medal;

export default function CommunityProgression({ session, profile, toast }: Props) {
  const db = supabase;
  const memberId = profile?.member_id;
  const [member, setMember] = useState<any>(null);
  const [teamName, setTeamName] = useState("");
  const [xp, setXp] = useState(0);
  const [driverStats, setDriverStats] = useState<any>({ race_starts: 0, wins: 0, podiums: 0, points: 0, championships: 0 });
  const [teamStats, setTeamStats] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [teamMilestones, setTeamMilestones] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [badges, setBadges] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [tab, setTab] = useState("overview");
  const [id, setId] = useState<any>({ theme: "classic", accent_color: "#b99752", tagline: "", public_visible: false });
  const [seasons, setSeasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [standing, setStanding] = useState("");
  const [rounds, setRounds] = useState(0);
  const [points, setPoints] = useState("");
  const [prediction, setPrediction] = useState<any[]>([]);
  const [predictionMeta, setPredictionMeta] = useState<any>(null);
  const [seasonData, setSeasonData] = useState<any>(null);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [eventVectors, setEventVectors] = useState<PredictorEvent[] | null>(null);

  const load = async () => {
    if (!db || !memberId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [
      memberResult, dashboardResult, definitionsResult, progressResult, feedResult,
      awardsResult, badgeDefinitionsResult, pollsResult, optionsResult, votesResult,
      idResult, seasonsResult, adminResult,
    ] = await Promise.all([
      db.from("members").select("id,character_name,role,license,team_id,member_code").eq("id", memberId).maybeSingle(),
      db.rpc("caleris_get_community_dashboard"),
      db.from("caleris_milestone_definitions").select("*").eq("active", true),
      db.from("caleris_milestone_progress").select("*").eq("scope", "driver").eq("member_id", memberId),
      db.from("caleris_activity_feed").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30),
      db.from("caleris_member_badges").select("*").eq("member_id", memberId),
      db.from("caleris_achievement_badges").select("*").eq("active", true).order("title"),
      db.from("caleris_community_polls").select("*").in("status", ["scheduled", "open", "closed", "finalized", "published", "cancelled"]).order("ends_at", { ascending: false }).limit(30),
      db.from("caleris_community_poll_options").select("*"),
      db.from("caleris_community_votes").select("poll_id,option_id").eq("voter_member_id", memberId),
      db.from("caleris_digital_id_cards").select("*").eq("member_id", memberId).maybeSingle(),
      db.from("license_seasons").select("id,title,season_key,status,starts_on").order("starts_on", { ascending: false }),
      db.from("site_admins").select("user_id").eq("user_id", session?.user?.id).maybeSingle(),
    ]);

    if (memberResult.error || dashboardResult.error) {
      toast("error", "Community Hub gagal dimuat", memberResult.error?.message || dashboardResult.error?.message);
    }
    const currentMember = memberResult.data;
    setMember(currentMember ?? null);
    const dashboard = dashboardResult.data ?? {};
    const totalXp = Number(dashboard.total_xp ?? 0);
    setXp(Number.isFinite(totalXp) ? totalXp : 0);
    setDriverStats(dashboard.driver_stats ?? { race_starts: 0, wins: 0, podiums: 0, points: 0, championships: 0 });
    setTeamStats(dashboard.team_stats ?? null);
    setIsAdmin(Boolean(adminResult.data?.user_id));

    if (currentMember?.team_id) {
      const [team, teamDefinitions, teamProgress] = await Promise.all([
        db.from("teams").select("name").eq("id", currentMember.team_id).maybeSingle(),
        db.from("caleris_milestone_definitions").select("*").eq("active", true).eq("scope", "team"),
        db.from("caleris_milestone_progress").select("*").eq("scope", "team").eq("team_id", currentMember.team_id),
      ]);
      setTeamName(team.data?.name ?? "");
      setTeamMilestones((teamDefinitions.data ?? []).map((definition: any) => ({
        ...definition,
        current_value: teamProgress.data?.find((row: any) => row.milestone_id === definition.id)?.current_value ?? 0,
        completed_at: teamProgress.data?.find((row: any) => row.milestone_id === definition.id)?.completed_at ?? null,
      })));
      if (team.error || teamDefinitions.error || teamProgress.error) {
        toast("error", "Milestone tim gagal dimuat", team.error?.message || teamDefinitions.error?.message || teamProgress.error?.message);
      }
    } else {
      setTeamName("");
      setTeamStats(null);
      setTeamMilestones([]);
    }

    const progressRows = progressResult.data ?? [];
    setMilestones((definitionsResult.data ?? [])
      .filter((definition: any) => definition.scope === "driver")
      .map((definition: any) => ({
        ...definition,
        current_value: progressRows.find((row: any) => row.milestone_id === definition.id)?.current_value
          ?? (definition.metric_key === "xp_total" ? totalXp : 0),
        completed_at: progressRows.find((row: any) => row.milestone_id === definition.id)?.completed_at ?? null,
      })));

    setFeed(feedResult.data ?? []);
    setFeedHasMore((feedResult.data ?? []).length === 30);
    setBadges((badgeDefinitionsResult.data ?? []).map((badge: any) => ({
      ...badge,
      earned: (awardsResult.data ?? []).some((award: any) => award.badge_code === badge.code),
      awarded_at: (awardsResult.data ?? []).find((award: any) => award.badge_code === badge.code)?.awarded_at ?? null,
    })));
    setPolls((pollsResult.data ?? []).map((poll: any) => ({
      ...poll,
      options: (optionsResult.data ?? []).filter((option: any) => option.poll_id === poll.id),
      voted: (votesResult.data ?? []).some((vote: any) => vote.poll_id === poll.id),
    })));
    if (idResult.data) setId(idResult.data);
    setSeasons(seasonsResult.data ?? []);

    const pollsNeedingResults = (pollsResult.data ?? []).filter((poll: any) =>
      poll.status !== "cancelled" && (poll.status === "closed" || poll.status === "finalized" || poll.status === "published" || isExpired(poll))
    );
    if (pollsNeedingResults.length) {
      const results = await Promise.all(pollsNeedingResults.map(async (poll: any) => {
        const response = await db.rpc("caleris_get_community_poll_results", { p_poll_id: poll.id });
        return [poll.id, response.error ? null : response.data] as const;
      }));
      const resultMap = new Map(results);
      setPolls((pollsResult.data ?? []).map((poll: any) => ({
        ...poll,
        options: (optionsResult.data ?? []).filter((option: any) => option.poll_id === poll.id),
        voted: (votesResult.data ?? []).some((vote: any) => vote.poll_id === poll.id),
        result: resultMap.get(poll.id) ?? null,
      })));
    }

    const queryErrors = [
      definitionsResult.error, progressResult.error, feedResult.error, awardsResult.error,
      badgeDefinitionsResult.error, pollsResult.error, optionsResult.error, votesResult.error,
      idResult.error, seasonsResult.error,
    ].filter(Boolean);
    if (queryErrors.length) toast("error", "Sebagian data Community Hub gagal dimuat", (queryErrors[0] as any).message);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [memberId]);

  const loadMoreFeed = async () => {
    if (!db || !feedHasMore || feedLoadingMore || !feed.length) return;
    const last = feed[feed.length - 1];
    setFeedLoadingMore(true);
    const { data, error } = await db.from("caleris_activity_feed").select("*")
      .or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30);
    setFeedLoadingMore(false);
    if (error) {
      toast("error", "Aktivitas sebelumnya gagal dimuat", error.message);
      return;
    }
    const currentIds = new Set(feed.map((item) => item.id));
    const nextRows = (data ?? []).filter((item: any) => !currentIds.has(item.id));
    setFeed((current) => [...current, ...nextRows]);
    setFeedHasMore((data ?? []).length === 30);
  };

  const vote = async (pollId: string, optionId: string) => {
    if (!db) return;
    const { error } = await db.rpc("caleris_cast_community_vote", { p_poll_id: pollId, p_option_id: optionId });
    if (error) {
      toast(error.code === "23505" ? "info" : "error", error.code === "23505" ? "Kamu sudah memilih" : "Vote gagal", error.code === "23505" ? "Satu member hanya dapat memilih sekali." : error.message);
    } else {
      toast("success", "Vote tersimpan", "Pilihanmu sudah tercatat.");
      await load();
    }
  };

  const finalizePoll = async (pollId: string, publish: boolean) => {
    if (!db) return;
    const { error } = await db.rpc("caleris_admin_finalize_poll", { p_poll_id: pollId, p_publish: publish });
    if (error) toast("error", "Voting gagal diperbarui", error.message);
    else {
      toast("success", publish ? "Hasil voting dipublikasikan" : "Voting difinalisasi");
      await load();
    }
  };

  const cancelPoll = async (pollId: string) => {
    if (!db || !window.confirm("Batalkan voting ini? Suara yang sudah masuk tetap tersimpan sebagai arsip.")) return;
    const { error } = await db.rpc("caleris_admin_cancel_poll", {
      p_poll_id: pollId,
      p_reason: "Cancelled by administrator",
    });
    if (error) toast("error", "Voting gagal dibatalkan", error.message);
    else {
      toast("success", "Voting dibatalkan");
      await load();
    }
  };

  const saveId = async () => {
    if (!db) return;
    if (!/^#[0-9a-f]{6}$/i.test(id.accent_color || "")) {
      toast("warning", "Warna accent tidak valid", "Gunakan format HEX enam karakter.");
      return;
    }
    if ((id.tagline ?? "").length > 80) {
      toast("warning", "Tagline terlalu panjang", "Maksimal 80 karakter.");
      return;
    }
    const { error } = await db.rpc("caleris_save_digital_id", {
      p_theme: id.theme,
      p_accent: id.accent_color,
      p_tagline: id.tagline,
      p_public: Boolean(id.public_visible),
    });
    if (error) toast("error", "ID gagal disimpan", error.message);
    else {
      toast("success", "Digital ID tersimpan");
      await load();
    }
  };

  const shareUrl = member?.member_code
    ? `${window.location.origin}/member-id/${encodeURIComponent(member.member_code)}`
    : "";
  const qrUrl = shareUrl
    ? `https://quickchart.io/qr?text=${encodeURIComponent(shareUrl)}&size=240&margin=2`
    : "";

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("success", "Link berhasil disalin");
    } catch {
      toast("error", "Gagal menyalin link", "Salin URL yang tampil secara manual.");
    }
  };

  const shareDigitalId = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "CALERIS MASTERS Digital ID", text: member.character_name, url: shareUrl });
      } catch (error: any) {
        if (error?.name !== "AbortError") toast("error", "Share gagal", error.message);
      }
    } else {
      await copyShareUrl();
    }
  };

  const makeYearbook = async (season: any) => {
    if (!db) return;
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      toast("warning", "Popup diblokir", "Izinkan popup untuk membuka yearbook dan menyimpannya sebagai PDF.");
      return;
    }
    printWindow.document.write("<p style='font:16px Arial;padding:24px'>Menyiapkan CALERIS MASTERS Yearbook...</p>");
    printWindow.document.close();
    const { data, error } = await db.rpc("caleris_generate_yearbook", {
      p_season: season.id,
      p_title: `${season.title} Yearbook`,
    });
    if (error || !data) {
      printWindow.close();
      toast("error", "Yearbook gagal dibuat", error?.message || "Snapshot server tidak tersedia.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildYearbookPrintHtml(data));
    printWindow.document.close();
    toast("success", "Yearbook siap", "Gunakan Print lalu pilih Save as PDF.");
  };

  const applyDivision = (data: any, divisionId: string) => {
    const division = (data?.divisions ?? []).find((item: any) => item.id === divisionId);
    if (!division) {
      setStanding("");
      setEventVectors([]);
      setRounds(0);
      return;
    }
    const sourceRows = data.current_driver_standings?.length
      ? data.current_driver_standings
      : data.driver_standings ?? [];
    const rows = sourceRows.filter((row: any) => row.season_division_id === division.id);
    setStanding(rows.map((row: any) => `${row.driver_name_snapshot ?? "Driver"},${Number(row.final_points ?? 0)}`).join("\n"));
    const remaining = (data.rounds ?? []).filter((event: any) => {
      if (event.season_division_id !== division.id) return false;
      const status = String(event.race_lifecycle_status ?? event.status ?? "").toLowerCase();
      return !["completed", "closed"].includes(status);
    });
    const rules = data.scoring_rules ?? [];
    const vectors = remaining.map((event: any) => {
      const matching = rules.filter((rule: any) => rule.session_type === event.session_type);
      if (!matching.length) return [];
      const maxPosition = Math.max(...matching.map((rule: any) => Number(rule.finishing_position)));
      const finishingPoints = Array.from({ length: Math.max(0, maxPosition) }, () => 0);
      matching.forEach((rule: any) => {
        const position = Number(rule.finishing_position);
        if (Number.isInteger(position) && position > 0) {
          finishingPoints[position - 1] = Number(rule.points ?? 0);
        }
      });
      const poleBonus = Math.max(0, ...matching.map((rule: any) => Number(rule.pole_bonus ?? 0)));
      return { finishingPoints, poleBonus };
    });
    setRounds(remaining.length);
    setEventVectors(vectors);
    const maxRace = Math.max(0, ...rules.filter((rule: any) => rule.session_type === "race").map((rule: any) => Number(rule.points ?? 0) + Number(rule.pole_bonus ?? 0)));
    setPoints(String(maxRace));
    setPrediction([]);
    setPredictionMeta(null);
  };

  const loadOfficialSeason = async () => {
    if (!db || !selectedSeason) {
      toast("warning", "Pilih musim terlebih dahulu");
      return;
    }
    const { data, error } = await db.rpc("caleris_get_season_community_data", { p_season: selectedSeason });
    if (error) {
      toast("error", "Data musim gagal dimuat", error.message);
      return;
    }
    setSeasonData(data);
    const firstDivision = data?.divisions?.[0]?.id ?? "";
    setSelectedDivision(firstDivision);
    applyDivision(data, firstDivision);
    toast("success", "Data musim resmi dimuat", "Klasemen dan aturan poin berasal dari database kompetisi.");
  };

  const changeDivision = (divisionId: string) => {
    setSelectedDivision(divisionId);
    if (seasonData) applyDivision(seasonData, divisionId);
  };

  const runPredictor = () => {
    const rows = standing.split("\n").map((line) => {
      const [name, ...pointParts] = line.split(",");
      return { name: name?.trim() ?? "", points: Number(pointParts.join(",").trim()) };
    }).filter((row) => row.name && Number.isFinite(row.points) && row.points >= 0);
    const manualVector = points.split(",").map(Number).filter((value) => Number.isFinite(value) && value >= 0);
    const vectors = eventVectors !== null
      ? eventVectors
      : rounds > 0 ? Array.from({ length: rounds }, () => manualVector) : [];
    if (rows.length < 2 || (eventVectors === null && rounds > 0 && !manualVector.length)) {
      toast("warning", "Data predictor belum lengkap", "Masukkan minimal dua driver dan aturan poin yang valid.");
      return;
    }
    try {
      const result = simulateChampionship(rows, vectors, 15000);
      setPrediction(rows.map((row, index) => ({
        name: row.name,
        probability: result.probabilities[index] ?? 0,
        eliminated: result.eliminated[index] ?? false,
        locked: result.lockedChampionIndex === index,
      })).sort((a, b) => b.probability - a.probability));
      setPredictionMeta(result);
    } catch (error: any) {
      toast("warning", "Simulasi tidak dapat dijalankan", error.message);
    }
  };

  if (loading) return <main className="cp-page"><p>Memuat Community Hub...</p></main>;
  if (!memberId || !member) return <main className="cp-page"><p>Profil member belum terhubung. Hubungi Admin jika kondisi ini terus terjadi.</p></main>;

  const lv = getCalerisLevel(xp);
  const next = lv >= 100 ? xp : 50 * 2 ** lv;
  const previous = lv ? 50 * 2 ** (lv - 1) : 0;
  const levelProgress = lv >= 100 ? 100 : Math.max(0, Math.min(100, ((xp - previous) / Math.max(1, next - previous)) * 100));
  const tabs = [
    ["overview", "Overview"], ["milestones", "Milestones"], ["activity", "Activity"],
    ["voting", "Voting"], ["predictor", "Predictor"], ["identity", "Digital ID"],
    ["yearbook", "Yearbook"], ["badges", "Badges"],
  ];

  return (
    <main className="cp-page">
      <header className="cp-header">
        <div><small>CALERIS MASTERS · COMMUNITY</small><h1>Community Hub</h1><p>Career progress, community activity, and season history.</p></div>
        <button onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </header>
      <nav className="cp-tabs" aria-label="Community sections">
        {tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>

      {tab === "overview" && <>
        <section className="cp-grid cp-stats">
          <article><span>Account Level</span><strong>LV {lv}</strong><div className="cp-bar"><i style={{ width: `${levelProgress}%` }} /></div><small>{formatNumber(xp)} / {lv >= 100 ? "MAX" : formatNumber(next)} XP</small></article>
          <article><span>Race Starts</span><strong>{formatNumber(driverStats.race_starts)}</strong><small>Completed official sessions</small></article>
          <article><span>Wins</span><strong>{formatNumber(driverStats.wins)}</strong><small>Official P1 results</small></article>
          <article><span>Podiums</span><strong>{formatNumber(driverStats.podiums)}</strong><small>Official top-three results</small></article>
          <article><span>Championship Points</span><strong>{formatNumber(driverStats.points)}</strong><small>Completed rounds only</small></article>
          <article><span>Season Titles</span><strong>{formatNumber(driverStats.championships)}</strong><small>Official final standings</small></article>
          <article><span>Current Team</span><strong>{teamName || "Independent"}</strong><small>{member.role} · {member.license || "Unlicensed"}</small></article>
        </section>
        {teamStats && <section className="cp-grid cp-stats">
          <article><span>Team Race Starts</span><strong>{formatNumber(teamStats.race_starts)}</strong></article>
          <article><span>Team Wins</span><strong>{formatNumber(teamStats.wins)}</strong></article>
          <article><span>Team Podiums</span><strong>{formatNumber(teamStats.podiums)}</strong></article>
          <article><span>Team Titles</span><strong>{formatNumber(teamStats.championships)}</strong></article>
          <article><span>Current Driver Roster</span><strong>{formatNumber(teamStats.drivers)}</strong></article>
        </section>}
        <section className="cp-grid">
          <article><h2><Target size={18} /> Driver Milestones</h2><p>{milestones.filter((item) => item.completed_at).length} / {milestones.length} completed</p><button onClick={() => setTab("milestones")}>View milestones</button></article>
          <article><h2><Activity size={18} /> Community Activity</h2><p>{feed.length} recent events available</p><button onClick={() => setTab("activity")}>View activity</button></article>
          <article><h2><Medal size={18} /> Achievement Badges</h2><p>{badges.filter((item) => item.earned).length} / {badges.length} earned</p><button onClick={() => setTab("badges")}>View collection</button></article>
        </section>
      </>}

      {tab === "milestones" && <>
        <section className="cp-section">
          <h2><Target size={20} /> Driver Career Milestones</h2>
          <p>Progress uses completed official results and the XP ledger. Career targets and rewards are configured by Admin.</p>
          <div className="cp-grid cp-milestone-grid">
            {milestones.map((item) => {
              const current = Number(item.current_value ?? 0);
              const target = Number(item.target_value ?? 1);
              const completed = Boolean(item.completed_at);
              return <article key={item.id} className={completed ? "earned" : ""}>
                <div className="cp-card-title"><strong>{item.title}</strong>{completed && <CheckCircle size={17} />}</div>
                <p>{item.description}</p>
                <div className="cp-bar"><i style={{ width: `${Math.min(100, current / Math.max(1, target) * 100)}%` }} /></div>
                <small>{formatNumber(current)} / {formatNumber(target)} {item.metric_key === "xp_total" ? "XP" : ""}</small>
                {item.xp_reward > 0 && <small>Reward: {formatNumber(item.xp_reward)} XP</small>}
              </article>;
            })}
            {!milestones.length && <article>Belum ada milestone driver aktif.</article>}
          </div>
        </section>
        <section className="cp-section">
          <h2><Users size={20} /> Team Milestones {teamName && <small>· {teamName}</small>}</h2>
          <div className="cp-grid cp-milestone-grid">
            {teamMilestones.map((item) => {
              const current = Number(item.current_value ?? 0);
              const target = Number(item.target_value ?? 1);
              const completed = Boolean(item.completed_at);
              return <article key={item.id} className={completed ? "earned" : ""}>
                <div className="cp-card-title"><strong>{item.title}</strong>{completed && <CheckCircle size={17} />}</div>
                <p>{item.description}</p>
                <div className="cp-bar"><i style={{ width: `${Math.min(100, current / Math.max(1, target) * 100)}%` }} /></div>
                <small>{formatNumber(current)} / {formatNumber(target)}</small>
              </article>;
            })}
            {!teamMilestones.length && <article>Belum ada milestone tim aktif untuk tim ini.</article>}
          </div>
        </section>
      </>}

      {tab === "activity" && <section className="cp-section">
        <h2><Activity size={20} /> Member Activity Feed</h2>
        <p>Feed hanya menampilkan event yang diizinkan oleh aturan visibility database.</p>
        {feed.map((item) => <article key={item.id} className="cp-feed-item">
          <div><strong>{item.title}</strong><small>{eventTypeLabel(item.event_type)} · {new Date(item.created_at).toLocaleString("id-ID")}</small></div>
          <p>{item.body}</p>
        </article>)}
        {!feed.length && <article>Belum ada aktivitas yang dapat ditampilkan.</article>}
        {feedHasMore && <button onClick={() => void loadMoreFeed()} disabled={feedLoadingMore}>{feedLoadingMore ? "Memuat..." : "Muat aktivitas sebelumnya"}</button>}
      </section>}

      {tab === "voting" && <section className="cp-section">
        <h2><Vote size={20} /> Community Voting</h2>
        <p>Satu suara per member. Identitas pemilih tidak dipublikasikan; hasil hanya berupa rekap setelah voting berakhir.</p>
        {isAdmin && <PollAdmin toast={toast} onCreated={() => void load()} />}
        {polls.map((poll) => {
          const startsNow = new Date(poll.starts_at).getTime() <= Date.now();
          const scheduled = poll.status === "scheduled" && !startsNow;
          const canVote = ["open", "scheduled"].includes(poll.status) && startsNow && !isExpired(poll);
          const cancelled = poll.status === "cancelled";
          const ended = ["closed", "finalized", "published", "cancelled"].includes(poll.status) || isExpired(poll);
          const result = poll.result;
          return <article key={poll.id} className="cp-poll">
            <div className="cp-card-title"><strong>{poll.title}</strong><span className={ended ? "cp-status closed" : "cp-status"}>{poll.status === "published" ? "Published" : poll.status === "finalized" ? "Finalized" : cancelled ? "Cancelled" : scheduled ? "Scheduled" : ended ? "Ended" : canVote ? "Open" : "Pending"}</span></div>
            <p>{poll.description}</p>
            {poll.period_title_snapshot && <small>Official period: {poll.period_title_snapshot}</small>}
            <small>Ends: {new Date(poll.ends_at).toLocaleString("id-ID")}</small>
            {scheduled && <p className="cp-muted">Voting dimulai {new Date(poll.starts_at).toLocaleString("id-ID")}.</p>}
            {canVote && !poll.voted && poll.options.map((option: any) => <button key={option.id} onClick={() => void vote(poll.id, option.id)}>{option.label}</button>)}
            {canVote && poll.voted && <p className="cp-muted">Suaramu sudah tercatat. Terima kasih sudah berpartisipasi.</p>}
            {cancelled && <p className="cp-muted">Voting ini dibatalkan oleh Admin.</p>}
            {ended && !cancelled && !result && <p className="cp-muted">Voting berakhir. Hasil menunggu finalisasi Admin.</p>}
            {result && <div className="cp-results">
              <strong>{formatNumber(result.total_votes)} total votes</strong>
              {result.winner_option_ids?.length > 0 && <p><strong>{result.winner_option_ids.length > 1 ? "Shared winners" : "Winner"}:</strong> {poll.options.filter((option: any) => result.winner_option_ids.includes(option.id)).map((option: any) => option.label).join(", ")}</p>}
              {Number(result.total_votes) === 0 && <p className="cp-muted">No winner: no votes were recorded.</p>}
              {result.winner_option_ids?.length > 1 && <small>Tie policy: shared winners.</small>}
              {(result.options ?? []).map((option: any) => {
                const percent = result.total_votes ? Number(option.votes) / Number(result.total_votes) * 100 : 0;
                return <div key={option.option_id} className="cp-result-row"><span>{option.label}</span><b>{formatNumber(option.votes)} · {percent.toFixed(1)}%</b><div className="cp-bar"><i style={{ width: `${percent}%` }} /></div></div>;
              })}
            </div>}
            {isAdmin && ["open", "scheduled"].includes(poll.status) && <div className="cp-admin-actions">
              <button onClick={() => void finalizePoll(poll.id, false)}>Finalisasi voting</button>
              <button onClick={() => void finalizePoll(poll.id, true)}>Finalisasi & publikasikan</button>
              <button onClick={() => void cancelPoll(poll.id)}>Batalkan voting</button>
            </div>}
            {isAdmin && poll.status === "closed" && <div className="cp-admin-actions">
              <button onClick={() => void finalizePoll(poll.id, false)}>Finalisasi hasil</button>
              <button onClick={() => void finalizePoll(poll.id, true)}>Publikasikan hasil</button>
              <button onClick={() => void cancelPoll(poll.id)}>Batalkan voting</button>
            </div>}
            {isAdmin && poll.status === "finalized" && <button onClick={() => void finalizePoll(poll.id, true)}>Publikasikan hasil</button>}
          </article>;
        })}
        {!polls.length && <article>Belum ada voting komunitas aktif.</article>}
      </section>}

      {tab === "predictor" && <section className="cp-section">
        <h2><Flag size={20} /> Championship Predictor</h2>
        <p>Simulasi 15.000 percobaan. Data resmi hanya memakai klasemen ronde selesai dan aturan poin aktif. Hasil tetap estimasi, bukan klasemen resmi.</p>
        <label>Season<select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}>
          <option value="">Pilih musim</option>
          {seasons.map((season) => <option key={season.id} value={season.id}>{season.title}</option>)}
        </select></label>
        <button onClick={() => void loadOfficialSeason()}>Muat data resmi</button>
        {seasonData && <>
          <label>Division<select value={selectedDivision} onChange={(event) => changeDivision(event.target.value)}>
            {(seasonData.divisions ?? []).map((division: any) => <option key={division.id} value={division.id}>{division.division_name}</option>)}
          </select></label>
          <small>{(seasonData.rounds ?? []).filter((round: any) => round.season_division_id === selectedDivision).length} ronde tercatat pada divisi ini.</small>
        </>}
        <label>Klasemen skenario (Nama,Poin per baris)<textarea rows={7} value={standing} onChange={(event) => { setEventVectors(null); setPrediction([]); setStanding(event.target.value); }} placeholder={"Driver A,120\nDriver B,98"} /></label>
        <label>Ronde tersisa<input type="number" min="0" max="100" value={rounds} onChange={(event) => { setEventVectors(null); setRounds(Math.max(0, Number(event.target.value))); }} /></label>
        <label>Poin per ronde manual (P1,P2,P3...)<input value={points} onChange={(event) => { setEventVectors(null); setPoints(event.target.value); }} placeholder="25,18,15,12,10" /></label>
        <small>{eventVectors !== null ? "Aturan poin resmi per sesi sudah dimuat." : "Mode skenario manual aktif."}</small>
        <button onClick={runPredictor}>Jalankan 15.000 simulasi</button>
        {predictionMeta && <p className="cp-muted">Maksimal poin tersisa per driver: {formatNumber(predictionMeta.maxRemainingPoints)}. Tie-break resmi belum dimodelkan, sehingga batas seri tidak dikunci.</p>}
        {prediction.map((row) => <article key={row.name} className="cp-prediction">
          <div><strong>{row.name}</strong><b>{row.probability.toFixed(1)}%</b></div>
          {row.locked && <small><Crown size={14} /> Mathematical champion</small>}
          {row.eliminated && <small>Mathematically eliminated</small>}
          <div className="cp-bar"><i style={{ width: `${row.probability}%` }} /></div>
        </article>)}
      </section>}

      {tab === "identity" && <section className="cp-section">
        <h2><ShieldCheck size={20} /> CALERIS MASTERS Digital ID</h2>
        <div className="cp-id" style={{ borderColor: id.accent_color }}>
          <div className="cp-id-top"><span>CALERIS MASTERS</span><span>{id.theme.toUpperCase()}</span></div>
          <h1>{member.character_name}</h1>
          <p>{member.role} · {member.license || "UNLICENSED"}</p>
          <p>{teamName || "Independent"} · {member.member_code}</p>
          <div className="cp-id-level"><strong>LV {lv}</strong><span>{formatNumber(xp)} XP</span></div>
          <div className="cp-id-bottom">{id.tagline || "Built through every season."}</div>
        </div>
        <label>Theme<select value={id.theme} onChange={(event) => setId({ ...id, theme: event.target.value })}>
          <option value="classic">Classic</option><option value="premio">Premio</option><option value="zwei">Zwei</option><option value="gold">Gold</option>
        </select></label>
        <label>Accent color<input type="color" value={id.accent_color} onChange={(event) => setId({ ...id, accent_color: event.target.value })} /></label>
        <label>Tagline<input maxLength={80} value={id.tagline ?? ""} onChange={(event) => setId({ ...id, tagline: event.target.value })} placeholder="Your personal tagline" /></label>
        <label className="cp-checkbox"><input type="checkbox" checked={Boolean(id.public_visible)} onChange={(event) => setId({ ...id, public_visible: event.target.checked })} /> Public verification page</label>
        <button onClick={() => void saveId()}><Save size={15} /> Save Digital ID</button>
        {id.public_visible && shareUrl && <div className="cp-share">
          <div><strong>Public verification link</strong><p>{shareUrl}</p><button onClick={() => void copyShareUrl()}><Copy size={15} /> Copy link</button><button onClick={() => void shareDigitalId()}><Share2 size={15} /> Share ID</button></div>
          <img src={qrUrl} alt="QR code for public CALERIS member ID" loading="lazy" />
        </div>}
        {!id.public_visible && <p className="cp-muted">Public verification dinonaktifkan. Link dan QR tidak akan menampilkan kartu ini.</p>}
      </section>}

      {tab === "yearbook" && <section className="cp-section">
        <h2><BookOpen size={20} /> Season Yearbook</h2>
        <p>Yearbook dibuat dari snapshot server-side: profil, XP, badge, aktivitas yang diizinkan, klasemen, jadwal, hasil, dan aturan poin resmi.</p>
        {seasons.map((season) => <article key={season.id} className="cp-yearbook-row">
          <div><strong>{season.title}</strong><small>{season.status ?? "Season"} · {season.season_key ?? ""}</small></div>
          <button onClick={() => void makeYearbook(season)}><Printer size={15} /> Generate PDF</button>
        </article>)}
        {!seasons.length && <article>Belum ada data season yang tersedia.</article>}
        <small>Browser akan membuka tampilan cetak. Pilih Save as PDF pada dialog cetak perangkat.</small>
      </section>}

      {tab === "badges" && <section className="cp-section">
        <h2><Award size={20} /> Achievement Badges</h2>
        <p>Badge hanya ditampilkan sebagai earned setelah award tercatat di database.</p>
        <div className="cp-grid cp-badges">
          {badges.map((badge) => {
            const Icon = badgeIcon(badge.icon);
            return <article key={badge.code} className={badge.earned ? "earned" : "locked"}>
              <div className="cp-badge-icon"><Icon size={22} /></div>
              <strong>{badge.title}</strong><p>{badge.description}</p>
              <small>{badge.earned ? `Earned ${badge.awarded_at ? new Date(badge.awarded_at).toLocaleDateString("id-ID") : ""}` : "Locked"}</small>
              <small>{badge.rarity || "Standard"}</small>
            </article>;
          })}
        </div>
        {!badges.length && <article>Belum ada badge yang dikonfigurasi.</article>}
      </section>}
    </main>
  );
}

function PollAdmin({
  toast, onCreated,
}: {
  toast: Toast; onCreated: () => void;
}) {
  const db = supabase;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("driver_of_period");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [seasonOptions, setSeasonOptions] = useState<any[]>([]);
  const [periodOptions, setPeriodOptions] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [badgeOptions, setBadgeOptions] = useState<any[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<any[]>([]);
  const [badgeCodeInput, setBadgeCodeInput] = useState("");
  const [badgeTitleInput, setBadgeTitleInput] = useState("");
  const [badgeDescriptionInput, setBadgeDescriptionInput] = useState("");
  const [badgeIconInput, setBadgeIconInput] = useState("award");
  const [badgeRarityInput, setBadgeRarityInput] = useState("common");
  const [badgeActiveInput, setBadgeActiveInput] = useState(true);
  const [editingBadgeCode, setEditingBadgeCode] = useState("");
  const [rewardSettings, setRewardSettings] = useState<any[]>([]);
  const [rewardInputs, setRewardInputs] = useState<Record<string, string>>({});
  const [editingCode, setEditingCode] = useState("");
  const [scope, setScope] = useState("driver");
  const [metricKey, setMetricKey] = useState("driver_race_starts");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [target, setTarget] = useState("1");
  const [reward, setReward] = useState("0");
  const [badgeCode, setBadgeCode] = useState("");
  const [active, setActive] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberMatches, setMemberMatches] = useState<any[]>([]);
  const [adjustMember, setAdjustMember] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("0");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [searchingMembers, setSearchingMembers] = useState(false);

  const teamPoll = type === "team_of_period" || type === "team_of_season";
  const driverPoll = type === "driver_of_period" || type === "driver_of_season";
  const metricOptions = scope === "driver"
    ? [
      ["driver_race_starts", "Race starts"], ["driver_wins", "Wins"],
      ["driver_podiums", "Podiums"], ["driver_points", "Championship points"],
      ["driver_championships", "Season titles"], ["xp_total", "Cumulative XP"],
    ]
    : [["team_races", "Race starts"], ["team_wins", "Wins"], ["team_podiums", "Podiums"], ["team_drivers", "Active drivers"], ["team_xp", "Current roster XP"], ["team_championships", "Season titles"]];

  const loadCandidates = async () => {
    if (!db) return;
    const response = teamPoll
      ? await db.from("teams").select("id,name").order("name").limit(200)
      : await db.from("members").select("id,character_name,role").order("character_name").limit(300);
    if (response.error) {
      toast("error", "Kandidat gagal dimuat", response.error.message);
      setCandidates([]);
      return;
    }
    const list = (response.data ?? []).filter((candidate: any) => {
      if (teamPoll) return true;
      if (driverPoll) return candidate.role === "Driver";
      return true;
    }).map((candidate: any) => ({
      id: candidate.id,
      label: teamPoll ? candidate.name : `${candidate.character_name} · ${candidate.role}`,
      member_id: teamPoll ? null : candidate.id,
      team_id: teamPoll ? candidate.id : null,
    }));
    setCandidates(list);
    setSelected((current) => current.filter((id) => list.some((candidate: any) => candidate.id === id)));
  };

  const loadAdminConfig = async () => {
    if (!db) return;
    const [definitionResult, badgeResult, seasonResult, periodResult, rewardResult] = await Promise.all([
      db.from("caleris_milestone_definitions").select("*").order("scope").order("title"),
      db.from("caleris_achievement_badges").select("*").order("title"),
      db.from("license_seasons").select("id,title").order("starts_on", { ascending: false }),
      db.from("season_calendar_periods").select("id,season_id,title,period_type,period_number").order("sort_order"),
      db.from("caleris_xp_reward_settings").select("*").order("source_type"),
    ]);
    if (definitionResult.error || badgeResult.error || seasonResult.error || periodResult.error || rewardResult.error) {
      toast("error", "Konfigurasi progression gagal dimuat", definitionResult.error?.message || badgeResult.error?.message || seasonResult.error?.message || periodResult.error?.message || rewardResult.error?.message);
    }
    setDefinitions(definitionResult.data ?? []);
    setBadgeCatalog(badgeResult.data ?? []);
    setBadgeOptions((badgeResult.data ?? []).filter((badge: any) => badge.active));
    setSeasonOptions(seasonResult.data ?? []);
    setPeriodOptions(periodResult.data ?? []);
    setRewardSettings(rewardResult.data ?? []);
    setRewardInputs(Object.fromEntries((rewardResult.data ?? []).map((item: any) => [item.source_type, String(item.reward_xp)])));
  };

  useEffect(() => { void loadCandidates(); }, [type]);
  useEffect(() => { void loadAdminConfig(); }, []);

  const createPoll = async () => {
    if (!db || selected.length < 2 || !endsAt
      || ((type.endsWith("_of_season") || type.endsWith("_of_period")) && !seasonId)
      || (type.endsWith("_of_period") && !periodId)) {
      toast("warning", "Voting belum lengkap", "Pilih minimal dua kandidat, season/period yang sesuai, dan waktu penutupan.");
      return;
    }
    const startDate = startsAt ? new Date(startsAt) : new Date();
    const endDate = new Date(endsAt);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())
      || endDate.getTime() <= Date.now() || startDate.getTime() > endDate.getTime()
      || (startsAt && startDate.getTime() < Date.now())) {
      toast("warning", "Jadwal voting tidak valid", "Waktu mulai harus sekarang atau masa depan, dan penutupan harus setelah waktu mulai.");
      return;
    }
    const options = selected.map((id) => candidates.find((candidate) => candidate.id === id)).filter(Boolean);
    setSaving(true);
    const { error } = await db.rpc("caleris_admin_create_poll", {
      p_title: title,
      p_description: description,
      p_type: type,
      p_starts_at: startDate.toISOString(),
      p_ends_at: endDate.toISOString(),
      p_options: options,
      p_season_id: seasonId || null,
      p_period_id: periodId || null,
    });
    setSaving(false);
    if (error) toast("error", "Voting gagal dibuat", error.message);
    else {
      toast("success", startDate.getTime() > Date.now() ? "Voting berhasil dijadwalkan" : "Voting berhasil dibuat");
      setTitle(""); setDescription(""); setSelected([]); setStartsAt(""); setEndsAt(""); setPeriodId("");
      onCreated();
    }
  };

  const saveReward = async (source: string) => {
    const value = Number(rewardInputs[source]);
    if (!db || !Number.isInteger(value) || value < 0 || value > 100000) {
      toast("warning", "Reward XP tidak valid", "Masukkan angka bulat dari 0 sampai 100.000.");
      return;
    }
    const { error } = await db.rpc("caleris_set_xp_reward", { p_source: source, p_reward: value });
    if (error) toast("error", "Reward XP gagal disimpan", error.message);
    else {
      toast("success", "Reward XP diperbarui", `${source}: ${formatNumber(value)} XP`);
      await loadAdminConfig();
    }
  };

  const editBadge = (badge: any) => {
    setEditingBadgeCode(badge.code);
    setBadgeCodeInput(badge.code);
    setBadgeTitleInput(badge.title);
    setBadgeDescriptionInput(badge.description ?? "");
    setBadgeIconInput(badge.icon ?? "award");
    setBadgeRarityInput(badge.rarity ?? "common");
    setBadgeActiveInput(Boolean(badge.active));
  };

  const resetBadge = () => {
    setEditingBadgeCode("");
    setBadgeCodeInput("");
    setBadgeTitleInput("");
    setBadgeDescriptionInput("");
    setBadgeIconInput("award");
    setBadgeRarityInput("common");
    setBadgeActiveInput(true);
  };

  const saveBadge = async () => {
    const code = badgeCodeInput.trim().toLowerCase();
    if (!db || !/^[a-z0-9_]{3,80}$/.test(code) || !badgeTitleInput.trim() || badgeDescriptionInput.length > 500 || badgeIconInput.length > 60) {
      toast("warning", "Badge belum valid", "Kode harus 3-80 karakter huruf kecil/angka/underscore; judul wajib diisi.");
      return;
    }
    const { error } = await db.rpc("caleris_admin_save_badge", {
      p_code: code, p_title: badgeTitleInput.trim(), p_description: badgeDescriptionInput,
      p_icon: badgeIconInput, p_rarity: badgeRarityInput, p_active: badgeActiveInput,
    });
    if (error) toast("error", "Badge gagal disimpan", error.message);
    else {
      toast("success", "Badge catalog diperbarui");
      resetBadge();
      await loadAdminConfig();
      onCreated();
    }
  };

  const editMilestone = (definition: any) => {
    setEditingCode(definition.code);
    setScope(definition.scope);
    setMetricKey(definition.metric_key);
    setMilestoneTitle(definition.title);
    setMilestoneDescription(definition.description ?? "");
    setTarget(String(definition.target_value));
    setReward(String(definition.xp_reward ?? 0));
    setBadgeCode(definition.badge_code ?? "");
    setActive(Boolean(definition.active));
  };

  const resetMilestone = () => {
    setEditingCode("");
    setScope("driver");
    setMetricKey("driver_race_starts");
    setMilestoneTitle("");
    setMilestoneDescription("");
    setTarget("1");
    setReward("0");
    setBadgeCode("");
    setActive(true);
  };

  const saveMilestone = async () => {
    if (!db || !milestoneTitle.trim() || !Number.isInteger(Number(target)) || Number(target) <= 0 || !Number.isInteger(Number(reward)) || Number(reward) < 0) {
      toast("warning", "Milestone belum lengkap", "Judul dan target harus valid.");
      return;
    }
    const code = editingCode || milestoneTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
    if (!code || code.length < 3) {
      toast("warning", "Kode milestone tidak valid", "Judul harus menghasilkan kode minimal tiga karakter.");
      return;
    }
    const { error } = await db.rpc("caleris_admin_save_milestone", {
      p_code: code,
      p_scope: scope,
      p_title: milestoneTitle,
      p_description: milestoneDescription,
      p_metric_key: metricKey,
      p_target: Number(target),
      p_xp_reward: scope === "driver" ? Number(reward) : 0,
      p_badge_code: badgeCode || null,
      p_active: active,
    });
    if (error) toast("error", "Milestone gagal disimpan", error.message);
    else {
      toast("success", "Konfigurasi milestone tersimpan");
      resetMilestone();
      await loadAdminConfig();
      onCreated();
    }
  };

  const searchMembers = async () => {
    if (!db || memberSearch.trim().length < 2) {
      toast("warning", "Masukkan minimal dua karakter nama member");
      return;
    }
    setSearchingMembers(true);
    const { data, error } = await db.from("members")
      .select("id,character_name,member_code,role")
      .ilike("character_name", `%${memberSearch.trim()}%`)
      .order("character_name")
      .limit(20);
    setSearchingMembers(false);
    if (error) toast("error", "Pencarian member gagal", error.message);
    else setMemberMatches(data ?? []);
  };

  const adjustXp = async () => {
    if (!db || !adjustMember || !Number.isInteger(Number(adjustAmount)) || Number(adjustAmount) === 0 || !adjustDescription.trim()) {
      toast("warning", "Penyesuaian XP belum valid", "Pilih member, masukkan angka bulat bukan nol, dan isi alasan.");
      return;
    }
    const { data, error } = await db.rpc("caleris_admin_adjust_xp", {
      p_member_id: adjustMember,
      p_amount: Number(adjustAmount),
      p_source_id: `admin-adjust-${crypto.randomUUID()}`,
      p_description: adjustDescription.trim(),
    });
    if (error) toast("error", "Penyesuaian XP gagal", error.message);
    else {
      toast("success", "XP berhasil disesuaikan", `Saldo XP terbaru: ${formatNumber(data?.total_xp)}`);
      setAdjustAmount("0"); setAdjustDescription("");
      onCreated();
    }
  };

  return <section className="cp-admin-poll">
    <h3>Admin · Voting & Progression Configuration</h3>
    <div className="cp-admin-form">
      <label>Judul voting<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label>
      <label>Deskripsi<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} /></label>
      <label>Jenis voting<select value={type} onChange={(event) => {
        const nextType = event.target.value;
        setType(nextType);
        setSelected([]);
        if (!nextType.endsWith("_of_period")) setPeriodId("");
        if (!nextType.endsWith("_of_period") && !nextType.endsWith("_of_season")) setSeasonId("");
      }}>
        <option value="driver_of_period">Driver of the Period</option>
        <option value="team_of_period">Team of the Period</option>
        <option value="driver_of_season">Driver of the Season</option>
        <option value="team_of_season">Team of the Season</option>
        <option value="fia_nomination">FIA Nomination</option>
      </select></label>
      {(type.endsWith("_of_season") || type.endsWith("_of_period")) && <label>Season<select value={seasonId} onChange={(event) => { setSeasonId(event.target.value); setPeriodId(""); }}>
        <option value="">Pilih season</option>{seasonOptions.map((season) => <option key={season.id} value={season.id}>{season.title}</option>)}
      </select></label>}
      {type.endsWith("_of_period") && <label>Period<select value={periodId} onChange={(event) => setPeriodId(event.target.value)} disabled={!seasonId}>
        <option value="">Pilih period</option>{periodOptions.filter((period) => period.season_id === seasonId).map((period) => <option key={period.id} value={period.id}>{period.title}</option>)}
      </select></label>}
      <label>Voting dimulai (opsional, kosong = langsung)<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
      <label>Voting berakhir<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
      <div><strong>Kandidat (pilih minimal dua)</strong><div className="cp-candidate-list">
        {candidates.map((candidate) => <label key={candidate.id}>
          <input type="checkbox" checked={selected.includes(candidate.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} />
          <span>{candidate.label}</span>
        </label>)}
      </div></div>
      <button onClick={() => void createPoll()} disabled={saving}><Plus size={15} /> {saving ? "Membuat..." : "Buat voting"}</button>
    </div>

    <div className="cp-admin-config">
      <h4>Milestone Catalog</h4>
      <p>Target, reward XP, badge, dan status milestone dapat diatur tanpa mengubah source code.</p>
      <div className="cp-grid cp-admin-form">
        <label>Scope<select value={scope} disabled={Boolean(editingCode)} onChange={(event) => { const value = event.target.value; setScope(value); setMetricKey(value === "driver" ? "driver_race_starts" : "team_races"); }}>
          <option value="driver">Driver</option><option value="team">Team</option>
        </select></label>
        <label>Metric<select value={metricKey} disabled={Boolean(editingCode)} onChange={(event) => setMetricKey(event.target.value)}>
          {metricOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Judul<input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} maxLength={120} /></label>
        <label>Target<input type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
        <label>Reward XP<input type="number" min="0" max="100000" step="1" value={scope === "team" ? "0" : reward} disabled={scope === "team"} onChange={(event) => setReward(event.target.value)} /></label>
        <label>Badge<select value={badgeCode} onChange={(event) => setBadgeCode(event.target.value)}>
          <option value="">Tanpa badge</option>{badgeOptions.map((badge) => <option key={badge.code} value={badge.code}>{badge.title}</option>)}
        </select></label>
      </div>
      <label>Deskripsi<textarea rows={2} value={milestoneDescription} onChange={(event) => setMilestoneDescription(event.target.value)} maxLength={500} /></label>
      <label className="cp-checkbox"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Aktif</label>
      <button onClick={() => void saveMilestone()}><Save size={15} /> {editingCode ? "Simpan perubahan" : "Tambah milestone"}</button>
      {editingCode && <button onClick={resetMilestone}>Batal edit</button>}
      <div className="cp-admin-list">
        {definitions.map((definition) => <div key={definition.id}>
          <span><strong>{definition.title}</strong><small>{definition.scope} · {definition.metric_key} · target {formatNumber(definition.target_value)} · reward {formatNumber(definition.xp_reward)} XP</small></span>
          <button onClick={() => editMilestone(definition)}>Edit</button>
        </div>)}
      </div>
    </div>

    <div className="cp-admin-config">
      <h4>XP Reward Configuration</h4>
      <p>Reward berasal dari konfigurasi server. Nilai 0 menonaktifkan award untuk sumber tersebut.</p>
      <div className="cp-grid cp-admin-form">
        {rewardSettings.map((item) => <label key={item.source_type}>
          {({ race_result: "Official race result", checkin: "Race check-in", quest: "Quest completion", shop_purchase: "Development shop purchase" } as Record<string, string>)[item.source_type] ?? item.source_type}
          <input type="number" min="0" max="100000" step="1" value={rewardInputs[item.source_type] ?? "0"} onChange={(event) => setRewardInputs((current) => ({ ...current, [item.source_type]: event.target.value }))} />
          <button onClick={() => void saveReward(item.source_type)}>Save reward</button>
        </label>)}
      </div>
    </div>

    <div className="cp-admin-config">
      <h4>Manual XP Adjustment</h4>
      <p>Setiap penyesuaian dicatat di ledger dengan reference unik dan alasan audit. Total XP tidak boleh menjadi negatif.</p>
      <label>Cari member<input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Nama karakter" /></label>
      <button onClick={() => void searchMembers()} disabled={searchingMembers}><Users size={15} /> Cari member</button>
      <label>Member<select value={adjustMember} onChange={(event) => setAdjustMember(event.target.value)}>
        <option value="">Pilih member</option>{memberMatches.map((item) => <option key={item.id} value={item.id}>{item.character_name} · {item.role} · {item.member_code}</option>)}
      </select></label>
      <label>Jumlah XP (+/-)<input type="number" step="1" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} /></label>
      <label>Alasan<input value={adjustDescription} onChange={(event) => setAdjustDescription(event.target.value)} maxLength={240} /></label>
      <button onClick={() => void adjustXp()}><Save size={15} /> Terapkan penyesuaian</button>
    </div>

    <div className="cp-admin-config">
      <h4>Achievement Badge Catalog</h4>
      <p>Admin dapat mengatur deskripsi, icon key, rarity, dan status badge. Kode badge yang sudah dipakai tidak dapat diganti.</p>
      <div className="cp-admin-form">
        <label>Badge code<input value={badgeCodeInput} disabled={Boolean(editingBadgeCode)} onChange={(event) => setBadgeCodeInput(event.target.value.toLowerCase())} maxLength={80} placeholder="season_champion" /></label>
        <label>Title<input value={badgeTitleInput} onChange={(event) => setBadgeTitleInput(event.target.value)} maxLength={120} /></label>
        <label>Icon key<input value={badgeIconInput} onChange={(event) => setBadgeIconInput(event.target.value)} maxLength={60} placeholder="award" /></label>
        <label>Rarity<select value={badgeRarityInput} onChange={(event) => setBadgeRarityInput(event.target.value)}>
          <option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option>
        </select></label>
      </div>
      <label>Description<textarea rows={2} value={badgeDescriptionInput} onChange={(event) => setBadgeDescriptionInput(event.target.value)} maxLength={500} /></label>
      <label className="cp-checkbox"><input type="checkbox" checked={badgeActiveInput} onChange={(event) => setBadgeActiveInput(event.target.checked)} /> Active in member catalog</label>
      <button onClick={() => void saveBadge()}><Save size={15} /> {editingBadgeCode ? "Save badge" : "Create badge"}</button>
      {editingBadgeCode && <button onClick={resetBadge}>Cancel edit</button>}
      <div className="cp-admin-list">
        {badgeCatalog.map((badge) => <div key={badge.code}>
          <span><strong>{badge.title}</strong><small>{badge.code} · {badge.rarity} · {badge.active ? "Active" : "Inactive"}</small></span>
          <button onClick={() => editBadge(badge)}>Edit</button>
        </div>)}
      </div>
    </div>
  </section>;
}
