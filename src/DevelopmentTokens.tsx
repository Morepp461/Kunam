import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,Coins,RefreshCw,Trophy} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import DevelopmentShop from "./DevelopmentShop";

type Account={id:string;asset_type:"DDP"|"TDP";balance:number;member_id:string|null;team_id:string|null};
type Entry={id:string;delta:number;source_type:string;description:string;created_at:string};
type Member={id:string;role:string|null;team_id:string|null;character_name:string|null};
type Team={id:string;name:string};
type Part={id:string;part_key:string;current_value:number;updated_at:string};
type PartHistory={id:string;part_key:string;previous_value:number;new_value:number;tdp_spent:number;created_at:string;note:string|null};
type DriverAttribute={id:string;attribute_key:string;current_value:number;updated_at:string};
type DriverHistory={id:string;attribute_key:string;previous_value:number;new_value:number;ddp_spent:number;created_at:string;note:string|null};
const DRIVER_LABELS:Record<string,string>={race_pace:"Race Pace",qualifying_pace:"Qualifying Pace",experience:"Experience",aggression:"Aggression",defensive_strength:"Defensive Strength",overtake_skill:"Overtake Skill",mistake_rate:"Mistake Rate",tyre_management:"Tyre Management"};
const PART_LABELS:Record<string,string>={race_pace:"Race Pace",qualifying_pace:"Qualifying Pace",engine_power:"Engine Power",aero_power:"Aero Power",low_speed_corners:"Low Speed Corners",high_speed_corners:"High Speed Corners",traction:"Traction",mechanical_grip:"Mechanical Grip",team_tyre_management:"Team Tyre Management",strategy_quality:"Strategy Quality",team_morale:"Team Morale",reliability:"Reliability",car_tyre_wear:"Car Tyre Wear",pit_stop_efficiency:"Pit Stop Efficiency",drs_efficiency:"DRS Efficiency",ers_efficiency:"ERS Efficiency"};
export default function DevelopmentTokens({session,asset}:{session:Session;asset:"DDP"|"TDP"}){
 const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Team|null>(null),[account,setAccount]=useState<Account|null>(null),[entries,setEntries]=useState<Entry[]>([]);
 const [parts,setParts]=useState<Part[]>([]),[partHistory,setPartHistory]=useState<PartHistory[]>([]);
 const [driverAttributes,setDriverAttributes]=useState<DriverAttribute[]>([]),[driverHistory,setDriverHistory]=useState<DriverHistory[]>([]);
 const [targets,setTargets]=useState<Record<string,string>>({}),[upgrading,setUpgrading]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Akun belum terhubung ke member.");setLoading(false);return}
  const {data:m,error:me}=await supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle();
  if(me||!m){setNotice(me?.message||"Member tidak ditemukan.");setLoading(false);return}
  setMember(m as Member);
  if(asset==="TDP"&&m.team_id){
   const [{data:t},{data:partRows,error:partError},{data:historyRows,error:historyError}]=await Promise.all([
    supabase.from("teams").select("id,name").eq("id",m.team_id).maybeSingle(),
    supabase.from("caleris_team_development_parts").select("id,part_key,current_value,updated_at").eq("team_id",m.team_id).order("part_key"),
    supabase.from("caleris_team_development_part_history").select("id,part_key,previous_value,new_value,tdp_spent,created_at,note").eq("team_id",m.team_id).order("created_at",{ascending:false}).limit(100)
   ]);
   setTeam(t as Team|null);setParts((partRows||[]) as Part[]);setPartHistory((historyRows||[]) as PartHistory[]);
   if(partError||historyError)setNotice(partError?.message||historyError?.message||"Gagal memuat riwayat pengembangan.");
  }else{setTeam(null);setParts([]);setPartHistory([])}
  if(asset==="DDP"){
   const [{data:driverRows,error:driverError},{data:driverHistoryRows,error:driverHistoryError}]=await Promise.all([
    supabase.from("caleris_driver_development_attributes").select("id,attribute_key,current_value,updated_at").eq("member_id",m.id).order("attribute_key"),
    supabase.from("caleris_driver_development_history").select("id,attribute_key,previous_value,new_value,ddp_spent,created_at,note").eq("member_id",m.id).order("created_at",{ascending:false}).limit(100)
   ]);
   setDriverAttributes((driverRows||[]) as DriverAttribute[]);setDriverHistory((driverHistoryRows||[]) as DriverHistory[]);
   if(driverError||driverHistoryError)setNotice(driverError?.message||driverHistoryError?.message||"Gagal memuat atribut driver.");
  }else{setDriverAttributes([]);setDriverHistory([])}
  const query=supabase.from("caleris_development_accounts").select("*").eq("asset_type",asset).eq(asset==="DDP"?"member_id":"team_id",asset==="DDP"?m.id:m.team_id||"");
  const {data:a,error:ae}=await query.maybeSingle();
  if(ae){setNotice(ae.message);setLoading(false);return}
  setAccount(a as Account|null);
  if(a){const {data:l,error:le}=await supabase.from("caleris_development_ledger").select("id,delta,source_type,description,created_at").eq("account_id",a.id).order("created_at",{ascending:false}).limit(100);if(le)setNotice(le.message);setEntries((l||[]) as Entry[])}else setEntries([]);
  setLoading(false);
 },[session.user.id,asset]);
 useEffect(()=>{void refresh()},[refresh]);
 const balance=Number(account?.balance||0);
 const upgrade=async(scope:"team"|"driver",key:string)=>{
  const raw=targets[key],value=Number(raw);
  if(!raw||!Number.isFinite(value)){setNotice("Masukkan nilai atribut tujuan.");return}
  setUpgrading(key);setNotice("");
  const {data,error}=await supabase!.functions.invoke("economy-workflows",{body:{action:"upgrade_development_attribute",scope,attributeKey:key,newValue:value}});
  if(error||data?.error){setNotice(data?.error||error?.message||"Upgrade gagal.");setUpgrading(null);return}
  setTargets(v=>({...v,[key]:""}));setUpgrading(null);await refresh();
 };
 return <section className="workspace development-token-workspace">
  <DevelopmentShop session={session}/>
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">DEVELOPMENT ECONOMY</span><h1 className="page-title">{asset} Wallet</h1><p className="page-description">{asset==="DDP"?"Driver Development Points":"Team Development Points"} disimpan terpisah dari saldo ¢p dan hanya bertambah melalui reward resmi atau penyesuaian Admin.</p></header>
  {loading?<div className="workspace-card"><p>Memuat development wallet...</p></div>:<><div className="development-token-hero"><div><span className="section-eyebrow">{asset==="DDP"?"DRIVER DEVELOPMENT POINTS":"TEAM DEVELOPMENT POINTS"}</span><strong>{balance.toLocaleString("id-ID",{maximumFractionDigits:2})}</strong><small>{asset==="DDP"?member?.character_name||"Driver":team?.name||"Team"}</small></div><span className="development-token-icon">{asset==="DDP"?<Trophy size={28}/>:<Coins size={28}/>}</span></div>
   {asset==="TDP"&&<section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CAR DEVELOPMENT</span><h2>16 atribut mobil</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {parts.length===0?<p className="muted">Data atribut belum tersedia untuk tim ini.</p>:<div className="development-token-history">{parts.map(part=><article key={part.id}><div><strong>{PART_LABELS[part.part_key]||part.part_key}</strong><small>Rentang 50–100 · 1 TDP per +1</small><div className="development-upgrade-controls"><input aria-label={"Nilai tujuan "+(PART_LABELS[part.part_key]||part.part_key)} type="number" min={Number(part.current_value)+0.01} max="100" step="1" value={targets[part.part_key]||""} onChange={e=>setTargets(v=>({...v,[part.part_key]:e.target.value}))} placeholder="Nilai tujuan"/><button type="button" disabled={upgrading===part.part_key} onClick={()=>void upgrade("team",part.part_key)}>{upgrading===part.part_key?"Memproses...":"Upgrade"}</button></div></div><b>{Number(part.current_value).toLocaleString("id-ID",{maximumFractionDigits:2})}/100</b></article>)}</div>}
   </section>}
   {asset==="DDP"&&<section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">DRIVER DEVELOPMENT</span><h2>8 atribut driver</h2></div></div>
    {driverAttributes.length===0?<p className="muted">Data atribut driver belum tersedia.</p>:<div className="development-token-history">{driverAttributes.map(a=><article key={a.id}><div><strong>{DRIVER_LABELS[a.attribute_key]||a.attribute_key}</strong><small>Rentang 50–100 · 1 DDP per +1</small><div className="development-upgrade-controls"><input aria-label={"Nilai tujuan "+(DRIVER_LABELS[a.attribute_key]||a.attribute_key)} type="number" min={Number(a.current_value)+0.01} max="100" step="1" value={targets[a.attribute_key]||""} onChange={e=>setTargets(v=>({...v,[a.attribute_key]:e.target.value}))} placeholder="Nilai tujuan"/><button type="button" disabled={upgrading===a.attribute_key} onClick={()=>void upgrade("driver",a.attribute_key)}>{upgrading===a.attribute_key?"Memproses...":"Upgrade"}</button></div></div><b>{Number(a.current_value).toLocaleString("id-ID",{maximumFractionDigits:2})}/100</b></article>)}</div>}
   </section>}
   {asset==="DDP"&&<section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">DRIVER UPGRADE LEDGER</span><h2>Riwayat upgrade atribut</h2></div></div>
    {driverHistory.length===0?<p className="muted">Belum ada riwayat upgrade atribut driver.</p>:<div className="development-token-history">{driverHistory.map(h=><article key={h.id}><div><strong>{DRIVER_LABELS[h.attribute_key]||h.attribute_key}: {h.previous_value} → {h.new_value}</strong><small>{new Date(h.created_at).toLocaleString("id-ID")}{h.note?" · "+h.note:""}</small></div><b>{Number(h.ddp_spent).toLocaleString("id-ID")} DDP</b></article>)}</div>}
   </section>}
   {asset==="TDP"&&<section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">UPGRADE LEDGER</span><h2>Riwayat upgrade atribut</h2></div></div>
    {partHistory.length===0?<p className="muted">Belum ada riwayat upgrade.</p>:<div className="development-token-history">{partHistory.map(h=><article key={h.id}><div><strong>{PART_LABELS[h.part_key]||h.part_key}: {h.previous_value} → {h.new_value}</strong><small>{new Date(h.created_at).toLocaleString("id-ID")}{h.note?" · "+h.note:""}</small></div><b>{Number(h.tdp_spent).toLocaleString("id-ID")} TDP</b></article>)}</div>}
   </section>}
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">TOKEN LEDGER</span><h2>Riwayat development token</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>{entries.length===0?<p className="muted">Belum ada development token yang diterima.</p>:<div className="development-token-history">{entries.map(e=><article key={e.id}><div><strong>{e.description}</strong><small>{e.source_type.replaceAll("_"," ")} · {new Date(e.created_at).toLocaleString("id-ID")}</small></div><b>+{Number(e.delta).toLocaleString("id-ID",{maximumFractionDigits:2})}</b></article>)}</div>}</section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
