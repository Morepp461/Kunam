import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { Activity, RefreshCw, Target, Wallet, FileSignature } from "lucide-react";
import { supabase } from "./lib/supabase";

type Row = Record<string, any>;
type Scope = "roadmap" | "budget" | "renewals" | "operations";
const DRIVER_ATTRIBUTES = [
  ["race_pace", "Race Pace"], ["qualifying_pace", "Qualifying Pace"], ["experience", "Experience"],
  ["aggression", "Aggression"], ["defensive_strength", "Defensive Strength"],
  ["overtake_skill", "Overtake Skill"], ["mistake_rate", "Mistake Rate"], ["tyre_management", "Tyre Management"]
] as const;
const cash = (v: number) => "€ " + Number(v || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const Panel = ({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) => <section className="s5-card"><div className="s5-card-head"><div><span>{eyebrow}</span><h2>{title}</h2></div></div>{children}</section>;

export default function CalerisIntelligence({ session, scope }: { session: Session; scope: Scope }) {
  const [member, setMember] = useState<Row | null>(null);
  const [team, setTeam] = useState<Row | null>(null);
  const [seasons, setSeasons] = useState<Row[]>([]);
  const [activeSeason, setActiveSeason] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [roadmap, setRoadmap] = useState<Row | null>(null);
  const [suggestions, setSuggestions] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<Row[]>([]);
  const [budget, setBudget] = useState<Row | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [outflow, setOutflow] = useState(0);
  const [offers, setOffers] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [requestSalaryBand, setRequestSalaryBand] = useState<Row | null>(null);
  const [contracts, setContracts] = useState<Row[]>([]);
  const [health, setHealth] = useState<Row | null>(null);
  const [healthRuns, setHealthRuns] = useState<Row[]>([]);
  const [form, setForm] = useState<Row>({ targets: {}, category_budgets: {}, duration_seasons: "1" });
  const set = (key: string, value: any) => setForm((v: Row) => ({ ...v, [key]: value }));

  const refresh = useCallback(async () => {
    if (!supabase) { setNotice("Supabase belum dikonfigurasi."); setLoading(false); return; }
    setLoading(true); setNotice("");
    try {
      const [{ data: profile, error: profileError }, { data: seasonRows, error: seasonError }] = await Promise.all([
        supabase.from("profiles").select("member_id").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("license_seasons").select("id,title,starts_on,ends_on,status").order("starts_on", { ascending: false })
      ]);
      if (profileError) throw profileError;
      if (seasonError) throw seasonError;
      const nextSeasons = (seasonRows || []) as Row[];
      const current = nextSeasons.find(s => s.status === "active") || nextSeasons[0] || null;
      setSeasons(nextSeasons); setActiveSeason(current);
      if (scope === "operations") {
        const [{ data: snapshot, error: healthError }, { data: runs, error: runsError }] = await Promise.all([
          supabase.rpc("admin_get_system_health_snapshot"),
          supabase.from("caleris_system_health_runs").select("*").order("started_at", { ascending: false }).limit(20)
        ]);
        if (healthError) throw healthError;
        if (runsError) throw runsError;
        setHealth((snapshot || {}) as Row); setHealthRuns((runs || []) as Row[]);
        setLoading(false); return;
      }
      if (!profile?.member_id) throw new Error("Akun belum terhubung ke member CALERIS.");
      const { data: own, error: memberError } = await supabase.from("members").select("id,role,team_id,character_name,license").eq("id", profile.member_id).maybeSingle();
      if (memberError) throw memberError;
      if (!own) throw new Error("Member tidak ditemukan.");
      setMember(own as Row);
      const ownTeam = own.team_id ? await supabase.from("teams").select("id,name,division_key").eq("id", own.team_id).maybeSingle() : { data: null, error: null };
      if (ownTeam.error) throw ownTeam.error;
      setTeam(ownTeam.data as Row | null);

      if (scope === "roadmap") {
        if (own.role === "Driver") {
          const [{ data: roadmapRow, error: roadmapError }, { data: suggestionRows, error: suggestionError }] = await Promise.all([
            supabase.from("caleris_driver_roadmaps").select("*").eq("member_id", own.id).eq("season_id", current?.id || "00000000-0000-0000-0000-000000000000").maybeSingle(),
            supabase.from("caleris_driver_roadmap_suggestions").select("*").eq("member_id", own.id).order("created_at", { ascending: false })
          ]);
          if (roadmapError) throw roadmapError;
          if (suggestionError) throw suggestionError;
          setRoadmap(roadmapRow as Row | null); setSuggestions((suggestionRows || []) as Row[]);
          setForm((v: Row) => ({ ...v, targets: roadmapRow?.targets || {} }));
        } else if (own.role === "Owner" && own.team_id) {
          const [{ data: teamDrivers, error: driversError }, { data: suggestionRows, error: suggestionError }] = await Promise.all([
            supabase.from("members").select("id,character_name,license,team_id").eq("team_id", own.team_id).eq("role", "Driver").order("character_name"),
            supabase.from("caleris_driver_roadmap_suggestions").select("*").eq("team_id", own.team_id).order("created_at", { ascending: false })
          ]);
          if (driversError) throw driversError;
          if (suggestionError) throw suggestionError;
          setDrivers((teamDrivers || []) as Row[]); setSuggestions((suggestionRows || []) as Row[]);
        } else throw new Error("Roadmap hanya tersedia untuk Driver dan Team Owner.");
      }

      if (scope === "budget") {
        if (own.role !== "Owner" || !own.team_id || !current?.id) throw new Error("Budget Guard hanya tersedia untuk Team Owner dengan season aktif.");
        const [{ data: plan, error: planError }, { data: snapshot, error: snapshotError }] = await Promise.all([
          supabase.from("caleris_team_budget_plans").select("*").eq("team_id", own.team_id).eq("season_id", current.id).maybeSingle(),
          supabase.rpc("team_owner_get_budget_snapshot", { p_season_id: current.id })
        ]);
        if (planError) throw planError;
        if (snapshotError) throw snapshotError;
        setBudget(plan as Row | null); setForm((v: Row) => ({ ...v, planned_budget: String(plan?.planned_budget ?? ""), alert_threshold_percent: String(plan?.alert_threshold_percent ?? 80), category_budgets: plan?.category_budgets || {}, owner_notes: plan?.owner_notes || "" }));
        setWalletBalance(Number(snapshot?.wallet_balance || 0));
        setOutflow(Number(snapshot?.season_outflow || 0));
      }

      if (scope === "renewals") {
        if (own.role === "Owner" && own.team_id) {
          const [{ data: contractRows, error: contractError }, { data: driverRows, error: driverError }, { data: ownerOffers, error: offerError }, { data: ownerRequests, error: requestError }] = await Promise.all([
            supabase.from("economy_driver_contracts").select("*,members(character_name,license)").eq("team_id", own.team_id).eq("status", "active").order("created_at", { ascending: false }),
            supabase.from("members").select("id,character_name,license").eq("team_id", own.team_id).eq("role", "Driver").order("character_name"),
            supabase.from("caleris_driver_renewal_offers").select("*").eq("team_id", own.team_id).order("created_at", { ascending: false }),
            supabase.from("caleris_driver_contract_requests").select("*").eq("team_id", own.team_id).order("created_at", { ascending: false })
          ]);
          if (contractError) throw contractError;
          if (driverError) throw driverError;
          if (offerError) throw offerError;
          if (requestError) throw requestError;
          setContracts((contractRows || []) as Row[]); setDrivers((driverRows || []) as Row[]);
          setOffers((ownerOffers || []) as Row[]); setRequests((ownerRequests || []) as Row[]);
        } else if (own.role === "Driver") {
          const [{ data: driverOffers, error: offerError }, { data: driverRequests, error: requestError }] = await Promise.all([
            supabase.from("caleris_driver_renewal_offers").select("*,teams(name),license_seasons(title)").eq("member_id", own.id).order("created_at", { ascending: false }),
            supabase.from("caleris_driver_contract_requests").select("*").eq("member_id", own.id).order("created_at", { ascending: false })
          ]);
          if (offerError) throw offerError;
          if (requestError) throw requestError;
          setOffers((driverOffers || []) as Row[]); setRequests((driverRequests || []) as Row[]);
          const { data: salaryBands, error: bandError } = await supabase.from("caleris_driver_salary_bands")
            .select("license_label,salary_min_eur,salary_max_eur")
            .ilike("license_label", String(own.license || "").toUpperCase()==="A" ? "Super License" : String(own.license || ""));
          if (bandError) throw bandError;
          setRequestSalaryBand((salaryBands || [])[0] as Row | null);
        } else throw new Error("Renewal Center hanya tersedia untuk Driver dan Team Owner.");
      }
    } catch (error: any) {
      setNotice(error?.message || "Gagal memuat CALERIS Intelligence.");
    } finally { setLoading(false); }
  }, [session.user.id, scope]);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveRoadmap = async () => {
    if (!supabase || !member || !activeSeason) return;
    setSaving(true); setNotice("");
    const targets = Object.fromEntries(DRIVER_ATTRIBUTES.map(([key]) => [key, Math.max(50, Math.min(100, Number(form.targets?.[key] ?? 50)))]));
    const { error } = await supabase.from("caleris_driver_roadmaps").upsert({
      member_id: member.id, season_id: activeSeason.id, title: String(form.roadmap_title || "Driver Development Roadmap"),
      targets, notes: String(form.roadmap_notes || "").trim() || null, status: "active", updated_at: new Date().toISOString()
    }, { onConflict: "member_id,season_id" });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Roadmap tersimpan. Target tidak mengubah atribut atau hasil race secara otomatis."); await refresh();
  };

  const suggestRoadmap = async () => {
    if (!supabase || !form.driver_id || !form.attribute_key) return;
    setSaving(true); setNotice("");
    const { error } = await supabase.from("caleris_driver_roadmap_suggestions").insert({
      member_id: form.driver_id, team_id: member?.team_id, suggested_by: session.user.id,
      attribute_key: form.attribute_key, target_value: Number(form.target_value || 50),
      note: String(form.suggestion_note || "").trim() || null
    });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Saran dikirim. Driver yang menentukan apakah target diterapkan."); await refresh();
  };

  const decideSuggestion = async (suggestion: Row, accepted: boolean) => {
    if (!supabase || !member) return;
    setSaving(true); setNotice("");
    const { error } = await supabase.from("caleris_driver_roadmap_suggestions").update({ status: accepted ? "accepted" : "rejected", decided_at: new Date().toISOString() }).eq("id", suggestion.id);
    if (error) { setSaving(false); setNotice(error.message); return; }
    if (accepted && activeSeason) {
      const targets = { ...(roadmap?.targets || {}), [suggestion.attribute_key]: Number(suggestion.target_value) };
      const { error: roadmapError } = await supabase.from("caleris_driver_roadmaps").upsert({ member_id: member.id, season_id: activeSeason.id, targets, status: "active" }, { onConflict: "member_id,season_id" });
      if (roadmapError) { setSaving(false); setNotice(roadmapError.message); await refresh(); return; }
    }
    setSaving(false); setNotice(accepted ? "Saran diterapkan ke roadmap oleh keputusan Driver." : "Saran ditolak oleh Driver."); await refresh();
  };

  const saveBudget = async () => {
    if (!supabase || !member?.team_id || !activeSeason) return;
    setSaving(true); setNotice("");
    const total = Number(form.planned_budget);
    if (!Number.isFinite(total) || total < 0) { setSaving(false); setNotice("Total budget harus nol atau lebih."); return; }
    const categoryBudgets = Object.fromEntries(["payroll","development","team_hq","operations","reserve"].map(key => [key, Math.max(0, Number(form.category_budgets?.[key] || 0))]));
    if (Object.values(categoryBudgets).reduce((n: number, v: any) => n + Number(v), 0) > total) { setSaving(false); setNotice("Total alokasi kategori tidak boleh melebihi total budget."); return; }
    const { error } = await supabase.from("caleris_team_budget_plans").upsert({
      team_id: member.team_id, season_id: activeSeason.id, planned_budget: total,
      alert_threshold_percent: Number(form.alert_threshold_percent || 80),
      category_budgets: categoryBudgets, owner_notes: String(form.owner_notes || "").trim() || null,
      created_by: session.user.id, updated_at: new Date().toISOString()
    }, { onConflict: "team_id,season_id" });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Budget Guard tersimpan. Mode saat ini hanya monitoring dan peringatan, tidak memblokir payroll atau transaksi Economy Engine."); await refresh();
  };

  const sendRenewal = async () => {
    if (!supabase || (!form.request_id && !form.contract_id) || !form.duration_seasons) return;
    setSaving(true); setNotice("");
    const requestId = String(form.request_id || "");
    const { error } = requestId
      ? await supabase.rpc("team_owner_offer_driver_renewal_from_request", {
          p_request_id: requestId, p_duration_seasons: Number(form.duration_seasons),
          p_proposed_salary: Number(form.proposed_salary), p_offer_note: String(form.offer_note || "").trim() || null
        })
      : await supabase.rpc("team_owner_offer_driver_renewal", {
          p_current_contract_id: form.contract_id, p_duration_seasons: Number(form.duration_seasons),
          p_proposed_salary: Number(form.proposed_salary), p_offer_note: String(form.offer_note || "").trim() || null
        });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Penawaran renewal terkirim ke Driver. Keputusan sepenuhnya berada di tangan Driver."); await refresh();
  };

  const submitContractRequest = async () => {
    if (!supabase || !member?.team_id || !form.requested_salary || !form.requested_duration_seasons) return;
    setSaving(true); setNotice("");
    const { error } = await supabase.rpc("member_submit_driver_contract_request", {
      p_requested_salary: Number(form.requested_salary),
      p_duration_seasons: Number(form.requested_duration_seasons),
      p_request_note: String(form.request_note || "").trim() || null
    });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Pengajuan kontrak berhasil dikirim ke Team Owner."); setForm((v: Row) => ({ ...v, requested_salary: "", request_note: "" })); await refresh();
  };

  const declineContractRequest = async (request: Row) => {
    if (!supabase) return;
    setSaving(true); setNotice("");
    const { error } = await supabase.rpc("team_owner_decline_driver_contract_request", {
      p_request_id: request.id, p_response_note: String(form.response_note || "").trim() || null
    });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Pengajuan kontrak ditolak dan statusnya tercatat."); setForm((v: Row) => ({ ...v, response_note: "" })); await refresh();
  };

  const decideRenewal = async (offer: Row, accept: boolean) => {
    if (!supabase) return;
    setSaving(true); setNotice("");
    const { error } = await supabase.rpc("member_decide_driver_renewal", { p_offer_id: offer.id, p_accept: accept, p_driver_note: String(form.driver_note || "").trim() || null });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setNotice(accept ? "Renewal diterima. Kontrak season berikutnya dibuat." : "Renewal ditolak. Status Driver mengikuti lifecycle kontrak yang berlaku."); await refresh();
  };

  const progressPercent = budget && Number(budget.planned_budget) > 0 ? Math.min(100, outflow / Number(budget.planned_budget) * 100) : 0;
  
  const categories = ["payroll","development","team_hq","operations","reserve"];

  if (loading) return <section className="workspace s5-workspace"><div className="s5-loading"><Activity className="s5-pulse"/> Memuat Intelligence...</div></section>;
  return <section className="workspace s5-workspace">
    <header className="page-heading"><span className="section-eyebrow">CALERIS MASTERS · INTELLIGENCE</span><h1 className="page-title">{scope === "roadmap" ? "Development Roadmap" : scope === "budget" ? "Team Budget Guard" : scope === "renewals" ? "Contract Renewal Center" : "Operations Intelligence"}</h1><p className="page-description">{scope === "roadmap" ? "Target pengembangan milik Driver. Team Owner hanya dapat memberi saran." : scope === "budget" ? "Rencana dan pemantauan pengeluaran tim berdasarkan ledger Economy Engine." : scope === "renewals" ? "Negosiasi kontrak untuk season berikutnya. Keputusan akhir ada pada Driver." : "Ringkasan kondisi engine dan rekonsiliasi operasional CALERIS."}</p></header>
    {notice && <div className="s5-notice" role="status">{notice}</div>}
    {scope === "roadmap" && member?.role === "Driver" && <>
      <Panel title="Roadmap target" eyebrow={activeSeason?.title || "SEASON"}>
        <div className="s5-form"><label className="s5-field"><span>Judul roadmap</span><input value={form.roadmap_title ?? roadmap?.title ?? "Driver Development Roadmap"} onChange={e=>set("roadmap_title",e.target.value)}/></label>
          <div className="s5-form-grid">{DRIVER_ATTRIBUTES.map(([key,label])=><label className="s5-field" key={key}><span>{label} · target</span><input type="number" min="50" max="100" value={form.targets?.[key] ?? 50} onChange={e=>set("targets",{...form.targets,[key]:e.target.value})}/></label>)}</div>
          <label className="s5-field"><span>Catatan pribadi</span><textarea rows={3} value={form.roadmap_notes ?? roadmap?.notes ?? ""} onChange={e=>set("roadmap_notes",e.target.value)}/></label>
          <button className="s5-primary" disabled={saving || !activeSeason} onClick={()=>void saveRoadmap()}><Target size={15}/> Simpan roadmap</button>
        </div>
      </Panel>
      <Panel title="Saran Team Owner" eyebrow="DRIVER DECISION">
        {suggestions.filter(s=>s.status==="pending").length ? suggestions.filter(s=>s.status==="pending").map(s=><article className="s5-record" key={s.id}><b>{String(s.attribute_key).replaceAll("_"," ")} → {s.target_value}</b><p>{s.note || "Saran pengembangan dari Team Owner."}</p><div className="s5-actions"><button className="s5-primary" disabled={saving} onClick={()=>void decideSuggestion(s,true)}>Terima saran</button><button className="s5-secondary" disabled={saving} onClick={()=>void decideSuggestion(s,false)}>Tolak</button></div></article>) : <p className="s5-footnote">Belum ada saran yang menunggu keputusan.</p>}
      </Panel>
    </>}
    {scope === "roadmap" && member?.role === "Owner" && <Panel title="Saran target untuk Driver" eyebrow={team?.name || "TEAM OWNER"}>
      <div className="s5-form"><label className="s5-field"><span>Driver</span><select value={form.driver_id||""} onChange={e=>set("driver_id",e.target.value)}><option value="">Pilih Driver</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.character_name}</option>)}</select></label>
      <label className="s5-field"><span>Atribut</span><select value={form.attribute_key||""} onChange={e=>set("attribute_key",e.target.value)}><option value="">Pilih atribut</option>{DRIVER_ATTRIBUTES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="s5-field"><span>Target yang disarankan</span><input type="number" min="50" max="100" value={form.target_value||70} onChange={e=>set("target_value",e.target.value)}/></label>
      <label className="s5-field"><span>Catatan</span><textarea rows={2} value={form.suggestion_note||""} onChange={e=>set("suggestion_note",e.target.value)}/></label>
      <button className="s5-primary" disabled={saving||!form.driver_id||!form.attribute_key} onClick={()=>void suggestRoadmap()}>Kirim saran</button></div>
      <div className="s5-record-list">{suggestions.map(s=><article className="s5-record" key={s.id}><b>{drivers.find(d=>d.id===s.member_id)?.character_name || "Driver"} · {s.attribute_key} {s.target_value}</b><small>{s.status.toUpperCase()} · {s.note||"—"}</small></article>)}</div>
    </Panel>}
    {scope === "budget" && <><div className="s5-grid s5-grid-3"><div className="s5-stat"><span>TEAM WALLET</span><strong>{cash(walletBalance)}</strong></div><div className="s5-stat"><span>OUTFLOW TERCATAT</span><strong>{cash(outflow)}</strong></div><div className="s5-stat"><span>PLANNED BUDGET</span><strong>{cash(Number(budget?.planned_budget||form.planned_budget||0))}</strong></div></div>
      <Panel title="Budget configuration" eyebrow={activeSeason?.title || "ACTIVE SEASON"}><div className="s5-form"><label className="s5-field"><span>Total budget (€)</span><input type="number" min="0" step="0.01" value={form.planned_budget||""} onChange={e=>set("planned_budget",e.target.value)}/></label><label className="s5-field"><span>Alert threshold (%)</span><input type="number" min="1" max="100" value={form.alert_threshold_percent||80} onChange={e=>set("alert_threshold_percent",e.target.value)}/></label><div className="s5-form-grid">{categories.map(key=><label className="s5-field" key={key}><span>{key.replaceAll("_"," ")} (€)</span><input type="number" min="0" step="0.01" value={form.category_budgets?.[key]||""} onChange={e=>set("category_budgets",{...form.category_budgets,[key]:e.target.value})}/></label>)}</div><label className="s5-field"><span>Catatan Owner</span><textarea rows={2} value={form.owner_notes||""} onChange={e=>set("owner_notes",e.target.value)}/></label><button className="s5-primary" disabled={saving} onClick={()=>void saveBudget()}><Wallet size={15}/> Simpan budget</button></div></Panel>
      <Panel title="Spending monitor" eyebrow="LEDGER-BASED · MONITOR ONLY"><p className="s5-history">Outflow dihitung dari transaksi Economy Engine yang bersumber dari Team Wallet. Data tidak membuat saldo bayangan dan tidak memblokir payroll.</p><div className="s5-stat"><span>ESTIMATED BUDGET CONSUMPTION</span><strong>{progressPercent.toFixed(1)}%</strong><small>{cash(outflow)} / {cash(Number(budget?.planned_budget||0))}</small></div>{budget && progressPercent>=Number(budget.alert_threshold_percent)?<p className="s5-notice">Peringatan: pengeluaran sudah melewati ambang yang ditetapkan Owner.</p>:<p className="s5-footnote">Pengeluaran masih di bawah ambang peringatan Owner.</p>}</Panel></>}
    {scope === "renewals" && member?.role === "Owner" && <>
      <Panel title="Pengajuan dari Driver" eyebrow={team?.name || "TEAM OWNER"}>
        {requests.filter(r=>r.status==="pending").length ? requests.filter(r=>r.status==="pending").map(request=><article className="s5-record" key={request.id}>
          <b>{drivers.find(d=>d.id===request.member_id)?.character_name || "Driver"} · {cash(request.requested_salary)} / season</b>
          <small>{Number(request.requested_duration_seasons)} Season · {new Date(request.created_at).toLocaleString("id-ID")}</small>
          <p>{request.request_note || "Tidak ada catatan tambahan."}</p>
          <div className="s5-actions">
            <button className="s5-primary" disabled={saving} onClick={()=>setForm((v:Row)=>({...v,request_id:request.id,contract_id:request.current_contract_id,duration_seasons:String(request.requested_duration_seasons),proposed_salary:String(request.requested_salary),offer_note:request.request_note||""}))}>Buat penawaran</button>
            <button className="s5-secondary" disabled={saving} onClick={()=>void declineContractRequest(request)}>Tolak</button>
          </div>
        </article>) : <p className="s5-footnote">Belum ada pengajuan kontrak baru dari Driver.</p>}
      </Panel>
      <Panel title="Buat penawaran renewal" eyebrow={team?.name || "TEAM OWNER"}><div className="s5-form"><label className="s5-field"><span>Kontrak Driver</span><select value={form.contract_id||""} onChange={e=>set("contract_id",e.target.value)}><option value="">Pilih kontrak aktif</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.members?.character_name||"Driver"} · {cash(c.annual_salary)}</option>)}</select></label><label className="s5-field"><span>Durasi kontrak</span><select value={form.duration_seasons||"1"} onChange={e=>set("duration_seasons",e.target.value)}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} Season</option>)}</select></label><label className="s5-field"><span>Gaji tahunan yang ditawarkan (€)</span><input type="number" min="0" step="0.01" value={form.proposed_salary||""} onChange={e=>set("proposed_salary",e.target.value)}/></label><label className="s5-field"><span>Catatan penawaran</span><textarea rows={2} value={form.offer_note||""} onChange={e=>set("offer_note",e.target.value)}/></label><button className="s5-primary" disabled={saving||(!form.request_id&&!form.contract_id)||!form.duration_seasons} onClick={()=>void sendRenewal()}><FileSignature size={15}/> {form.request_id?"Kirim penawaran untuk pengajuan":"Kirim penawaran"}</button></div></Panel>
      <Panel title="Status penawaran" eyebrow="RENEWAL HISTORY">{offers.map(o=><article className="s5-record" key={o.id}><b>{drivers.find(d=>d.id===o.member_id)?.character_name||"Driver"} · {cash(o.proposed_salary)}</b><small>{seasons.find(s=>s.id===o.renewal_season_id)?.title||"Season"} · {Number(o.duration_seasons||1)} Season · {o.status.toUpperCase()}</small></article>)}</Panel></>}
    {scope === "renewals" && member?.role === "Driver" && <>
      <Panel title="Ajukan kontrak baru ke Team Owner" eyebrow={team?.name || "DRIVER CONTRACT REQUEST"}>
        {member?.team_id ? <div className="s5-form">
          <p className="s5-footnote">Ajukan perpanjangan jika kontrak aktif, atau pengajuan kontrak pertama jika kamu belum memiliki kontrak aktif. Lamaran ke tim lain tetap dilakukan melalui Job Search.</p>
          {requestSalaryBand&&<p className="s5-footnote">Salary band lisensi {member.license}: {cash(requestSalaryBand.salary_min_eur)} – {cash(requestSalaryBand.salary_max_eur)} per season.</p>}
          <label className="s5-field"><span>Gaji tahunan yang diajukan (€)</span><input type="number" min={requestSalaryBand?.salary_min_eur||1} max={requestSalaryBand?.salary_max_eur||undefined} step="0.01" value={form.requested_salary||""} onChange={e=>set("requested_salary",e.target.value)} placeholder="Masukkan nominal dalam salary band lisensi"/></label>
          <label className="s5-field"><span>Durasi kontrak</span><select value={form.requested_duration_seasons||"1"} onChange={e=>set("requested_duration_seasons",e.target.value)}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} Season</option>)}</select></label>
          <label className="s5-field"><span>Catatan untuk Team Owner</span><textarea rows={3} maxLength={1000} value={form.request_note||""} onChange={e=>set("request_note",e.target.value)} placeholder="Sampaikan permintaan dan pertimbangan kontrakmu."/></label>
          <button className="s5-primary" disabled={saving||requests.some(r=>r.status==="pending")||!form.requested_salary||Number(form.requested_salary)<=0} onClick={()=>void submitContractRequest()}><FileSignature size={15}/> Kirim pengajuan kontrak</button>
          {requests.some(r=>r.status==="pending")&&<p className="s5-footnote">Pengajuan sebelumnya masih menunggu keputusan Team Owner.</p>}
        </div> : <p className="s5-footnote">Akun Driver belum terhubung ke tim. Hubungi administrator atau gunakan Job Search untuk mencari tim.</p>}
      </Panel>
      <Panel title="Status pengajuan dan penawaran" eyebrow="DRIVER CONTRACTS">
        {requests.map(r=><article className="s5-record" key={r.id}><b>Pengajuan · {cash(r.requested_salary)} / season</b><small>{Number(r.requested_duration_seasons)} Season · {r.status.toUpperCase()} · {new Date(r.created_at).toLocaleString("id-ID")}</small>{r.owner_response_note&&<p>{r.owner_response_note}</p>}</article>)}
        {offers.map(o=><article className="s5-record" key={o.id}><b>{o.teams?.name||"Team"} · {cash(o.proposed_salary)} / season</b><small>{o.license_seasons?.title||"Season"} · {Number(o.duration_seasons||1)} Season · {o.status.toUpperCase()}</small><p>{o.offer_note||"Tidak ada catatan tambahan."}</p>{o.status==="offered"&&<><label className="s5-field"><span>Catatan keputusan (opsional)</span><textarea rows={2} value={form.driver_note||""} onChange={e=>set("driver_note",e.target.value)}/></label><div className="s5-actions"><button className="s5-primary" disabled={saving} onClick={()=>void decideRenewal(o,true)}>Terima</button><button className="s5-secondary" disabled={saving} onClick={()=>void decideRenewal(o,false)}>Tolak</button></div></>}</article>)}
        {!requests.length&&!offers.length&&<p className="s5-footnote">Belum ada pengajuan atau penawaran kontrak.</p>}
      </Panel>
    </>}
    {scope === "operations" && <><div className="s5-grid s5-grid-4">{Object.entries(health||{}).filter(([,v])=>typeof v==="number").map(([k,v])=><div className="s5-stat" key={k}><span>{k.replaceAll("_"," ").toUpperCase()}</span><strong>{String(v)}</strong></div>)}</div><Panel title="Latest system health runs" eyebrow="ADMIN ONLY">{healthRuns.length?healthRuns.map(run=><article className="s5-record" key={run.id}><b>{String(run.status||"UNKNOWN").toUpperCase()} · {new Date(run.started_at).toLocaleString("id-ID")}</b><small>Wallet mismatch {run.wallet_mismatches} · Cron failure 24h {run.cron_failures_24h} · Pending payroll {run.pending_payroll} · Race waiting result {run.races_awaiting_result} · Missing calendar {run.seasons_missing_calendar}</small>{run.error&&<p>{run.error}</p>}</article>):<p className="s5-footnote">Belum ada health run yang tercatat.</p>}</Panel></>}
    <div className="s5-actions"><button className="s5-secondary" onClick={()=>void refresh()} disabled={saving}><RefreshCw size={14}/> Refresh</button><span className="s5-footnote">CALERIS · {team?.name || member?.character_name || "Admin"}</span></div>
  </section>;
}
