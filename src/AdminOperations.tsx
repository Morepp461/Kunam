import {useCallback,useEffect,useState} from "react";
import type {FormEvent} from "react";
import {ArrowLeft,Coins,Handshake,RefreshCw,Save,ShieldCheck,Trash2,Trophy,Wallet} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type TaxRule={id:string;tax_type:"wealth"|"driver_transfer";tax_scope:"member"|"team";label:string;minimum_base:number;rate_percent:number;is_active:boolean;sort_order:number};
type WealthAssessment={id:string;season_id:string;target_kind:"member"|"team";member_id:string|null;team_id:string|null;wallet_balance_snapshot:number;applied_rate:number;tax_amount:number;status:string;assessed_at:string};
type Division={id:string;season_id:string;division_key:string;division_name:string;season?:{title:string}};
type PrizeRule={id:string;season_division_id:string;driver_win_ddp:number;team_win_tdp:number;driver_pole_ddp:number;team_pole_tdp:number;is_active:boolean};
type Sponsor={id:string;name:string;description:string|null;industry:string|null;available_budget:number|null;is_active:boolean};
type Team={id:string;name:string;division_key:string|null};
type Valuation={id:string;team_id:string;assets_value:number;development_value:number;history_value:number;achievements_value:number;financial_health_value:number;total_valuation:number;assessed_at:string;team?:{name:string}};
type Tab="tax"|"prizes"|"sponsors"|"valuation";
const money=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
const number=(v:string)=>v.trim()===""?0:Number(v);
export default function AdminOperations({session}:{session:Session}){
 const [tab,setTab]=useState<Tab>("tax"),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [taxRules,setTaxRules]=useState<TaxRule[]>([]),[divisions,setDivisions]=useState<Division[]>([]),[prizes,setPrizes]=useState<PrizeRule[]>([]),[assessments,setAssessments]=useState<WealthAssessment[]>([]);
 const [sponsors,setSponsors]=useState<Sponsor[]>([]),[teams,setTeams]=useState<Team[]>([]),[valuations,setValuations]=useState<Valuation[]>([]);
 const [taxType,setTaxType]=useState<"wealth"|"driver_transfer">("wealth"),[taxScope,setTaxScope]=useState<"member"|"team">("member"),[taxLabel,setTaxLabel]=useState(""),[taxMinimum,setTaxMinimum]=useState(""),[taxRate,setTaxRate]=useState(""),[taxActive,setTaxActive]=useState(true),[editingTax,setEditingTax]=useState<string|null>(null),[wealthSeasonId,setWealthSeasonId]=useState("");
 const [divisionId,setDivisionId]=useState(""),[driverWin,setDriverWin]=useState(""),[teamWin,setTeamWin]=useState(""),[driverPole,setDriverPole]=useState(""),[teamPole,setTeamPole]=useState(""),[prizeActive,setPrizeActive]=useState(false);
 const [sponsorId,setSponsorId]=useState<string|null>(null),[sponsorName,setSponsorName]=useState(""),[sponsorDescription,setSponsorDescription]=useState(""),[sponsorIndustry,setSponsorIndustry]=useState(""),[sponsorBudget,setSponsorBudget]=useState(""),[sponsorActive,setSponsorActive]=useState(true);
 const [teamId,setTeamId]=useState(""),[assetValue,setAssetValue]=useState(""),[developmentValue,setDevelopmentValue]=useState(""),[historyValue,setHistoryValue]=useState(""),[achievementValue,setAchievementValue]=useState(""),[financialValue,setFinancialValue]=useState(""),[valuationNote,setValuationNote]=useState("");

 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const [tax,division,prize,sponsor,team,valuation,assessment]=await Promise.all([
   supabase.from("caleris_tax_rules").select("*").order("tax_type").order("minimum_base",{ascending:true}),
   supabase.from("license_season_divisions").select("id,season_id,division_key,division_name,license_seasons(title)").order("created_at",{ascending:false}),
   supabase.from("caleris_race_reward_rules").select("*"),
   supabase.from("caleris_sponsors").select("*").order("name"),
   supabase.from("teams").select("id,name,division_key").order("name"),
   supabase.from("caleris_team_valuations").select("*,teams(name)").order("assessed_at",{ascending:false}).limit(100),
   supabase.from("caleris_wealth_tax_assessments_v2").select("*").order("assessed_at",{ascending:false}).limit(100),
  ]);
  const err=[tax.error,division.error,prize.error,sponsor.error,team.error,valuation.error,assessment.error].find(Boolean);
  if(err)setNotice(err.message);
  setTaxRules((tax.data||[]) as TaxRule[]);
  const nextDivisions=(division.data||[]).map((x:any)=>({...x,season:x.license_seasons})) as Division[];
  setDivisions(nextDivisions);setWealthSeasonId(current=>current||nextDivisions[0]?.season_id||"");
  setAssessments((assessment.data||[]) as WealthAssessment[]);
  setPrizes((prize.data||[]) as PrizeRule[]);
  setSponsors((sponsor.data||[]) as Sponsor[]);
  setTeams((team.data||[]) as Team[]);
  setValuations((valuation.data||[]).map((x:any)=>({...x,team:x.teams})) as Valuation[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);

 const saveTax=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase)return;
  const minimum=number(taxMinimum),rate=number(taxRate);
  if(!taxLabel.trim()||!Number.isFinite(minimum)||minimum<0||!Number.isFinite(rate)||rate<0||rate>100){setNotice("Periksa nama, ambang saldo, dan tarif pajak.");return}
  setSaving(true);
  const payload={tax_type:taxType,tax_scope:taxType==="wealth"?taxScope:"member",label:taxLabel.trim(),minimum_base:minimum,rate_percent:rate,is_active:taxActive,updated_by:session.user.id,updated_at:new Date().toISOString()};
  const result=editingTax?await supabase.from("caleris_tax_rules").update(payload).eq("id",editingTax):await supabase.from("caleris_tax_rules").insert({...payload,created_by:session.user.id});
  setSaving(false);if(result.error){setNotice(result.error.message);return}
  setNotice("Aturan pajak tersimpan.");resetTax();await refresh();
 };
 const resetTax=()=>{setEditingTax(null);setTaxScope("member");setTaxLabel("");setTaxMinimum("");setTaxRate("");setTaxActive(true)};

 const editTax=(r:TaxRule)=>{setEditingTax(r.id);setTaxType(r.tax_type);setTaxScope(r.tax_scope||"member");setTaxLabel(r.label);setTaxMinimum(String(r.minimum_base));setTaxRate(String(r.rate_percent));setTaxActive(r.is_active)};
 const deleteTax=async(id:string)=>{if(!supabase||!window.confirm("Hapus aturan pajak ini?"))return;const {error}=await supabase.from("caleris_tax_rules").delete().eq("id",id);setNotice(error?.message||"Aturan dihapus.");await refresh()};


 const seasonOptions=Array.from(new Map(divisions.map(d=>[d.season_id,{id:d.season_id,title:d.season?.title||"Season"}])).values());
 const runWealthTax=async(action:"wealth_tax_assess"|"wealth_tax_collect")=>{
  if(!supabase||!wealthSeasonId)return;
  setSaving(true);setNotice("");
  const {data,error}=await supabase.functions.invoke("economy-engine",{body:{action,seasonId:wealthSeasonId}});
  setSaving(false);
  if(error){setNotice(error.message);return}
  const result=(data as {result?:Record<string,unknown>})?.result||{};
  setNotice(action==="wealth_tax_assess"
   ? "Assessment dibuat: "+String(result.member_assessments_created??0)+" member, "+String(result.team_assessments_created??0)+" tim."
   : "Penagihan selesai: "+String(result.paid??0)+" lunas, "+String(result.insufficient_balance??0)+" saldo belum cukup, "+String(result.skipped??0)+" dilewati.");
  await refresh();
 };

 const savePrize=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!divisionId)return;
  const values=[driverWin,teamWin,driverPole,teamPole].map(number);
  if(values.some(v=>!Number.isFinite(v)||v<0)){setNotice("Nilai token tidak boleh negatif.");return}
  setSaving(true);
  const {error}=await supabase.from("caleris_race_reward_rules").upsert({season_division_id:divisionId,driver_win_ddp:values[0],team_win_tdp:values[1],driver_pole_ddp:values[2],team_pole_tdp:values[3],is_active:prizeActive,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:"season_division_id"});
  setSaving(false);setNotice(error?.message||"Aturan DDP/TDP tersimpan. Tidak ada token yang dibagikan sebelum hasil race dicatat.");await refresh();
 };
 const choosePrize=(id:string)=>{setDivisionId(id);const p=prizes.find(x=>x.season_division_id===id);setDriverWin(String(p?.driver_win_ddp??""));setTeamWin(String(p?.team_win_tdp??""));setDriverPole(String(p?.driver_pole_ddp??""));setTeamPole(String(p?.team_pole_tdp??""));setPrizeActive(p?.is_active??false)};

 const saveSponsor=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!sponsorName.trim())return;
  const budget=sponsorBudget.trim()===""?null:number(sponsorBudget);
  if(budget!==null&&(!Number.isFinite(budget)||budget<0)){setNotice("Budget sponsor tidak valid.");return}
  setSaving(true);const payload={name:sponsorName.trim(),description:sponsorDescription.trim()||null,industry:sponsorIndustry.trim()||null,available_budget:budget,is_active:sponsorActive,updated_at:new Date().toISOString()};
  const result=sponsorId?await supabase.from("caleris_sponsors").update(payload).eq("id",sponsorId):await supabase.from("caleris_sponsors").insert({...payload,created_by:session.user.id});
  setSaving(false);setNotice(result.error?.message||"Data sponsor tersimpan.");if(!result.error){resetSponsor();await refresh()}
 };
 const resetSponsor=()=>{setSponsorId(null);setSponsorName("");setSponsorDescription("");setSponsorIndustry("");setSponsorBudget("");setSponsorActive(true)};
 const editSponsor=(s:Sponsor)=>{setSponsorId(s.id);setSponsorName(s.name);setSponsorDescription(s.description||"");setSponsorIndustry(s.industry||"");setSponsorBudget(s.available_budget==null?"":String(s.available_budget));setSponsorActive(s.is_active)};
 const deleteSponsor=async(id:string)=>{if(!supabase||!window.confirm("Hapus sponsor dari pool? Sponsor yang sudah memiliki kontrak akan ditolak database."))return;const {error}=await supabase.from("caleris_sponsors").delete().eq("id",id);setNotice(error?.message||"Sponsor dihapus.");await refresh()};

 const divisionOptions=Array.from(new Map(divisions.map(d=>[d.division_key,d.division_name])).entries());
 const assignTeamTier=async(id:string,key:string)=>{if(!supabase)return;setSaving(true);const {error}=await supabase.rpc("admin_set_team_division",{p_team_id:id,p_division_key:key||null});setSaving(false);setNotice(error?.message||"Tier tim diperbarui.");await refresh()};
 const saveValuation=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!teamId)return;
  const values=[assetValue,developmentValue,historyValue,achievementValue,financialValue].map(number);
  if(values.some(v=>!Number.isFinite(v)||v<0)){setNotice("Nilai komponen valuasi harus nol atau lebih.");return}
  setSaving(true);const {error}=await supabase.from("caleris_team_valuations").insert({team_id:teamId,assets_value:values[0],development_value:values[1],history_value:values[2],achievements_value:values[3],financial_health_value:values[4],notes:valuationNote.trim()||null,assessed_by:session.user.id});
  setSaving(false);setNotice(error?.message||"Snapshot valuasi tim tersimpan.");if(!error){setAssetValue("");setDevelopmentValue("");setHistoryValue("");setAchievementValue("");setFinancialValue("");setValuationNote("");await refresh()}
 };

 return <section className="workspace ops-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="economy-heading"><div><span className="section-eyebrow">ADMIN CONTROL · OPERATIONS</span><h1>Operations Suite</h1><p>Konfigurasi pajak, hadiah development, sponsor pool, dan valuasi tim.</p></div><span className="economy-admin-mark"><ShieldCheck size={16}/> ADMIN ONLY</span></header>
  <nav className="ops-tabs" aria-label="Operations modules">
   <button className={tab==="tax"?"active":""} onClick={()=>setTab("tax")}><Wallet size={16}/> Tax Rules</button>
   <button className={tab==="prizes"?"active":""} onClick={()=>setTab("prizes")}><Trophy size={16}/> Race Rewards</button>
   <button className={tab==="sponsors"?"active":""} onClick={()=>setTab("sponsors")}><Handshake size={16}/> Sponsor Pool</button>
   <button className={tab==="valuation"?"active":""} onClick={()=>setTab("valuation")}><Coins size={16}/> Team Valuation</button>
   <button className="ops-refresh" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/></button>
  </nav>
  {tab==="tax"&&<div className="ops-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">CONFIGURABLE TAX</span><h2>{editingTax?"Edit tax rule":"Tambah tax rule"}</h2></div></div>
    <form className="economy-form" onSubmit={saveTax}>
     <label>Jenis pajak<select value={taxType} onChange={e=>setTaxType(e.target.value as "wealth"|"driver_transfer")}><option value="wealth">Wealth Tax · saldo wallet</option><option value="driver_transfer">Driver Transfer Tax</option></select></label>
     {taxType==="wealth"&&<label>Kategori Wealth Tax<select value={taxScope} onChange={e=>setTaxScope(e.target.value as "member"|"team")}><option value="member">Member · gabungan wallet personal</option><option value="team">Team · Team Wallet</option></select></label>}
     <label>Nama aturan<input value={taxLabel} onChange={e=>setTaxLabel(e.target.value)} required maxLength={100}/></label>
     <label>Ambang minimum (¢p)<input type="number" min="0" step="0.01" value={taxMinimum} onChange={e=>setTaxMinimum(e.target.value)} required/></label>
     <label>Tarif flat (%)<input type="number" min="0" max="100" step="0.0001" value={taxRate} onChange={e=>setTaxRate(e.target.value)} required/></label>
     <label className="economy-toggle"><input type="checkbox" checked={taxActive} onChange={e=>setTaxActive(e.target.checked)}/> Aktif</label>
     <p className="economy-form-hint">Tarif flat: sistem memilih satu tarif tertinggi dari ambang yang terlampaui dan menerapkannya ke seluruh saldo. Ambang Member dan Team berdiri sendiri; penagihan tidak menggabungkan wallet tim dengan wallet personal.</p>
     <div className="ops-actions"><button className="economy-primary-button" disabled={saving}><Save size={15}/> Simpan aturan</button>{editingTax&&<button type="button" className="economy-secondary-button" onClick={resetTax}>Batal</button>}</div>
    </form>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">TAX TABLE</span><h2>Aturan tersimpan</h2></div></div>
    {loading?"Memuat...":taxRules.length===0?<p className="economy-empty">Belum ada aturan. Tidak ada pajak otomatis sebelum Admin membuat dan mengaktifkan konfigurasi.</p>:<div className="ops-record-list">{taxRules.map(r=><article key={r.id}><div><strong>{r.label}</strong><small>{r.tax_type==="wealth"?"Wealth Tax · "+(r.tax_scope==="team"?"Team":"Member"):"Driver Transfer Tax"} · Ambang {money(r.minimum_base)} · Tarif {r.rate_percent}% · {r.is_active?"Aktif":"Nonaktif"}</small></div><div className="ops-record-actions"><button onClick={()=>editTax(r)}>Edit</button><button onClick={()=>void deleteTax(r.id)} aria-label="Hapus aturan"><Trash2 size={14}/></button></div></article>)}</div>}
    <p className="economy-form-hint">Ambang Member dan Team dikonfigurasi terpisah. Driver Transfer Tax tetap memakai aturan tersendiri.</p>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">WEALTH TAX PROCESSING</span><h2>Assessment & collection</h2></div></div>
    <div className="economy-form">
     <label>Season<select value={wealthSeasonId} onChange={e=>setWealthSeasonId(e.target.value)} required><option value="">Pilih season</option>{seasonOptions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
     <div className="ops-actions"><button type="button" className="economy-primary-button" disabled={saving||!wealthSeasonId} onClick={()=>void runWealthTax("wealth_tax_assess")}>Generate assessment</button><button type="button" className="economy-secondary-button" disabled={saving||!wealthSeasonId||!assessments.some(a=>a.season_id===wealthSeasonId&&a.status==="assessed")} onClick={()=>void runWealthTax("wealth_tax_collect")}>Collect tax</button></div>
     <p className="economy-form-hint">Assessment menyimpan snapshot saldo saat dijalankan. Collection hanya menagih assessment berstatus assessed dan tidak akan membuat saldo wallet negatif. Member dapat ditagih dari beberapa wallet personal secara berurutan.</p>
    </div>
    {assessments.filter(a=>!wealthSeasonId||a.season_id===wealthSeasonId).length===0?<p className="economy-empty">Belum ada assessment untuk season ini.</p>:<div className="ops-record-list">{assessments.filter(a=>!wealthSeasonId||a.season_id===wealthSeasonId).map(a=><article key={a.id}><div><strong>{a.target_kind==="member"?"Member":"Team"} · {(a.member_id||a.team_id||"").slice(0,8)}</strong><small>Saldo snapshot {money(a.wallet_balance_snapshot)} · Tarif {a.applied_rate}% · Pajak {money(a.tax_amount)} · {a.status.toUpperCase()}</small></div></article>)}</div>}
   </section>
  </div>}
  {tab==="prizes"&&<div className="ops-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">DEVELOPMENT TOKEN SETTINGS</span><h2>Race reward rules</h2></div></div>
    <form className="economy-form" onSubmit={savePrize}>
     <label>Season division<select value={divisionId} onChange={e=>choosePrize(e.target.value)} required><option value="">Pilih divisi season</option>{divisions.map(d=><option key={d.id} value={d.id}>{d.season?.title||"Season"} · {d.division_name}</option>)}</select></label>
     <label>Race winner · Driver DDP<input type="number" min="0" step="0.01" value={driverWin} onChange={e=>setDriverWin(e.target.value)} required/></label>
     <label>Race winner · Team TDP<input type="number" min="0" step="0.01" value={teamWin} onChange={e=>setTeamWin(e.target.value)} required/></label>
     <label>Pole position · Driver DDP<input type="number" min="0" step="0.01" value={driverPole} onChange={e=>setDriverPole(e.target.value)} required/></label>
     <label>Pole position · Team TDP<input type="number" min="0" step="0.01" value={teamPole} onChange={e=>setTeamPole(e.target.value)} required/></label>
     <label className="economy-toggle"><input type="checkbox" checked={prizeActive} onChange={e=>setPrizeActive(e.target.checked)}/> Aktifkan aturan</label>
     <p className="economy-form-hint">DDP hanya masuk ke driver pemenang atau pole sitter. TDP masuk ke tim masing-masing. Token terpisah dari saldo ¢p.</p>
     <button className="economy-primary-button" disabled={saving||!divisionId}><Save size={15}/> Simpan aturan hadiah</button>
    </form>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">RULE REGISTRY</span><h2>Konfigurasi per divisi</h2></div></div>
    {prizes.length===0?<p className="economy-empty">Belum ada aturan hadiah development.</p>:<div className="ops-record-list">{prizes.map(p=><article key={p.id}><div><strong>{divisions.find(d=>d.id===p.season_division_id)?.season?.title||"Season"} · {divisions.find(d=>d.id===p.season_division_id)?.division_name||"Division"}</strong><small>Winner: {p.driver_win_ddp} DDP / {p.team_win_tdp} TDP · Pole: {p.driver_pole_ddp} DDP / {p.team_pole_tdp} TDP · {p.is_active?"Aktif":"Nonaktif"}</small></div><button onClick={()=>choosePrize(p.season_division_id)}>Edit</button></article>)}</div>}
   </section>
  </div>}
  {tab==="sponsors"&&<div className="ops-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">SPONSOR DATABASE</span><h2>{sponsorId?"Edit sponsor":"Tambah sponsor"}</h2></div><Link className="text-link" to="/admin/sponsorship">Manage offers & contracts</Link></div>
    <form className="economy-form" onSubmit={saveSponsor}>
     <label>Nama sponsor<input value={sponsorName} onChange={e=>setSponsorName(e.target.value)} required maxLength={160}/></label>
     <label>Industri<input value={sponsorIndustry} onChange={e=>setSponsorIndustry(e.target.value)} maxLength={100}/></label>
     <label>Deskripsi<textarea value={sponsorDescription} onChange={e=>setSponsorDescription(e.target.value)} rows={3}/></label>
     <label>Budget sponsor (¢p)<input type="number" min="0" step="0.01" value={sponsorBudget} onChange={e=>setSponsorBudget(e.target.value)} placeholder="Kosongkan jika belum ditentukan"/></label>
     <label className="economy-toggle"><input type="checkbox" checked={sponsorActive} onChange={e=>setSponsorActive(e.target.checked)}/> Aktif di Sponsor Pool</label>
     <div className="ops-actions"><button className="economy-primary-button" disabled={saving}><Save size={15}/> Simpan sponsor</button>{sponsorId&&<button type="button" className="economy-secondary-button" onClick={resetSponsor}>Batal</button>}</div>
    </form>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">SPONSOR POOL</span><h2>{sponsors.length} sponsor</h2></div></div>
    {sponsors.length===0?<p className="economy-empty">Sponsor pool kosong. Nama dan ketentuan sponsor tidak dibuat otomatis.</p>:<div className="ops-record-list">{sponsors.map(s=><article key={s.id}><div><strong>{s.name}</strong><small>{s.industry||"Industri belum diisi"} · {s.available_budget==null?"Budget belum ditentukan":money(s.available_budget)} · {s.is_active?"Aktif":"Nonaktif"}</small></div><div className="ops-record-actions"><button onClick={()=>editSponsor(s)}>Edit</button><button onClick={()=>void deleteSponsor(s.id)} aria-label="Hapus sponsor"><Trash2 size={14}/></button></div></article>)}</div>}
   </section>
  </div>}
  {tab==="valuation"&&<div className="ops-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">TEAM VALUATION INPUT</span><h2>Assess team value</h2></div></div>
    <form className="economy-form" onSubmit={saveValuation}>
     <label>Team<select value={teamId} onChange={e=>setTeamId(e.target.value)} required><option value="">Pilih team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}{t.division_key?" · "+t.division_key:""}</option>)}</select></label>
     <label>Assets<input type="number" min="0" step="0.01" value={assetValue} onChange={e=>setAssetValue(e.target.value)} required/></label>
     <label>Development parts<input type="number" min="0" step="0.01" value={developmentValue} onChange={e=>setDevelopmentValue(e.target.value)} required/></label>
     <label>History<input type="number" min="0" step="0.01" value={historyValue} onChange={e=>setHistoryValue(e.target.value)} required/></label>
     <label>Achievements<input type="number" min="0" step="0.01" value={achievementValue} onChange={e=>setAchievementValue(e.target.value)} required/></label>
     <label>Financial health<input type="number" min="0" step="0.01" value={financialValue} onChange={e=>setFinancialValue(e.target.value)} required/></label>
     <label>Notes<textarea rows={3} value={valuationNote} onChange={e=>setValuationNote(e.target.value)}/></label>
     <p className="economy-form-hint">Setiap komponen dinilai Admin dalam ¢p. Total valuasi adalah penjumlahan komponen, tanpa bobot tersembunyi atau formula asumsi.</p>
     <button className="economy-primary-button" disabled={saving||!teamId}><Save size={15}/> Simpan valuation snapshot</button>
    </form>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">TEAM TIER MAPPING</span><h2>Penetapan tier tim</h2></div></div><p className="economy-form-hint">Affiliate hanya dapat dibuat antar-tier berbeda. Pilih division key yang sudah dibuat melalui License Scoring Engine.</p><div className="ops-record-list">{teams.map(t=><article key={t.id}><div><strong>{t.name}</strong><small>Tier saat ini: {t.division_key||"Belum ditetapkan"}</small></div><select value={t.division_key||""} onChange={e=>void assignTeamTier(t.id,e.target.value)} disabled={saving||divisionOptions.length===0}><option value="">Belum ditetapkan</option>{divisionOptions.map(([key,name])=><option key={key} value={key}>{name} · {key}</option>)}</select></article>)}</div></section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">VALUATION HISTORY</span><h2>Snapshot valuasi</h2></div></div>
    {valuations.length===0?<p className="economy-empty">Belum ada penilaian tim.</p>:<div className="ops-record-list">{valuations.map(v=><article key={v.id}><div><strong>{v.team?.name||"Team"} · {money(v.total_valuation)}</strong><small>Assets {money(v.assets_value)} · Development {money(v.development_value)} · History {money(v.history_value)} · Achievements {money(v.achievements_value)} · Financial {money(v.financial_health_value)}</small></div><time>{new Date(v.assessed_at).toLocaleDateString("id-ID")}</time></article>)}</div>}
   </section>
  </div>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
  <div className="economy-security-note"><ShieldCheck size={17}/><p>Semua nilai disimpan sebagai konfigurasi/data operasional. Modul ini tidak mengaktifkan pungutan atau payout otomatis dan tidak mengubah ledger sampai workflow transaksinya disahkan.</p></div>
 </section>;
}
