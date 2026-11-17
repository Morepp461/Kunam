import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,RefreshCw,Handshake,Coins,Target,Globe2,Plus,CheckCircle2} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./brand-ecosystem.css";

type Member={id:string;role:string|null;team_id:string|null;character_name:string|null};
type Sponsor={id:string;name:string;industry:string|null;tier_key:string|null;source_code?:string|null;available_budget:number|null;flexibility_percent:number;is_active:boolean};
type Season={id:string;title:string;starts_on:string;status:string};
type Team={id:string;name:string};
type Offer={id:string;sponsor_id:string;target_team_id:string|null;target_kind:string;season_id:string;proposed_amount:number;status:string;terms:Record<string,unknown>;expires_at:string|null;counter_count:number;generated_by_engine:boolean};
type Revision={id:string;offer_id:string;actor_kind:string;amount:number;terms:Record<string,unknown>;response:string;created_at:string};
type Contract={id:string;sponsor_id:string;target_team_id:string|null;target_kind:string;season_id:string;contract_amount:number;annual_contract_amount:number|null;bonus_pool_total:number;bonus_pool_paid:number;status:string;renewal_status:string;duration_seasons:number};
type Target={id:string;contract_id:string;title:string;metric_key:string;target_value:number;current_value:number;bonus_amount:number;status:string};
type Tier={tier_key:string;label:string;minimum_team_reputation:number;minimum_fan_population:number;minimum_season_performance:number;minimum_budget:number;maximum_budget:number|null;is_active:boolean};
type Reputation={team_id?:string;member_id?:string;score:number;band:string;metrics:Record<string,number>};
type Fan={entity_kind:string;team_id:string|null;member_id:string|null;region_key:string;population:number;loyalty:number;engagement:number;sentiment:number};
const money=(v:number|null|undefined)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
const num=(v:number|null|undefined)=>Number(v||0).toLocaleString("id-ID");
const errText=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function BrandEcosystem({session,mode}:{session:Session;mode:"team"|"driver"|"admin"}){
 const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Team|null>(null);
 const [sponsors,setSponsors]=useState<Sponsor[]>([]),[seasons,setSeasons]=useState<Season[]>([]),[teams,setTeams]=useState<Team[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [offers,setOffers]=useState<Offer[]>([]),[revisions,setRevisions]=useState<Revision[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[targets,setTargets]=useState<Target[]>([]);
 const [tiers,setTiers]=useState<Tier[]>([]),[teamRep,setTeamRep]=useState<Reputation|null>(null),[driverRep,setDriverRep]=useState<Reputation|null>(null),[fans,setFans]=useState<Fan[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [counterId,setCounterId]=useState(""),[counterAmount,setCounterAmount]=useState(""),[counterTerms,setCounterTerms]=useState("");
 const [seasonId,setSeasonId]=useState(""),[sponsorName,setSponsorName]=useState(""),[industry,setIndustry]=useState(""),[tierKey,setTierKey]=useState(""),[budget,setBudget]=useState(""),[flex,setFlex]=useState("10"),[offerMin,setOfferMin]=useState(""),[offerMax,setOfferMax]=useState("");
 const [tierForm,setTierForm]=useState({key:"T5",label:"Tier 5",rep:"0",fans:"0",performance:"0",budget:"0",maxBudget:"",active:true});
 const [selectedSponsorId,setSelectedSponsorId]=useState(""),[sponsorBudgetEdit,setSponsorBudgetEdit]=useState("");
 const [repTeam,setRepTeam]=useState(""),[repMetrics,setRepMetrics]=useState(""),[trustMetrics,setTrustMetrics]=useState(""),[fanEntity,setFanEntity]=useState("team"),[fanTarget,setFanTarget]=useState(""),[fanRegion,setFanRegion]=useState("Indonesia"),[fanDelta,setFanDelta]=useState("");
 const [targetContract,setTargetContract]=useState(""),[targetTitle,setTargetTitle]=useState(""),[targetMetric,setTargetMetric]=useState(""),[targetValue,setTargetValue]=useState(""),[targetBonus,setTargetBonus]=useState("");
 const [progressTarget,setProgressTarget]=useState(""),[progressValue,setProgressValue]=useState("");

 const refresh=useCallback(async()=>{
  if(!supabase){setLoading(false);setNotice("Supabase belum dikonfigurasi.");return;}
  setLoading(true);
  try{
   const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
   if(pe)throw pe;
   let current:Member|null=null;
   if(p?.member_id){const {data,error}=await supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle();if(error)throw error;current=data as Member|null;}
   setMember(current);
   if(mode!=="admin"&&!current){setNotice("Akun belum terhubung ke member.");setLoading(false);return;}
   if(mode==="team"&&current?.role!=="Owner"){setNotice("Halaman sponsorship hanya dapat diakses Team Owner.");setLoading(false);return;}
   const [s,se,t,m,o,r,c,ta,tr,rt,rd,fa]=await Promise.all([
    supabase.from("caleris_sponsors").select("id,name,industry,tier_key,source_code,available_budget,flexibility_percent,is_active").eq("is_active",true).order("name"),
    supabase.from("license_seasons").select("id,title,starts_on,status").order("starts_on",{ascending:false}),
    supabase.from("teams").select("id,name").order("name"),
    supabase.from("members").select("id,character_name,role,team_id").order("character_name"),
    supabase.from("caleris_sponsorship_offers").select("*").order("created_at",{ascending:false}),
    supabase.from("caleris_sponsorship_offer_revisions").select("*").order("created_at",{ascending:false}),
    supabase.from("caleris_sponsorship_contracts").select("*").order("started_at",{ascending:false}),
    supabase.from("caleris_sponsorship_targets").select("*").order("created_at",{ascending:false}),
    supabase.from("caleris_sponsor_tier_rules").select("*").order("tier_key"),
    current?.team_id?supabase.from("caleris_team_reputation").select("*").eq("team_id",current.team_id).maybeSingle():Promise.resolve({data:null,error:null}),
    current?.role==="Driver"?supabase.from("caleris_driver_reputation").select("*").eq("member_id",current.id).maybeSingle():Promise.resolve({data:null,error:null}),
    supabase.from("caleris_fan_populations").select("*").order("region_key")
   ]);
   const issue=[s.error,se.error,t.error,m.error,o.error,r.error,c.error,ta.error,tr.error,rt.error,rd.error,fa.error].find(Boolean);if(issue)throw issue;
   setSponsors((s.data||[]) as Sponsor[]);setSeasons((se.data||[]) as Season[]);setTeams((t.data||[]) as Team[]);setMembers((m.data||[]) as Member[]);
   setOffers((o.data||[]) as Offer[]);setRevisions((r.data||[]) as Revision[]);setContracts((c.data||[]) as Contract[]);setTargets((ta.data||[]) as Target[]);
   setTiers((tr.data||[]) as Tier[]);setTeamRep(rt.data as Reputation|null);setDriverRep(rd.data as Reputation|null);setFans((fa.data||[]) as Fan[]);
   if(current?.team_id)setTeam((t.data||[]).find((x:Team)=>x.id===current?.team_id)||null);
   const active=(se.data||[]).find((x:Season)=>x.status==="active")||(se.data||[])[0];if(active&&!seasonId)setSeasonId(active.id);
   if(mode==="admin"&&!repTeam&&t.data?.[0])setRepTeam(t.data[0].id);
   setNotice("");
  }catch(e){setNotice(errText(e));}
  finally{setLoading(false);}
 },[session.user.id,mode]);
 useEffect(()=>{void refresh()},[refresh]);

 const run=async(fn:string,args:Record<string,unknown>,success:string)=>{
  if(!supabase)return;setSaving(true);setNotice("");
  const {data,error}=await supabase.rpc(fn,args);setSaving(false);
  if(error){setNotice(error.message);return null;}setNotice(success);await refresh();return data;
 };
 const sponsor=(id:string)=>sponsors.find(s=>s.id===id)?.name||"Sponsor";
 const lastRevision=(id:string)=>revisions.filter(r=>r.offer_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
 const visibleOffers=mode==="admin"?offers.filter(o=>o.target_kind==="team"):offers.filter(o=>o.target_kind==="team"&&o.target_team_id===member?.team_id);
 const visibleContracts=mode==="admin"?contracts.filter(c=>c.target_kind==="team"):contracts.filter(c=>c.target_kind==="team"&&c.target_team_id===member?.team_id);
 const teamFans=fans.filter(f=>f.entity_kind==="team"&&f.team_id===(mode==="admin"?repTeam:member?.team_id));
 const driverFans=fans.filter(f=>f.entity_kind==="driver"&&f.member_id===member?.id);
 const totalFans=(rows:Fan[])=>rows.reduce((sum,f)=>sum+Number(f.population||0),0);
 const respond=async(id:string,action:"accept"|"reject"|"counter")=>{
  const amount=Number(counterAmount);if(action==="counter"&&(!Number.isFinite(amount)||amount<0||Math.round(amount*100)!==amount*100)){setNotice("Nominal counter-offer tidak valid.");return;}
  await run("owner_respond_sponsorship_offer",{p_offer_id:id,p_action:action,p_amount:action==="counter"?amount:null,p_terms:{summary:counterTerms.trim()}} ,action==="accept"?"Kontrak sponsorship diterima.":action==="reject"?"Offer ditolak.":"Counter-offer dikirim ke sponsor engine.");
  setCounterId("");setCounterAmount("");setCounterTerms("");
 };
 const createSponsor=async()=>{
  const result=await run("admin_upsert_brand_sponsor",{p_id:null,p_name:sponsorName,p_industry:industry,p_tier_key:tierKey||null,p_budget:Number(budget),p_flexibility:Number(flex),p_region_scope:"regional",p_logo_url:null,p_description:null},"Sponsor dibuat.");
  const id=typeof result==="string"?result:(result as {id?:string}|null)?.id;
  if(id&&offerMin&&offerMax)await run("admin_set_sponsor_offer_band",{p_sponsor_id:id,p_minimum:Number(offerMin),p_maximum:Number(offerMax)},"Rentang penawaran sponsor disimpan.");
  setSponsorName("");setIndustry("");setBudget("");setOfferMin("");setOfferMax("");
 };
 const saveBudget=async()=>{await run("admin_set_sponsor_budget",{p_sponsor_id:selectedSponsorId,p_budget:Number(sponsorBudgetEdit)},"Budget sponsor diperbarui.");setSponsorBudgetEdit("");};
 const saveTier=async()=>{await run("admin_upsert_sponsor_tier_rule",{p_tier_key:tierForm.key,p_label:tierForm.label,p_minimum_team_reputation:Number(tierForm.rep),p_minimum_fan_population:Number(tierForm.fans),p_minimum_season_performance:Number(tierForm.performance),p_minimum_budget:Number(tierForm.budget),p_maximum_budget:tierForm.maxBudget?Number(tierForm.maxBudget):null,p_is_active:tierForm.active},"Aturan tier sponsor disimpan.");};
 const generate=()=>run("generate_team_sponsorship_offers",{p_season_id:seasonId},"AI Sponsor matching selesai dijalankan.");
 const sponsorRespond=(id:string)=>run("sponsor_engine_respond",{p_offer_id:id},"Sponsor engine telah memberikan respons otomatis.");
 const setReputation=async()=>{
  let metrics:Record<string,number>={};try{metrics=repMetrics?JSON.parse(repMetrics):{};}catch{setNotice("Format metrics harus JSON object yang valid.");return;}
  if(!repMetrics.trim()){setNotice("Metrics Team Reputation wajib diisi.");return;}
  await run("admin_calculate_team_reputation",{p_team_id:repTeam,p_metrics:metrics,p_source_event:"season_evaluation"},"Team Reputation dihitung dari bobot konfigurasi.");
 };
 const adjustFans=async()=>{
  const delta=Number(fanDelta);if(!Number.isInteger(delta)||delta===0){setNotice("Perubahan populasi harus bilangan bulat selain nol.");return;}
  const target=fanEntity==="team"?{p_team_id:fanTarget,p_member_id:null}:{p_team_id:null,p_member_id:fanTarget};
  await run("admin_adjust_fan_population",{p_entity_kind:fanEntity,...target,p_region_key:fanRegion,p_delta:delta,p_source_event:"admin_adjustment",p_metadata:{source:"brand_ecosystem_admin"}},"Populasi fans diperbarui.");
  setFanDelta("");
 };
 const createTarget=async()=>{await run("admin_create_sponsorship_target",{p_contract_id:targetContract,p_title:targetTitle,p_description:null,p_metric_key:targetMetric,p_target_value:Number(targetValue),p_bonus_amount:Number(targetBonus),p_due_at:null},"Target sponsor dibuat.");setTargetTitle("");setTargetMetric("");setTargetValue("");setTargetBonus("");};
 const updateProgress=async()=>{
  const result=await run("admin_record_sponsorship_progress",{p_target_id:progressTarget,p_new_value:Number(progressValue),p_note:"Admin update"},"Progress target diperbarui.");
  if(result)await run("admin_process_sponsorship_bonuses",{},"Bonus target yang memenuhi syarat telah diproses.");
  setProgressValue("");
 };
 const trustEval=async(contractId:string,season:string)=>{
  let metrics:Record<string,number>={};try{metrics=trustMetrics?JSON.parse(trustMetrics):{};}catch{setNotice("Format Trust metrics harus JSON object.");return;}
  if(!trustMetrics.trim()){setNotice("Isi Trust metrics aktual sebelum evaluasi.");return;}
  await run("admin_evaluate_sponsorship_trust",{p_contract_id:contractId,p_season_id:season,p_metrics:metrics},"Evaluasi Trust Score disimpan.");
 };

 if(loading)return <section className="workspace brand-ecosystem"><div className="workspace-card">Memuat Brand Ecosystem...</div></section>;
 if(notice.includes("hanya dapat diakses")||notice.includes("belum terhubung"))return <section className="workspace brand-ecosystem"><div className="workspace-card">{notice}</div></section>;
 if(mode==="admin")return <section className="workspace brand-ecosystem">
  <Link className="back-link" to="/admin/operations"><ArrowLeft size={16}/> Operations Suite</Link>
  <header className="page-heading"><span className="section-eyebrow">ADMIN CONTROL · BRAND ECOSYSTEM</span><h1 className="page-title">Brand Ecosystem</h1><p className="page-description">Kelola sponsor, AI matching, reputasi, fans regional, target, trust score, dan settlement melalui Economy Ledger.</p></header>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
  <section className="brand-grid">
   <article className="workspace-card"><span className="section-eyebrow">SPONSOR DATABASE</span><h2>Tambah Sponsor</h2>
    <label>Nama sponsor<input value={sponsorName} onChange={e=>setSponsorName(e.target.value)} placeholder="Nama brand"/></label>
    <label>Industri<input value={industry} onChange={e=>setIndustry(e.target.value)} placeholder="Automotive, finance, technology..."/></label>
    <label>Tier<select value={tierKey} onChange={e=>setTierKey(e.target.value)}><option value="">Pilih tier</option>{tiers.map(t=><option key={t.tier_key} value={t.tier_key}>{t.label}</option>)}</select></label>
    <label>Budget sponsor (€)<input type="number" min="0" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
    <label>Fleksibilitas negosiasi (%)<input type="number" min="0" max="100" value={flex} onChange={e=>setFlex(e.target.value)}/></label>
    <div className="brand-two"><label>Offer minimum (€)<input type="number" min="1" value={offerMin} onChange={e=>setOfferMin(e.target.value)}/></label><label>Offer maksimum (€)<input type="number" min="1" value={offerMax} onChange={e=>setOfferMax(e.target.value)}/></label></div>
    <button className="action primary" disabled={saving||!sponsorName||!budget||!tierKey||!offerMin||!offerMax} onClick={()=>void createSponsor()}><Plus size={15}/> Simpan Sponsor</button>
    <div className="brand-compact-list">{sponsors.map(s=><div key={s.id}><strong>{s.name}</strong><span>{s.source_code||""} · {s.tier_key||"No tier"} · {money(s.available_budget)}</span></div>)}</div>
    <div className="brand-two"><label>Tambah budget sponsor<select value={selectedSponsorId} onChange={e=>{setSelectedSponsorId(e.target.value);setSponsorBudgetEdit(String(sponsors.find(s=>s.id===e.target.value)?.available_budget||0));}}><option value="">Pilih sponsor</option>{sponsors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Budget baru (€)<input type="number" min="0" value={sponsorBudgetEdit} onChange={e=>setSponsorBudgetEdit(e.target.value)}/></label></div>
    <button className="action" disabled={saving||!selectedSponsorId||!sponsorBudgetEdit} onClick={()=>void saveBudget()}>Update Sponsor Budget</button>
   </article>
   <article className="workspace-card"><span className="section-eyebrow">SPONSOR TIERS</span><h2>Aturan Tier</h2>
    <div className="brand-two"><label>Tier key<input value={tierForm.key} onChange={e=>setTierForm(v=>({...v,key:e.target.value.toUpperCase()}))}/></label><label>Label<input value={tierForm.label} onChange={e=>setTierForm(v=>({...v,label:e.target.value}))}/></label></div>
    <label>Minimum Team Reputation<input type="number" min="0" max="9999" value={tierForm.rep} onChange={e=>setTierForm(v=>({...v,rep:e.target.value}))}/></label>
    <label>Minimum Fan Population<input type="number" min="0" value={tierForm.fans} onChange={e=>setTierForm(v=>({...v,fans:e.target.value}))}/></label>
    <label>Minimum season performance<input type="number" min="0" value={tierForm.performance} onChange={e=>setTierForm(v=>({...v,performance:e.target.value}))}/></label>
    <div className="brand-two"><label>Budget minimum<input type="number" min="0" value={tierForm.budget} onChange={e=>setTierForm(v=>({...v,budget:e.target.value}))}/></label><label>Budget maksimum<input type="number" min="0" value={tierForm.maxBudget} onChange={e=>setTierForm(v=>({...v,maxBudget:e.target.value}))}/></label></div>
    <label className="brand-check"><input type="checkbox" checked={tierForm.active} onChange={e=>setTierForm(v=>({...v,active:e.target.checked}))}/> Aktif untuk AI matching</label>
    <button className="action primary" disabled={saving} onClick={()=>void saveTier()}>Simpan Aturan Tier</button>
    <div className="brand-compact-list">{tiers.map(t=><div key={t.tier_key}><strong>{t.label} {t.is_active?"· ACTIVE":"· DRAFT"}</strong><span>Reputation {num(t.minimum_team_reputation)} · Fans {num(t.minimum_fan_population)}</span></div>)}</div>
   </article>
   <article className="workspace-card"><span className="section-eyebrow">AI SPONSOR MATCHING</span><h2>Generate Sponsor Offers</h2>
    <label>Season<select value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <button className="action primary" disabled={saving||!seasonId} onClick={()=>void generate()}><Handshake size={15}/> Generate offers untuk tim yang memenuhi syarat</button>
    <p className="brand-note">Matching memakai tier sponsor aktif, Team Reputation, regional Fan Population, dan budget. Sponsor dapat bekerja dengan beberapa tim sekaligus.</p>
   </article>
   <article className="workspace-card"><span className="section-eyebrow">ECONOMY SETTLEMENT</span><h2>Automatic Settlement</h2>
    <p className="brand-note">Pembayaran memeriksa budget masing-masing sponsor dan Sponsor Source, lalu mencatat transaksi pada Economy Ledger.</p>
    <button className="action primary" disabled={saving} onClick={()=>void run("admin_process_sponsorship_payments",{},"Seasonal sponsorship payments diproses.")}><Coins size={15}/> Proses pembayaran jatuh tempo</button>
    <button className="action" disabled={saving} onClick={()=>void run("admin_process_sponsorship_bonuses",{},"Bonus target diproses.")}>Proses bonus target tercapai</button>
   </article>
   <article className="workspace-card"><span className="section-eyebrow">TEAM REPUTATION</span><h2>Update Reputation</h2>
    <label>Team<select value={repTeam} onChange={e=>setRepTeam(e.target.value)}><option value="">Pilih team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Metrics JSON<input value={repMetrics} onChange={e=>setRepMetrics(e.target.value)} placeholder='{"championship":80,"race_performance":70,"consistency":65,"driver_reputation":60,"fanbase":50,"commercial_credibility":50}'/></label>
    <button className="action primary" disabled={saving||!repTeam||!repMetrics} onClick={()=>void setReputation()}>Hitung Team Reputation</button>
   </article>
   <article className="workspace-card"><span className="section-eyebrow">REGIONAL FANBASE</span><h2>Adjust Fan Population</h2>
    <label>Entity<select value={fanEntity} onChange={e=>{setFanEntity(e.target.value);setFanTarget("")}}><option value="team">Team</option><option value="driver">Driver</option></select></label>
    <label>Target<select value={fanTarget} onChange={e=>setFanTarget(e.target.value)}><option value="">Pilih target</option>{(fanEntity==="team"?teams:members.filter(m=>m.role==="Driver")).map(x=><option key={x.id} value={x.id}>{fanEntity==="team"?(x as Team).name:(x as Member).character_name||"Driver"}</option>)}</select></label>
    <label>Region<input value={fanRegion} onChange={e=>setFanRegion(e.target.value)}/></label>
    <label>Perubahan populasi (+/-)<input type="number" step="1" value={fanDelta} onChange={e=>setFanDelta(e.target.value)}/></label>
    <button className="action primary" disabled={saving||!fanTarget||!fanDelta} onClick={()=>void adjustFans()}>Simpan Fan Population</button>
   </article>
  </section>
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">NEGOTIATION CONTROL</span><h2>Offer & Sponsor Engine</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div>
   {visibleOffers.map(o=><article className="brand-list-item" key={o.id}><div><strong>{sponsor(o.sponsor_id)} → {teams.find(t=>t.id===o.target_team_id)?.name||"Team"}</strong><span>{money(lastRevision(o.id)?.amount??o.proposed_amount)} · {o.status} · {o.counter_count||0}/3 counters {o.generated_by_engine?"· AI MATCHED":""}</span></div>{o.status==="negotiating"&&lastRevision(o.id)?.actor_kind==="member"&&<button className="action primary" disabled={saving} onClick={()=>void sponsorRespond(o.id)}>AI Sponsor Respond</button>}</article>)}
  </section>
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CONTRACT OPERATIONS</span><h2>Contracts & Targets</h2></div></div>
   <label>Trust Score metrics JSON<input value={trustMetrics} onChange={e=>setTrustMetrics(e.target.value)} placeholder='{"target_achievement":75,"consistency":80,"fanbase_growth":60,"commercial_exposure":70,"partnership_conduct":90}'/></label>
   <div className="brand-form-grid"><label>Contract<select value={targetContract} onChange={e=>setTargetContract(e.target.value)}><option value="">Pilih kontrak</option>{visibleContracts.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{sponsor(c.sponsor_id)} · {money(c.contract_amount)}</option>)}</select></label><label>Target title<input value={targetTitle} onChange={e=>setTargetTitle(e.target.value)}/></label><label>Metric key<input value={targetMetric} onChange={e=>setTargetMetric(e.target.value)}/></label><label>Target value<input type="number" min="1" value={targetValue} onChange={e=>setTargetValue(e.target.value)}/></label><label>Bonus (€)<input type="number" min="0" value={targetBonus} onChange={e=>setTargetBonus(e.target.value)}/></label><button className="action primary" disabled={saving||!targetContract||!targetTitle||!targetMetric||!targetValue||!targetBonus} onClick={()=>void createTarget()}><Target size={15}/> Tambah Target</button></div>
   {targets.filter(t=>visibleContracts.some(c=>c.id===t.contract_id)).map(t=><article className="brand-list-item" key={t.id}><div><strong>{t.title}</strong><span>{t.current_value}/{t.target_value} · Bonus {money(t.bonus_amount)} · {t.status}</span></div><div className="brand-inline"><input type="number" value={progressTarget===t.id?progressValue:""} placeholder="Progress baru" onChange={e=>{setProgressTarget(t.id);setProgressValue(e.target.value)}}/><button className="action" disabled={saving||progressTarget!==t.id||!progressValue} onClick={()=>void updateProgress()}>Update & settle</button></div></article>)}
   {visibleContracts.map(c=><article className="brand-list-item" key={c.id}><div><strong>{sponsor(c.sponsor_id)} · {money(c.annual_contract_amount??c.contract_amount)}</strong><span>{c.duration_seasons} season · Bonus pool {money(c.bonus_pool_paid)}/{money(c.bonus_pool_total)} · {c.renewal_status}</span></div><button className="action" disabled={saving||!seasonId} onClick={()=>void trustEval(c.id,seasonId)}>Evaluate Trust</button></article>)}
  </section>
 </section>;

 const reputation=mode==="team"?teamRep:driverRep;
 const fansFor=mode==="team"?teamFans:driverFans;
 const entityName=mode==="team"?team?.name:member?.character_name;
 return <section className="workspace brand-ecosystem">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">BRAND ECOSYSTEM · {mode==="team"?"TEAM OWNER":"DRIVER PROFILE"}</span><h1 className="page-title">{mode==="team"?"Team Sponsorship":"Reputation & Fans"}</h1><p className="page-description">{mode==="team"?"Negosiasi sponsor dilakukan Team Owner. Kontrak, bonus, target, dan settlement tercatat otomatis.":"Reputasi dan fan population driver ditampilkan sebagai agregat regional."}</p></header>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
  <div className="brand-stats">
   <article><span>{mode==="team"?"TEAM REPUTATION":"DRIVER REPUTATION"}</span><strong>{reputation?num(reputation.score):"—"}</strong><small>{reputation?.band||"Belum dinilai"}</small></article>
   <article><span>FAN POPULATION</span><strong>{num(totalFans(fansFor))}</strong><small>Agregat regional</small></article>
   {mode==="team"&&<article><span>ACTIVE CONTRACTS</span><strong>{visibleContracts.filter(c=>c.status==="active").length}</strong><small>Brand partners</small></article>}
   {mode==="team"&&<article><span>SPONSORSHIP VALUE</span><strong>{money(visibleContracts.filter(c=>c.status==="active").reduce((n,c)=>n+Number(c.contract_amount),0))}</strong><small>Nilai kontrak aktif</small></article>}
  </div>
  {mode==="team"&&<>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">SPONSOR OFFERS</span><h2>Penawaran Masuk</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div>
    {visibleOffers.length===0?<p className="muted">Belum ada sponsor offer untuk tim ini.</p>:visibleOffers.map(o=>{const latest=lastRevision(o.id);return <article className="brand-list-item" key={o.id}><div><strong>{sponsor(o.sponsor_id)}</strong><span>{money(latest?.amount??o.proposed_amount)} · {o.status} · {o.counter_count||0}/3 counters</span><p>{String(latest?.terms?.summary||o.terms?.summary||"Ketentuan sponsor")}</p></div>{o.status==="offered"&&latest?.actor_kind==="admin"&&<div className="brand-inline"><button className="action primary" disabled={saving} onClick={()=>void respond(o.id,"accept")}><CheckCircle2 size={14}/> Accept</button><button className="action" disabled={saving} onClick={()=>{setCounterId(o.id);setCounterAmount(String(latest.amount));}}>Counter</button><button className="action" disabled={saving} onClick={()=>void respond(o.id,"reject")}>Reject</button></div>}
     {counterId===o.id&&<div className="brand-counter"><label>Counter amount (€)<input type="number" min="0" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)}/></label><label>Terms<textarea rows={2} value={counterTerms} onChange={e=>setCounterTerms(e.target.value)}/></label><button className="action primary" disabled={saving} onClick={()=>void respond(o.id,"counter")}>Kirim counter</button></div>}
    </article>})}
   </section>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CONTRACTS & TARGETS</span><h2>Partnership Portfolio</h2></div><Handshake size={18}/></div>
    {visibleContracts.length===0?<p className="muted">Belum ada kontrak sponsorship.</p>:visibleContracts.map(c=><article className="brand-contract" key={c.id}><div className="brand-list-item"><div><strong>{sponsor(c.sponsor_id)}</strong><span>{money(c.contract_amount)} per season · {c.duration_seasons} season · {c.status}</span></div><span className="brand-contract-status">{c.renewal_status}</span></div><div className="brand-progress-meta"><span>Bonus pool used</span><strong>{money(c.bonus_pool_paid)} / {money(c.bonus_pool_total)}</strong></div><div className="brand-progress"><i style={{width:Math.min(100,c.bonus_pool_total?c.bonus_pool_paid/c.bonus_pool_total*100:0)+"%"}}/></div>{targets.filter(t=>t.contract_id===c.id).map(t=><div className="brand-target" key={t.id}><div><strong>{t.title}</strong><small>{t.current_value} / {t.target_value} · {t.status}</small></div><span>Bonus {money(t.bonus_amount)}</span></div>)}</article>)}
   </section>
  </>}
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">REGIONAL FANBASE</span><h2>{entityName||"Fan Population"}</h2></div><Globe2 size={18}/></div>
   {fansFor.length===0?<p className="muted">Belum ada data populasi fans regional.</p>:<div className="brand-fan-grid">{fansFor.map(f=><article key={f.region_key}><strong>{f.region_key}</strong><b>{num(f.population)}</b><small>Loyalty {f.loyalty} · Engagement {f.engagement} · Sentiment {f.sentiment}</small></article>)}</div>}
  </section>
  {mode==="driver"&&<section className="workspace-card"><span className="section-eyebrow">DRIVER BRAND PROFILE</span><h2>Individual sponsorship is disabled</h2><p className="muted">Sponsorship contracts are issued to teams only. Driver reputation and regional fans remain visible as part of the team's commercial profile.</p></section>}
 </section>;
}
