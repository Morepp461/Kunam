import {useCallback,useEffect,useState} from "react";
import {RefreshCw,ShoppingCart,ShieldCheck,Tag} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./team-engine-market.css";

type Engine={id:string;name:string;manufacturer?:string|null;country_of_origin?:string|null;description?:string|null;asking_price:number|null;is_for_sale?:boolean;seller_team_id?:string;seller_team_name?:string;race_pace:number;qualifying_pace:number;engine_power:number;active_usage_count?:number};
type Team={id:string;name:string};
type Assignment={engine_id:string;engine?:{name:string;race_pace:number;qualifying_pace:number;engine_power:number}};
type Season={id:string;title:string;status:string};

const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:0});
const Attributes=({engine}:{engine:Engine})=><div className="tem-attributes"><span>Race Pace <b>{Number(engine.race_pace).toFixed(0)}</b></span><span>Qualifying Pace <b>{Number(engine.qualifying_pace).toFixed(0)}</b></span><span>Engine Power <b>{Number(engine.engine_power).toFixed(0)}</b></span></div>;

export default function TeamEngineMarket({session}:{session:Session}){
 const [team,setTeam]=useState<Team|null>(null),[engines,setEngines]=useState<Engine[]>([]),[market,setMarket]=useState<Engine[]>([]);
 const [season,setSeason]=useState<Season|null>(null),[assignment,setAssignment]=useState<Assignment|null>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Profil member belum terhubung.");setLoading(false);return;}
  const {data:m,error:me}=await supabase.from("members").select("team_id,role").eq("id",p.member_id).maybeSingle();
  if(me||m?.role!=="Owner"||!m.team_id){setNotice(me?.message||"Fitur ini hanya tersedia untuk Team Owner.");setLoading(false);return;}
  const [t,e,offers,s]=await Promise.all([
   supabase.from("caleris_team_directory").select("id,name").eq("id",m.team_id).maybeSingle(),
   supabase.rpc("team_list_owned_engines"),
   supabase.rpc("list_main_event_engine_marketplace"),
   supabase.from("license_seasons").select("id,title,status").eq("status","active").order("starts_on",{ascending:false}).limit(1).maybeSingle()
  ]);
  const issue=t.error||e.error||offers.error||s.error;
  if(issue){setNotice(issue.message);setLoading(false);return;}
  const activeSeason=(s.data||null) as Season|null;
  setTeam(t.data as Team|null);setSeason(activeSeason);setEngines((e.data||[]) as Engine[]);setMarket((offers.data||[]) as Engine[]);
  if(activeSeason){
   const {data:a}=await supabase.from("caleris_team_engines").select("engine_id,engine:caleris_engines(name,race_pace,qualifying_pace,engine_power)").eq("team_id",m.team_id).eq("season_id",activeSeason.id).maybeSingle();
   setAssignment((a||null) as Assignment|null);
  }else setAssignment(null);
  setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void load()},[load]);
 const purchase=async(engine:Engine)=>{
  if(!supabase||!season)return;setSaving(engine.id);setNotice("");
  const {error}=await supabase.rpc("team_purchase_engine_usage",{p_engine_id:engine.id,p_season_id:season.id,p_idempotency_key:crypto.randomUUID()});
  setSaving("");if(error){setNotice(error.message);return;}
  setNotice("Hak penggunaan Engine berhasil dibeli. Pemilik Engine tetap memiliki Engine tersebut; atributnya sekarang digunakan tim kamu.");await load();
 };
 return <section className="workspace tem-workspace">
  <header className="page-heading"><span className="section-eyebrow">TEAM PANEL · ENGINE MARKET</span><h1 className="page-title">Engine Market</h1><p className="page-description">Beli hak penggunaan Engine untuk season aktif. Engine tetap dimiliki tim asal dan dapat digunakan bersama oleh beberapa tim.</p></header>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
  {loading?<div className="workspace-card">Memuat Engine Market...</div>:!team?<div className="workspace-card tem-empty"><ShieldCheck/><strong>Akses Team Owner diperlukan</strong></div>:<>
   <section className="workspace-card tem-card"><div className="tem-head"><div><span className="section-eyebrow">CURRENT SEASON</span><h2>{season?.title||"Belum ada season aktif"}</h2></div><button className="economy-secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {assignment?.engine?<article className="tem-engine"><div className="tem-engine-title"><Tag size={18}/><div><strong>{assignment.engine.name}</strong><small>Engine yang digunakan tim saat ini</small></div></div><Attributes engine={{id:assignment.engine_id,name:assignment.engine.name,asking_price:null,race_pace:assignment.engine.race_pace,qualifying_pace:assignment.engine.qualifying_pace,engine_power:assignment.engine.engine_power}}/></article>:<p className="muted">Belum ada Engine yang digunakan untuk season aktif.</p>}
   </section>
   <section className="workspace-card tem-card"><div className="tem-head"><div><span className="section-eyebrow">AVAILABLE ENGINE</span><h2>Engine tersedia</h2></div><span className="empty-tag">{market.length} listing</span></div>
    {!season?<p className="muted">Season aktif belum tersedia.</p>:market.length===0?<p className="muted">Belum ada listing penggunaan Engine dari tim lain.</p>:market.map(engine=><article className="tem-engine" key={engine.id}>
     <div className="tem-engine-title"><Tag size={18}/><div><strong>{engine.name}</strong><small>{engine.manufacturer||"Manufacturer tidak tersedia"} · Pemilik: {engine.seller_team_name||"Team"}</small></div><strong>{money(Number(engine.asking_price||0))}</strong></div>
     <Attributes engine={engine}/>{engine.description&&<p className="muted">{engine.description}</p>}
     <small>Dapat digunakan bersama oleh beberapa tim · {Number(engine.active_usage_count||0)} pengguna aktif</small>
     <button className="action primary" disabled={saving===engine.id||!season} onClick={()=>void purchase(engine)}><ShoppingCart size={15}/>{saving===engine.id?"Memproses...":"Beli hak penggunaan"}</button>
    </article>)}
   </section>
   <section className="workspace-card tem-card"><div className="tem-head"><div><span className="section-eyebrow">OWNED ENGINES</span><h2>Engine milik tim</h2></div><span className="empty-tag">{engines.length} Engine</span></div>
    {engines.length?engines.map(engine=><article className="tem-engine" key={engine.id}><div className="tem-engine-title"><Tag size={18}/><div><strong>{engine.name}</strong><small>Pemilik tetap: {team.name} · {Number(engine.active_usage_count||0)} pengguna aktif</small></div></div><Attributes engine={engine}/></article>):<p className="muted">Tim belum memiliki Engine.</p>}
   </section>
  </>}
 </section>;
}
