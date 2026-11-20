import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useLocation } from "react-router-dom";
import { Activity, CarFront, CheckCircle2, Flag, Medal, Trophy, Wallet } from "lucide-react";
import { supabase } from "./lib/supabase";
import { createStage5QueryPlan } from "./lib/stage5QueryPlan";
import { broadcastNewsroomArticle } from "./lib/newsroomBroadcast";
import DriverExhibition from "./DriverExhibition";
import FiaDataExport from "./FiaDataExport";
import { findCircuitForRound, getScheduleRoundsForPeriod } from "./lib/schedulePresentation";
import "./driver-exhibition.css";
import "./circuit-pool.css";
import "./schedule-circuit.css";

type Props = { session: Session; fallback: ReactNode; isAdmin?: boolean };
type Row = Record<string, any>;
const EMPTY_ROWS = { data: [] as Row[], error: null };
const EMPTY_SINGLE = { data: null as Row | null, error: null };
const money = (n: number) => "€ " + Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const dateLabel = (v?: string | null) => v ? new Date(v + (v.length === 10 ? "T00:00:00" : "")).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "Belum diatur";
const ageOf = (dob?: string | null) => {
  if (!dob) return "Belum diatur";
  const d = new Date(dob + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age + " tahun";
};
const labelDivision = (v?: string | null) => v ? v.toLowerCase().includes("premio") ? "Premio" : v.toLowerCase().includes("zwei") ? "Zwei" : v : "Belum ditetapkan";
const formatRaceDate = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "Tanggal belum diatur";
const formatRaceTime = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) + " WIB" : "Jam belum diatur";
const formatCircuitRecord = (ms?: number | null) => {
  if (!ms) return "Belum ada record";
  const minutes = Math.floor(ms / 60000), seconds = Math.floor((ms % 60000) / 1000), millis = ms % 1000;
  return minutes + ":" + String(seconds).padStart(2, "0") + "," + String(millis).padStart(3, "0");
};
const circuitCountryName = (code?: string | null) => code && /^[A-Z]{2}$/.test(code) ? new Intl.DisplayNames(["id"], { type: "region" }).of(code) || code : "Negara belum diatur";
const Card = ({ title, eyebrow, children, onClick }: { title: string; eyebrow?: string; children: ReactNode; onClick?: () => void }) => <section className="s5-card" onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}><div className="s5-card-head"><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div></div>{children}</section>;
const Empty = ({ children = "Belum ada data yang dipublikasikan." }: { children?: ReactNode }) => <div className="s5-empty">{children}</div>;
const Table = ({ headers, rows, empty = "Belum ada data." }: { headers: string[]; rows: ReactNode[][]; empty?: string }) => <div className="s5-table-wrap"><table className="s5-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={headers.length}><Empty>{empty}</Empty></td></tr>}</tbody></table></div>;
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="s5-field"><span>{label}</span>{children}</label>;

export default function Stage5Panel({ session, fallback, isAdmin = false }: Props) {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const group = parts[0] || "";
  const tab = parts[1] || "";
  const detail = parts[2] || "";
  const isMain = group === "main-event";
  const isDriver = group === "driver-panel";
  const isTeam = group === "team-panel";
  const isFia = group === "fia-panel";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<Row>({});
  const [profile, setProfile] = useState<Row | null>(null);
  const [member, setMember] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [comparisonKind, setComparisonKind] = useState("driver");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [attributeModalOpen, setAttributeModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Row | null>(null);
  const [teamDetailClosing, setTeamDetailClosing] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<{ round: Row; circuit: Row | null } | null>(null);
  const closeSelectedTeam = () => {
    if (!selectedTeam || teamDetailClosing) return;
    setTeamDetailClosing(true);
    window.setTimeout(() => { setSelectedTeam(null); setTeamDetailClosing(false); }, 260);
  };
  useEffect(() => {
    if (!selectedSchedule) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedSchedule(null); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [selectedSchedule]);
  const set = (key: string, value: any) => setForm((v: Row) => ({ ...v, [key]: value }));

  const queryPlan = useMemo(() => createStage5QueryPlan(group, tab, detail, isAdmin), [group, tab, detail, isAdmin]);
  const {
    isMainGridPage, isDriverCharacterPage, isTeamSummaryPage, isFinancialPage,
    isMainAnnouncementPage, isMainRegulationPage, isCompetitionSchedulePage, needsOwnIdentity, needsSeasonData, needsTeamData,
    needsMemberDirectory, needsDirectoryAvatars, needsDivisionData, needsRoundData,
    needsRoundPoints, needsFinalStandings, needsRegistrationData, needsRaceResults,
    needsResultEntries, needsTeamProfiles, needsAttributes, needsAchievements,
    needsEngineData, needsJobAdverts, needsAppealData, needsContracts, needsWallets,
    needsFinancialLedger, needsDriverReputation, needsSponsorshipData
  } = queryPlan;
  const refresh = useCallback(async () => {
    if (!supabase) { setNotice("Supabase belum dikonfigurasi."); setLoading(false); return; }
    setLoading(true);
    setNotice("");
    const [
      p, seasonsQ, teamsQ, membersQ, divisionsQ, roundsQ, roundPointsQ, finalQ,
      registrationsQ, raceResultsQ, resultEntriesQ, teamProfilesQ, attributesQ,
      achievementsQ, enginesQ, announcementsQ, regulationsQ, advertsQ, appealsQ,
      finesQ, contractsQ, walletsQ, transactionsQ, periodsQ, periodMappingsQ,
      fanPopulationsQ, driverReputationQ, sponsorshipContractsQ, sponsorsQ, circuitsQ
    ] = await Promise.all([
      needsOwnIdentity ? supabase.from("profiles").select(isDriverCharacterPage ? "user_id,member_id,avatar_url,avatar_path,date_of_birth,nationality,hometown" : "member_id").eq("user_id", session.user.id).maybeSingle() : Promise.resolve(EMPTY_SINGLE),
      needsSeasonData ? supabase.from("license_seasons").select("id,title,season_key,starts_on,ends_on,status").order("starts_on", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsTeamData ? supabase.from("caleris_team_directory").select("id,name,division_key,main_color,secondary_color").order("name") : Promise.resolve(EMPTY_ROWS),
      needsMemberDirectory ? supabase.from("caleris_member_directory").select(needsDirectoryAvatars ? "id,character_name,role,license,team_id,avatar_path,avatar_url,nationality,hometown" : "id,character_name,role,license,team_id").order("character_name") : Promise.resolve(EMPTY_ROWS),
      needsDivisionData ? supabase.from("license_season_divisions").select("id,season_id,division_key,division_name,status") : Promise.resolve(EMPTY_ROWS),
      needsRoundData ? supabase.from("license_rounds").select("id,season_division_id,round_number,title,circuit_name,circuit_country_code,race_starts_at,race_duration_minutes,status,processed_at").order("round_number") : Promise.resolve(EMPTY_ROWS),
      needsRoundPoints ? supabase.from("license_round_standings").select("id,round_id,member_id,points_total,driver_name_snapshot,team_id_snapshot,team_name_snapshot") : Promise.resolve(EMPTY_ROWS),
      needsFinalStandings ? supabase.from("license_final_standings").select("id,season_division_id,member_id,final_points,final_position,driver_name_snapshot,team_id_snapshot,team_name_snapshot") : Promise.resolve(EMPTY_ROWS),
      needsRegistrationData ? supabase.from("license_season_members").select("id,season_id,season_division_id,member_id,is_hiatus,preserved_license") : Promise.resolve(EMPTY_ROWS),
      needsRaceResults ? supabase.from("caleris_race_results").select("id,round_id,winner_member_id,pole_member_id,driver_of_day_member_id,fastest_lap_member_id,fastest_lap_ms,published_at") : Promise.resolve(EMPTY_ROWS),
      needsResultEntries ? supabase.from("caleris_race_result_entries").select("id,round_id,member_id,team_id,driver_name_snapshot,team_name_snapshot,finish_status,finishing_position,grid_position,fastest_lap_ms") : Promise.resolve(EMPTY_ROWS),
      needsTeamProfiles ? supabase.from("caleris_team_profiles").select("*") : Promise.resolve(EMPTY_ROWS),
      needsAttributes ? supabase.from("caleris_driver_attributes").select("*") : Promise.resolve(EMPTY_ROWS),
      needsAchievements ? supabase.from("caleris_achievements").select("*").order("awarded_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsEngineData ? supabase.from("caleris_engines").select("*").eq("is_active", true).order("name") : Promise.resolve(EMPTY_ROWS),
      isMainAnnouncementPage ? supabase.from("caleris_announcements").select("*").eq("is_published", true).order("published_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      isMainRegulationPage ? supabase.from("caleris_regulations").select("*").eq("is_published", true).order("published_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsJobAdverts ? supabase.from("caleris_job_adverts").select("*").eq("status", "published").order("created_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsAppealData ? supabase.from("caleris_appeals").select("*").order("submitted_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsAppealData ? supabase.from("caleris_fines").select("*").order("issued_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsContracts ? supabase.from("economy_driver_contracts").select("*").order("created_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsWallets ? supabase.from("economy_wallet_accounts").select("id,account_kind,member_id,team_id,balance,is_active").eq("is_active", true) : Promise.resolve(EMPTY_ROWS),
      needsFinancialLedger ? supabase.from("economy_transactions").select("id,event_type,source_account_id,destination_account_id,amount,description,metadata,created_at").order("created_at", { ascending: false }).limit(150) : Promise.resolve(EMPTY_ROWS),
      isCompetitionSchedulePage ? supabase.from("season_calendar_periods").select("id,season_id,period_type,period_number,title,starts_on,ends_on,sort_order").order("sort_order") : Promise.resolve(EMPTY_ROWS),
      isCompetitionSchedulePage ? supabase.from("season_period_rounds").select("id,period_id,season_division_id,round_id") : Promise.resolve(EMPTY_ROWS),
      isDriverCharacterPage ? supabase.from("caleris_fan_populations").select("member_id,population").eq("entity_kind", "driver") : Promise.resolve(EMPTY_ROWS),
      needsDriverReputation ? supabase.from("caleris_driver_reputation").select("member_id,score,band") : Promise.resolve(EMPTY_ROWS),
      needsSponsorshipData ? supabase.from("caleris_sponsorship_contracts").select("id,sponsor_id,target_team_id,season_id,contract_amount,annual_contract_amount,duration_seasons,status,started_at,ended_at,renewal_status").eq("target_kind", "team").eq("status", "active").order("started_at", { ascending: false }) : Promise.resolve(EMPTY_ROWS),
      needsSponsorshipData ? supabase.from("caleris_sponsors").select("id,name,logo_url,industry").order("name") : Promise.resolve(EMPTY_ROWS),
       isCompetitionSchedulePage ? supabase.from("caleris_circuit_pool").select("*").order("name") : Promise.resolve(EMPTY_ROWS)
    ]);
    const errors = [
      p, seasonsQ, teamsQ, membersQ, divisionsQ, roundsQ, roundPointsQ, finalQ,
      registrationsQ, raceResultsQ, resultEntriesQ, teamProfilesQ, attributesQ,
      achievementsQ, enginesQ, announcementsQ, regulationsQ, advertsQ, appealsQ,
      finesQ, contractsQ, walletsQ, transactionsQ, periodsQ, periodMappingsQ,
      fanPopulationsQ, driverReputationQ, sponsorshipContractsQ, sponsorsQ, circuitsQ
    ].map(x => x.error).filter(Boolean);
    if (errors.length && errors[0]) setNotice(errors[0].message);
    let ownProfile = (p.data || null) as Row | null;
    if (isDriverCharacterPage && ownProfile?.avatar_path) {
      const signed = await supabase.storage.from("profile-avatars").createSignedUrl(ownProfile.avatar_path, 3600);
      ownProfile = { ...ownProfile, avatar_url: signed.data?.signedUrl || ownProfile.avatar_url };
    }
    setProfile(ownProfile);
    let ownMember: Row | null = null;
    if (ownProfile?.member_id) {
      const m = await supabase.from("members").select("id,member_code,character_name,role,license,team_id").eq("id", ownProfile.member_id).maybeSingle();
      if (m.error) setNotice(m.error.message);
      ownMember = m.data as Row | null;
    }
    setMember(ownMember);
    const directoryMembers = (membersQ.data || []) as Row[];
    const avatarPaths = needsDirectoryAvatars ? [...new Set(directoryMembers.map((m: Row) => String(m.avatar_path || "")).filter(Boolean))] : [];
    const avatarUrlByPath = new Map<string, string>();
    if (avatarPaths.length) {
      const { data: signedAvatars, error: avatarError } = await supabase.storage.from("profile-avatars").createSignedUrls(avatarPaths, 3600);
      if (avatarError) setNotice(avatarError.message);
      (signedAvatars || []).forEach((item: Row) => {
        if (item.path && item.signedUrl) avatarUrlByPath.set(item.path, item.signedUrl);
      });
    }
    const membersWithAvatars = directoryMembers.map((m: Row) => ({
      ...m,
      avatar_url: (m.avatar_path ? avatarUrlByPath.get(m.avatar_path) : null) || m.avatar_url || null,
    }));
    const seasons = (seasonsQ.data || []) as Row[];
    const activeSeason = seasons.find(s => s.status === "active") || seasons[0] || null;
    const divisions = (divisionsQ.data || []) as Row[];
    const activeDivisions = divisions.filter(d => d.season_id === activeSeason?.id);
    const activeDivisionIds = activeDivisions.map(d => d.id);
    const rounds = (roundsQ.data || []) as Row[];
    const activeRounds = rounds.filter(r => activeDivisionIds.includes(r.season_division_id));
    const activeRoundIds = activeRounds.map(r => r.id);
    let teamEngines: Row[] = [];
    if ((isMainGridPage || isTeamSummaryPage) && activeSeason?.id) {
      const te = await supabase.from("caleris_team_engines").select("id,season_id,team_id,engine_id,caleris_engines(name,manufacturer)").eq("season_id", activeSeason.id);
      if (te.error) setNotice(te.error.message);
      teamEngines = (te.data || []) as Row[];
    }
    const ownMemberId = ownMember?.id;
    const personalWallets: Row[] = ownMemberId ? ((walletsQ.data || []) as Row[]).filter(w => w.member_id === ownMemberId) : [];
    const ownTeamWallets: Row[] = ownMember?.team_id ? ((walletsQ.data || []) as Row[]).filter(w => w.team_id === ownMember.team_id) : [];
    const walletIds = [...personalWallets, ...ownTeamWallets].map(w => w.id);
    let ledgerEntries: Row[] = [];
    if (isFinancialPage && walletIds.length) {
      const le = await supabase.from("economy_entries").select("id,transaction_id,account_id,entry_side,amount,created_at").in("account_id", walletIds).order("created_at", { ascending: false }).limit(150);
      if (le.error) setNotice(le.error.message);
      ledgerEntries = (le.data || []) as Row[];
    }
    setData({
      seasons, activeSeason, teams: teamsQ.data || [], members: membersWithAvatars,
      divisions, activeDivisions, rounds, activeRounds,
      roundPoints: roundPointsQ.data || [], finalStandings: finalQ.data || [], registrations: registrationsQ.data || [],
      raceResults: raceResultsQ.data || [], resultEntries: resultEntriesQ.data || [], teamProfiles: teamProfilesQ.data || [],
      attributes: attributesQ.data || [], achievements: achievementsQ.data || [], engines: enginesQ.data || [], teamEngines,
      announcements: announcementsQ.data || [], regulations: regulationsQ.data || [], adverts: advertsQ.data || [],
      appeals: appealsQ.data || [], fines: finesQ.data || [], contracts: contractsQ.data || [],
      transactions: transactionsQ.data || [],
      periods: (periodsQ.data || []).filter((x: Row) => x.season_id === activeSeason?.id),
      periodMappings: periodMappingsQ.data || [], personalWallets, ownTeamWallets, ledgerEntries, activeRoundIds,
      fanPopulations: fanPopulationsQ.data || [], driverReputations: driverReputationQ.data || [],
      sponsorshipContracts: sponsorshipContractsQ.data || [], sponsors: sponsorsQ.data || []
    });
    setLoading(false);
  }, [session.user.id, queryPlan]);

  useEffect(() => { void refresh(); }, [refresh]);

  const teams = data.teams || [];
  const members = data.members || [];
  const teamOf = (id?: string | null) => teams.find((x: Row) => x.id === id);
  const memberOf = (id?: string | null) => members.find((x: Row) => x.id === id);
  const teamProfile = (id?: string | null) => (data.teamProfiles || []).find((x: Row) => x.team_id === id);
  const activeTeamId = member?.team_id || null;
  const ownTeam = teamOf(activeTeamId);
  const divisionFilter = tab === "caleris-premio" ? "premio" : tab === "caleris-zwei" ? "zwei" : "";
  const inDivision = (teamId?: string | null) => {
    if (!divisionFilter) return true;
    return String(teamOf(teamId)?.division_key || "").toLowerCase().includes(divisionFilter);
  };
  const scopedRoundIds = (data.activeRounds || []).filter((r: Row) => !divisionFilter || String((data.activeDivisions || []).find((d: Row) => d.id === r.season_division_id)?.division_key || "").toLowerCase().includes(divisionFilter)).map((r: Row) => r.id);
  const roundPoints = useMemo(() => {
    const map = new Map<string, number>();
    (data.roundPoints || []).forEach((r: Row) => {
      if (scopedRoundIds.includes(r.round_id)) map.set(r.member_id, (map.get(r.member_id) || 0) + Number(r.points_total || 0));
    });
    if (!map.size) (data.finalStandings || []).filter((r: Row) => (data.activeDivisions || []).some((d: Row) => d.id === r.season_division_id)).forEach((r: Row) => map.set(r.member_id, Number(r.final_points || 0)));
    return map;
  }, [data.roundPoints, data.finalStandings, data.activeDivisions, scopedRoundIds]);
  const driverRows = useMemo(() => members.filter((m: Row) => m.role === "Driver" && inDivision(m.team_id)).map((m: Row) => ({
    ...m, avatar_url: m.avatar_url || null, points: roundPoints.get(m.id) || 0, team: teamOf(m.team_id), profile: teamProfile(m.team_id),
    wins: (data.raceResults || []).filter((r: Row) => r.winner_member_id === m.id && (data.activeRoundIds || []).includes(r.round_id)).length,
    poles: (data.raceResults || []).filter((r: Row) => r.pole_member_id === m.id && (data.activeRoundIds || []).includes(r.round_id)).length,
    finishes: (data.resultEntries || []).filter((r: Row) => r.member_id === m.id && r.finish_status === "finished" && (data.activeRoundIds || []).includes(r.round_id)).length,
    dnf: (data.resultEntries || []).filter((r: Row) => r.member_id === m.id && r.finish_status === "dnf" && (data.activeRoundIds || []).includes(r.round_id)).length
  })).sort((a: Row, b: Row) => b.points - a.points || a.wins - b.wins), [members, data, roundPoints, divisionFilter, scopedRoundIds]);
  // Constructor points sum each round's awarded points, attributed to the team snapshot on the official result entry.
  const teamSeasonPoints = (teamId: string) => {
    const team = teamOf(teamId);
    if (!team) return 0;
    return (data.roundPoints || []).reduce((total: number, row: Row) => {
      if (!(data.activeRoundIds || []).includes(row.round_id)) return total;
      const round = (data.rounds || []).find((item: Row) => item.id === row.round_id);
      const division = (data.activeDivisions || []).find((item: Row) => item.id === round?.season_division_id);
      if (!division || String(division.division_key).toLowerCase() !== String(team.division_key || "").toLowerCase()) return total;
      const entry = (data.resultEntries || []).find((item: Row) => item.round_id === row.round_id && item.member_id === row.member_id);
      return total + (entry?.team_id === teamId ? Number(row.points_total || 0) : 0);
    }, 0);
  };
  const teamRows = useMemo(() => teams.filter((t: Row) => !divisionFilter || String(t.division_key || "").toLowerCase().includes(divisionFilter)).map((t: Row) => {
    const drivers = driverRows.filter((d: Row) => d.team_id === t.id);
    const entries = (data.resultEntries || []).filter((e: Row) => e.team_id === t.id && (data.activeRoundIds || []).includes(e.round_id));
    const points = teamSeasonPoints(t.id);
    const teamWins = (data.raceResults || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id) && entries.some((e: Row) => e.round_id === r.round_id && e.member_id === r.winner_member_id)).length;
    const teamPoles = (data.raceResults || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id) && entries.some((e: Row) => e.round_id === r.round_id && e.member_id === r.pole_member_id)).length;
    const finished = entries.filter((e: Row) => e.finish_status === "finished" && Number(e.finishing_position) > 0);
    return { ...t, profile: teamProfile(t.id), drivers, points, wins: teamWins, poles: teamPoles,
      podiums: finished.filter((e: Row) => Number(e.finishing_position) <= 3).length,
      fastestLaps: (data.raceResults || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id) && entries.some((e: Row) => e.round_id === r.round_id && e.member_id === r.fastest_lap_member_id)).length,
      finishes: finished.length, dnf: entries.filter((e: Row) => e.finish_status === "dnf").length };
  }).sort((a: Row, b: Row) => b.points - a.points), [teams, driverRows, divisionFilter, data]);
  const engineRows = useMemo(() => {
    const map = new Map<string, Row>();
    teamRows.forEach((t: Row) => {
      const assignment = (data.teamEngines || []).find((x: Row) => x.team_id === t.id);
      if (!assignment) return;
      const engineId = assignment.engine_id;
      const current = map.get(engineId) || { id: engineId, name: assignment.caleris_engines?.name || "Engine", teams: [], points: 0 };
      current.teams.push(t.name); current.points += t.points; map.set(engineId, current);
    });
    return [...map.values()].sort((a: Row, b: Row) => b.points - a.points);
  }, [teamRows, data.teamEngines]);
  const stats = useMemo(() => ({
    wins: (data.raceResults || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id)).length,
    poles: (data.raceResults || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id) && r.pole_member_id).length,
    finishes: (data.resultEntries || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id) && r.finish_status === "finished").length,
    dnf: (data.resultEntries || []).filter((r: Row) => (data.activeRoundIds || []).includes(r.round_id) && r.finish_status === "dnf").length
  }), [data, scopedRoundIds]);
  const activeSeasonId = data.activeSeason?.id;
  const debutants = useMemo(() => {
    const all = data.registrations || [];
    const seasonDates = new Map<string, string>((data.seasons || []).map((s: Row) => [s.id, s.starts_on || ""] as [string, string]));
    return driverRows.filter((d: Row) => {
      const seasons = all.filter((r: Row) => r.member_id === d.id && !r.is_hiatus).map((r: Row) => seasonDates.get(r.season_id) || "").filter(Boolean).sort();
      return seasons.length > 0 && seasons[0] === (data.activeSeason?.starts_on || "");
    }).sort((a: Row, b: Row) => b.points - a.points);
  }, [driverRows, data.registrations, data.seasons, data.activeSeason]);

  const careerStandings = (data.finalStandings || []).filter((r: Row) => r.member_id === member?.id).map((r: Row) => {
    const div = (data.divisions || []).find((d: Row) => d.id === r.season_division_id);
    const season = (data.seasons || []).find((s: Row) => s.id === div?.season_id);
    const contract = (data.contracts || []).find((c: Row) => c.member_id === member?.id && c.season_id === div?.season_id);
    return { ...r, division: div?.division_name, season: season?.title, team: { id: r.team_id_snapshot || contract?.team_id || null, name: r.team_name_snapshot || teamOf(r.team_id_snapshot || contract?.team_id)?.name || null }, contract };
  }).sort((a: Row, b: Row) => String(b.season || "").localeCompare(String(a.season || "")));
  const driverRaceHistory = (data.resultEntries || []).filter((r: Row) => r.member_id === member?.id).map((r: Row) => {
    const round = (data.rounds || []).find((x: Row) => x.id === r.round_id);
    const division = (data.divisions || []).find((x: Row) => x.id === round?.season_division_id);
    const season = (data.seasons || []).find((x: Row) => x.id === division?.season_id);
    return { ...r, round, division, season };
  }).sort((a: Row,b: Row) => String(b.season?.starts_on||"").localeCompare(String(a.season?.starts_on||"")) || Number(b.round?.round_number||0)-Number(a.round?.round_number||0));
  const racePointDeltas = (() => { const previous=new Map<string,number>(); const ordered=(data.roundPoints||[]).map((row:Row)=>({...row,round:(data.rounds||[]).find((r:Row)=>r.id===row.round_id)})).filter((row:Row)=>row.round).sort((a:Row,b:Row)=>String(a.round.season_division_id).localeCompare(String(b.round.season_division_id))||Number(a.round.round_number)-Number(b.round.round_number)); return ordered.map((row:Row)=>{const key=String(row.round.season_division_id)+":"+String(row.member_id);const current=Number(row.points_total||0);const delta=current-(previous.get(key)||0);previous.set(key,current);const entry=(data.resultEntries||[]).find((e:Row)=>e.round_id===row.round_id&&e.member_id===row.member_id);return {member_id:row.member_id,team_id:entry?.team_id||null,points:delta};}); })();
  const driverCareerStats = (() => { const entries=(data.resultEntries||[]).filter((r: Row)=>r.member_id===member?.id); const results=data.raceResults||[]; const finishes=entries.filter((r: Row)=>r.finish_status==="finished"&&Number(r.finishing_position)>0); const points=racePointDeltas.filter((r:Row)=>r.member_id===member?.id).reduce((n:number,r:Row)=>n+Number(r.points||0),0); return {points,wins:results.filter((r:Row)=>r.winner_member_id===member?.id).length,poles:results.filter((r:Row)=>r.pole_member_id===member?.id).length,podium:finishes.filter((r:Row)=>Number(r.finishing_position)<=3).length,fastestLaps:results.filter((r:Row)=>r.fastest_lap_member_id===member?.id).length,dotd:results.filter((r:Row)=>r.driver_of_day_member_id===member?.id).length,completed:finishes.length,gained:finishes.reduce((n:number,r:Row)=>n+Number(r.grid_position||r.finishing_position)-Number(r.finishing_position),0),average:finishes.length?finishes.reduce((n:number,r:Row)=>n+Number(r.finishing_position),0)/finishes.length:0,ppr:finishes.length?points/finishes.length:0,dnf:entries.filter((r:Row)=>r.finish_status==="dnf").length}; })();
  const ownFines = (data.fines || []).filter((f: Row) => isDriver ? f.target_kind === "member" && f.target_member_id === member?.id : f.target_kind === "team" && f.target_team_id === activeTeamId);
  const ownAppeals = (data.appeals || []).filter((a: Row) => isDriver ? a.target_kind === "member" && a.target_member_id === member?.id : a.target_kind === "team" && a.target_team_id === activeTeamId);
  const ownContracts = (data.contracts || []).filter((c: Row) => isDriver ? c.member_id === member?.id : c.team_id === activeTeamId);
  const activeContract = ownContracts.find((c: Row) => c.status === "active" && (!activeSeasonId || c.season_id === activeSeasonId)) || ownContracts[0];
  const ownWallets = isDriver ? (data.personalWallets || []) : (data.ownTeamWallets || []);
  const walletTotal = ownWallets.reduce((n: number, w: Row) => n + Number(w.balance || 0), 0);
  const transactionById = new Map<string, Row>((data.transactions || []).map((t: Row) => [t.id, t] as [string, Row]));
  const financialRows = (data.ledgerEntries || []).map((entry: Row) => {
    const transaction: any = transactionById.get(entry.transaction_id);
    return { ...entry, transaction, incoming: entry.entry_side === "inflow" };
  }).sort((a: Row, b: Row) => String(b.created_at).localeCompare(String(a.created_at)));
  const ownAttributes = (data.attributes || []).find((x: Row) => x.member_id === member?.id)?.attributes || {};
  const ownFanTotal = (data.fanPopulations || []).filter((x: Row) => x.member_id === member?.id).reduce((sum: number, x: Row) => sum + Number(x.population || 0), 0);
  const ownReputation = (data.driverReputations || []).find((x: Row) => x.member_id === member?.id) || null;
  const ownAchievements = (data.achievements || []).filter((x: Row) => isDriver ? x.target_kind === "member" && x.member_id === member?.id : x.target_kind === "team" && x.team_id === activeTeamId);

  const submit = async (e: FormEvent, action: () => Promise<void>) => { e.preventDefault(); if (saving) return; setSaving(true); setNotice(""); try { await action(); } catch (err: any) { setNotice(err?.message || "Terjadi kesalahan."); } finally { setSaving(false); } };
  const publishJob = async (e: FormEvent) => submit(e, async () => {
    const selectedTeamId = isAdmin ? String(form.team_id || activeTeamId || "") : String(activeTeamId || "");
    const selectedTeam = teamOf(selectedTeamId);
    if (!supabase || !selectedTeamId || !selectedTeam || (!isAdmin && member?.role !== "Owner")) throw new Error("Pilih tim yang valid untuk lowongan.");
    const title = String(form.title || "").trim(), description = String(form.description || "").trim();
    if (!title || !description) throw new Error("Judul dan deskripsi wajib diisi.");
    const { error } = await supabase.from("caleris_job_adverts").insert({ team_id: selectedTeamId, season_id: activeSeasonId || null, division_key: selectedTeam.division_key, title, description, position_kind: String(form.position_kind || "Driver"), minimum_license: String(form.position_kind || "Driver") === "Driver" ? String(form.minimum_license || "").trim() || null : null, salary_min: form.salary_min === "" || form.salary_min == null ? null : Number(form.salary_min), salary_max: form.salary_max === "" || form.salary_max == null ? null : Number(form.salary_max), requirements: String(form.requirements || "").trim() || null, open_seats: Math.max(1, Number(form.open_seats || 1)), available_from: form.available_from || null, status: "published", created_by: session.user.id });
    if (error) throw error; setForm({}); await refresh(); setNotice("Lowongan berhasil dipublikasikan ke Job Search.");
  });
  const sendAppeal = async (e: FormEvent) => submit(e, async () => {
    if (!supabase || !form.fine_id) throw new Error("Pilih keputusan sanksi yang akan diajukan banding.");
    const fine = ownFines.find((f: Row) => f.id === form.fine_id);
    if (!fine) throw new Error("Sanksi tidak ditemukan atau bukan milik akun/tim ini.");
    const payload = { fine_id: fine.id, target_kind: fine.target_kind, target_member_id: fine.target_member_id, target_team_id: fine.target_team_id, appeal_statement: String(form.appeal_statement || "").trim(), status: "pending", submitted_by: session.user.id };
    if (!payload.appeal_statement) throw new Error("Alasan banding wajib diisi.");
    const { error } = await supabase.from("caleris_appeals").insert(payload);
    if (error) throw error; setForm({}); await refresh(); setNotice("Banding terkirim ke FIA Appeal Room.");
  });
  const registerDriver = async (e: FormEvent) => submit(e, async () => {
    if (!supabase || !form.driver_id || !form.season_division_id) throw new Error("Pilih season/divisi dan driver.");
    const { error } = await supabase.rpc("member_register_driver_for_season", { p_season_division_id: form.season_division_id, p_driver_member_id: form.driver_id });
    if (error) throw error; setForm({}); await refresh(); setNotice("Driver berhasil didaftarkan untuk season tujuan.");
  });
  const publishAnnouncement = async (e: FormEvent) => submit(e, async () => {
    if (!supabase) return;
    const title = String(form.title || "").trim(), body = String(form.body || "").trim();
    if (!title || !body) throw new Error("Judul dan isi pengumuman wajib diisi.");
    const { error } = await supabase.from("caleris_announcements").insert({ title, body, category: form.category || "general", division_key: form.division_key || null, season_id: form.season_id || null, is_published: true, published_at: new Date().toISOString(), created_by: session.user.id });
    if (error) throw error; const broadcast = await broadcastNewsroomArticle(title, body, "official_bulletin"); setForm({}); await refresh(); setNotice(broadcast.sent ? "Pengumuman terbit dan otomatis dikirim ke Discord melalui Vreeo Pedia." : "Pengumuman terbit. Notifikasi Discord belum terkirim: " + (broadcast.error?.message || "integrasi belum dikonfigurasi."));
  });
  const publishRegulation = async (e: FormEvent) => submit(e, async () => {
    if (!supabase) return;
    const title = String(form.title || "").trim(), body = String(form.body || "").trim();
    if (!title || !body) throw new Error("Judul dan isi regulasi wajib diisi.");
    const scope = form.scope_kind || "permanent";
    if (scope === "seasonal" && !form.season_id) throw new Error("Pilih season untuk regulasi seasonal.");
    const { error } = await supabase.rpc("fia_publish_regulation", { p_title: title, p_body: body, p_scope_kind: scope, p_division_key: form.division_key || null, p_season_id: scope === "seasonal" ? form.season_id : null, p_version_label: String(form.version_label || "").trim() || null });
    if (error) throw error; const broadcast = await broadcastNewsroomArticle(title, body, "regulation_update"); setForm({}); await refresh(); setNotice(broadcast.sent ? "Regulasi terbit dan otomatis dikirim ke Discord melalui Vreeo Pedia." : "Regulasi terbit. Notifikasi Discord belum terkirim: " + (broadcast.error?.message || "integrasi belum dikonfigurasi."));
  });
  const decideAppeal = async (id: string, approve: boolean) => {
    if (!supabase || saving) return; setSaving(true); setNotice("");
    const { error } = await supabase.rpc("fia_decide_appeal", { p_appeal_id: id, p_approve: approve, p_decision: String(form.decision || "").trim() });
    setSaving(false); if (error) setNotice(error.message); else { setForm({}); await refresh(); setNotice("Keputusan banding berhasil dicatat."); }
  };

  const heading = (eyebrow: string, title: string, desc: string) => <><header className="page-heading"><span className="section-eyebrow">{eyebrow}</span><h1 className="page-title">{title}</h1><p className="page-description">{desc}</p></header>{notice&&<div className="s5-notice" role="status">{notice}</div>}</>;
  const standingsRows = driverRows.map((d: Row, i: number) => [<b className="s5-rank">{i + 1}</b>, <span className="s5-driver"><b>{d.character_name || "Driver"}</b><small>{d.license || "No licence"}</small></span>, <span className="s5-team-cell">{d.profile?.logo_url && <img src={d.profile.logo_url} alt="" />}<span>{d.team?.name || "Independent"}</span></span>, <strong>{d.points.toLocaleString("id-ID")}</strong>]);
  const teamStandingsRows = teamRows.map((t: Row, i: number) => [<b className="s5-rank">{i + 1}</b>, <span className="s5-team-cell">{t.profile?.logo_url && <img src={t.profile.logo_url} alt="" />}<span>{t.name}</span></span>, <strong>{t.points.toLocaleString("id-ID")}</strong>]);
  const statTiles = [["RACE WIN", stats.wins, Trophy], ["POLE", stats.poles, Flag], ["FINISH", stats.finishes, CheckCircle2], ["DNF", stats.dnf, Activity]] as const;
  const engineRankingRows = engineRows.map((e: Row, i: number) => [i + 1, e.name, e.teams.join(", "), e.points.toLocaleString("id-ID")]);
  const filteredFines = ownFines.filter((f: Row) => !ownAppeals.some((a: Row) => a.fine_id === f.id && a.status === "pending"));

  if (!((isMain && ["global", "caleris-premio", "caleris-zwei", "fia-announcement", "job-search", "regulation", "hall-of-fame", "archive"].includes(tab)) ||
    (isDriver && ["character", "career-history", "financial-centre", "appeal"].includes(tab)) ||
    (isTeam && ["team-summary", "driver-registration", "scout", "place-job-advert", "appeal"].includes(tab)) ||
    (isFia && ["event-control", "rules-input", "announcement-input", "appeal-room"].includes(tab)))) return <>{fallback}</>;
  if (loading) return <section className="workspace s5-workspace">{heading("CALERIS MASTERS", "Memuat panel...", "Menghubungkan panel ke data kompetisi dan ekonomi.")}<div className="s5-loading"><Activity className="s5-pulse"/> Memuat data Supabase...</div></section>;

  if (isFia && tab === "event-control") return <section className="workspace s5-workspace">{heading("FIA PANEL · EVENT CONTROL", "Event Control", "Kontrol data kompetisi dan operasional resmi CALERIS MASTERS.")}<FiaDataExport isAdmin={isAdmin} isFia={isFia}/></section>;

  if (isDriver && tab === "character") {
    const team = teamOf(member?.team_id);
    const statsAll = driverCareerStats;
    return <section className="workspace s5-workspace">{heading("DRIVER PANEL · CHARACTER", "Character", "Profil lengkap karakter, kontrak, performa, atribut, dan achievement.")}{!member ? <Empty>Akun ini belum terhubung ke data Driver.</Empty> : <>
      <div className="s5-hero"><div className="s5-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar driver"/> : <span>{(member.character_name || "D").slice(0, 1)}</span>}</div><div className="s5-hero-copy"><span>OFFICIAL DRIVER PROFILE</span><h2>{member.character_name || "Driver"}</h2><p>{team?.name || "No team"} · {labelDivision(team?.division_key)}</p><small>{profile?.nationality || profile?.hometown || "Asal belum diatur"} · {ageOf(profile?.date_of_birth)}</small></div><div className="s5-wallet-chip"><Wallet size={16}/><span>{money((data.personalWallets || []).reduce((n: number, w: Row) => n + Number(w.balance || 0), 0))}</span></div></div>
      <div className="s5-grid s5-grid-4">{[["POINTS",statsAll.points],["WINS",statsAll.wins],["POLES",statsAll.poles],["PODIUM",statsAll.podium],["FASTEST LAPS",statsAll.fastestLaps],["DRIVER OF THE DAY",statsAll.dotd],["COMPLETED RACES",statsAll.completed],["GAINED POSITIONS",statsAll.gained],["AVERAGE POSITION",statsAll.average?statsAll.average.toFixed(2):"—"],["POINTS / RACE",statsAll.ppr.toFixed(2)],["DNF",statsAll.dnf],["TOTAL FANS",ownFanTotal.toLocaleString("id-ID")],["REPUTATION",ownReputation?Number(ownReputation.score).toLocaleString("id-ID"):"Belum dihitung"]].map(([k,v])=><div className="s5-stat" key={k as string}><span>{k}</span><strong>{v as string|number}</strong>{k==="REPUTATION"&&ownReputation?.band&&<small>{ownReputation.band}</small>}</div>)}</div>
      {(() => {
        const metrics=ownReputation?.metrics||{};
        const formScore=Number.isFinite(Number(metrics.form))&&metrics.form!==null?Math.round(Number(metrics.form)):null;
        const moraleScore=Number.isFinite(Number(metrics.morale))&&metrics.morale!==null?Math.round(Number(metrics.morale)):null;
        const confidenceScore=Number.isFinite(Number(metrics.confidence))&&metrics.confidence!==null?Math.round(Number(metrics.confidence)):null;
        const label=(score:number|null)=>score===null?"Menunggu hasil":score>=75?"Strong":score>=50?"Stable":"Needs attention";
        return <Card title="Form, Morale & Confidence" eyebrow="REPUTATION SIGNALS">
          <div className="s5-grid s5-grid-3">
            <div className="s5-stat"><span>FORM</span><strong>{label(formScore)}</strong><small>{formScore===null?"Menunggu race dipublikasikan":formScore+"/100"}</small></div>
            <div className="s5-stat"><span>MORALE</span><strong>{label(moraleScore)}</strong><small>{moraleScore===null?"Menunggu perhitungan reputasi":moraleScore+"/100"}</small></div>
            <div className="s5-stat"><span>CONFIDENCE</span><strong>{label(confidenceScore)}</strong><small>{confidenceScore===null?"Menunggu perhitungan reputasi":confidenceScore+"/100"}</small></div>
          </div>
          <p className="s5-footnote">Ketiga indikator dihitung otomatis setelah hasil race dipublikasikan dan memengaruhi skor reputasi Driver. Tidak ada pengaruh ke race engine atau atribut permanen.</p>
        </Card>;
      })()}
      <div className="s5-grid s5-grid-2"><Card title="Contract & Salary" eyebrow="CURRENT SEASON"><dl className="s5-dl"><dt>Team</dt><dd>{team?.name || "Belum ada tim"}</dd><dt>License</dt><dd>{member.license || "Belum ditetapkan"}</dd><dt>Status</dt><dd>{activeContract?.status || "Belum ada kontrak"}</dd><dt>Annual salary</dt><dd>{activeContract ? money(Number(activeContract.annual_salary || 0)) : "—"}</dd><dt>Season</dt><dd>{(data.seasons || []).find((s: Row) => s.id === activeContract?.season_id)?.title || "—"}</dd><dt>Contract term</dt><dd>{ownContracts.filter((c: Row) => c.status === "active").length || "—"} season(s)</dd></dl></Card><Card title="Driver Attributes" eyebrow="ATTRIBUTE PROFILE · TAP TO VIEW CHART" onClick={() => setAttributeModalOpen(true)}><div className="s5-attribute-summary">{Object.entries(ownAttributes).map(([key, value])=><div key={key}><span>{key.replaceAll("_"," ")}</span><strong>{String(value)}</strong></div>)}</div></Card></div>
      {attributeModalOpen && <div className="s5-attribute-modal-backdrop" onClick={() => setAttributeModalOpen(false)}><section className="s5-attribute-modal" role="dialog" aria-modal="true" aria-labelledby="s5-attribute-modal-title" onClick={e => e.stopPropagation()}><div className="s5-attribute-modal-head"><div><span>ATTRIBUTE PROFILE</span><h2 id="s5-attribute-modal-title">Driver Attributes Chart</h2></div><button type="button" className="s5-secondary" onClick={() => setAttributeModalOpen(false)}>Close</button></div><div className="s5-attributes">{Object.entries(ownAttributes).map(([key, value])=><div key={key}><span>{key.replaceAll("_"," ")}</span><i><b style={{width: Math.max(0,Math.min(100,Number(value)))+"%"}}/></i><strong>{String(value)}</strong></div>)}</div></section></div>}
      <Card title="Race History" eyebrow="OFFICIAL CLASSIFICATION"><Table headers={["Season","Round","Division","Team","Result","Status"]} rows={driverRaceHistory.map((r: Row)=>[r.season?.title||"Season",r.round?.title||("R"+r.round?.round_number),r.division?.division_name||"Division",r.team_name_snapshot||teamOf(r.team_id)?.name||"—",r.finishing_position?"P"+r.finishing_position:"—",r.finish_status.toUpperCase()])}/></Card><Card title="Season History" eyebrow="CAREER RECORD"><Table headers={["Season","Team","Division","Final Position","Points","Title"]} rows={careerStandings.map((r: Row)=>[r.season || "Season",r.team?.name || "—",r.division || "Division","#"+r.final_position,Number(r.final_points||0).toLocaleString("id-ID"),r.final_position===1?"WDC":"—"])}/></Card>
      <Card title="Achievements" eyebrow="HALL OF FAME">{ownAchievements.length ? <div className="s5-achievements">{ownAchievements.map((a: Row)=><article key={a.id}><Medal/><div><b>{a.title}</b><small>{a.description || "Official Caleris achievement"} · {dateLabel(a.awarded_at)}</small></div></article>)}</div> : <Empty>Belum ada achievement yang diberikan.</Empty>}</Card>
    </>}</section>;
  }

  if (isDriver && tab === "career-history") {
    const raceStats = driverCareerStats;
    const completedHistory = driverRaceHistory.filter((r:Row)=>r.finish_status==="finished"&&Number(r.finishing_position)>0);
    const gridHistory = completedHistory.filter((r:Row)=>Number(r.grid_position)>0);
    const averageGrid = gridHistory.length ? gridHistory.reduce((n:number,r:Row)=>n+Number(r.grid_position),0)/gridHistory.length : 0;
    const averageFinish = completedHistory.length ? completedHistory.reduce((n:number,r:Row)=>n+Number(r.finishing_position),0)/completedHistory.length : 0;
    const finishRate = driverRaceHistory.length ? completedHistory.length/driverRaceHistory.length*100 : 0;
    const recentHistory = driverRaceHistory.slice(0,5);
    const teammateHeadToHead = driverRaceHistory.reduce((score:{wins:number;losses:number},own:Row)=>{
      const teammates=(data.resultEntries||[]).filter((entry:Row)=>entry.round_id===own.round_id&&entry.team_id===own.team_id&&entry.member_id!==member?.id&&entry.finish_status==="finished"&&own.finish_status==="finished"&&Number(entry.finishing_position)>0&&Number(own.finishing_position)>0);
      if(!teammates.length)return score;
      const best=Math.min(...teammates.map((entry:Row)=>Number(entry.finishing_position)));
      if(Number(own.finishing_position)<best)score.wins++;
      else if(Number(own.finishing_position)>best)score.losses++;
      return score;
    },{wins:0,losses:0});
    return <section className="workspace s5-workspace">{heading("DRIVER PANEL · CAREER", "Career History", "Rekam jejak setiap season dan statistik sepanjang masa.")}<div className="s5-grid s5-grid-4">{[["SEASONS",careerStandings.length],["POINTS",raceStats.points],["WINS",raceStats.wins],["POLES",raceStats.poles],["PODIUM",raceStats.podium],["FASTEST LAPS",raceStats.fastestLaps],["DRIVER OF THE DAY",raceStats.dotd],["COMPLETED RACES",raceStats.completed],["GAINED POSITIONS",raceStats.gained],["AVERAGE POSITION",raceStats.average?raceStats.average.toFixed(2):"—"],["POINTS / RACE",raceStats.ppr.toFixed(2)],["DNF",raceStats.dnf]].map(([k,v])=><div className="s5-stat" key={k as string}><span>{k}</span><strong>{v as string|number}</strong></div>)}</div><Card title="Career Timeline" eyebrow="ALL SEASONS"><Table headers={["Season","Team","Division","Final Position","Points","Title"]} rows={careerStandings.map((r: Row)=>[r.season||"Season",r.team?.name||"—",r.division||"—","#"+r.final_position,Number(r.final_points||0).toLocaleString("id-ID"),r.final_position===1?"WDC":"—"])}/></Card><Card title="Performance Intelligence" eyebrow="OFFICIAL RACE DATA"><div className="s5-grid s5-grid-4">{[["AVERAGE GRID",averageGrid?averageGrid.toFixed(2):"—"],["AVERAGE FINISH",averageFinish?averageFinish.toFixed(2):"—"],["FINISH RATE",finishRate.toFixed(1)+"%"],["TEAMMATE H2H",teammateHeadToHead.wins+"W · "+teammateHeadToHead.losses+"L"]].map(([k,v])=><div className="s5-stat" key={k as string}><span>{k}</span><strong>{v as string}</strong></div>)}</div><Table headers={["Recent round","Team snapshot","Grid","Finish","Status"]} rows={recentHistory.map((r:Row)=>[r.round?.title||("R"+r.round?.round_number),r.team_name_snapshot||"—",r.grid_position? "P"+r.grid_position:"—",r.finishing_position?"P"+r.finishing_position:"—",String(r.finish_status||"").toUpperCase()])}/><p className="s5-footnote">Analisis dihitung dari klasifikasi resmi yang tersimpan. Data yang tidak tersedia tidak direkonstruksi.</p></Card><Card title="Lifetime Statistics" eyebrow="OFFICIAL RECORD"><div className="s5-grid s5-grid-4">{[["Race Win",raceStats.wins],["Pole",raceStats.poles],["Finish",raceStats.completed],["DNF",raceStats.dnf]].map(([k,v])=><div className="s5-stat" key={k as string}><span>{k}</span><strong>{v as number}</strong></div>)}</div><p className="s5-footnote">Finish dan DNF dihitung dari klasifikasi detail yang dicatat FIA. Data sebelum klasifikasi detail tersedia tidak direkonstruksi.</p></Card></section>;
  }

  if ((isDriver || isTeam) && tab === "financial-centre") {
    return <section className="workspace s5-workspace">{heading("FINANCIAL CENTRE", "Financial Centre", "Saldo wallet, cashflow, dan rincian seluruh transaksi yang dapat diakses akun ini.")}<div className="s5-grid s5-grid-3"><div className="s5-stat s5-stat-wide"><span>TOTAL WALLET BALANCE</span><strong>{money(walletTotal)}</strong></div><div className="s5-stat"><span>INFLOW</span><strong>{money(financialRows.filter((x: Row)=>x.incoming).reduce((n:number,x:Row)=>n+Number(x.amount||0),0))}</strong></div><div className="s5-stat"><span>OUTFLOW</span><strong>{money(financialRows.filter((x: Row)=>!x.incoming).reduce((n:number,x:Row)=>n+Number(x.amount||0),0))}</strong></div></div><Card title="Wallet Accounts" eyebrow="BALANCE BREAKDOWN"><Table headers={["Wallet","Balance"]} rows={ownWallets.map((w: Row)=>[w.account_kind==="driver"?"Driver Wallet":w.account_kind==="team"?"Team Wallet":w.account_kind,w.balance ? money(Number(w.balance)) : money(0)])}/></Card><Card title="Cashflow Ledger" eyebrow="LATEST 150 ENTRIES"><Table headers={["Date","Description","Direction","Amount"]} rows={financialRows.map((x: Row)=>[new Date(x.created_at).toLocaleString("id-ID"),x.transaction?.description || x.transaction?.event_type || "Wallet transaction",x.incoming?"IN":"OUT",(x.incoming?"+":"−")+money(Number(x.amount||0))])}/></Card></section>;
  }


  if ((isDriver || isTeam) && tab === "appeal") {
    if (isTeam && member?.role !== "Owner") return <section className="workspace s5-workspace">{heading("TEAM PANEL", "Appeal", "Pengajuan banding atas sanksi tim.")}<Empty>Hanya Team Owner yang dapat mengirim banding untuk tim.</Empty></section>;
    return <section className="workspace s5-workspace">{heading(isDriver?"DRIVER PANEL · FIA":"TEAM PANEL · FIA","Appeal","Ajukan banding atas sanksi resmi yang tercatat untuk akun atau tim ini.")}<Card title="Submit Appeal" eyebrow="FORMAL REVIEW">{filteredFines.length ? <form className="s5-form" onSubmit={sendAppeal}><Field label="Punishment"><select value={form.fine_id||""} onChange={e=>set("fine_id",e.target.value)} required><option value="">Pilih sanksi</option>{filteredFines.map((f: Row)=><option key={f.id} value={f.id}>{money(Number(f.amount))} · {f.reason}</option>)}</select></Field><Field label="Appeal statement"><textarea rows={5} maxLength={3000} value={form.appeal_statement||""} onChange={e=>set("appeal_statement",e.target.value)} required placeholder="Jelaskan alasan dan dasar banding."/></Field><button className="s5-primary" disabled={saving}>{saving?"Mengirim...":"Kirim banding ke FIA"}</button></form> : <Empty>Tidak ada sanksi yang tersedia untuk diajukan banding, atau seluruh sanksi sudah memiliki banding aktif.</Empty>}</Card><Card title="Appeal History" eyebrow="SUBMISSION STATUS"><Table headers={["Submitted","Punishment","Status","FIA Decision"]} rows={ownAppeals.map((a: Row)=>[dateLabel(a.submitted_at),money(Number((data.fines||[]).find((f: Row)=>f.id===a.fine_id)?.amount||0)),a.status.toUpperCase(),a.fia_decision||"Menunggu keputusan"])}/></Card></section>;
  }

  if (isTeam && tab === "team-summary") {
    const tProfile = teamProfile(activeTeamId);
    const drivers = members.filter((m: Row)=>m.team_id===activeTeamId && m.role==="Driver");
    const teamContracts = ownContracts;
    const teamWins = (data.resultEntries||[]).filter((r: Row)=>r.team_id===activeTeamId && r.finish_status==="finished" && r.finishing_position===1).length;
    const teamPoles = (data.raceResults||[]).filter((r: Row)=>(data.resultEntries||[]).some((entry: Row)=>entry.round_id===r.round_id&&entry.member_id===r.pole_member_id&&entry.team_id===activeTeamId)).length;
    const teamFinishes = (data.resultEntries||[]).filter((r: Row)=>r.team_id===activeTeamId && r.finish_status==="finished").length;
    const teamDnfs = (data.resultEntries||[]).filter((r: Row)=>r.team_id===activeTeamId && r.finish_status==="dnf").length;
    const teamFinishedRows = (data.resultEntries||[]).filter((r:Row)=>r.team_id===activeTeamId&&r.finish_status==="finished"&&Number(r.finishing_position)>0);
    const teamPodiums = teamFinishedRows.filter((r:Row)=>Number(r.finishing_position)<=3).length;
    const teamFastestLaps = (data.raceResults||[]).filter((r:Row)=>(data.resultEntries||[]).some((e:Row)=>e.round_id===r.round_id&&e.member_id===r.fastest_lap_member_id&&e.team_id===activeTeamId)).length;
    const teamGained = teamFinishedRows.reduce((n:number,r:Row)=>n+Number(r.grid_position||r.finishing_position)-Number(r.finishing_position),0);
    const teamPoints = teamSeasonPoints(activeTeamId);
    const teamSponsors = (data.sponsorshipContracts||[]).filter((contract: Row)=>contract.target_team_id===activeTeamId && contract.status==="active").map((contract: Row)=>({...contract,sponsor:(data.sponsors||[]).find((s: Row)=>s.id===contract.sponsor_id)})).filter((contract: Row)=>contract.sponsor);
    return <section className="workspace s5-workspace">{heading("TEAM PANEL · IDENTITY", "Team Summary", "Profil resmi tim, susunan driver, sejarah, dan statistik kejuaraan.")}{!ownTeam?<Empty>Akun ini belum terhubung ke tim.</Empty>:<><div className="s5-hero s5-team-brand-hero" style={{background:`linear-gradient(112deg, ${tProfile?.main_color||"#7A263A"}, ${tProfile?.secondary_color||"#C6A33A"})`}}>{tProfile?.logo_url?<img className="s5-team-logo" src={tProfile.logo_url} alt={ownTeam.name+" logo"}/>:<div className="s5-team-logo s5-logo-placeholder">{ownTeam.name.slice(0,1)}</div>}<div className="s5-hero-copy"><span>OFFICIAL TEAM PROFILE</span><h2>{ownTeam.name}</h2><p>{labelDivision(ownTeam.division_key)} · {tProfile?.country_of_origin||tProfile?.base_location||"Origin not set"}</p><small>Founded {tProfile?.founded_year||"—"}</small></div><div className="s5-wallet-chip"><Wallet size={16}/>{money(walletTotal)}</div></div><div className="s5-grid s5-grid-4">{[["POINTS",teamPoints],["WINS",teamWins],["POLES",teamPoles],["PODIUM",teamPodiums],["FASTEST LAPS",teamFastestLaps],["GAINED POSITIONS",teamGained],["COMPLETED RACES",teamFinishes],["DNF",teamDnfs]].map(([k,v])=><div className="s5-stat" key={k as string}><span>{k}</span><strong>{v as number}</strong></div>)}</div><Card title="Team History" eyebrow="OFFICIAL RECORD"><p className="s5-history">{tProfile?.history||"Sejarah tim belum diisi."}</p><dl className="s5-dl"><dt>Founded</dt><dd>{tProfile?.founded_year||"—"}</dd><dt>Country</dt><dd>{tProfile?.country_of_origin||"—"}</dd><dt>Base</dt><dd>{tProfile?.base_location||"—"}</dd><dt>Engine</dt><dd>{(data.teamEngines||[]).find((x: Row)=>x.team_id===activeTeamId)?.caleris_engines?.name||"Belum ditetapkan"}</dd></dl></Card><Card title="Official Sponsors" eyebrow="ACTIVE BRAND PARTNERS"><div className="s5-sponsor-grid">{teamSponsors.length?teamSponsors.map((contract: Row)=><article className="s5-sponsor-card" key={contract.id}>{contract.sponsor.logo_url?<img src={contract.sponsor.logo_url} alt={contract.sponsor.name+" logo"}/>:<span className="s5-sponsor-mark">{String(contract.sponsor.name||"S").slice(0,1)}</span>}<div><strong>{contract.sponsor.name}</strong><small>{contract.sponsor.industry||"Official partner"}</small><b>{money(Number(contract.annual_contract_amount??contract.contract_amount))} / season</b><small>{contract.duration_seasons||1} season · {contract.renewal_status||"Active"}</small></div></article>):<Empty>Belum ada sponsor yang resmi deal dengan tim ini.</Empty>}</div></Card><Card title="Active Drivers" eyebrow="CURRENT LINE-UP"><Table headers={["Driver","Licence","Contract","Annual Salary"]} rows={drivers.map((d: Row)=>{const c=teamContracts.find((x: Row)=>x.member_id===d.id&&x.season_id===activeSeasonId);return [d.character_name||"Driver",d.license||"—",c?.status||"No contract",c?money(Number(c.annual_salary||0)):"—"]})}/></Card><Card title="Driver History" eyebrow="CONTRACT REGISTER"><Table headers={["Driver","Season","Status","Salary"]} rows={teamContracts.map((c: Row)=>[memberOf(c.member_id)?.character_name||"Driver",(data.seasons||[]).find((s: Row)=>s.id===c.season_id)?.title||"Season",c.status,money(Number(c.annual_salary||0))])}/></Card><Card title="Championship History" eyebrow="TEAM TITLES"><Table headers={["Season","Driver","Division","Title"]} rows={teamContracts.filter((contract: Row)=>(data.finalStandings||[]).some((standing: Row)=>standing.member_id===contract.member_id&&standing.final_position===1&&(data.divisions||[]).some((division: Row)=>division.id===standing.season_division_id&&division.season_id===contract.season_id))).map((contract: Row)=>[ (data.seasons||[]).find((s: Row)=>s.id===contract.season_id)?.title||"Season",memberOf(contract.member_id)?.character_name||"Driver",labelDivision(teamOf(contract.team_id)?.division_key),"Team Champion"])}/></Card><Card title="Achievements" eyebrow="TEAM HALL OF FAME">{ownAchievements.length?<div className="s5-achievements">{ownAchievements.map((a: Row)=><article key={a.id}><Medal/><div><b>{a.title}</b><small>{a.description||"Official Caleris achievement"}</small></div></article>)}</div>:<Empty>Belum ada achievement tim.</Empty>}</Card></>}</section>;
  }

  if (isTeam && tab === "driver-registration") {
    if (member?.role !== "Owner") return <section className="workspace s5-workspace">{heading("TEAM PANEL", "Driver Registration", "Pendaftaran season hanya dapat dikirim Team Owner.")}<Empty>Akses Team Owner diperlukan untuk mendaftarkan driver.</Empty></section>;
    const candidates = members.filter((m: Row)=>m.role==="Driver"&&m.team_id===activeTeamId);
    const selectedDivision = (data.divisions||[]).find((d: Row)=>d.id===form.season_division_id);
    const targetSeasonId = selectedDivision?.season_id;
    const eligibleContracts = (data.contracts||[]).filter((c: Row)=>c.team_id===activeTeamId&&c.status==="active"&&c.season_id===targetSeasonId);
    const contractedIds = new Set(eligibleContracts.map((c: Row)=>c.member_id));
    const unregistered = candidates.filter((d: Row)=>contractedIds.has(d.id)&&!(data.registrations||[]).some((r: Row)=>r.season_id===targetSeasonId&&r.member_id===d.id));
    return <section className="workspace s5-workspace">{heading("TEAM PANEL · SEASON ENTRY", "Driver Registration", "Daftarkan driver yang memiliki kontrak aktif untuk season berikutnya selama Off Season.")}<Card title="Season Registration" eyebrow="OFF-SEASON SUBMISSION"><form className="s5-form" onSubmit={registerDriver}><Field label="Season / Division"><select value={form.season_division_id||""} onChange={e=>{set("season_division_id",e.target.value);set("driver_id","");}} required><option value="">Pilih divisi season</option>{(data.divisions||[]).map((d: Row)=><option key={d.id} value={d.id}>{(data.seasons||[]).find((s: Row)=>s.id===d.season_id)?.title||"Season"} · {d.division_name}</option>)}</select></Field><Field label="Contracted Driver"><select value={form.driver_id||""} onChange={e=>set("driver_id",e.target.value)} required><option value="">Pilih driver</option>{unregistered.map((d: Row)=><option key={d.id} value={d.id}>{d.character_name||"Driver"}</option>)}</select></Field><p className="s5-footnote">Database memvalidasi role Owner, kecocokan divisi, kontrak aktif untuk season tujuan, dan periode Off Season. Pendaftaran di luar Off Season ditolak.</p><button className="s5-primary" disabled={saving}>{saving?"Menyimpan...":"Submit Driver Registration"}</button></form></Card><Card title="Registered Drivers" eyebrow="CURRENT SEASON"><Table headers={["Driver","Season","Division","Status"]} rows={(data.registrations||[]).filter((r: Row)=>r.season_id===targetSeasonId&&candidates.some((d: Row)=>d.id===r.member_id)).map((r: Row)=>[memberOf(r.member_id)?.character_name||"Driver",(data.seasons||[]).find((s: Row)=>s.id===r.season_id)?.title||"Season",(data.divisions||[]).find((d: Row)=>d.id===r.season_division_id)?.division_name||"Division",r.is_hiatus?"Hiatus":"Registered"])}/></Card></section>;
  }

  if (isTeam && tab === "scout") {
    const query = String(form.scout_query||"");
    const licenseFilter = String(form.scout_license||"all");
    const availabilityFilter = String(form.scout_availability||"all");
    const minimumAttribute = Math.max(0,Math.min(100,Number(form.scout_min_attribute||0)));
    const scoutRows = members.filter((m: Row)=>m.role==="Driver"&&m.id!==member?.id&&String(m.character_name||"").toLowerCase().includes(query.toLowerCase())).map((m: Row)=>({ ...m, team:teamOf(m.team_id), attributes:(data.attributes||[]).find((a: Row)=>a.member_id===m.id)?.attributes||{}, contracted:(data.contracts||[]).some((c: Row)=>c.member_id===m.id&&c.status==="active"&&c.season_id===activeSeasonId), reputation:(data.driverReputations||[]).find((r:Row)=>r.member_id===m.id)?.score??null })).filter((d:Row)=>{
      const vals=Object.values(d.attributes).map(Number).filter(Number.isFinite);
      const avg=vals.length?vals.reduce((a:number,b:number)=>a+b,0)/vals.length:null;
      const availability=!d.team_id?"free_agent":d.contracted?"under_contract":"assigned";
      return (licenseFilter==="all"||String(d.license||"").toLowerCase()===licenseFilter) &&
        (availabilityFilter==="all"||availability===availabilityFilter) &&
        (minimumAttribute===0||(avg!==null&&avg>=minimumAttribute));
    });
    return <section className="workspace s5-workspace">{heading("TEAM PANEL · RECRUITMENT INTELLIGENCE", "Scout", "Bandingkan atribut, reputasi, lisensi, dan ketersediaan Driver dari data resmi.")}<Card title="Driver Scouting" eyebrow="GLOBAL DRIVER DATABASE"><div className="s5-form s5-form-grid"><label className="s5-field"><span>Nama Driver</span><input value={query} onChange={e=>set("scout_query",e.target.value)} placeholder="Cari nama driver"/></label><label className="s5-field"><span>Lisensi</span><select value={licenseFilter} onChange={e=>set("scout_license",e.target.value)}><option value="all">Semua lisensi</option>{["Bronze","Silver","Gold","Super License","A"].map(v=><option key={v} value={v.toLowerCase()}>{v}</option>)}</select></label><label className="s5-field"><span>Ketersediaan</span><select value={availabilityFilter} onChange={e=>set("scout_availability",e.target.value)}><option value="all">Semua status</option><option value="free_agent">Free Agent</option><option value="under_contract">Under Contract</option><option value="assigned">Assigned to Team</option></select></label><label className="s5-field"><span>Minimum average attribute</span><input type="number" min="0" max="100" value={minimumAttribute} onChange={e=>set("scout_min_attribute",e.target.value)}/></label></div><Table headers={["Driver","Team","Licence","Availability","Average Attribute","Reputation"]} rows={scoutRows.map((d: Row)=>{const vals=Object.values(d.attributes).map(Number).filter(Number.isFinite);const avg=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;return [d.character_name||"Driver",d.team?.name||"Independent",d.license||"—",!d.team_id?"Free Agent":d.contracted?"Under Contract":"Assigned to Team",avg===null?"No attribute data":avg+"/100",d.reputation==null?"—":String(d.reputation)]})}/><p className="s5-footnote">Status ketersediaan memakai kontrak aktif dan penempatan tim. Gaji dan detail kontrak tim lain tetap privat.</p></Card></section>;
  }

  if (isTeam && tab === "place-job-advert") return <section className="workspace s5-workspace">{heading("TEAM PANEL · RECRUITMENT", "Place Job Advert", "Terbitkan lowongan Driver atau Team Owner ke halaman Job Search.")}{!isAdmin&&(!activeTeamId||member?.role!=="Owner")?<Empty>Fitur ini hanya dapat digunakan Team Owner yang terhubung dengan tim.</Empty>:<Card title="Publish Team Vacancy" eyebrow="RECRUITMENT FORM"><form className="s5-form" onSubmit={publishJob}>{isAdmin&&<Field label="Team"><select value={form.team_id||""} onChange={e=>set("team_id",e.target.value)} required><option value="">Pilih tim</option>{teams.map((t:Row)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}<Field label="Position"><select value={form.position_kind||"Driver"} onChange={e=>set("position_kind",e.target.value)}><option value="Driver">Driver</option><option value="Team Owner">Team Owner</option></select></Field><Field label="Advert title"><input maxLength={120} value={form.title||""} onChange={e=>set("title",e.target.value)} required/></Field><Field label="Description"><textarea rows={4} maxLength={3000} value={form.description||""} onChange={e=>set("description",e.target.value)} required/></Field>{form.position_kind!=="Team Owner"&&<Field label="Minimum driver license"><input value={form.minimum_license||""} onChange={e=>set("minimum_license",e.target.value)} placeholder="Contoh: A"/></Field>}<div className="s5-form-grid"><Field label="Salary minimum (€)"><input type="number" min="0" step="0.01" value={form.salary_min||""} onChange={e=>set("salary_min",e.target.value)}/></Field><Field label="Salary maximum (€)"><input type="number" min="0" step="0.01" value={form.salary_max||""} onChange={e=>set("salary_max",e.target.value)}/></Field></div><Field label="Requirements"><textarea rows={3} maxLength={2000} value={form.requirements||""} onChange={e=>set("requirements",e.target.value)}/></Field><Field label="Open seats"><input type="number" min="1" max="4" value={form.open_seats||1} onChange={e=>set("open_seats",e.target.value)}/></Field><Field label="Available from"><input type="date" value={form.available_from||""} onChange={e=>set("available_from",e.target.value)}/></Field><button className="s5-primary" disabled={saving||(!isAdmin&&!activeTeamId)}>{saving?"Publishing...":"Publish to Job Search"}</button></form></Card>}</section>;

  if (isMain && tab === "hall-of-fame") {
    const achievements=(data.achievements||[]).slice().sort((a:Row,b:Row)=>String(b.awarded_at||"").localeCompare(String(a.awarded_at||"")));
    const champions=(data.finalStandings||[]).filter((r:Row)=>Number(r.final_position)===1).map((r:Row)=>{
      const division=(data.divisions||[]).find((d:Row)=>d.id===r.season_division_id);
      const season=(data.seasons||[]).find((x:Row)=>x.id===division?.season_id);
      return {...r,division,season};
    }).sort((a:Row,b:Row)=>String(b.season?.starts_on||"").localeCompare(String(a.season?.starts_on||"")));
    return <section className="workspace s5-workspace">{heading("MAIN EVENT · LEGACY", "Hall of Fame", "Daftar juara resmi dan penghargaan yang tercatat dalam sejarah CALERIS.")}<Card title="Champions Archive" eyebrow="OFFICIAL SEASON RECORD"><Table headers={["Season","Division","Champion","Team","Points"]} rows={champions.map((r:Row)=>[r.season?.title||"Season",r.division?.division_name||"Division",r.driver_name_snapshot||memberOf(r.member_id)?.character_name||"Driver",r.team_name_snapshot||"—",Number(r.final_points||0).toLocaleString("id-ID")])}/></Card><Card title="Season Awards" eyebrow="RECORDED ACHIEVEMENTS">{achievements.length?<div className="s5-achievements">{achievements.map((a:Row)=><article key={a.id}><Medal/><div><b>{a.title}</b><small>{a.target_kind==="team"?(teamOf(a.team_id)?.name||"Team"):(memberOf(a.member_id)?.character_name||"Driver")} · {a.description||"Official Caleris achievement"} · {dateLabel(a.awarded_at)}</small></div></article>)}</div>:<Empty>Belum ada penghargaan yang tercatat.</Empty>}</Card></section>;
  }

  if (isMain && tab === "archive") {
    const selectedSeasonId=String(form.archive_season_id||data.activeSeason?.id||"");
    const selectedDivisions=(data.divisions||[]).filter((d:Row)=>d.season_id===selectedSeasonId);
    const divisionIds=selectedDivisions.map((d:Row)=>d.id);
    const archiveRounds=(data.rounds||[]).filter((r:Row)=>divisionIds.includes(r.season_division_id));
    const archiveRoundIds=archiveRounds.map((r:Row)=>r.id);
    const archiveResults=(data.raceResults||[]).filter((r:Row)=>archiveRoundIds.includes(r.round_id));
    const archiveStandings=(data.finalStandings||[]).filter((r:Row)=>divisionIds.includes(r.season_division_id));
    return <section className="workspace s5-workspace">{heading("MAIN EVENT · HISTORY", "Season Archive", "Arsip klasemen, klasifikasi, dan hasil resmi yang dipertahankan lintas season.")}<Card title="Pilih Season" eyebrow="IMMUTABLE HISTORICAL DATA"><label className="s5-field"><span>Season</span><select value={selectedSeasonId} onChange={e=>set("archive_season_id",e.target.value)}>{(data.seasons||[]).map((season:Row)=><option key={season.id} value={season.id}>{season.title} · {season.status}</option>)}</select></label><div className="s5-grid s5-grid-3"><div className="s5-stat"><span>ROUNDS</span><strong>{archiveRounds.length}</strong></div><div className="s5-stat"><span>RACE CLASSIFICATIONS</span><strong>{archiveResults.length}</strong></div><div className="s5-stat"><span>FINAL STANDINGS</span><strong>{archiveStandings.length}</strong></div></div></Card><Card title="Final Standings" eyebrow="SEASON SNAPSHOT"><Table headers={["Division","Position","Driver","Team Snapshot","Points"]} rows={archiveStandings.map((r:Row)=>[(data.divisions||[]).find((d:Row)=>d.id===r.season_division_id)?.division_name||"Division","#"+r.final_position,r.driver_name_snapshot||memberOf(r.member_id)?.character_name||"Driver",r.team_name_snapshot||"—",Number(r.final_points||0).toLocaleString("id-ID")])}/></Card><Card title="Race Winners & Poles" eyebrow="PUBLISHED RESULTS"><Table headers={["Round","Circuit","Winner","Pole","Published"]} rows={archiveResults.map((r:Row)=>{const round=archiveRounds.find((x:Row)=>x.id===r.round_id);const winner=(data.resultEntries||[]).find((e:Row)=>e.round_id===r.round_id&&e.member_id===r.winner_member_id);const pole=(data.resultEntries||[]).find((e:Row)=>e.round_id===r.round_id&&e.member_id===r.pole_member_id);return [round?.title||("R"+round?.round_number),round?.circuit_name||"—",winner?.driver_name_snapshot||memberOf(r.winner_member_id)?.character_name||"—",pole?.driver_name_snapshot||memberOf(r.pole_member_id)?.character_name||"—",dateLabel(r.published_at)]})}/></Card></section>;
  }

  if (isMain && ["global","caleris-premio","caleris-zwei"].includes(tab)) {
    const scope = tab === "global" ? "GLOBAL" : tab === "caleris-premio" ? "PREMIO" : "ZWEI";
    const currentRookie = debutants[0];
    const driverDetail = detail === "driver-ranking";
    const teamDetail = detail === "team-ranking";
    const engineDetail = detail === "engine-ranking";
    const rookieDetail = detail === "rookie-of-the-season";
    const statsDetail = detail === "statistic";
    const comparisonDetail = detail === "comparison";
    const scheduleDetail = detail === "calendar";
    const resultsDetail = detail === "results";
    const driverListDetail = detail === "driver-list";
    const teamListDetail = detail === "team-list";
    if (driverListDetail) return <section className="workspace s5-workspace">{heading("MAIN EVENT · " + scope, data.activeSeason?.title || "Caleris Masters", "Jelajahi seluruh driver Caleris Masters dalam 3D exhibition hall.")}<DriverExhibition drivers={driverRows} gallery={members.filter((m: Row) => (m.role === "Driver" || m.role === "Owner") && inDivision(m.team_id)).map((m: Row) => ({ ...m, avatar_url: m.avatar_url || null, team: teamOf(m.team_id) }))} scope={tab}/></section>;
    return <section className="workspace s5-workspace">{heading("MAIN EVENT · "+scope, data.activeSeason?.title||"Caleris Masters", "Klasemen, statistik, jadwal, dan performa resmi "+scope.toLowerCase()+".")}<div className="s5-main-tabs"><Link className={detail==="driver-ranking"?"is-active":""} to={"/main-event/"+tab+"/driver-ranking"}>Driver Ranking</Link><Link className={detail==="rookie-of-the-season"?"is-active":""} to={"/main-event/"+tab+"/rookie-of-the-season"}>Rookie of the Season</Link><Link className={detail==="team-ranking"?"is-active":""} to={"/main-event/"+tab+"/team-ranking"}>Team Ranking</Link><Link className={detail==="engine-ranking"?"is-active":""} to={"/main-event/"+tab+"/engine-ranking"}>Engine Ranking</Link><Link className={detail==="statistic"?"is-active":""} to={"/main-event/"+tab+"/statistic"}>Statistics</Link><Link className={detail==="comparison"?"is-active":""} to={"/main-event/"+tab+"/comparison"}>Comparison</Link><Link className={detail==="calendar"?"is-active":""} to={"/main-event/"+tab+"/calendar"}>Schedule</Link><Link className={detail==="results"?"is-active":""} to={"/main-event/"+tab+"/results"}>Results</Link><Link className={detail==="driver-list"?"is-active":""} to={"/main-event/"+tab+"/driver-list"}>Driver List</Link><Link className={detail==="team-list"?"is-active":""} to={"/main-event/"+tab+"/team-list"}>Team List</Link></div>
      {(!detail||driverDetail)&&<Card title="Driver Ranking" eyebrow="OFFICIAL CHAMPIONSHIP STANDINGS"><Table headers={["POS","DRIVER","TEAM / LOGO","POINTS"]} rows={standingsRows}/></Card>}
      {(!detail||rookieDetail)&&<Card title="Rookie of the Season" eyebrow="BEST-PLACED DEBUTANT"><div className="s5-rookie">{currentRookie?<><Medal/><div><span>{(data.finalStandings||[]).some((standing: Row)=>(data.activeDivisions||[]).some((division: Row)=>division.id===standing.season_division_id))?"ROOKIE OF THE SEASON":"PROVISIONAL ROOKIE LEADER"}</span><h3>{currentRookie.character_name}</h3><p>{currentRookie.team?.name||"Independent"} · {currentRookie.points} points</p></div></>:<Empty>Belum ada debutant yang memenuhi kriteria pada season ini.</Empty>}</div></Card>}
      {(!detail||teamDetail)&&<Card title="Team Ranking" eyebrow="TEAM CHAMPIONSHIP"><Table headers={["POS","TEAM / LOGO","POINTS"]} rows={teamStandingsRows}/></Card>}
      {(!detail||engineDetail)&&<Card title="Engine Ranking" eyebrow="SHARED POWER UNIT POINTS"><Table headers={["POS","ENGINE","TEAMS USING IT","POINTS"]} rows={engineRankingRows} empty="Engine belum dipetakan untuk season ini. Admin perlu mengisi engine per tim."/></Card>}
      {(!detail||statsDetail)&&<Card title="Competition Statistics" eyebrow="SEASON TOTALS"><div className="s5-grid s5-grid-4">{statTiles.map(([k,v,Icon])=><div className="s5-stat" key={k}><Icon/><span>{k}</span><strong>{v}</strong></div>)}</div><p className="s5-footnote">Finish dan DNF hanya menghitung klasifikasi yang dicatat FIA. Data yang belum dimasukkan tidak diperkirakan.</p></Card>}
      {(!detail||comparisonDetail)&&<Card title="Comparison" eyebrow="DRIVER / TEAM COMPARISON"><div className="s5-form s5-compare-controls"><Field label="Entity type"><select value={comparisonKind} onChange={e=>{setComparisonKind(e.target.value);setCompareA("");setCompareB("");}}><option value="driver">Driver</option><option value="team">Team</option></select></Field><Field label="First entity"><select value={compareA} onChange={e=>setCompareA(e.target.value)}><option value="">Select</option>{(comparisonKind==="driver"?driverRows:teamRows).map((x: Row)=><option key={x.id} value={x.id}>{x.character_name||x.name}</option>)}</select></Field><Field label="Second entity"><select value={compareB} onChange={e=>setCompareB(e.target.value)}><option value="">Select</option>{(comparisonKind==="driver"?driverRows:teamRows).map((x: Row)=><option key={x.id} value={x.id}>{x.character_name||x.name}</option>)}</select></Field></div>{compareA&&compareB&&compareA!==compareB&&<div className="s5-grid s5-grid-2">{[compareA,compareB].map(id=>{const x=(comparisonKind==="driver"?driverRows:teamRows).find((v: Row)=>v.id===id);return <div className="s5-stat" key={id}><span>{comparisonKind==="driver"?"DRIVER":"TEAM"}</span><strong>{x?.character_name||x?.name}</strong><p>{x?.points||0} points · {x?.wins||0} wins · {x?.poles||0} poles</p></div>})}</div>}</Card>}
      {scheduleDetail&&<Card title="Season Schedule" eyebrow="DIVISION CALENDAR">
        <div className="schedule-circuit-periods">
          {(data.periods||[]).map((period: Row)=>{
            const visibleDivisions=(data.activeDivisions||[]).filter((division: Row)=>!divisionFilter||String(division.division_key||"").toLowerCase()===divisionFilter);
            const divisionIds=new Set<string>(visibleDivisions.map((division: Row)=>division.id));
            const periodRounds=getScheduleRoundsForPeriod((data.rounds||[]) as Row[],(data.periodMappings||[]) as Row[],period.id,divisionIds);
            return <section className="schedule-circuit-period" key={period.id}>
              <header className="schedule-circuit-period-head">
                <div><strong>{period.title}</strong><small>{dateLabel(period.starts_on)} – {dateLabel(period.ends_on)}</small></div>
                <span>{periodRounds.length} RACE ROUND{periodRounds.length===1?"":"S"}</span>
              </header>
              {periodRounds.length?<div className="schedule-circuit-grid">
                {periodRounds.map((round: Row)=>{
                  const circuit=findCircuitForRound((data.circuits||[]) as Row[],round);
                  const division=visibleDivisions.find((item: Row)=>item.id===round.season_division_id);
                  return <button type="button" className="circuit-reveal-card schedule-circuit-card" key={round.id} onClick={()=>setSelectedSchedule({round,circuit})} aria-label={`Buka preview ${round.title||"Round "+round.round_number}`}>
                    <span className="circuit-card-art">
                      {circuit?.image_url?<img src={circuit.image_url} alt={`Layout ${circuit.name}`} loading="lazy"/>:<span className="circuit-card-no-image">{circuit?"LAYOUT UNAVAILABLE":"CIRCUIT TBA"}</span>}
                      <span className="circuit-card-sheen" aria-hidden="true"/><span className="circuit-card-edge" aria-hidden="true"/>
                    </span>
                    <span className="circuit-card-caption">
                      <span className="circuit-card-country"><span className="circuit-card-flag" aria-hidden="true">{countryFlag(circuit?.country_code||round.circuit_country_code)}</span><span>{circuit?circuitCountryName(circuit.country_code):"Circuit belum dipilih"}</span></span>
                      <span className="circuit-card-name">{circuit?.name||round.circuit_name||round.title||"Circuit TBA"}</span>
                      <span className="schedule-circuit-round"><strong>ROUND {String(round.round_number).padStart(2,"0")}</strong><span>{formatRaceDate(round.race_starts_at)} · {formatRaceTime(round.race_starts_at)}</span></span>
                      <span className="schedule-circuit-round"><strong>{labelDivision(division?.division_key).toUpperCase()}</strong><span>{Number(round.race_duration_minutes||90)} menit · {String(round.status||"scheduled").replaceAll("_"," ").toUpperCase()}</span></span>
                    </span>
                    <span className="circuit-card-open" aria-hidden="true">VIEW RACE <span>↗</span></span>
                  </button>;
                })}
              </div>:<Empty>Belum ada race round yang terhubung ke periode ini.</Empty>}
            </section>;
          })}
        </div>
      </Card>}
      {scheduleDetail&&selectedSchedule&&<ScheduleCircuitModal selected={selectedSchedule} divisions={data.divisions||[]} onClose={()=>setSelectedSchedule(null)}/>}
      {driverListDetail&&<Card title="Driver Directory" eyebrow="OFFICIAL DRIVER REGISTER"><Table headers={["Driver","Licence","Team","Division","Points"]} rows={driverRows.map((d: Row)=>[d.character_name||"Driver",d.license||"—",d.team?.name||"Independent",labelDivision(d.team?.division_key),d.points.toLocaleString("id-ID")])}/></Card>}
      {teamListDetail&&<Card title="Team Directory" eyebrow="OFFICIAL TEAM REGISTER"><div className="team-graphic-card-grid">{teamRows.map((t: Row,index: number)=>{const main=/^#[0-9A-Fa-f]{6}$/.test(String(t.profile?.main_color||t.main_color||""))?(t.profile?.main_color||t.main_color):"#7A263A";const secondary=/^#[0-9A-Fa-f]{6}$/.test(String(t.profile?.secondary_color||t.secondary_color||""))?(t.profile?.secondary_color||t.secondary_color):"#C6A33A";const logo=t.profile?.logo_url||"";const nation=t.profile?.country_of_origin||"Nation not set";const hometown=t.profile?.base_location||"Base not set";return <button type="button" className="team-graphic-card" key={t.id} style={{"--team-card-index":index,"--team-card-main":main,"--team-card-secondary":secondary} as any} onClick={() => { setTeamDetailClosing(false); setSelectedTeam(t); }} aria-label={`View ${t.name} team details`}><div className="team-graphic-card-top" style={{background:`linear-gradient(118deg, ${main} 0%, ${secondary} 100%)`}}><div className="team-graphic-card-shade"/><span className="team-graphic-card-index">{String(index+1).padStart(2,"0")} / {String(teamRows.length).padStart(2,"0")}</span><span className="team-graphic-card-orbit" aria-hidden="true"/><span className="team-graphic-card-accent" aria-hidden="true"/><span className="team-race-weekend-label">CONSTRUCTOR <i/> CHAMPIONSHIP</span><span className="team-start-lights" aria-hidden="true"><i/><i/><i/><i/><i/></span><span className="team-livery-stripe" aria-hidden="true"/><h3>{t.name}</h3>{logo?<img className="team-graphic-card-logo" src={logo} alt={t.name+" logo"} loading="lazy" referrerPolicy="no-referrer"/>:<div className="team-graphic-card-logo team-graphic-card-logo-fallback"><CarFront size={42}/></div>}</div><div className="team-graphic-card-base"><div className="team-pit-board-label">TEAM GARAGE <i/> OFFICIAL ENTRY</div><div className="team-graphic-card-identity"><span className="team-graphic-card-color-mark" aria-hidden="true"/><span className="team-graphic-card-meta"><span className="team-graphic-card-division">{labelDivision(t.division_key)}</span><span>{nation} · {hometown}</span></span></div><div className="team-graphic-card-drivers">{t.drivers.length?t.drivers.map((d: Row)=><span key={d.id}>{d.character_name}</span>):<span>No registered drivers</span>}</div><div className="team-graphic-card-stats"><span><small>POINTS</small><strong>{Number(t.points||0).toLocaleString("id-ID")}</strong></span><span><small>WINS</small><strong>{Number(t.wins||0)}</strong></span></div></div></button>})}</div>{selectedTeam&&<div className={`driver-card-detail-backdrop team-detail-motion${teamDetailClosing?" is-closing":""}`} role="presentation" onClick={closeSelectedTeam}><section className="driver-card-detail team-detail-motion-panel" role="dialog" aria-modal="true" aria-labelledby="team-detail-title" onClick={e=>e.stopPropagation()}><button type="button" className="driver-card-detail-close" onClick={closeSelectedTeam} aria-label="Close team details">×</button><div className="driver-card-detail-banner" style={{background:`linear-gradient(118deg, ${selectedTeam.profile?.main_color||selectedTeam.main_color||"#7A263A"}, ${selectedTeam.profile?.secondary_color||selectedTeam.secondary_color||"#C6A33A"})`}}>{selectedTeam.profile?.logo_url&&<img src={selectedTeam.profile.logo_url} alt={selectedTeam.name+" logo"}/>}<div><span>OFFICIAL TEAM PROFILE</span><h2 id="team-detail-title">{selectedTeam.name}</h2><p>{labelDivision(selectedTeam.division_key)} · {selectedTeam.profile?.country_of_origin||"Nation not set"}</p></div></div><div className="driver-card-detail-body"><div className="driver-card-detail-stats">{[["POINTS",selectedTeam.points],["WINS",selectedTeam.wins],["POLES",selectedTeam.poles],["PODIUMS",selectedTeam.podiums],["FASTEST LAPS",selectedTeam.fastestLaps],["COMPLETED RACES",selectedTeam.finishes],["DNF",selectedTeam.dnf]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{Number(value||0).toLocaleString("id-ID")}</strong></div>)}</div><p className="driver-card-detail-scope">{selectedTeam.profile?.base_location||"Base not set"} · Founded {selectedTeam.profile?.founded_year||"—"}</p><div className="team-detail-roster"><h3>DRIVER LINE-UP</h3>{selectedTeam.drivers?.length?selectedTeam.drivers.map((d:Row)=><div key={d.id}><span>{d.character_name}</span><strong>{Number(d.points||0).toLocaleString("id-ID")} PTS</strong></div>):<p>No registered drivers</p>}</div><p className="driver-card-detail-empty">{selectedTeam.profile?.history||selectedTeam.profile?.description||"Team history has not been published."}</p></div></section></div>}</Card>}
      {resultsDetail&&<Card title="Race Results" eyebrow="OFFICIAL WINNERS & POLES"><Table headers={["Round","Winner","Pole","Published"]} rows={(data.raceResults||[]).filter((r: Row)=>scopedRoundIds.includes(r.round_id)).map((r: Row)=>{const rd=(data.rounds||[]).find((x: Row)=>x.id===r.round_id);return [rd?.title||"Round",memberOf(r.winner_member_id)?.character_name||"—",memberOf(r.pole_member_id)?.character_name||"—",dateLabel(r.published_at)]})}/></Card>}
    </section>;
  }

  if (isMain && tab === "fia-announcement") return <section className="workspace s5-workspace">{heading("MAIN EVENT · FIA", "FIA Announcement", "Pengumuman resmi yang dipublikasikan oleh FIA.")}{(data.announcements||[]).filter((a: Row)=>(!a.season_id||a.season_id===activeSeasonId)&&(!a.division_key||!divisionFilter||String(a.division_key).toLowerCase().includes(divisionFilter))).length ? (data.announcements||[]).filter((a: Row)=>(!a.season_id||a.season_id===activeSeasonId)&&(!a.division_key||!divisionFilter||String(a.division_key).toLowerCase().includes(divisionFilter))).map((a: Row)=><Card key={a.id} title={a.title} eyebrow={a.category.toUpperCase()}><p className="s5-history">{a.body}</p><small className="s5-footnote">{dateLabel(a.published_at)} · {labelDivision(a.division_key)}</small></Card>) : <Empty/>}</section>;
  if (isMain && tab === "regulation") return <section className="workspace s5-workspace">{heading("MAIN EVENT · SPORTING CODE", "Regulation", "Regulasi permanen dan regulasi khusus season/divisi.")}{(data.regulations||[]).filter((r: Row)=>(!r.season_id||r.season_id===activeSeasonId)&&(!r.division_key||!divisionFilter||String(r.division_key).toLowerCase().includes(divisionFilter))).length ? (data.regulations||[]).filter((r: Row)=>(!r.season_id||r.season_id===activeSeasonId)&&(!r.division_key||!divisionFilter||String(r.division_key).toLowerCase().includes(divisionFilter))).map((r: Row)=><Card key={r.id} title={r.title} eyebrow={(r.scope_kind+" · "+(r.version_label||"CURRENT")).toUpperCase()}><p className="s5-history">{r.body}</p><small className="s5-footnote">{r.season_id?(data.seasons||[]).find((s: Row)=>s.id===r.season_id)?.title:"Permanent"} · {labelDivision(r.division_key)}</small></Card>) : <Empty/>}</section>;
  if (isMain && tab === "job-search") return <section className="workspace s5-workspace">{heading("MAIN EVENT · RECRUITMENT", "Job Search", "Lowongan driver yang dipublikasikan oleh Team Owner.")}<Card title="Open Driver Seats" eyebrow="PUBLISHED VACANCIES"><Table headers={["Team","Division","Position","Available From","Requirements"]} rows={(data.adverts||[]).map((a: Row)=>[teamOf(a.team_id)?.name||"Team",labelDivision(a.division_key),a.title,dateLabel(a.available_from),a.requirements||a.description])}/></Card></section>;

  if (isFia && tab === "rules-input") return <section className="workspace s5-workspace">{heading("FIA PANEL · REGULATIONS", "Rules Input", "Publikasikan regulasi permanen atau regulasi khusus season/divisi.")}<Card title="Publish Regulation" eyebrow="OFFICIAL RULES FORM"><form className="s5-form" onSubmit={publishRegulation}><Field label="Title"><input value={form.title||""} onChange={e=>set("title",e.target.value)} required maxLength={160}/></Field><Field label="Scope"><select value={form.scope_kind||"permanent"} onChange={e=>set("scope_kind",e.target.value)}><option value="permanent">Permanent</option><option value="seasonal">Seasonal</option></select></Field><Field label="Division"><select value={form.division_key||""} onChange={e=>set("division_key",e.target.value)}><option value="">Global</option><option value="premio">Premio</option><option value="zwei">Zwei</option></select></Field>{form.scope_kind==="seasonal"&&<Field label="Season"><select value={form.season_id||""} onChange={e=>set("season_id",e.target.value)} required><option value="">Choose season</option>{(data.seasons||[]).map((s: Row)=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>}<Field label="Version label"><input value={form.version_label||""} onChange={e=>set("version_label",e.target.value)} maxLength={60}/></Field><Field label="Regulation text"><textarea rows={8} value={form.body||""} onChange={e=>set("body",e.target.value)} required maxLength={20000}/></Field><button className="s5-primary" disabled={saving}>{saving?"Publishing...":"Publish Regulation"}</button></form></Card></section>;
  if (isFia && tab === "announcement-input") return <section className="workspace s5-workspace">{heading("FIA PANEL · COMMUNICATION", "Announcement Input", "Publikasikan pengumuman resmi ke Main Event.")}<Card title="Publish Announcement" eyebrow="OFFICIAL NOTICE"><form className="s5-form" onSubmit={publishAnnouncement}><Field label="Title"><input value={form.title||""} onChange={e=>set("title",e.target.value)} required maxLength={160}/></Field><Field label="Category"><select value={form.category||"general"} onChange={e=>set("category",e.target.value)}><option value="general">General</option><option value="sporting">Sporting</option><option value="disciplinary">Disciplinary</option><option value="schedule">Schedule</option><option value="administrative">Administrative</option></select></Field><Field label="Division"><select value={form.division_key||""} onChange={e=>set("division_key",e.target.value)}><option value="">Global</option><option value="premio">Premio</option><option value="zwei">Zwei</option></select></Field><Field label="Season (optional)"><select value={form.season_id||""} onChange={e=>set("season_id",e.target.value)}><option value="">All seasons</option>{(data.seasons||[]).map((s: Row)=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field><Field label="Announcement text"><textarea rows={7} value={form.body||""} onChange={e=>set("body",e.target.value)} required maxLength={12000}/></Field><button className="s5-primary" disabled={saving}>{saving?"Publishing...":"Publish Announcement"}</button></form></Card></section>;
  if (isFia && tab === "appeal-room") {
    if (!isAdmin) return <section className="workspace s5-workspace">{heading("ADMIN COURT", "Appeal Room", "Kewenangan pengadilan banding hanya dimiliki Admin.")}<Empty>Appeal Room hanya dapat diakses Admin. FIA tidak memiliki akses untuk membaca atau memutuskan perkara.</Empty></section>;
    const appealCards = (data.appeals || []).map((a: Row) => {
      const targetName = a.target_kind === "team"
        ? (teamOf(a.target_team_id)?.name || "Team")
        : (memberOf(a.target_member_id)?.character_name || "Driver");
      return (
        <Card key={a.id} title={targetName} eyebrow={"APPEAL · " + a.status.toUpperCase()}>
          <p className="s5-history">{a.appeal_statement}</p>
          {a.status === "pending" ? (
            <div className="s5-form">
              <Field label="FIA decision">
                <textarea rows={3} value={form.decision || ""} onChange={e => set("decision", e.target.value)} required maxLength={3000}/>
              </Field>
              <div className="s5-actions">
                <button type="button" className="s5-secondary" onClick={() => void decideAppeal(a.id, true)} disabled={saving}>Approve Appeal</button>
                <button type="button" className="s5-primary" onClick={() => void decideAppeal(a.id, false)} disabled={saving}>Reject Appeal</button>
              </div>
            </div>
          ) : (
            <p className="s5-footnote">Decision: {a.fia_decision || "—"} · {dateLabel(a.decided_at)}</p>
          )}
        </Card>
      );
    });
    return (
      <section className="workspace s5-workspace">
        {heading("ADMIN · JUDICIAL", "Appeal Room", "Admin meninjau dan memutuskan banding yang diajukan Driver dan Team Owner.")}
        {appealCards.length ? appealCards : <Empty>Tidak ada banding masuk.</Empty>}
      </section>
    );
  }

  return <>{fallback}</>;
}

function countryFlag(countryCode?: string | null) {
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return "🏁";
  return String.fromCodePoint(...countryCode.split("").map((letter) => 127397 + letter.charCodeAt(0)));
}


function ScheduleCircuitModal({selected,divisions,onClose}:{selected:{round:Row;circuit:Row|null};divisions:Row[];onClose:()=>void}) {
  const {round,circuit}=selected;
  const division=divisions.find((item:Row)=>item.id===round.season_division_id);
  return <div className="circuit-modal-backdrop circuit-reveal-backdrop" role="presentation" onClick={onClose}>
    <section className="circuit-modal circuit-reveal-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-circuit-title" onClick={event=>event.stopPropagation()}>
      <div className="circuit-modal-head"><div><span className="section-eyebrow">{circuit?countryFlag(circuit.country_code)+" "+circuitCountryName(circuit.country_code)+" · CIRCUIT PROFILE":"RACE WEEKEND · CIRCUIT ASSIGNMENT PENDING"}</span><h2 id="schedule-circuit-title">{circuit?.name||round.circuit_name||round.title||"Circuit TBA"}</h2></div><button type="button" aria-label="Tutup preview race" onClick={onClose}><span aria-hidden="true">×</span></button></div>
      <div className="schedule-circuit-meta">
        <div><small>Round</small><strong>{round.title||"Round "+String(round.round_number).padStart(2,"0")}</strong></div>
        <div><small>Tanggal</small><strong>{formatRaceDate(round.race_starts_at)}</strong></div>
        <div><small>Jam start</small><strong>{formatRaceTime(round.race_starts_at)}</strong></div>
        <div><small>Divisi</small><strong>{labelDivision(division?.division_key)}</strong></div>
        <div><small>Durasi</small><strong>{Number(round.race_duration_minutes||90)} menit</strong></div>
        <div><small>Status</small><strong>{String(round.status||"scheduled").replaceAll("_"," ")}</strong></div>
      </div>
      {circuit?.image_url?<div className="circuit-reveal-hero"><img className="circuit-layout-image" src={circuit.image_url} alt={`Layout ${circuit.name}`} loading="eager"/><span className="circuit-reveal-scan" aria-hidden="true"/><span className="circuit-reveal-corner" aria-hidden="true"/></div>:<div className="schedule-circuit-unassigned">{circuit?"Layout circuit belum tersedia.":"Round ini belum memiliki circuit yang ditautkan ke Circuit Pool. Data jadwal lama tidak diubah otomatis agar tidak salah memasangkan layout."}</div>}
      {circuit&&<><div className="circuit-detail-grid">
        {[["Total lap",circuit.total_laps],["Lap record time",formatCircuitRecord(circuit.lap_record_ms)],["Record holder",circuit.lap_record_driver_name||"Belum diketahui"],["AVG track temp",circuit.avg_track_temp_c+" °C"],["DRS zone",circuit.drs_zones],["Straight",circuit.straights],["Low speed corner",circuit.low_speed_corners],["High speed corner",circuit.high_speed_corners],["Grip level",circuit.grip_level+"/100"]].map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}
      </div><p className="circuit-record-note">Detail circuit dan layout diambil langsung dari Circuit Pool. Jadwal race menggunakan waktu lokal GMT+7.</p></>}
      <span className="circuit-reveal-scan" aria-hidden="true"/>
    </section>
  </div>;
}
