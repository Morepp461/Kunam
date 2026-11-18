import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, RefreshCw, Save, ShieldCheck, Wrench } from "lucide-react";
import { supabase } from "./lib/supabase";
import { parseTeamHqConfigJson, teamHqFacilityConfigSchema } from "./lib/teamHqValidation";
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
type Facility = { id: string; team_id: string; facility_key: string; level: number; condition: number; asset_value: number; last_maintenance_at: string | null };
type Project = { id: string; facility_key: string; target_level: number; status: string; cost: number; started_at: string | null; completes_at: string | null; completed_at: string | null; created_at: string };
type Team = { id: string; name: string; division_key: string | null };

const jsonFields = [
  ["construction_cost_by_level", "Biaya konstruksi per level"],
  ["construction_days_by_level", "Durasi konstruksi (hari)"],
  ["maintenance_by_level", "Maintenance per level"],
  ["effects_by_level", "Efek per level"],
  ["unlock_rules", "Aturan unlock"]
] as const;

const money = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
const divisionMax = (division: string | null) => division?.toLowerCase().includes("zwei") ? 6 : 8;

export default function TeamHQ() {
  const [team, setTeam] = useState<Team | null>(null);
  const [configs, setConfigs] = useState<FacilityConfig[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isFia, setIsFia] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<FacilityConfig | null>(null);
  const [jsonDraft, setJsonDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<FacilityConfig | null>(null);
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
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
    if (!memberId) { setTeam(null); setFacilities([]); setProjects([]); setIsFia(Boolean(adminResult.data?.user_id)); setIsOwner(false); setLoading(false); return; }
    const { data: member, error: memberError } = await supabase.from("members").select("id,team_id,role").eq("id", memberId).maybeSingle();
    if (memberError) setError(memberError.message);
    const role = String(member?.role ?? "");
    setIsFia(Boolean(adminResult.data?.user_id) || role === "FIA");
    setIsOwner(role === "Owner" || role === "Principal");
    if (!member?.team_id) { setTeam(null); setFacilities([]); setProjects([]); setLoading(false); return; }
    const [teamResult, facilityResult, projectResult] = await Promise.all([
      supabase.from("teams").select("id,name,division_key").eq("id", member.team_id).maybeSingle(),
      supabase.from("caleris_team_hq_facilities").select("*").eq("team_id", member.team_id),
      supabase.from("caleris_team_hq_projects").select("*").eq("team_id", member.team_id).order("created_at", { ascending: false }).limit(10)
    ]);
    if (teamResult.error) setError(teamResult.error.message);
    else setTeam(teamResult.data as Team | null);
    if (facilityResult.error) setError(facilityResult.error.message);
    else setFacilities((facilityResult.data ?? []) as Facility[]);
    if (projectResult.error) setError(projectResult.error.message);
    else setProjects((projectResult.data ?? []) as Project[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (activeProjects.some(project => project.completes_at && new Date(project.completes_at).getTime() <= clock)) void load();
  }, [Math.floor(clock / 30000), activeProjects, load]);

  const maxLevel = useMemo(() => divisionMax(team?.division_key ?? null), [team?.division_key]);
  const facilityMap = useMemo(() => new Map(facilities.map((item) => [item.facility_key, item])), [facilities]);
  const activeProjects = useMemo(() => projects.filter(p => p.status === "queued" || p.status === "in_progress"), [projects]);
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
    const { error: upgradeError } = await supabase.rpc("member_start_team_hq_project", {
      p_facility_key: confirmConfig.facility_key,
      p_idempotency_key: crypto.randomUUID()
    });
    setSubmittingUpgrade(false);
    if (upgradeError) { setError(upgradeError.message); return; }
    setConfirmConfig(null);
    setNotice("Proyek upgrade berhasil dimulai. Biaya telah dipindahkan ke VreeoBank.");
    await load();
  };

  const beginEdit = (config: FacilityConfig) => {
    setEditing(config.facility_key); setDraft({ ...config });
    setJsonDraft(Object.fromEntries(jsonFields.map(([key]) => [key, JSON.stringify(config[key] ?? {}, null, 2)])));
    setNotice(""); setError("");
  };
  const saveConfig = async () => {
    if (!supabase || !draft) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = parseTeamHqConfigJson(jsonDraft);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Format JSON konfigurasi tidak valid.");
      return;
    }
    const validation = teamHqFacilityConfigSchema.safeParse({ ...draft, ...parsed });
    if (!validation.success) {
      setError(validation.error.issues.map(issue => issue.message).join(" "));
      return;
    }
    if (draft.max_level_premio < 1 || draft.max_level_premio > 8 || draft.max_level_zwei < 1 || draft.max_level_zwei > 6) {
      setError("Batas level harus 1–8 untuk Premio dan 1–6 untuk Zwei."); return;
    }
    setSaving(true); setError("");
    const { error: saveError } = await supabase.from("caleris_team_hq_facility_configs").update({
      title: draft.title.trim(), description: draft.description.trim(), is_enabled: draft.is_enabled,
      max_level_premio: draft.max_level_premio, max_level_zwei: draft.max_level_zwei,
      maintenance_required: draft.maintenance_required, ...parsed,
      updated_at: new Date().toISOString()
    }).eq("facility_key", draft.facility_key);
    setSaving(false);
    if (saveError) setError(saveError.message);
    else { setNotice("Konfigurasi fasilitas berhasil disimpan."); setEditing(null); setDraft(null); await load(); }
  };

  if (loading) return <section className="workspace team-hq"><p>Memuat Team HQ...</p></section>;
  if (error && !team && !isFia) return <section className="workspace team-hq"><h1>Team HQ</h1><p className="team-hq-error">{error}</p></section>;

  return <section className="workspace team-hq">
    <div className="team-hq-heading">
      <div><span className="section-eyebrow">TEAM MANAGEMENT · HEADQUARTERS</span><h1>Team HQ</h1><p>{team ? team.name + " · " + (team.division_key ?? "Division belum ditetapkan") : isFia ? "FIA Configuration Center" : "Akun ini belum terhubung ke tim."}</p></div>
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
          {team && <><div className="team-hq-level"><span>LEVEL</span><strong>{level}<small> / {limit}</small></strong></div><div className="team-hq-progress"><i style={{ width: Math.min(100, level / limit * 100) + "%" }}/></div><div className="team-hq-meta"><span>Condition</span><strong>{facility ? facility.condition + "%" : "Belum dibangun"}</strong></div><div className="team-hq-meta"><span>Asset value</span><strong>{facility ? "€" + money(facility.asset_value) : "—"}</strong></div></>}
          {config.maintenance_required && <small className="team-hq-maintenance"><Wrench size={12}/> Maintenance diperlukan</small>}
          {isFia && <button className="team-hq-edit" onClick={() => beginEdit(config)}>Edit configuration</button>}
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
    {team && <section className="team-hq-projects"><div className="team-hq-section-title"><div><span className="section-eyebrow">CONSTRUCTION PIPELINE</span><h2>Project History</h2></div><span className="empty-tag">LATEST 10</span></div>{projects.length ? projects.map(project => <div className="team-hq-project-row" key={project.id}><strong>{configs.find(c => c.facility_key === project.facility_key)?.title ?? project.facility_key}</strong><span>Target level {project.target_level}</span><span>{project.status.replaceAll("_"," ")}</span><span>€{money(project.cost)}</span></div>) : <p className="team-hq-empty">Belum ada proyek pembangunan atau upgrade.</p>}</section>}
    {confirmConfig && team && <div className="team-hq-modal-backdrop" role="presentation" onClick={() => !submittingUpgrade && setConfirmConfig(null)}><section className="team-hq-confirm" role="dialog" aria-modal="true" aria-labelledby="team-hq-confirm-title" onClick={e => e.stopPropagation()}><span className="section-eyebrow">KONFIRMASI UPGRADE</span><h2 id="team-hq-confirm-title">{confirmConfig.title}</h2><p>Pastikan rincian pembangunan fasilitas berikut sudah benar.</p><div className="team-hq-confirm-row"><span>Level</span><strong>{(facilityMap.get(confirmConfig.facility_key)?.level ?? 0)} → {(facilityMap.get(confirmConfig.facility_key)?.level ?? 0) + 1}</strong></div><div className="team-hq-confirm-row"><span>Biaya</span><strong>€{money(Number(confirmConfig.construction_cost_by_level?.[String((facilityMap.get(confirmConfig.facility_key)?.level ?? 0) + 1)] ?? 0))}</strong></div><div className="team-hq-confirm-row"><span>Durasi</span><strong>{confirmConfig.construction_days_by_level?.[String((facilityMap.get(confirmConfig.facility_key)?.level ?? 0) + 1)] ?? 0} hari</strong></div><div className="team-hq-confirm-row"><span>Pembayaran</span><strong>Team Wallet → VreeoBank</strong></div><p className="team-hq-confirm-note">Pembayaran dilakukan langsung saat proyek dimulai dan tidak dapat dibatalkan melalui halaman ini.</p><div className="team-hq-actions"><button className="team-hq-cancel" disabled={submittingUpgrade} onClick={() => setConfirmConfig(null)}>Kembali</button><button className="team-hq-save" disabled={submittingUpgrade} onClick={() => void startUpgrade()}>{submittingUpgrade ? "Memproses..." : "Konfirmasi & mulai upgrade"}</button></div></section></div>}
    {editing && draft && <div className="team-hq-editor"><div className="team-hq-section-title"><div><span className="section-eyebrow">FIA CONTROL</span><h2>Edit {draft.title}</h2></div></div>
      <label>Nama fasilitas<input value={draft.title} onChange={e => setDraft(v => v ? { ...v, title: e.target.value } : v)}/></label>
      <label>Deskripsi<textarea value={draft.description} onChange={e => setDraft(v => v ? { ...v, description: e.target.value } : v)}/></label>
      <div className="team-hq-form-grid"><label>Max level Premio<input type="number" min="1" max="8" value={draft.max_level_premio} onChange={e => setDraft(v => v ? { ...v, max_level_premio: Number(e.target.value) } : v)}/></label><label>Max level Zwei<input type="number" min="1" max="6" value={draft.max_level_zwei} onChange={e => setDraft(v => v ? { ...v, max_level_zwei: Number(e.target.value) } : v)}/></label></div>
      <label className="team-hq-check"><input type="checkbox" checked={draft.is_enabled} onChange={e => setDraft(v => v ? { ...v, is_enabled: e.target.checked } : v)}/> Facility enabled</label>
      <label className="team-hq-check"><input type="checkbox" checked={draft.maintenance_required} onChange={e => setDraft(v => v ? { ...v, maintenance_required: e.target.checked } : v)}/> Maintenance required</label>
      {jsonFields.map(([key,label]) => <label key={key}>{label}<textarea className="team-hq-json" spellCheck={false} value={jsonDraft[key] ?? "{}"} onChange={e => setJsonDraft(v => ({ ...v, [key]: e.target.value }))}/></label>)}
      <div className="team-hq-actions"><button onClick={() => { setEditing(null); setDraft(null); }} className="team-hq-cancel">Batal</button><button onClick={() => void saveConfig()} disabled={saving} className="team-hq-save"><Save size={15}/>{saving ? "Menyimpan..." : "Simpan konfigurasi"}</button></div>
      <p className="team-hq-footnote"><ShieldCheck size={14}/> Biaya, durasi, maintenance, efek, dan unlock disimpan sebagai konfigurasi FIA. Tidak ada nilai ekonomi default yang dikarang.</p>
    </div>}
  </section>;
}
