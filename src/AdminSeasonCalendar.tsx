import {useCallback,useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowLeft,CalendarDays,RefreshCw,ShieldCheck} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import "./season-calendar.css";

type Season={id:string;title:string;status:string;starts_on:string;ends_on:string};
type Division={id:string;season_id:string;division_name:string};
type Round={id:string;season_division_id:string;round_number:number;title:string;status:string};
type Period={id:string;season_id:string;period_type:string;period_number:number|null;title:string;starts_on:string;ends_on:string;sort_order:number};
type Mapping={id:string;period_id:string;season_division_id:string;round_id:string};
type Draft={key:string;period_type:string;title:string;rounds:Record<string,string[]>};
type ScheduledDraft=Draft&{starts_on:string;ends_on:string;duration:number};

const labels:Record<string,string>={off_season:"Off Season",pre_season:"Pre Season",race_period:"Race Periode",race_break:"Break Balancing Periode",end_season:"End Season"};
const PERIOD_SEQUENCE:Array<[string,number]>=[["pre_season",1],["race_period",1],["race_break",1],["race_period",2],["race_break",2],["race_period",3],["race_break",3],["race_period",4],["race_break",4],["race_period",5],["end_season",1],["off_season",1]];
const makeDraft=(type:string,n:number):Draft=>({key:type+"-"+n+"-"+Math.random().toString(36).slice(2,7),period_type:type,title:labels[type]+(type==="race_period"||type==="race_break"?" "+n:""),rounds:{}});
const addDays=(date:string,days:number)=>{if(!date)return "";const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const durationFor=(draft:Draft,divisions:Division[])=>{
 if(draft.period_type==="pre_season")return 7;
 if(draft.period_type==="race_break")return 2;
 if(draft.period_type==="end_season")return 5;
 if(draft.period_type==="off_season")return 7;
 if(draft.period_type==="race_period")return Math.max(0,...divisions.map(div=>(draft.rounds[div.id]||[]).length));
 return 0;
};
const buildSchedule=(drafts:Draft[],startDate:string,divisions:Division[]):ScheduledDraft[]=>{
 let cursor=startDate;
 return drafts.map(d=>{
  const duration=durationFor(d,divisions);
  const starts_on=cursor&&duration>0?cursor:"";
  const ends_on=starts_on?addDays(starts_on,duration-1):"";
  if(ends_on)cursor=addDays(ends_on,1);
  return {...d,starts_on,ends_on,duration};
 });
};

export default function AdminSeasonCalendar(){
 const [seasons,setSeasons]=useState<Season[]>([]),[divisions,setDivisions]=useState<Division[]>([]),[rounds,setRounds]=useState<Round[]>([]),[periods,setPeriods]=useState<Period[]>([]),[mappings,setMappings]=useState<Mapping[]>([]);
 const [seasonId,setSeasonId]=useState(""),[drafts,setDrafts]=useState<Draft[]>([]),[startDate,setStartDate]=useState("");
 const [showReschedule,setShowReschedule]=useState(false),[rescheduleStart,setRescheduleStart]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const [s,d,r]=await Promise.all([
   supabase.from("license_seasons").select("id,title,status,starts_on,ends_on").order("created_at",{ascending:false}),
   supabase.from("license_season_divisions").select("id,season_id,division_name").order("created_at"),
   supabase.from("license_rounds").select("id,season_division_id,round_number,title,status").order("round_number")
  ]);
  const err=s.error||d.error||r.error;
  if(err)setNotice({kind:"error",text:err.message});
  setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);setRounds((r.data||[]) as Round[]);
  const next=seasonId||s.data?.find(x=>x.status==="active")?.id||s.data?.find(x=>x.status==="draft")?.id||s.data?.[0]?.id||"";
  if(!seasonId&&next)setSeasonId(next);
  if(next){
   const [p,m]=await Promise.all([
    supabase.from("season_calendar_periods").select("*").eq("season_id",next).order("sort_order"),
    supabase.from("season_period_rounds").select("*")
   ]);
   if(p.error||m.error)setNotice({kind:"error",text:p.error?.message||m.error?.message||"Gagal memuat kalender."});
   setPeriods((p.data||[]) as Period[]);setMappings((m.data||[]) as Mapping[]);
   const selected=s.data?.find(x=>x.id===next);
   setStartDate(selected?.starts_on||"");
  }else{setPeriods([]);setMappings([]);setStartDate("")}
  setLoading(false);
 },[seasonId]);
 useEffect(()=>{void load()},[load]);

 const seasonDivisions=useMemo(()=>divisions.filter(x=>x.season_id===seasonId),[divisions,seasonId]);
 const seasonRounds=useMemo(()=>rounds.filter(r=>seasonDivisions.some(d=>d.id===r.season_division_id)),[rounds,seasonDivisions]);
 const activeSeason=seasons.find(s=>s.id===seasonId);
 const hasCalendar=periods.length>0;
 const isCompleteCalendar=periods.length===12&&periods.every((p,i)=>p.period_type===PERIOD_SEQUENCE[i]?.[0]);
 const scheduledDrafts=useMemo(()=>buildSchedule(drafts,startDate,seasonDivisions),[drafts,startDate,seasonDivisions]);

 const updateDraft=(key:string,patch:Partial<Draft>)=>setDrafts(cur=>cur.map(d=>d.key===key?{...d,...patch}:d));
 const toggleRound=(draft:Draft,divisionId:string,roundId:string)=>{
  const current=draft.rounds[divisionId]||[];
  const next=current.includes(roundId)?current.filter(x=>x!==roundId):[...current,roundId];
  updateDraft(draft.key,{rounds:{...draft.rounds,[divisionId]:next}});
 };
 const createDrafts=()=>setDrafts(PERIOD_SEQUENCE.map(([type,n])=>makeDraft(type,n)));
 useEffect(()=>{if(seasonId&&!hasCalendar&&drafts.length===0&&seasonDivisions.length)createDrafts()},[seasonId,hasCalendar,seasonDivisions.length,drafts.length]);

 const availableFor=(draft:Draft,divisionId:string)=>seasonRounds.filter(r=>
  r.season_division_id===divisionId
  &&!mappings.some(m=>m.round_id===r.id)
  &&!drafts.some(other=>other.key!==draft.key&&other.period_type==="race_period"&&(other.rounds[divisionId]||[]).includes(r.id))
 );
 const roundDays=(periodId:string)=>Math.max(0,...seasonDivisions.map(div=>mappings.filter(m=>m.period_id===periodId&&m.season_division_id===div.id).length));
 const totalRoundMappings=(periodId:string)=>mappings.filter(m=>m.period_id===periodId).length;
 const periodDuration=(p:Period)=>p.period_type==="pre_season"?7:p.period_type==="race_break"?2:p.period_type==="end_season"?5:p.period_type==="off_season"?7:roundDays(p.id);

 const saveCalendar=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!seasonId)return;
  if(activeSeason?.status!=="draft"&&activeSeason?.status!=="active"){setNotice({kind:"error",text:"Kalender hanya dapat dibuat untuk season draft atau active."});return}
  if(!startDate){setNotice({kind:"error",text:"Tanggal mulai Pre Season wajib diisi."});return}
  if(drafts.length!==PERIOD_SEQUENCE.length||drafts.some((d,index)=>d.period_type!==PERIOD_SEQUENCE[index][0])){setNotice({kind:"error",text:"Kalender wajib mengikuti urutan tetap 12 periode CALERIS."});return}
  const races=scheduledDrafts.filter(d=>d.period_type==="race_period");
  for(const d of races){
   if(seasonDivisions.some(div=>(d.rounds[div.id]||[]).length<3||(d.rounds[div.id]||[]).length>5)){
    setNotice({kind:"error",text:"Setiap Race Period wajib berisi 3–5 round untuk setiap divisi."});return;
   }
  }
  if(scheduledDrafts.some(d=>!d.starts_on||!d.ends_on||d.duration<1)){
   setNotice({kind:"error",text:"Pilih round untuk seluruh Race Period agar durasi dan tanggal kalender dapat dihitung otomatis."});return;
  }
  const allSelected=races.flatMap(d=>Object.values(d.rounds).flat());
  if(new Set(allSelected).size!==allSelected.length){setNotice({kind:"error",text:"Satu round tidak boleh dimasukkan ke lebih dari satu Race Period."});return}
  const unassigned=seasonRounds.filter(r=>!allSelected.includes(r.id));
  if(unassigned.length){setNotice({kind:"error",text:unassigned.length+" round belum dimasukkan ke Race Period."});return}
  setBusy(true);setNotice(null);
  const payload=scheduledDrafts.map((d,index)=>({
   order_index:index+1,period_type:d.period_type,title:d.title,
   starts_on:d.starts_on,ends_on:d.ends_on,
   assignments:d.period_type==="race_period"?seasonDivisions.map(div=>({season_division_id:div.id,round_ids:d.rounds[div.id]||[]})):[]
  }));
  const {data,error}=await supabase.rpc("fia_create_season_calendar",{p_season_id:seasonId,p_periods:payload});
  setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"12 periode berhasil dibentuk. Durasi setiap periode dihitung dari jadwal race dan aturan hari real-life."});
  setDrafts([]);await load();
 };

 const saveReschedule=async()=>{
  if(!supabase||!seasonId||!rescheduleStart)return;
  setBusy(true);setNotice(null);
  const {error}=await supabase.rpc("fia_reschedule_season_calendar",{p_season_id:seasonId,p_start_date:rescheduleStart});
  setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"Seluruh kalender berhasil dijadwalkan ulang dengan durasi otomatis."});
  setShowReschedule(false);await load();
 };

 return <section className="workspace season-calendar">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="season-calendar-heading">
   <div><span className="section-eyebrow">FIA PANEL · SEASON OPERATIONS</span><h1>Season Calendar</h1><p>12 periode berulang setiap season. Durasi dihitung otomatis berdasarkan race dan kalender real-life.</p></div>
   <span><ShieldCheck size={16}/> FIA OPERATIONS</span>
  </header>
  {notice&&<div className={"season-calendar-notice "+notice.kind}>{notice.text}</div>}
  <section className="season-calendar-card">
   <label>Season<select value={seasonId} onChange={e=>{setSeasonId(e.target.value);setPeriods([]);setMappings([]);setDrafts([]);setShowReschedule(false)}}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   {activeSeason&&<p className="season-calendar-muted">Season window: {activeSeason.starts_on} sampai {activeSeason.ends_on} · Status: {activeSeason.status}</p>}
   <div className="season-calendar-periods">
    {loading?<p>Memuat kalender...</p>:periods.length===0?<p>Belum ada kalender untuk season ini.</p>:periods.map(p=><article key={p.id} className="season-calendar-period">
     <div className="season-calendar-period-main"><span>{labels[p.period_type]}{p.period_number?" "+p.period_number:""}</span><strong>{p.title}</strong><small>{p.starts_on} → {p.ends_on} · {periodDuration(p)} hari{p.period_type==="race_period"?" · "+totalRoundMappings(p.id)+" race terhubung":""}</small></div>
    </article>)}
   </div>
   {hasCalendar&&!isCompleteCalendar&&<div className="season-calendar-notice error">Kalender season ini hanya memiliki {periods.length} dari 12 periode. Data historis tidak ditimpa otomatis. Buat season baru untuk menggunakan siklus kalender 12 periode.</div>}
   {isCompleteCalendar&&activeSeason?.status==="draft"&&<div className="season-calendar-reschedule">
    {!showReschedule?<button className="season-calendar-reschedule-button" onClick={()=>{setRescheduleStart(activeSeason.starts_on);setShowReschedule(true)}}><RefreshCw size={14}/> Reschedule seluruh kalender</button>:<>
     <label>Tanggal mulai Pre Season<input type="date" value={rescheduleStart} onChange={e=>setRescheduleStart(e.target.value)}/></label>
     <button disabled={busy||!rescheduleStart} onClick={()=>void saveReschedule()}>{busy?"Menyimpan...":"Hitung ulang seluruh tanggal"}</button>
     <button className="quiet" disabled={busy} onClick={()=>setShowReschedule(false)}>Batal</button>
    </>}
   </div>}
  </section>

  {seasonId&&!hasCalendar&&<section className="season-calendar-card">
   <div className="season-calendar-subhead"><div><span className="section-eyebrow">FULL SEASON SCHEDULER</span><h2>Pembentukan jadwal season</h2></div><CalendarDays size={20}/></div>
   {!seasonDivisions.length?<p className="season-calendar-muted">Buat divisi dan round terlebih dahulu di License Scoring Engine.</p>:<form className="season-calendar-form" onSubmit={saveCalendar}>
    <label>Tanggal mulai Pre Season<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></label>
    <p className="season-calendar-muted">Durasi tetap: Pre Season 7 hari, Break Balancing 2 hari, End Season 5 hari, Off Season 7 hari. Race Period dihitung dari jumlah round per divisi, satu round satu hari. Race antar divisi pada nomor round yang sama berjalan pada hari yang sama.</p>
    {scheduledDrafts.map((d,index)=><article className="season-calendar-draft" key={d.key}>
     <div className="season-calendar-draft-heading"><strong>{labels[d.period_type]}{d.period_type==="race_period"||d.period_type==="race_break"?" "+(scheduledDrafts.filter((x,i)=>x.period_type===d.period_type&&i<=index).length):""}</strong><small>{d.duration>0?d.duration+" hari":"Menunggu pemilihan round"}{d.starts_on?" · "+d.starts_on+" → "+d.ends_on:""}</small></div>
     <label>Nama periode<input value={d.title} onChange={e=>updateDraft(d.key,{title:e.target.value})} required maxLength={100}/></label>
     {d.period_type==="race_period"&&<div className="season-calendar-rounds">
      <strong>Round dalam Race Period ini</strong><p>Pilih 3–5 round untuk setiap divisi. Round dengan nomor yang sama pada divisi berbeda berlangsung pada hari yang sama. Seluruh round season wajib terpetakan tepat satu kali.</p>
      {seasonDivisions.map(div=>{const selected=d.rounds[div.id]||[];return <div className="season-calendar-division" key={div.id}>
       <strong>{div.division_name}<small>{selected.length}/5 dipilih</small></strong>
       <div>{availableFor(d,div.id).map(r=><label key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id)&&selected.length>=5} onChange={()=>toggleRound(d,div.id,r.id)}/><span>R{r.round_number} · {r.title}</span></label>)}</div>
      </div>})}
     </div>}
    </article>)}
    <button className="season-calendar-submit" disabled={busy||!startDate}>{busy?"Menyimpan kalender...":"Bentuk jadwal full season"}</button>
   </form>}
  </section>}
 </section>;
}
