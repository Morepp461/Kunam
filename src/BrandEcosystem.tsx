import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,RefreshCw,Handshake,Coins,Target,Globe2,Plus,CheckCircle2,X} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import {MemberProfileLink,TeamProfileLink} from "./EntityProfileLink";
import {broadcastNewsroomArticle} from "./lib/newsroomBroadcast";
import "./brand-ecosystem.css";

type Member={id:string;role:string|null;team_id:string|null;character_name:string|null;public_member_id?:string|null};
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
 const [repTeam,setRepTeam]=useState(""),[repMetrics,setRepMetrics]=useState<Record<string,string>>({championship:"0",race_performance:"0",consistency:"0",driver_reputation:"0",fanbase:"0",commercial_credibility:"0"}),[repDriver,setRepDriver]=useState(""),[driverMetrics,setDriverMetrics]=useState<Record<string,string>>({championship:"0",race_performance:"0",consistency:"0",experience:"0",fan_popularity:"0",professional_record:"0"}),[trustMetrics,setTrustMetrics]=useState<Record<string,string>>({target_achievement:"0",consistency:"0",fanbase_growth:"0",commercial_exposure:"0",partnership_conduct:"0"}),[fanEntity,setFanEntity]=useState("team"),[fanTarget,setFanTarget]=useState(""),[fanRegion,setFanRegion]=useState("Indonesia"),[fanDelta,setFanDelta]=useState("");
 const [targetContract,setTargetContract]=useState(""),[targetTitle,setTargetTitle]=useState(""),[targetMetric,setTargetMetric]=useState(""),[targetValue,setTargetValue]=useState(""),[targetBonus,setTargetBonus]=useState("");
 const [progressTarget,setProgressTarget]=useState(""),[progressValue,setProgressValue]=useState("");
 const [teamWeights,setTeamWeights]=useState<Record<string,string>>({championship:"25",race_performance:"25",consistency:"15",driver_reputation:"15",fanbase:"10",commercial_credibility:"10"});
 const [driverWeights,setDriverWeights]=useState<Record<string,string>>({championship:"25",race_performance:"25",consistency:"15",experience:"10",fan_popularity:"15",professional_record:"10"});
 const [trustWeights,setTrustWeights]=useState<Record<string,string>>({target_achievement:"45",consistency:"20",fanbase_growth:"15",commercial_exposure:"10",partnership_conduct:"10"});
 const [bonusPercent,setBonusPercent]=useState("50");
 const [fanGrowth,setFanGrowth]=useState({base:"0.2",win:"2",podium:"1.5",points:"1",finish:"0.5",badFinish:"0.05",dnf:"0.15",streak:"0.05",inactive:"0.03",grace:"2"});
 const [divisionProb,setDivisionProb]=useState({premioT1:"50",premioT2:"40",premioT3:"10",zweiT1:"25",zweiT2:"50",zweiT3:"25"});
 const [focusTier,setFocusTier]=useState("T1");
 const [focusTargets,setFocusTargets]=useState<Record<string,Record<string,string>>>({T1:{points:"80",podium:"40",win:"25",finish:"92",popularity:"75"},T2:{points:"70",podium:"30",win:"15",finish:"90",popularity:"65"},T3:{points:"60",podium:"20",win:"10",finish:"88",popularity:"55"},T4:{points:"50",podium:"15",win:"5",finish:"85",popularity:"45"},T5:{points:"40",podium:"10",win:"5",finish:"80",popularity:"35"}});

 const refresh=useCallback(async()=>{
  if(!supabase){setLoading(false);setNotice("Supabase belum dikonfigurasi.");return;}
  setLoading(true);
  try{
   const {data:p,error:pe}=await supabase.from("profiles").select("member_id,public_member_id").eq("user_id",session.user.id).maybeSingle();
   if(pe)throw pe;
   let current:Member|null=null;
   if(p?.member_id){const {data,error}=await supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle();if(error)throw error;current=data?{...data,public_member_id:p.public_member_id||null} as Member:null;}
   setMember(current);
   if(mode!=="admin"&&!current){setNotice("Akun belum terhubung ke member.");setLoading(false);return;}
   if(mode==="team"&&current?.role!=="Owner"){setNotice("Halaman sponsorship hanya dapat diakses Team Owner.");setLoading(false);return;}
   const [s,se,t,m,o,r,c,ta,tr,rt,rd,fa,configs]=await Promise.all([
    supabase.from("caleris_sponsors").select("id,name,industry,tier_key,source_code,available_budget,flexibility_percent,is_active").eq("is_active",true).order("name"),
    supabase.from("license_seasons").select("id,title,starts_on,status").order("starts_on",{ascending:false}),
    supabase.from("teams").select("id,name").order("name"),
    supabase.from("members").select("id,character_name,role,team_id").order("character_name"),
    supabase.from("caleris_sponsorship_offers").select("*").order("created_at",{ascending:false}).order("id",{ascending:false}),
    supabase.from("caleris_sponsorship_offer_revisions").select("*").order("created_at",{ascending:false}).order("id",{ascending:false}),
    supabase.from("caleris_sponsorship_contracts").select("*").order("started_at",{ascending:false}),
    supabase.from("caleris_sponsorship_targets").select("*").order("created_at",{ascending:false}),
    supabase.from("caleris_sponsor_tier_rules").select("*").order("tier_key"),
    current?.team_id?supabase.from("caleris_team_reputation").select("*").eq("team_id",current.team_id).maybeSingle():Promise.resolve({data:null,error:null}),
    current?.role==="Driver"?supabase.from("caleris_driver_reputation").select("*").eq("member_id",current.id).maybeSingle():Promise.resolve({data:null,error:null}),
    supabase.from("caleris_fan_populations").select("*").order("region_key"),
    mode==="admin"?supabase.from("caleris_brand_ecosystem_config").select("config_key,config_value"):Promise.resolve({data:[],error:null})
   ]);
   const issue=[s.error,se.error,t.error,m.error,o.error,r.error,c.error,ta.error,tr.error,rt.error,rd.error,fa.error,configs.error].find(Boolean);if(issue)throw issue;
   setSponsors((s.data||[]) as Sponsor[]);setSeasons((se.data||[]) as Season[]);setTeams((t.data||[]) as Team[]);setMembers((m.data||[]) as Member[]);
   setOffers((o.data||[]) as Offer[]);setRevisions((r.data||[]) as Revision[]);setContracts((c.data||[]) as Contract[]);setTargets((ta.data||[]) as Target[]);
   setTiers((tr.data||[]) as Tier[]);setTeamRep(rt.data as Reputation|null);setDriverRep(rd.data as Reputation|null);setFans((fa.data||[]) as Fan[]);
   const cfg=Object.fromEntries((configs.data||[]).map((x:any)=>[x.config_key,x.config_value]));
   if(cfg.team_reputation_weights)setTeamWeights(Object.fromEntries(Object.entries(cfg.team_reputation_weights).map(([k,v])=>[k,String(v)])));
   if(cfg.driver_reputation_weights)setDriverWeights(Object.fromEntries(Object.entries(cfg.driver_reputation_weights).map(([k,v])=>[k,String(v)])));
   if(cfg.sponsor_trust_weights)setTrustWeights(Object.fromEntries(Object.entries(cfg.sponsor_trust_weights).map(([k,v])=>[k,String(v)])));
   if(cfg.bonus_pool_percent?.value!==undefined)setBonusPercent(String(cfg.bonus_pool_percent.value));
   if(cfg.fan_growth_config)setFanGrowth({base:String(cfg.fan_growth_config.base_growth_percent??0.2),win:String(cfg.fan_growth_config.win_multiplier??2),podium:String(cfg.fan_growth_config.podium_multiplier??1.5),points:String(cfg.fan_growth_config.points_multiplier??1),finish:String(cfg.fan_growth_config.finish_multiplier??0.5),badFinish:String(cfg.fan_growth_config.bad_finish_decline_percent??0.05),dnf:String(cfg.fan_growth_config.dnf_decline_percent??0.15),streak:String(cfg.fan_growth_config.poor_streak_decline_percent??0.05),inactive:String(cfg.fan_growth_config.inactive_decline_percent??0.03),grace:String(cfg.fan_growth_config.inactive_grace_rounds??2)});
   if(cfg.sponsor_focus_targets)setFocusTargets(Object.fromEntries(Object.entries(cfg.sponsor_focus_targets).map(([tier,values]:any)=>[tier,Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v)]))])));
   if(cfg.sponsor_division_probabilities)setDivisionProb({premioT1:String(cfg.sponsor_division_probabilities.premio?.T1??0),premioT2:String(cfg.sponsor_division_probabilities.premio?.T2??0),premioT3:String(cfg.sponsor_division_probabilities.premio?.T3??0),zweiT1:String(cfg.sponsor_division_probabilities.zwei?.T1??0),zweiT2:String(cfg.sponsor_division_probabilities.zwei?.T2??0),zweiT3:String(cfg.sponsor_division_probabilities.zwei?.T3??0)});
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
 const lastRevision=(id:string)=>revisions.filter(r=>r.offer_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))[0];
 const visibleOffers=mode==="admin"?offers.filter(o=>o.target_kind==="team"):offers.filter(o=>o.target_kind==="team"&&o.target_team_id===member?.team_id);
 const visibleContracts=mode==="admin"?contracts.filter(c=>c.target_kind==="team"):contracts.filter(c=>c.target_kind==="team"&&c.target_team_id===member?.team_id);
 const teamFans=fans.filter(f=>f.entity_kind==="team"&&f.team_id===(mode==="admin"?repTeam:member?.team_id));
 const driverFans=fans.filter(f=>f.entity_kind==="driver"&&f.member_id===member?.id);
 const totalFans=(rows:Fan[])=>rows.reduce((sum,f)=>sum+Number(f.population||0),0);
 const respond=async(id:string,action:"accept"|"reject"|"counter")=>{
  const amount=Number(counterAmount);
  if(action==="counter"&&(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100)){setNotice("Nominal counter harus lebih dari nol dan maksimal dua desimal.");return;}
  if(!supabase)return;
  setSaving(true);setNotice("");
  const {data,error}=await supabase.rpc("owner_respond_sponsorship_offer",{p_offer_id:id,p_action:action,p_amount:action==="counter"?amount:null,p_terms:{summary:counterTerms.trim()}});
  if(error){setSaving(false);setNotice(error.message);return;}
  const [o,r,co,ta]=await Promise.all([
   supabase.from("caleris_sponsorship_offers").select("*").eq("id",id).maybeSingle(),
   supabase.from("caleris_sponsorship_offer_revisions").select("*").eq("offer_id",id).order("created_at").order("id"),
   action==="accept"?supabase.from("caleris_sponsorship_contracts").select("*").order("started_at",{ascending:false}):Promise.resolve({data:contracts,error:null}),
   action==="accept"?supabase.from("caleris_sponsorship_targets").select("*").order("created_at",{ascending:false}):Promise.resolve({data:targets,error:null})
  ]);
  const issue=o.error||r.error||co.error||ta.error;
  if(issue){setSaving(false);setNotice(issue.message);return;}
  if(o.data)setOffers(current=>current.map(item=>item.id===id?o.data as Offer:item));
  setRevisions(current=>[...current.filter(item=>item.offer_id!==id),...((r.data||[]) as Revision[])]);
  if(action==="accept"){setContracts((co.data||[]) as Contract[]);setTargets((ta.data||[]) as Target[]);const accepted=(co.data||[]).find((contract:any)=>contract.offer_id===id);if(accepted){const {data:storyRows}=await supabase.from("caleris_sponsorship_story_events").select("id,headline,body,visibility").eq("contract_id",accepted.id).eq("visibility","public").order("created_at",{ascending:false});for(const story of storyRows||[])await broadcastNewsroomArticle(story.headline,story.body,"paddock_story",{source_id:story.id});}}
  const result=data as {status?:string;counter_count?:number}|null;
  setSaving(false);setCounterId("");setCounterAmount("");setCounterTerms("");
  setNotice(action==="counter"?(result?.status==="rejected"?"Sponsor langsung menolak counter di luar batas fleksibilitas.":"Counter diproses otomatis oleh Sponsor Engine.") : action==="accept"?"Kontrak sponsorship diterima.":"Offer ditolak.");
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
 const metricValues=(values:Record<string,string>)=>Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Number(value)]));
 const validMetrics=(values:Record<string,string>)=>Object.values(values).every(value=>value.trim()!==""&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=100);
 const setReputation=async()=>{
  if(!repTeam||!validMetrics(repMetrics)){setNotice("Pilih Team dan isi semua nilai indikator antara 0–100.");return;}
  await run("admin_calculate_team_reputation",{p_team_id:repTeam,p_metrics:metricValues(repMetrics),p_source_event:"season_evaluation"},"Team Reputation dihitung dari bobot konfigurasi.");
 };
 const setDriverReputation=async()=>{
  if(!repDriver||!validMetrics(driverMetrics)){setNotice("Pilih Driver dan isi semua nilai indikator antara 0–100.");return;}
  await run("admin_calculate_driver_reputation",{p_member_id:repDriver,p_metrics:metricValues(driverMetrics),p_source_event:"season_evaluation"},"Driver Reputation dihitung dari bobot konfigurasi.");
 };
 const saveFocusTargets=async()=>{
  const values=Object.fromEntries(Object.entries(focusTargets).map(([tier,metrics])=>[tier,Object.fromEntries(Object.entries(metrics).map(([key,value])=>[key,Number(value)]))]));
  await run("admin_set_brand_ecosystem_config",{p_key:"sponsor_focus_targets",p_value:values,p_description:"Sponsor performance targets by tier"},"Sponsor focus targets disimpan.");
 };
 const saveEngineConfig=async()=>{
  const numberMap=(v:Record<string,string>)=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,Number(x)]));
  const p={premio:{T1:Number(divisionProb.premioT1),T2:Number(divisionProb.premioT2),T3:Number(divisionProb.premioT3)},zwei:{T1:Number(divisionProb.zweiT1),T2:Number(divisionProb.zweiT2),T3:Number(divisionProb.zweiT3)}};
  for(const [name,value] of Object.entries(p)){if(Object.values(value).some(n=>!Number.isFinite(n)||n<0||n>100)||Math.abs(Object.values(value).reduce((a,b)=>a+b,0)-100)>0.01){setNotice("Probabilitas tier "+name+" harus berjumlah tepat 100%.");return;}}
  const configs=[
   ["team_reputation_weights",numberMap(teamWeights),"Team Reputation weights"],
   ["driver_reputation_weights",numberMap(driverWeights),"Driver Reputation weights"],
   ["sponsor_trust_weights",numberMap(trustWeights),"Sponsor Trust weights"],
   ["bonus_pool_percent",{value:Number(bonusPercent)},"Seasonal bonus pool percentage"],
   ["sponsor_division_probabilities",p,"Sponsor tier probability by division"],
   ["fan_growth_config",{base_growth_percent:Number(fanGrowth.base),win_multiplier:Number(fanGrowth.win),podium_multiplier:Number(fanGrowth.podium),points_multiplier:Number(fanGrowth.points),finish_multiplier:Number(fanGrowth.finish),bad_finish_decline_percent:Number(fanGrowth.badFinish),dnf_decline_percent:Number(fanGrowth.dnf),poor_streak_decline_percent:Number(fanGrowth.streak),inactive_decline_percent:Number(fanGrowth.inactive),inactive_grace_rounds:Number(fanGrowth.grace),regional_scope:"regional"},"Regional fan growth and decline settings"]
  ];
  for(const [key,value,description] of configs){const {error}=await supabase!.rpc("admin_set_brand_ecosystem_config",{p_key:key,p_value:value,p_description:description});if(error){setNotice(error.message);return;}}
  setNotice("Konfigurasi Brand Ecosystem disimpan.");await refresh();
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
  if(!validMetrics(trustMetrics)){setNotice("Isi semua indikator Trust Score dengan nilai 0–100.");return;}
  await run("admin_evaluate_sponsorship_trust",{p_contract_id:contractId,p_season_id:season,p_metrics:metricValues(trustMetrics)},"Evaluasi Trust Score disimpan.");
 };

 if(loading)return <section className="workspace brand-ecosystem"><div className="workspace-card">Memuat Brand Ecosystem...</div></section>;
 if(notice.includes("hanya dapat diakses")||notice.includes("belum terhubung"))return <section className="workspace brand-ecosystem"><div className="workspace-card">{notice}</div></section>;
 if(mode==="admin")return <section className="workspace brand-ecosystem">
  <Link className="back-link" to="/admin/operations"><ArrowLeft size={16}/> Operations Suite</Link>
  <header className="page-heading"><span className="section-eyebrow">ADMIN CONTROL · BRAND ECOSYSTEM</span><h1 className="page-title">Brand Ecosystem</h1><p className="page-description">Kelola sponsor, AI matching, reputasi, fans regional, target, trust score, dan settlement melalui Economy Ledger.</p></header>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
  <nav className="brand-admin-nav" aria-label="Navigasi konfigurasi sponsorship">
   <a href="#sponsor-database">Sponsor</a><a href="#sponsor-tiers">Tier</a><a href="#sponsor-matching">AI Matching</a><a href="#sponsor-settlement">Pembayaran</a><a href="#team-reputation-config">Team Reputation</a><a href="#driver-reputation-config">Driver Reputation</a><a href="#sponsor-engine-config">Engine</a><a href="#regional-fanbase-config">Fanbase</a>
  </nav>
  <section className="brand-grid">
   <article id="sponsor-database" className="workspace-card"><span className="section-eyebrow">SPONSOR DATABASE</span><h2>Tambah Sponsor</h2><p className="brand-card-help">Fungsi: menyimpan brand yang bisa menjadi sumber penawaran sponsorship. Budget adalah dana sponsor yang tersedia, sedangkan fleksibilitas menentukan seberapa jauh sponsor bisa bernegosiasi.</p>
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
   <article id="sponsor-tiers" className="workspace-card"><span className="section-eyebrow">SPONSOR TIERS</span><h2>Aturan Tier</h2><p className="brand-card-help">Fungsi: menentukan syarat minimum agar tim layak menerima sponsor pada tier ini. Tim yang tidak memenuhi reputasi, fans, atau performa minimum akan dilewati saat matching.</p>
    <div className="brand-two"><label>Tier key<input value={tierForm.key} onChange={e=>setTierForm(v=>({...v,key:e.target.value.toUpperCase()}))}/></label><label>Label<input value={tierForm.label} onChange={e=>setTierForm(v=>({...v,label:e.target.value}))}/></label></div>
    <label>Minimum Team Reputation<input type="number" min="0" max="9999" value={tierForm.rep} onChange={e=>setTierForm(v=>({...v,rep:e.target.value}))}/></label>
    <label>Minimum Fan Population<input type="number" min="0" value={tierForm.fans} onChange={e=>setTierForm(v=>({...v,fans:e.target.value}))}/></label>
    <label>Minimum season performance<input type="number" min="0" value={tierForm.performance} onChange={e=>setTierForm(v=>({...v,performance:e.target.value}))}/></label>
    <div className="brand-two"><label>Budget minimum<input type="number" min="0" value={tierForm.budget} onChange={e=>setTierForm(v=>({...v,budget:e.target.value}))}/></label><label>Budget maksimum<input type="number" min="0" value={tierForm.maxBudget} onChange={e=>setTierForm(v=>({...v,maxBudget:e.target.value}))}/></label></div>
    <label className="brand-check"><input type="checkbox" checked={tierForm.active} onChange={e=>setTierForm(v=>({...v,active:e.target.checked}))}/> Aktif untuk AI matching</label>
    <button className="action primary" disabled={saving} onClick={()=>void saveTier()}>Simpan Aturan Tier</button>
    <div className="brand-compact-list">{tiers.map(t=><div key={t.tier_key}><strong>{t.label} {t.is_active?"· ACTIVE":"· DRAFT"}</strong><span>Reputation {num(t.minimum_team_reputation)} · Fans {num(t.minimum_fan_population)}</span></div>)}</div>
   </article>
   <article id="sponsor-matching" className="workspace-card"><span className="section-eyebrow">AI SPONSOR MATCHING</span><h2>Generate Sponsor Offers</h2><p className="brand-card-help">Fungsi: mencari pasangan sponsor dan tim yang memenuhi aturan tier, reputasi, fanbase, serta budget untuk season yang dipilih. Proses ini membuat penawaran, bukan langsung membuat kontrak.</p>
    <label>Season<select value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <button className="action primary" disabled={saving||!seasonId} onClick={()=>void generate()}><Handshake size={15}/> Generate offers untuk tim yang memenuhi syarat</button>
    <p className="brand-note">Matching memakai tier sponsor aktif, Team Reputation, regional Fan Population, dan budget. Sponsor dapat bekerja dengan beberapa tim sekaligus.</p>
   </article>
   <article id="sponsor-settlement" className="workspace-card"><span className="section-eyebrow">ECONOMY SETTLEMENT</span><h2>Automatic Settlement</h2><p className="brand-card-help">Fungsi: membayar kontrak yang sudah jatuh tempo dan bonus target yang sudah tercapai. Setiap pembayaran melewati Sponsor Source dan tercatat di Economy Ledger.</p>
    <p className="brand-note">Pembayaran memeriksa budget masing-masing sponsor dan Sponsor Source, lalu mencatat transaksi pada Economy Ledger.</p>
    <button className="action primary" disabled={saving} onClick={()=>void run("admin_process_sponsorship_payments",{},"Seasonal sponsorship payments diproses.")}><Coins size={15}/> Proses pembayaran jatuh tempo</button>
    <button className="action" disabled={saving} onClick={()=>void run("admin_process_sponsorship_bonuses",{},"Bonus target diproses.")}>Proses bonus target tercapai</button>
   </article>
   <article id="team-reputation-config" className="workspace-card"><span className="section-eyebrow">TEAM REPUTATION</span><h2>Update Reputation</h2><p className="brand-card-help">Fungsi: menghitung reputasi komersial tim dari enam indikator. Masukkan nilai aktual tiap indikator dari 0 sampai 100. Bobotnya diatur pada kartu Engine Configuration.</p>
    <label>Team<select value={repTeam} onChange={e=>setRepTeam(e.target.value)}><option value="">Pilih team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <div className="brand-metric-grid">{Object.entries(repMetrics).map(([key,value])=><label key={key}>{({championship:"Prestasi kejuaraan",race_performance:"Performa balapan",consistency:"Konsistensi",driver_reputation:"Reputasi driver",fanbase:"Basis fans",commercial_credibility:"Kredibilitas komersial"} as Record<string,string>)[key]}<input type="number" min="0" max="100" value={value} onChange={e=>setRepMetrics(x=>({...x,[key]:e.target.value}))}/></label>)}</div>
    <button className="action primary" disabled={saving||!repTeam||!repMetrics} onClick={()=>void setReputation()}>Hitung Team Reputation</button>
   </article>
   <article id="driver-reputation-config" className="workspace-card"><span className="section-eyebrow">DRIVER REPUTATION</span><h2>Update Driver Score</h2><p className="brand-card-help">Fungsi: menghitung reputasi individu driver dari prestasi, performa, konsistensi, pengalaman, popularitas, dan catatan profesional. Isi nilai aktual 0–100, bukan skor akhir.</p>
    <label>Driver<select value={repDriver} onChange={e=>setRepDriver(e.target.value)}><option value="">Pilih Driver</option>{members.filter(m=>m.role==="Driver").map(m=><option key={m.id} value={m.id}>{m.character_name||m.id}</option>)}</select></label>
    <div className="brand-metric-grid">{Object.entries(driverMetrics).map(([key,value])=><label key={key}>{({championship:"Prestasi kejuaraan",race_performance:"Performa balapan",consistency:"Konsistensi",experience:"Pengalaman",fan_popularity:"Popularitas fans",professional_record:"Catatan profesional"} as Record<string,string>)[key]}<input type="number" min="0" max="100" value={value} onChange={e=>setDriverMetrics(x=>({...x,[key]:e.target.value}))}/></label>)}</div>
    <button className="action primary" disabled={saving||!repDriver||!driverMetrics} onClick={()=>void setDriverReputation()}>Hitung Driver Reputation</button>
   </article>
   <article id="sponsor-engine-config" className="workspace-card"><span className="section-eyebrow">ENGINE CONFIGURATION</span><h2>Weights & Sponsor Availability</h2><p className="brand-card-help">Fungsi: mengatur cara mesin memberi skor reputasi, membagi peluang tier sponsor, menghitung bonus pool, dan mengubah jumlah fans setelah hasil race. Ini pengaturan lanjutan. Nilai awal sudah tersedia, jadi tidak wajib diubah.</p>
    <details className="brand-engine-advanced"><summary>Pengaturan lanjutan · Bobot, bonus, fans, dan target</summary>
    <div className="brand-config-group"><strong>Bobot Team Reputation</strong><p className="brand-config-hint">Menentukan seberapa besar kontribusi setiap indikator pada skor reputasi tim. Total bobot tidak harus 100 karena sistem menghitungnya secara proporsional.</p><div className="brand-config-grid">{Object.entries(teamWeights).map(([k,v])=><label key={k}>{k.replaceAll("_"," ")}<input type="number" min="0" value={v} onChange={e=>setTeamWeights(x=>({...x,[k]:e.target.value}))}/></label>)}</div></div>
    <div className="brand-config-group"><strong>Bobot Driver Reputation</strong><p className="brand-config-hint">Menentukan pengaruh prestasi, performa, konsistensi, pengalaman, popularitas, dan rekam profesional terhadap reputasi driver.</p><div className="brand-config-grid">{Object.entries(driverWeights).map(([k,v])=><label key={k}>{k.replaceAll("_"," ")}<input type="number" min="0" value={v} onChange={e=>setDriverWeights(x=>({...x,[k]:e.target.value}))}/></label>)}</div></div>
    <div className="brand-config-group"><strong>Bobot Sponsor Trust</strong><p className="brand-config-hint">Menentukan faktor penilaian hubungan tim dengan sponsor di akhir season. Bobot tertinggi saat ini adalah pencapaian target.</p><div className="brand-config-grid">{Object.entries(trustWeights).map(([k,v])=><label key={k}>{k.replaceAll("_"," ")}<input type="number" min="0" value={v} onChange={e=>setTrustWeights(x=>({...x,[k]:e.target.value}))}/></label>)}</div></div>
    <p className="brand-config-hint">Persentase dari nilai kontrak yang disisihkan sebagai batas total bonus target selama kontrak.</p><label>Seasonal bonus pool (%)<input type="number" min="0" max="100" value={bonusPercent} onChange={e=>setBonusPercent(e.target.value)}/></label>
    <strong>Perubahan fans setiap hasil race dipublikasikan</strong><p className="brand-config-hint">Base growth adalah pertumbuhan dasar. Multiplier memperbesar pertumbuhan untuk kemenangan, podium, raihan poin, dan finish lainnya. Decline mengatur penurunan karena hasil buruk, DNF, streak buruk, atau absen. Grace menentukan berapa race absen sebelum penalti inactivity berlaku.</p><div className="brand-config-grid">{Object.entries(fanGrowth).map(([k,v])=><label key={k}>{({base:"Base growth (%)",win:"Win multiplier",podium:"Podium multiplier",points:"Points multiplier",finish:"Other finish multiplier",badFinish:"Poor finish decline (%)",dnf:"DNF decline (%)",streak:"3-race poor streak extra decline (%)",inactive:"Inactive after grace (%)",grace:"Consecutive missed races"} as Record<string,string>)[k]}<input type="number" min={k==="grace"?"1":"0"} max={k==="base"||k==="badFinish"||k==="dnf"||k==="streak"||k==="inactive"?"5":"10"} step={k==="grace"?"1":"0.05"} value={v} onChange={e=>setFanGrowth(x=>({...x,[k]:e.target.value}))}/></label>)}</div><p className="brand-config-hint">Growth mengikuti hasil race. DNF, hasil di luar poin, dan absen berturut-turut menurunkan fans. Loyalitas tinggi mengurangi dampak penurunan; engagement dan sentiment memperkuat pertumbuhan positif.</p>
    <strong>Peluang tier sponsor per divisi (%)</strong><p className="brand-config-hint">Mengatur komposisi peluang sponsor T1, T2, dan T3 yang tersedia di masing-masing divisi. Total untuk setiap divisi wajib 100%.</p><div className="brand-config-grid">{Object.entries(divisionProb).map(([k,v])=><label key={k}>{k.replace(/([A-Z])/g," $1")}<input type="number" min="0" max="100" value={v} onChange={e=>setDivisionProb(x=>({...x,[k]:e.target.value}))}/></label>)}</div>
    <div className="brand-config-group"><strong>Target performa sponsor per tier</strong><p className="brand-config-hint">Target angka yang digunakan mesin untuk membedakan fokus sponsor berdasarkan tier. Nilai 0–100 dan bisa disesuaikan untuk tiap tier.</p><label>Tier<select value={focusTier} onChange={e=>setFocusTier(e.target.value)}>{Object.keys(focusTargets).map(t=><option key={t}>{t}</option>)}</select></label><div className="brand-config-grid">{Object.entries(focusTargets[focusTier]||{}).map(([k,v])=><label key={k}>{k}<input type="number" min="0" max="100" value={v} onChange={e=>setFocusTargets(x=>({...x,[focusTier]:{...x[focusTier],[k]:e.target.value}}))}/></label>)}</div><button className="action" disabled={saving} onClick={()=>void saveFocusTargets()}>Simpan Focus Targets</button></div>
    <button className="action primary" disabled={saving} onClick={()=>void saveEngineConfig()}>Simpan Konfigurasi Engine</button>
    </details>
   </article>
   <article id="regional-fanbase-config" className="workspace-card"><span className="section-eyebrow">REGIONAL FANBASE</span><h2>Adjust Fan Population</h2><p className="brand-card-help">Fungsi: koreksi manual jumlah fans suatu tim atau driver di wilayah tertentu. Gunakan hanya untuk data awal atau koreksi resmi. Perubahan akan masuk ke riwayat populasi.</p>
    <label>Entity<select value={fanEntity} onChange={e=>{setFanEntity(e.target.value);setFanTarget("")}}><option value="team">Team</option><option value="driver">Driver</option></select></label>
    <label>Target<select value={fanTarget} onChange={e=>setFanTarget(e.target.value)}><option value="">Pilih target</option>{(fanEntity==="team"?teams:members.filter(m=>m.role==="Driver")).map(x=><option key={x.id} value={x.id}>{fanEntity==="team"?(x as Team).name:(x as Member).character_name||"Driver"}</option>)}</select></label>
    <label>Region<input value={fanRegion} onChange={e=>setFanRegion(e.target.value)}/></label>
    <label>Perubahan populasi (+/-)<input type="number" step="1" value={fanDelta} onChange={e=>setFanDelta(e.target.value)}/></label>
    <button className="action primary" disabled={saving||!fanTarget||!fanDelta} onClick={()=>void adjustFans()}>Simpan Fan Population</button>
   </article>
  </section>
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">NEGOTIATION CONTROL</span><h2>Offer & Sponsor Engine</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div><p className="brand-card-help">Fungsi: memantau semua penawaran yang sedang berjalan. Jika Team Owner mengirim counter-offer, tombol AI Sponsor Respond menjalankan keputusan sponsor berdasarkan budget dan fleksibilitas negosiasi.</p>
   {visibleOffers.map(o=><article className="brand-list-item" key={o.id}><div><strong>{sponsor(o.sponsor_id)} → <TeamProfileLink teamId={o.target_team_id||undefined}>{teams.find(t=>t.id===o.target_team_id)?.name||"Team"}</TeamProfileLink></strong><span>{money(lastRevision(o.id)?.amount??o.proposed_amount)} · {o.status} · {o.counter_count||0}/3 counters {o.generated_by_engine?"· AI MATCHED":""}</span></div>{o.status==="negotiating"&&lastRevision(o.id)?.actor_kind==="member"&&<button className="action primary" disabled={saving} onClick={()=>void sponsorRespond(o.id)}>AI Sponsor Respond</button>}</article>)}
  </section>
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CONTRACT OPERATIONS</span><h2>Contracts & Targets</h2></div></div><p className="brand-card-help">Fungsi: mengelola target kontrak, mencatat progres, memproses bonus yang lolos, dan mengevaluasi kepercayaan sponsor di akhir season. Target race otomatis diperbarui dari hasil race yang dipublikasikan.</p><div className="brand-trust-inputs"><strong>Nilai evaluasi Sponsor Trust (0–100)</strong><p className="brand-config-hint">Isi saat melakukan Evaluate Trust. Nilai ini menggambarkan pencapaian target, konsistensi, pertumbuhan fans, eksposur komersial, dan perilaku partnership.</p><div className="brand-metric-grid">{Object.entries(trustMetrics).map(([key,value])=><label key={key}>{({target_achievement:"Pencapaian target",consistency:"Konsistensi",fanbase_growth:"Pertumbuhan fans",commercial_exposure:"Eksposur komersial",partnership_conduct:"Perilaku partnership"} as Record<string,string>)[key]}<input type="number" min="0" max="100" value={value} onChange={e=>setTrustMetrics(x=>({...x,[key]:e.target.value}))}/></label>)}</div></div>
   <div className="brand-form-grid"><label>Contract<select value={targetContract} onChange={e=>setTargetContract(e.target.value)}><option value="">Pilih kontrak</option>{visibleContracts.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{sponsor(c.sponsor_id)} · {money(c.contract_amount)}</option>)}</select></label><label>Target title<input value={targetTitle} onChange={e=>setTargetTitle(e.target.value)}/></label><label>Jenis target<select value={targetMetric} onChange={e=>setTargetMetric(e.target.value)}><option value="">Pilih jenis target</option><option value="points_round_rate">Raihan poin per race (%)</option><option value="podium_round_rate">Podium per race (%)</option><option value="win_round_rate">Kemenangan per race (%)</option><option value="finish_rate">Tingkat finish (%)</option></select></label><label>Target value<input type="number" min="1" value={targetValue} onChange={e=>setTargetValue(e.target.value)}/></label><label>Bonus (€)<input type="number" min="0" value={targetBonus} onChange={e=>setTargetBonus(e.target.value)}/></label><button className="action primary" disabled={saving||!targetContract||!targetTitle||!targetMetric||!targetValue||!targetBonus} onClick={()=>void createTarget()}><Target size={15}/> Tambah Target</button></div>
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
  {counterId&&<div className="brand-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setCounterId("");}}><section className="brand-counter-modal" role="dialog" aria-modal="true" aria-labelledby="brand-counter-title"><header><div><span className="section-eyebrow">SPONSOR NEGOTIATION</span><h2 id="brand-counter-title">Ajukan Counter</h2></div><button className="brand-modal-close" aria-label="Tutup popup" disabled={saving} onClick={()=>setCounterId("")}><X size={19}/></button></header><p className="brand-card-help">Sponsor akan langsung memproses nominal ini. Penawaran yang melewati batas fleksibilitas sponsor akan ditolak, bukan dibalas dengan counter baru.</p><label>Nominal Counter (€)<input autoFocus type="number" min="0.01" step="0.01" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)} placeholder="Masukkan nominal counter"/></label><label>Catatan / Ketentuan (opsional)<textarea rows={3} value={counterTerms} onChange={e=>setCounterTerms(e.target.value)} placeholder="Tambahkan catatan untuk sponsor"/></label><footer><button className="action" disabled={saving} onClick={()=>setCounterId("")}>Batal</button><button className="action primary" disabled={saving||!counterAmount||Number(counterAmount)<=0} onClick={()=>void respond(counterId,"counter")}>{saving?"Memproses...":"Kirim Counter"}</button></footer></section></div>}
  <div className="brand-stats">
   <article><span>{mode==="team"?"TEAM REPUTATION":"DRIVER REPUTATION"}</span><strong>{reputation?num(reputation.score):"—"}</strong><small>{reputation?.band||"Belum dinilai"}</small></article>
   <article><span>FAN POPULATION</span><strong>{num(totalFans(fansFor))}</strong><small>Agregat regional</small></article>
   {mode==="team"&&<article><span>ACTIVE CONTRACTS</span><strong>{visibleContracts.filter(c=>c.status==="active").length}</strong><small>Brand partners</small></article>}
   {mode==="team"&&<article><span>SPONSORSHIP VALUE</span><strong>{money(visibleContracts.filter(c=>c.status==="active").reduce((n,c)=>n+Number(c.contract_amount),0))}</strong><small>Nilai kontrak aktif</small></article>}
  </div>
  {mode==="team"&&<>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">SPONSOR OFFERS</span><h2>Penawaran Masuk</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div>
    {visibleOffers.length===0?<p className="muted">Belum ada sponsor offer untuk tim ini.</p>:visibleOffers.map(o=>{const latest=lastRevision(o.id);const timeline=revisions.filter(r=>r.offer_id===o.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));return <article className="brand-list-item" key={o.id}><div><strong>{sponsor(o.sponsor_id)}</strong><span>{money(latest?.amount??o.proposed_amount)} · {o.status} · {o.counter_count||0}/3 counter Owner</span><p>{String(latest?.terms?.summary||o.terms?.summary||"Ketentuan sponsor")}</p><div className="brand-revision-timeline">{timeline.map((r,i)=><span key={o.id+"-"+i}><b>{r.actor_kind==="member"?"Team Owner":"Sponsor"}</b> · {money(Number(r.amount))} · {r.response==="countered"?"Counter":r.response==="accepted"?"Menerima":r.response==="rejected"?"Menolak":"Penawaran"}</span>)}</div>{o.status==="negotiating"&&latest?.actor_kind==="member"&&<small className="brand-config-hint">Sponsor sedang memproses counter secara otomatis.</small>}</div>{o.status==="offered"&&latest?.actor_kind==="admin"&&<div className="brand-inline"><button className="action primary" disabled={saving} onClick={()=>void respond(o.id,"accept")}><CheckCircle2 size={14}/> Accept</button><button className="action" disabled={saving} onClick={()=>{setCounterId(o.id);setCounterAmount(String(latest.amount));}}>Counter</button><button className="action" disabled={saving} onClick={()=>void respond(o.id,"reject")}>Reject</button></div>}
     
    </article>})}
   </section>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CONTRACTS & TARGETS</span><h2>Partnership Portfolio</h2></div><Handshake size={18}/></div>
    {visibleContracts.length===0?<p className="muted">Belum ada kontrak sponsorship.</p>:visibleContracts.map(c=><article className="brand-contract" key={c.id}><div className="brand-list-item"><div><strong>{sponsor(c.sponsor_id)}</strong><span>{money(c.contract_amount)} per season · {c.duration_seasons} season · {c.status}</span></div><span className="brand-contract-status">{c.renewal_status}</span></div><div className="brand-progress-meta"><span>Bonus pool used</span><strong>{money(c.bonus_pool_paid)} / {money(c.bonus_pool_total)}</strong></div><div className="brand-progress"><i style={{width:Math.min(100,c.bonus_pool_total?c.bonus_pool_paid/c.bonus_pool_total*100:0)+"%"}}/></div>{targets.filter(t=>t.contract_id===c.id).map(t=><div className="brand-target" key={t.id}><div><strong>{t.title}</strong><small>{t.current_value} / {t.target_value} · {t.status}</small></div><span>Bonus {money(t.bonus_amount)}</span></div>)}</article>)}
   </section>
  </>}
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">REGIONAL FANBASE</span><h2>{mode==="team"&&team?<TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink>:mode==="driver"&&member?.public_member_id?<MemberProfileLink memberId={member.public_member_id}>{member.character_name||"Driver"}</MemberProfileLink>:entityName||"Fan Population"}</h2></div><Globe2 size={18}/></div>
   {fansFor.length===0?<p className="muted">Belum ada data populasi fans regional.</p>:<div className="brand-fan-grid">{fansFor.map(f=><article key={f.region_key}><strong>{f.region_key}</strong><b>{num(f.population)}</b><small>Loyalty {f.loyalty} · Engagement {f.engagement} · Sentiment {f.sentiment}</small></article>)}</div>}
  </section>
  {mode==="driver"&&<section className="workspace-card"><span className="section-eyebrow">DRIVER BRAND PROFILE</span><h2>Individual sponsorship is disabled</h2><p className="muted">Sponsorship contracts are issued to teams only. Driver reputation and regional fans remain visible as part of the team's commercial profile.</p></section>}
 </section>;
}
