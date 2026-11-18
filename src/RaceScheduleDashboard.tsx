import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Flag,Timer} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type RaceRow={id:string;round_number:number;title:string;circuit_name:string|null;race_starts_at:string;race_duration_minutes:number;division_name:string;division_key:string;status:string};
type RaceState="upcoming"|"in_progress"|"awaiting_result"|"result_confirmed"|"completed";
const formatRemaining=(ms:number)=>{
 const total=Math.max(0,Math.floor(ms/1000)),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
 return days>0?`${days}h ${hours}j ${minutes}m`:`${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;
};
const getRaceState=(race:RaceRow,now:number):RaceState=>{
 const start=new Date(race.race_starts_at).getTime(),end=start+race.race_duration_minutes*60000,confirmed=race.status==="closed";
 if(confirmed&&now>=end)return "completed";
 if(confirmed)return "result_confirmed";
 if(now<start)return "upcoming";
 if(now<end)return "in_progress";
 return "awaiting_result";
};
const stateLabels:Record<RaceState,string>={upcoming:"UPCOMING",in_progress:"IN PROGRESS",awaiting_result:"AWAITING RESULT",result_confirmed:"RESULT CONFIRMED",completed:"COMPLETED"};
export default function RaceScheduleDashboard({session,memberId,isAdmin}:{session:Session;memberId:string|null;isAdmin:boolean}){
 const [races,setRaces]=useState<RaceRow[]>([]),[now,setNow]=useState(Date.now()),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id)},[]);
 useEffect(()=>{let live=true;async function load(){
  if(!supabase||!memberId){setRaces([]);setMessage("Jadwal Premio ditampilkan sebagai divisi default.");setLoading(false);return}
  setLoading(true);setMessage("");
  const [{data:member},{data:season}] = await Promise.all([
   supabase.from("members").select("id,role,team_id").eq("id",memberId).maybeSingle(),
   supabase.from("license_seasons").select("id").eq("status","active").order("starts_on",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(!live)return;
  if(!season){setRaces([]);setMessage("Belum ada season aktif.");setLoading(false);return}
  let divisionKeys:string[]=[];
  if(member?.team_id){
   const {data:team}=await supabase.from("teams").select("division_key").eq("id",member.team_id).maybeSingle();
   if(team?.division_key)divisionKeys=[String(team.division_key).toLowerCase()];
  }
  if(!isAdmin&&!divisionKeys.length)divisionKeys=["premio"];
  let divisionsQ=supabase.from("license_season_divisions").select("id,division_key,division_name").eq("season_id",season.id);
  if(!isAdmin)divisionsQ=divisionsQ.in("division_key",divisionKeys);
  const {data:divisions,error:divisionError}=await divisionsQ;
  if(divisionError){setMessage(divisionError.message);setRaces([]);setLoading(false);return}
  const ids=(divisions||[]).map((d:any)=>d.id);
  if(!ids.length){setRaces([]);setMessage("Divisi belum tersedia pada season aktif.");setLoading(false);return}
  const {data:rounds,error}=await supabase.from("license_rounds").select("id,round_number,title,circuit_name,race_starts_at,race_duration_minutes,season_division_id,status").in("season_division_id",ids).neq("status","cancelled").order("race_starts_at");
  if(!live)return;
  if(error){setMessage(error.message);setRaces([]);setLoading(false);return}
  const mapped=(rounds||[]).map((r:any)=>({...r,division_name:(divisions||[]).find((d:any)=>d.id===r.season_division_id)?.division_name||"",division_key:(divisions||[]).find((d:any)=>d.id===r.season_division_id)?.division_key||""})) as RaceRow[];
  setRaces(mapped);setLoading(false);
 }
 void load();return()=>{live=false};
 },[memberId,session.user.id,isAdmin]);
 const upcoming=useMemo(()=>races.filter(r=>getRaceState(r,now)==="upcoming").slice(0,6),[races,now]);
 const active=races.find(r=>getRaceState(r,now)==="in_progress");
 const awaiting=races.find(r=>getRaceState(r,now)==="awaiting_result");
 const confirmed=races.find(r=>getRaceState(r,now)==="result_confirmed");
 const next=races.find(r=>getRaceState(r,now)==="upcoming");
 const primary=active||awaiting||confirmed||next;
 const primaryState=primary?getRaceState(primary,now):null;
 const start=primary?new Date(primary.race_starts_at).getTime():0;
 const end=primary?start+primary.race_duration_minutes*60000:0;
 const countdown=(primaryState==="in_progress"||primaryState==="result_confirmed")?end-now:primaryState==="upcoming"?start-now:0;
 const raceTime=(v:string)=>new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v));
 return <section className="dashboard-race-schedule">
  <div className="dashboard-race-head"><div><span className="section-eyebrow">LIVE SEASON CALENDAR · GMT+7</span><h2>Race Schedule</h2></div><CalendarDays size={20}/></div>
  {loading?<p className="dashboard-race-muted">Memuat jadwal divisi...</p>:primary&&primaryState?<div className={`dashboard-race-next state-${primaryState}`}>
   <div><span>{stateLabels[primaryState]} · {primary.division_name.toUpperCase()}</span><strong>{primary.title} · {primary.circuit_name||"Circuit TBA"}</strong><small>{raceTime(primary.race_starts_at)} · Durasi {primary.race_duration_minutes} menit</small>
    {primaryState==="awaiting_result"&&<small>Durasi selesai. Menunggu konfirmasi hasil resmi FIA.</small>}
    {primaryState==="result_confirmed"&&<small>Hasil sudah sah. Countdown durasi tetap berjalan.</small>}
   </div>
   {(primaryState==="in_progress"||primaryState==="upcoming"||primaryState==="result_confirmed")&&<div className="dashboard-race-count"><small><Timer size={13}/> {primaryState==="in_progress"?"RACE ENDS IN":primaryState==="result_confirmed"?"SCHEDULED DURATION ENDS IN":"RACE STARTS IN"}</small><strong>{formatRemaining(countdown)}</strong></div>}
  </div>:<p className="dashboard-race-muted">{message||"Tidak ada race aktif atau mendatang pada jadwal divisi ini."}</p>}
  {upcoming.length>0&&<div className="dashboard-race-list">{upcoming.map(r=><article key={r.id}><span><Flag size={13}/> {r.division_name} · R{r.round_number}</span><strong>{r.circuit_name||r.title}</strong><small>{raceTime(r.race_starts_at)} · {r.race_duration_minutes} menit</small></article>)}</div>}
 </section>;
}
