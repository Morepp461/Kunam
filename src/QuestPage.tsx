import {useCallback,useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {CalendarDays,CheckCircle2,Clock3,RefreshCw,Wallet,ArrowUpRight} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Quest={
 id:string;quest_key:string;title:string;description:string;category:string;
 difficulty:"easy"|"normal"|"hard"|"elite";target:number;progress:number;
 status:"active"|"completed"|"expired";reward_amount:number;
 reward_status:"unpaid"|"pending"|"paid";completed_at:string|null;paid_at:string|null;
};
type Period={id:string;title:string;period_type:string;period_number:number|null;starts_on:string;ends_on:string};
type Board={member_name:string;role_scope:"driver"|"team_owner";team_id:string|null;wallet_balance:number;date:string;period:Period|null;daily:Quest[];period_quests:Quest[]};
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
const difficultyLabel:Record<string,string>={easy:"Easy",normal:"Normal",hard:"Hard",elite:"Elite"};
const difficultyClass:Record<string,string>={easy:"easy",normal:"normal",hard:"hard",elite:"elite"};

function questDestination(quest:Quest,scope:"driver"|"team_owner"){
 const key=quest.quest_key;
 if(scope==="driver"){
  if(key.startsWith("driver_train"))return "/driver-panel/training";
  if(key.startsWith("driver_dev"))return "/driver-panel/development";
  if(key.startsWith("driver_checkin"))return "/driver-panel/daily-checkin";
  return "/driver-panel/character";
 }
 if(key.startsWith("team_dev"))return "/team-panel/development";
 if(key.startsWith("team_sponsor"))return "/team-panel/sponsorship";
 if(key.startsWith("team_job_advert"))return "/team-panel/place-job-advert";
 if(key.startsWith("team_driver_contract"))return "/team-panel/driver-contracts";
 if(key.startsWith("team_affiliation"))return "/team-panel/affiliate-team";
 if(key.startsWith("team_checkin"))return "/team-panel/team-summary";
 return "/team-panel/team-summary";
}

function QuestCard({quest,scope,onClaim,claiming}:{quest:Quest;scope:"driver"|"team_owner";onClaim:(id:string)=>void;claiming:boolean}){
 const progress=Math.max(0,Math.min(100,Number(quest.progress)/Math.max(1,quest.target)*100));
 const done=quest.status==="completed";
 const destination=questDestination(quest,scope);
 return <article className={"quest-card"+(done?" is-complete":"")}>
  <Link className="quest-card-main" to={destination}>
   <div className="quest-card-top"><span className="quest-category">{quest.category}</span><span className={"quest-difficulty "+(difficultyClass[quest.difficulty]||"normal")}>{difficultyLabel[quest.difficulty]||quest.difficulty}</span></div>
   <div className="quest-card-copy"><h3>{quest.title}</h3><p>{quest.description}</p></div>
   <div className="quest-progress-meta"><span>Progress</span><strong>{Math.min(Number(quest.progress),quest.target).toLocaleString("id-ID")} / {quest.target.toLocaleString("id-ID")}</strong></div>
   <div className="quest-progress-track"><i style={{width:progress+"%"}}/></div>
   <div className="quest-card-bottom"><span className="quest-reward"><Wallet size={14}/>{money(quest.reward_amount)}</span>
    {quest.reward_status==="paid"?<span className="quest-state paid"><CheckCircle2 size={14}/> Reward masuk ke wallet aktif</span>
     :quest.reward_status==="pending"?<span className="quest-state pending"><Clock3 size={14}/> Menunggu saldo VreeoBank</span>
     :quest.status==="expired"?<span className="quest-state expired">Periode berakhir</span>
     :done?<span className="quest-state completed"><CheckCircle2 size={14}/> Reward siap diklaim</span>
     :<span className="quest-state active">Sedang berjalan</span>}
   </div>
   <span className="quest-open-hint">Buka halaman aktivitas <ArrowUpRight size={13}/></span>
  </Link>
  {done&&quest.reward_status!=="paid"&&<button className="quest-claim-button" type="button" disabled={claiming} onClick={()=>onClaim(quest.id)}>
   {claiming?"Memproses klaim…":quest.reward_status==="pending"?"Coba klaim lagi":"Klaim Reward"}
  </button>}
 </article>;
}

export default function QuestPage({session,scope}:{session:Session;scope:"driver"|"team_owner"}){
 const [board,setBoard]=useState<Board|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [claimingId,setClaimingId]=useState<string|null>(null),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setError("Koneksi database belum tersedia.");setLoading(false);return;}
  setLoading(true);setError("");
  const {data,error:requestError}=await supabase.rpc("member_get_quest_board");
  if(requestError||!data){setBoard(null);setError(requestError?.message||"Quest belum dapat dimuat.");setLoading(false);return;}
  const result=data as Board;
  if(result.role_scope!==scope){setBoard(null);setError("Quest tidak sesuai dengan role karakter aktif.");setLoading(false);return;}
  setBoard(result);setLoading(false);
 },[session.user.id,scope]);
 useEffect(()=>{void load()},[load]);
 const claim=async(id:string)=>{
  if(!supabase||claimingId)return;
  setClaimingId(id);setNotice("");
  const {data,error:claimError}=await supabase.rpc("member_claim_quest_reward",{p_assignment_id:id});
  setClaimingId(null);
  if(claimError){setNotice(claimError.message);return;}
  if(data?.status==="paid")setNotice("Reward berhasil diklaim dan masuk ke wallet.");
  else setNotice(data?.reason||"Klaim tercatat. Reward menunggu saldo VreeoBank tersedia.");
  await load();
 };
 const title=scope==="driver"?"Driver Quest":"Team Owner Quest";
 return <section className="workspace quest-workspace">
  <Link className="back-link" to="/dashboard">← Dashboard</Link>
  <header className="page-heading quest-heading"><div><span className="section-eyebrow">{scope==="driver"?"DRIVER PANEL":"TEAM PANEL"} · QUEST ENGINE</span><h1 className="page-title">{title}</h1><p className="page-description">Selesaikan aktivitas dari fitur yang sudah tersedia. Reward langsung dikirim ke wallet sesuai role karakter.</p></div><button className="quest-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
  {loading?<div className="workspace-card quest-empty">Memuat quest dan progress...</div>:error?<div className="workspace-card quest-empty quest-error">{error}</div>:board?<>
   <div className="quest-wallet-strip"><div><span>Wallet {scope==="driver"?"Driver":"Team Owner"}</span><strong>{money(board.wallet_balance)}</strong></div><span className="quest-wallet-icon"><Wallet size={21}/></span></div>
   <section className="quest-section"><div className="quest-section-heading"><div><span className="section-eyebrow">RESET HARIAN</span><h2>Daily Quest</h2><p>{new Date(board.date+"T00:00:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p></div><span className="quest-count">{board.daily.length} quest</span></div>
    {board.daily.length?<div className="quest-grid">{board.daily.map(q=><QuestCard key={q.id} quest={q} scope={scope} onClaim={claim} claiming={claimingId===q.id}/>)}</div>:<div className="workspace-card quest-empty">Belum ada Daily Quest yang memenuhi kondisi aktivitas hari ini.</div>}
   </section>
   <section className="quest-section"><div className="quest-section-heading"><div><span className="section-eyebrow">RESET PERIODE</span><h2>Period Quest</h2>{board.period&&<p><CalendarDays size={14}/>{board.period.title} · {board.period.starts_on} – {board.period.ends_on}</p>}</div><span className="quest-count">{board.period_quests.length} quest</span></div>
    {!board.period?<div className="workspace-card quest-empty">Belum ada periode season yang aktif. Period Quest akan mengikuti kalender 12 periode CALERIS.</div>
     :board.period_quests.length?<div className="quest-grid">{board.period_quests.map(q=><QuestCard key={q.id} quest={q} scope={scope} onClaim={claim} claiming={claimingId===q.id}/>)}</div>
     :<div className="workspace-card quest-empty">Belum ada Period Quest yang memenuhi kondisi pada periode ini.</div>}
   </section>
   <p className="quest-footnote">Progress dihitung dari aktivitas database. Reward yang memenuhi syarat langsung masuk ke Driver Wallet atau Team Owner Wallet sesuai role karakter. Jika saldo VreeoBank belum mencukupi, pembayaran akan berstatus pending dan diproses ulang otomatis.</p>
  </>:null}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
