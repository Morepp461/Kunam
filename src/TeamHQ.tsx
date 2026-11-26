import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, RefreshCw, Wrench } from "lucide-react";
import { supabase } from "./lib/supabase";
import { TeamProfileLink } from "./EntityProfileLink";
import TeamMerchandise from "./TeamMerchandise";
import "./team-hq.css";

type FacilityConfig = {
  facility_key: string; title: string; description: string; is_enabled: boolean;
  max_level_premio: number; max_level_zwei: number;
  construction_cost_by_level: Record<string, number>;
  construction_days_by_level: Record<string, number>;
  maintenance_by_level: Record<string, number>;
  effects_by_level: Record<string, unknown>;
  maintenance_required: boolean; unlock_rules: Record<string, unknown>;
};
type Facility = { id: string; team_id: string; facility_key: string; level: number; condition: number; asset_value: number; last_maintenance_at: string | null; last_condition_decay_at: string | null; maintenance_restore_level: number | null };
type Project = { id: string; facility_key: string; target_level: number; status: string; cost: number; started_at: string | null; completes_at: string | null; completed_at: string | null; created_at: string };
type Team = { id: string; name: string; division_key: string | null };

const money = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
const divisionMax = (division: string | null) => division?.toLowerCase().includes("zwei") ? 6 : 8;

export default function TeamHQ() {
  const [team, setTeam] = useState<Team | null>(null);
  const [configs, setConfigs] = useState<FacilityConfig[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isFia, setIsFia] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isMerchOwner, setIsMerchOwner] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<FacilityConfig | null>(null);
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
  const [submittingMaintenance, setSubmittingMaintenance] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  const load = useCallback(async () => {
    if (!supabase) { setError("Koneksi Supabase belum tersedia."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Login diperlukan untuk membuka Team HQ."); setLoading(false); return; }
    const [profileResult, configResult, adminResult] = await Promise.all([
      supabase.from("profiles").select("member_id").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("caleris_team_hq_facility_configs").select("*").order("title"),
      supabase.from("site_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle()
    ]);
    if (configResult.error) setError(configResult.error.message);
    else setConfigs((configResult.data ?? []) as FacilityConfig[]);
    const memberId = profileResult.data?.member_id;
    if (!memberId) { setTeam(null); setFacilities([]); setProjects([]); setAuditLogs([]); setIsFia(Boolean(adminResult.data?.user_id)); setIsAdmin(Boolean(adminResult.data?.user_id)); setIsOwner(false); setIsMerchOwner(false); setLoading(false); return; }
    const { data: member, error: memberError } = await supabase.from("members").select("id,team_id,role").eq("id", memberId).maybeSingle();
    if (memberError) setError(memberError.message);
    const role = String(member?.role ?? "");
    setIsFia(Boolean(adminResult.data?.user_id) || role === "FIA");
    setIsAdmin(Boolean(adminResult.data?.user_id));
    setIsOwner(role === "Owner" || role === "Principal");
    setIsMerchOwner(role === "Owner");
    if (!member?.team_id) { setTeam(null); setFacilities([]); setProjects([]); setAuditLogs([]); setIsMerchOwner(false); setLoading(false); return; }
    const [teamResult, facilityResult, projectResult, auditResult] = await Promise.all([
      supabase.from("teams").select("id,name,division_key").eq("id", member.team_id).maybeSingle(),
      supabase.from("caleris_team_hq_facilities").select("*").eq("team_id", member.team_id),
      supabase.from("caleris_team_hq_projects").select("*").eq("team_id", member.team_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("caleris_team_hq_audit_logs").select("id,facility_key,event_type,previous_level,new_level,previous_condition,new_condition,amount,metadata,created_at").eq("team_id", member.team_id).order("created_at", { ascending: false }).limit(30)
    ]);
    if (teamResult.error) setError(teamResult.error.message);
    else setTeam(teamResult.data as Team | null);
    if (facilityResult.error) setError(facilityResult.error.message);
    else setFacilities((facilityResult.data ?? []) as Facility[]);
    if (projectResult.error) setError(projectResult.error.message);
    else setProjects((projectResult.data ?? []) as Project[]);
    if (auditResult.error) setError(auditResult.error.message);
    else setAuditLogs(auditResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  const maxLevel = useMemo(() => divisionMax(team?.division_key ?? null), [team?.division_key]);
  const facilityMap = useMemo(() => new Map(facilities.map((item) => [item.facility_key, item])), [facilities]);
  const activeProjects = useMemo(() => projects.filter(p => p.status === "queued" || p.status === "in_progress"), [projects]);
  useEffect(() => {
    if (activeProjects.some(project => project.completes_at && new Date(project.completes_at).getTime() <= clock)) void load();
  }, [Math.floor(clock / 30000), activeProjects, load]);
  useEffect(() => {
    if (!supabase || !team || !isOwner) { setAnalytics(null); setAnalyticsError(""); return; }
    let active = true;
    void supabase.rpc("team_owner_get_hq_analytics_report").then(({ data, error: reportError }) => {
      if (!active) return;
      if (reportError) { setAnalyticsError(reportError.message); setAnalytics(null); }
      else { setAnalytics(data); setAnalyticsError(""); }
    });
    return () => { active = false; };
  }, [team?.id, isOwner, facilities]);

  const formatRemaining = (milliseconds: number) => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return days > 0 ? `${days}h ${hours}j ${minutes}m` : `${hours}j ${minutes}m ${secs}d`;
  };
  const progressFor = (project: Project) => {
    if (!project.started_at || !project.completes_at) return 0;
    const start = new Date(project.started_at).getTime();
    const end = new Date(project.completes_at).getTime();
    return Math.max(0, Math.min(100, ((clock - start) / Math.max(1, end - start)) * 100));
  };
  const startUpgrade = async () => {
    if (!supabase || !confirmConfig || submittingUpgrade) return;
    setSubmittingUpgrade(true); setError(""); setNotice("");
    try {
      const { error: upgradeError } = await supabase.rpc("member_start_team_hq_project", {
        p_facility_key: confirmConfig.facility_key,
        p_idempotency_key: crypto.randomUUID()
      });
      if (upgradeError) {
        console.error("[TeamHQ] Upgrade RPC failed", {
          code: upgradeError.code,
          message: upgradeError.message,
          details: upgradeError.details,
          hint: upgradeError.hint
        });
        setError([upgradeError.message, upgradeError.details, upgradeError.hint, upgradeError.code ? `Kode: ${upgradeError.code}` : ""].filter(Boolean).join(" · "));
        return;
      }
      setConfirmConfig(null);
      setNotice("Proyek upgrade berhasil dimulai. Biaya telah dipindahkan ke VreeoBank.");
      await load();
    } catch (upgradeError) {
      console.error("[TeamHQ] Unexpected upgrade failure", upgradeError);
      setError(upgradeError instanceof Error ? upgradeError.message : "Upgrade HQ gagal diproses. Coba lagi dan periksa koneksi.");
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const payMaintenance = async (facilityKey: string) => {
    if (!supabase || submittingMaintenance) return;
    setSubmittingMaintenance(facilityKey); setError(""); setNotice("");
    try {
      const { data, error: maintenanceError } = await supabase.rpc("member_pay_team_hq_maintenance", {
        p_facility_key: facilityKey,
        p_idempotency_key: crypto.randomUUID()
      });
      if (maintenanceError) throw maintenanceError;
      const result = data as { amount?: number; restored_level?: number };
      setNotice(`Maintenance berhasil dibayar: €${money(Number(result?.amount ?? 0))}. Fasilitas kembali ke level ${result?.restored_level ?? "sebelumnya"} dengan kondisi 100%.`);
      await load();
    } catch (maintenanceError) {
      setError(maintenanceError instanceof Error ? maintenanceError.message : "Pembayaran maintenance gagal diproses.");
    } finally {
      setSubmittingMaintenance(null);
    }
  };

  if (loading) return <section className="workspace team-hq"><p>Memuat Team HQ...</p></section>;
  if (error && !team && !isFia) return <section className="workspace team-hq"><h1>Team HQ</h1><p className="team-hq-error">{error}</p></section>;

  return <section className="workspace team-hq">
    <div className="team-hq-heading">
      <div><span className="section-eyebrow">TEAM MANAGEMENT · HEADQUARTERS</span><h1>Team HQ</h1><p>{team ? <><TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink>{" · "}{team.division_key ?? "Division belum ditetapkan"}</> : isFia ? "FIA Configuration Center" : "Akun ini belum terhubung ke tim."}</p></div>
      <button className="team-hq-refresh" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button>
    </div>
    {error && <p className="team-hq-error">{error}</p>}{notice && <p className="team-hq-notice">{notice}</p>}
    {team && <div className="team-hq-summary"><div><span>DIVISION MAX LEVEL</span><strong>{maxLevel}</strong></div><div><span>FACILITIES</span><strong>{facilities.length}/{configs.length}</strong></div><div><span>ACTIVE PROJECT</span><strong>{activeProjects.length}/2</strong></div></div>}
    <div className="team-hq-section-title"><div><span className="section-eyebrow">FACILITY DIRECTORY</span><h2>{isFia ? "Facility Configuration" : "Facilities"}</h2></div><span className="empty-tag">9 FACILITIES</span></div>
    <div className="team-hq-grid">
      {configs.map((config) => {
        const facility = facilityMap.get(config.facility_key);
        const level = facility?.level ?? 0;
        const limit = team ? (team.division_key?.toLowerCase().includes("zwei") ? config.max_level_zwei : config.max_level_premio) : config.max_level_premio;
        return <article className="team-hq-card" key={config.facility_key}>
          <div className="team-hq-card-top"><span className="team-hq-facility-icon"><Building2 size={18}/></span><span className={config.is_enabled ? "team-hq-status" : "team-hq-status disabled"}>{config.is_enabled ? "ACTIVE" : "DISABLED"}</span></div>
          <h3>{config.title}</h3><p>{config.description}</p>
          {team && <><div className="team-hq-level"><span>LEVEL</span><strong>{level}<small> / {limit}</small></strong></div><div className="team-hq-progress"><i style={{ width: Math.min(100, level / limit * 100) + "%" }}/></div><div className="team-hq-meta"><span>Condition</span><strong>{facility ? facility.condition + "%" : "Belum dibangun"}</strong></div><div className="team-hq-meta"><span>Asset value</span><strong>{facility ? "€" + money(facility.asset_value) : "—"}</strong></div>{facility && facility.condition < 50 && isOwner && (() => { const restoreLevel = facility.maintenance_restore_level ?? level; const base = Number(config.maintenance_by_level?.[String(restoreLevel)] ?? 0); const cost = Math.round(base * (100 - facility.condition) * 100) / 10000; return <div className="team-hq-maintenance-panel"><div className="team-hq-meta"><span>Biaya maintenance ({100 - facility.condition}% pemulihan)</span><strong>€{money(cost)}</strong></div><small>Level yang dipulihkan: {restoreLevel} · Kondisi kembali ke 100%</small><button className="team-hq-maintenance-action" disabled={submittingMaintenance === config.facility_key} onClick={() => void payMaintenance(config.facility_key)}>{submittingMaintenance === config.facility_key ? "Memproses..." : "Bayar maintenance"}</button></div>; })()}</>}
          {config.maintenance_required && <small className="team-hq-maintenance"><Wrench size={12}/> Maintenance diperlukan</small>}
          {team && (() => {
            const activeProject = activeProjects.find(p => p.facility_key === config.facility_key);
            const nextLevel = level + 1;
            const nextCost = Number(config.construction_cost_by_level?.[String(nextLevel)] ?? 0);
            const nextDays = Number(config.construction_days_by_level?.[String(nextLevel)] ?? 0);
            const canUpgrade = isOwner && config.is_enabled && level < limit && nextCost > 0 && nextDays > 0 && !activeProject && activeProjects.length < 2;
            return <>
              {level < limit && <div className="team-hq-upgrade-info">
                <div><span>UPGRADE BERIKUTNYA · LEVEL {nextLevel}</span><strong>€{money(nextCost)}</strong></div>
                <div><span>DURASI PENGERJAAN</span><strong>{nextDays} hari</strong></div>
              </div>}
              {activeProject && <div className="team-hq-construction">
                <div className="team-hq-construction-head"><strong>UPGRADE LEVEL {activeProject.target_level}</strong><b>{Math.floor(progressFor(activeProject))}%</b></div>
                <div className="team-hq-progress team-hq-progress-construction"><i style={{ width: progressFor(activeProject) + "%" }}/></div>
                <div className="team-hq-timer">{activeProject.completes_at ? (new Date(activeProject.completes_at).getTime() > clock ? "Sisa " + formatRemaining(new Date(activeProject.completes_at).getTime() - clock) : "Menunggu penyelesaian otomatis") : "Menunggu jadwal pengerjaan"}</div>
              </div>}
              {isOwner && level < limit && <button className="team-hq-upgrade" disabled={!canUpgrade} onClick={() => setConfirmConfig(config)}> {activeProject ? "Sedang diupgrade" : activeProjects.length >= 2 ? "Slot proyek penuh" : "Upgrade fasilitas"} </button>}
              {isOwner && level >= limit && <small className="team-hq-lock-note">Level maksimum divisi tercapai.</small>}
            </>;
          })()}
        </article>;
      })}
    </div>
    
    {isOwner && team && <section className="team-hq-projects">
      <div className="team-hq-section-title"><div><span className="section-eyebrow">DATA ANALYTICS CENTER</span><h2>Team Performance Analysis</h2></div><span className="empty-tag">{analytics?.unlocked ? analytics.analysis_window + " ROUND WINDOW" : "FACILITY LOCKED"}</span></div>
      {analyticsError ? <p className="team-hq-error">{analyticsError}</p> : analytics?.unlocked ? <div className="team-hq-project-grid">
        <div className="team-hq-project-row"><strong>{analytics.metrics?.sample_rounds ?? 0}</strong><span>Rounds analyzed</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.average_grid ?? "—"}</strong><span>Average grid</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.average_finish ?? "—"}</strong><span>Average finish</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.positions_gained ?? "—"}</strong><span>Positions gained</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.finish_rate_percent ?? 0}%</strong><span>Finish rate</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.wins ?? 0}</strong><span>Team wins</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.fastest_laps ?? 0}</strong><span>Fastest laps</span></div>
        <div className="team-hq-project-row"><strong>{analytics.metrics?.dnf_count ?? 0}</strong><span>DNF records</span></div>
      </div> : <p className="team-hq-empty">{analytics?.message || "Upgrade Data Analytics Center untuk membuka analisis performa berdasarkan hasil race resmi."}</p>}
    </section>}
    <TeamMerchandise teamId={team?.id ?? null} isOwner={isMerchOwner} isAdmin={isAdmin} />
    {team && <section className="team-hq-projects"><div className="team-hq-section-title"><div><span className="section-eyebrow">CONSTRUCTION PIPELINE</span><h2>Project History</h2></div><span className="empty-tag">LATEST 10</span></div>{projects.length ? projects.map(project => <div className="team-hq-project-row" key={project.id}><strong>{configs.find(c => c.facility_key === project.facility_key)?.title ?? project.facility_key}</strong><span>Target level {project.target_level}</span><span>{project.status.replaceAll("_"," ")}</span><span>€{money(project.cost)}</span></div>) : <p className="team-hq-empty">Belum ada proyek pembangunan atau upgrade.</p>}</section>}
    {team && <section className="team-hq-projects"><div className="team-hq-section-title"><div><span className="section-eyebrow">OPERATIONAL RECORDS</span><h2>HQ Activity History</h2></div><span className="empty-tag">CURRENT SEASON · LATEST 30</span></div>{auditLogs.length ? auditLogs.map(log => <div className="team-hq-project-row" key={log.id}><strong>{configs.find(c => c.facility_key === log.facility_key)?.title ?? log.facility_key}</strong><span>{({condition_decay:"Condition turun",level_degraded:"Level menurun",maintenance:"Maintenance dibayar",project_started:"Proyek dimulai",project_completed:"Proyek selesai"} as Record<string,string>)[log.event_type] ?? log.event_type}</span><span>{log.previous_condition != null ? `${log.previous_condition}% → ${log.new_condition}%` : log.metadata?.target_level ? `Target LV ${log.metadata.target_level}` : "—"}</span><span>{new Date(log.created_at).toLocaleString("id-ID")}</span></div>) : <p className="team-hq-empty">Belum ada aktivitas HQ pada season ini.</p>}</section>}
    {confirmConfig && team && <div className="team-hq-modal-backdrop" role="presentation" onClick={() => !submittingUpgrade && setConfirmConfig(null)}><section className="team-hq-confirm" role="dialog" aria-modal="true" aria-labelledby="team-hq-confirm-title" onClick={e => e.stopPropagation()}><span className="section-eyebrow">KONFIRMASI UPGRADE</span><h2 id="team-hq-confirm-title">{confirmConfig.title}</h2><p>Pastikan rincian pembangunan fasilitas berikut sudah benar.</p><div className="team-hq-confirm-row"><span>Level</span><strong>{(facilityMap.get(confirmConfig.facility_key)?.level ?? 0)} → {(facilityMap.get(confirmConfig.facility_key)?.level ?? 0) + 1}</strong></div><div className="team-hq-confirm-row"><span>Biaya</span><strong>€{money(Number(confirmConfig.construction_cost_by_level?.[String((facilityMap.get(confirmConfig.facility_key)?.level ?? 0) + 1)] ?? 0))}</strong></div><div className="team-hq-confirm-row"><span>Durasi</span><strong>{confirmConfig.construction_days_by_level?.[String((facilityMap.get(confirmConfig.facility_key)?.level ?? 0) + 1)] ?? 0} hari</strong></div><div className="team-hq-confirm-row"><span>Pembayaran</span><strong>Team Wallet → VreeoBank</strong></div><p className="team-hq-confirm-note">Pembayaran dilakukan langsung saat proyek dimulai dan tidak dapat dibatalkan melalui halaman ini.</p><div className="team-hq-actions"><button className="team-hq-cancel" disabled={submittingUpgrade} onClick={() => setConfirmConfig(null)}>Kembali</button><button className="team-hq-save" disabled={submittingUpgrade} onClick={() => void startUpgrade()}>{submittingUpgrade ? "Memproses..." : "Konfirmasi & mulai upgrade"}</button></div></section></div>}
  </section>;
}
