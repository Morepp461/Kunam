import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarDays,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";
import "./season-calendar.css";

type Season={id:string;title:string;status:string;starts_on:string;ends_on:string};
type Division={id:string;season_id:string;division_name:string};
type Round={id:string;season_division_id:string;round_number:number;title:string;status:string};
type Period={id:string;season_id:string;period_type:string;period_number:number|null;title:string;starts_on:string;ends_on:string;sort_order:number};
type Mapping={id:string;period_id:string;season_division_id:string;round_id:string};
const labels:Record<string,string>={off_season:"Off Season",pre_season:"Pre Season",race_period:"Race Period",race_break:"Break Balancing",end_season:"End Season"};
const sequence=["pre_season","race_period","race_break","race_period","race_break","race_period","race_break","race_period","race_break","race_period","end_season","off_season"];
const addDays=(value:string,days:number)=>{const d=new Date(value+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};

export default function AdminSeasonCalendar(){
 const [seasons,setSeasons]=useState<Season[]>([]),[divisions,setDivisions]=useState<Division[]>([]);
 const [rounds,setRounds]=useState<Round[]>([]),[periods,setPeriods]=useState<Period[]>([]),[mappings,setMappings]=useState<Mapping[]>([]);
 const [seasonId,setSeasonId]=useState(""),[rescheduleStart,setRescheduleStart]=useState("");
 const [showReschedule,setShowReschedule]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const [s,d,r]=await Promise.all([
   supabase.from("license_seasons").select("id,title,status,starts_on,ends_on").order("created_at",{ascending:false}),
   supabase.from("license_season_divisions").select("id,season_id,division_name").order("created_at"),
   supabase.from("license_rounds").select("id,season_division_id,round_number,title,status").order("round_number")
  ]);
  const error=s.error||d.error||r.error;if(error)setNotice({kind:"error",text:error.message});
  setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);setRounds((r.data||[]) as Round[]);
  const next=seasonId||s.data?.find(x=>x.status==="active")?.id||s.data?.find(x=>x.status==="draft")?.id||s.data?.[0]?.id||"";
  if(!seasonId&&next)setSeasonId(next);
  if(next){
   const [p,m]=await Promise.all([
    supabase.from("season_calendar_periods").select("id,season_id,period_type,period_number,title,starts_on,ends_on,sort_order").eq("season_id",next).order("sort_order"),
    supabase.from("season_period_rounds").select("id,period_id,season_division_id,round_id")
   ]);
   if(p.error||m.error)setNotice({kind:"error",text:p.error?.message||m.error?.message||"Gagal memuat kalender."});
   setPeriods((p.data||[]) as Period[]);setMappings((m.data||[]) as Mapping[]);
   setRescheduleStart(s.data?.find(x=>x.id===next)?.starts_on||"");
  }else{setPeriods([]);setMappings([]);setRescheduleStart("")}
  setLoading(false);
 },[seasonId]);
 useEffect(()=>{void load()},[load]);
 const activeSeason=seasons.find(s=>s.id===seasonId);
 const seasonDivisions=useMemo(()=>divisions.filter(d=>d.season_id===seasonId),[divisions,seasonId]);
 const seasonRounds=useMemo(()=>rounds.filter(r=>seasonDivisions.some(d=>d.id===r.season_division_id)),[rounds,seasonDivisions]);
 const hasCalendar=periods.length>0;
 const validCalendar=periods.length===12&&periods.every((p,i)=>p.period_type===sequence[i]);
 const countRounds=(periodId:string,divisionId:string)=>mappings.filter(m=>m.period_id===periodId&&m.season_division_id===divisionId).length;
 const saveReschedule=async()=>{
  if(!supabase||!seasonId||!rescheduleStart)return;
  setBusy(true);setNotice(null);
  const {error}=await supabase.rpc("fia_reschedule_season_calendar",{p_season_id:seasonId,p_start_date:rescheduleStart});
  setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"Seluruh tanggal 12 periode berhasil dihitung ulang otomatis."});
  setShowReschedule(false);await load();
 };
 return <section className="workspace season-calendar">
  <header className="season-calendar-heading"><div><span className="section-eyebrow">CALERIS MASTERS · SEASON OPERATIONS</span><h1>Season Calendar</h1><p>Kalender 12 periode dibuat otomatis saat season baru dibuat. Tidak perlu memilih round atau menyusun periode satu per satu.</p></div><span><ShieldCheck size={16}/> AUTOMATED</span></header>
  {notice&&<div className={"season-calendar-notice "+notice.kind}>{notice.text}</div>}
  <section className="season-calendar-card">
   <label>Season<select value={seasonId} onChange={e=>{setSeasonId(e.target.value);setPeriods([]);setMappings([]);setShowReschedule(false)}}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   {activeSeason&&<p className="season-calendar-muted">Season window: {activeSeason.starts_on} sampai {activeSeason.ends_on} · Status: {activeSeason.status}</p>}
   {!loading&&!hasCalendar&&<div className="season-calendar-notice error">Season ini belum memiliki kalender otomatis. Season legacy tidak diubah; gunakan setup season baru untuk membuat kalender lengkap.</div>}
   {loading?<p className="season-calendar-muted">Memuat kalender...</p>:hasCalendar&&<div className="season-calendar-periods">{periods.map(p=><article key={p.id} className="season-calendar-period">
    <div className="season-calendar-period-main"><span>{labels[p.period_type]}{p.period_number?" "+p.period_number:""}</span><strong>{p.title}</strong><small>{p.starts_on} → {p.ends_on} · {Math.round((new Date(p.ends_on+"T00:00:00Z").getTime()-new Date(p.starts_on+"T00:00:00Z").getTime())/86400000)+1} hari</small>
     {p.period_type==="race_period"&&seasonDivisions.map(d=><small key={d.id}>{d.division_name}: {countRounds(p.id,d.id)} race terhubung</small>)}
    </div>
   </article>)}</div>}
   {hasCalendar&&!validCalendar&&<div className="season-calendar-notice error">Struktur kalender legacy tidak sesuai urutan 12 periode CALERIS. Data historis tidak ditimpa otomatis.</div>}
   {validCalendar&&activeSeason?.status==="draft"&&<div className="season-calendar-reschedule">
    {!showReschedule?<button className="season-calendar-reschedule-button" onClick={()=>{setRescheduleStart(activeSeason.starts_on);setShowReschedule(true)}}><RefreshCw size={14}/> Reschedule seluruh kalender</button>:<>
     <label>Tanggal mulai Pre Season<input type="date" value={rescheduleStart} onChange={e=>setRescheduleStart(e.target.value)}/></label>
     <button disabled={busy||!rescheduleStart} onClick={()=>void saveReschedule()}>{busy?"Menghitung...":"Hitung ulang tanggal"}</button>
     <button className="quiet" disabled={busy} onClick={()=>setShowReschedule(false)}>Batal</button>
    </>}
   </div>}
  </section>
  <section className="season-calendar-card">
   <div className="season-calendar-subhead"><div><span className="section-eyebrow">AUTOMATED STRUCTURE</span><h2>Struktur kompetisi</h2></div><CalendarDays size={20}/></div>
   <div className="season-calendar-structure"><article><strong>12</strong><span>Periode season</span></article><article><strong>5</strong><span>Race Period</span></article><article><strong>4</strong><span>Break Balancing</span></article><article><strong>30</strong><span>Total race round · 2 divisi</span></article></div>
   <p className="season-calendar-muted">Setiap Race Period otomatis berisi tiga race per divisi. Pre Season 7 hari, Break Balancing 2 hari, End Season 5 hari, dan Off Season 7 hari. Total kalender 42 hari.</p>
   <p className="season-calendar-muted">Roster, kontrak, klasifikasi race, standings, milestone lisensi, inactivity, WDC, payroll, dan proses akhir season tetap memakai engine masing-masing yang terhubung pada ID season yang sama.</p>
  </section>
  <div className="license-engine-footer"><button className="license-small-button" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={14}/> Refresh data</button><span>{seasonDivisions.length} divisi · {seasonRounds.length} race round · {periods.length}/12 periode</span></div>
 </section>;
}
