import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Flag,Timer} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type RaceRow={id:string;round_number:number;title:string;circuit_name:string|null;race_starts_at:string;race_duration_minutes:number;division_name:string;division_key:string};
const formatRemaining=(ms:number)=>{
 const total=Math.max(0,Math.floor(ms/1000)),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
 return days>0?`${days}h ${hours}j ${minutes}m`:`${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;
};
export default function RaceScheduleDashboard({session,memberId,isAdmin}:{session:Session;memberId:string|null;isAdmin:boolean}){
 const [races,setRaces]=useState<RaceRow[]>([]),[now,setNow]=useState(Date.now()),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id)},[]);
 useEffect(()=>{let live=true;async function load(){
  if(!supabase||!memberId){setRaces([]);setMessage("Jadwal akan tampil setelah karakter terdaftar pada divisi season aktif.");setLoading(false);return}
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
  let divisionsQ=supabase.from("license_season_divisions").select("id,division_key,division_name").eq("season_id",season.id);
  if(!isAdmin&&divisionKeys.length)divisionsQ=divisionsQ.in("division_key",divisionKeys);
  const {data:divisions,error:divisionError}=await divisionsQ;
  if(divisionError){setMessage(divisionError.message);setRaces([]);setLoading(false);return}
  const ids=(divisions||[]).map((d:any)=>d.id);
  if(!ids.length){setRaces([]);setMessage("Divisi karakter belum terhubung ke season aktif.");setLoading(false);return}
  const {data:rounds,error}=await supabase.from("license_rounds").select("id,round_number,title,circuit_name,race_starts_at,race_duration_minutes,season_division_id,status").in("season_division_id",ids).neq("status","cancelled").order("race_starts_at");
  if(!live)return;
  if(error){setMessage(error.message);setRaces([]);setLoading(false);return}
  const mapped=(rounds||[]).map((r:any)=>({...r,division_name:(divisions||[]).find((d:any)=>d.id===r.season_division_id)?.division_name||"",division_key:(divisions||[]).find((d:any)=>d.id===r.season_division_id)?.division_key||""})) as RaceRow[];
  setRaces(mapped);setLoading(false);
 }
 void load();return()=>{live=false};
 },[memberId,session.user.id,isAdmin]);
 const next=races.find(r=>new Date(r.race_starts_at).getTime()>=now);
 const upcoming=useMemo(()=>races.filter(r=>new Date(r.race_starts_at).getTime()>=now).slice(0,6),[races,now]);
 const raceTime=(v:string)=>new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v));
 return <section className="dashboard-race-schedule">
  <div className="dashboard-race-head"><div><span className="section-eyebrow">LIVE SEASON CALENDAR · GMT+7</span><h2>Race Schedule</h2></div><CalendarDays size={20}/></div>
  {loading?<p className="dashboard-race-muted">Memuat jadwal divisi...</p>:next?<div className="dashboard-race-next"><div><span>NEXT RACE · {next.division_name.toUpperCase()}</span><strong>{next.title} · {next.circuit_name||"Circuit TBA"}</strong><small>{raceTime(next.race_starts_at)} · Durasi {next.race_duration_minutes} menit</small></div><div className="dashboard-race-count"><small><Timer size={13}/> COUNTDOWN</small><strong>{formatRemaining(new Date(next.race_starts_at).getTime()-now)}</strong></div></div>:<p className="dashboard-race-muted">{message||"Tidak ada race mendatang pada jadwal divisi ini."}</p>}
  {upcoming.length>0&&<div className="dashboard-race-list">{upcoming.map(r=><article key={r.id}><span><Flag size={13}/> {r.division_name} · R{r.round_number}</span><strong>{r.circuit_name||r.title}</strong><small>{raceTime(r.race_starts_at)}</small></article>)}</div>}
 </section>;
}
