import {useCallback,useEffect,useState} from "react";
import {CalendarDays,CheckCircle2,Flag,RefreshCw,ShieldCheck,Trophy} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Season={id:string;season_key:string;title:string;starts_on:string;ends_on:string;status:"draft"|"active"|"completed"};
type Division={id:string;season_id:string;division_key:string;division_name:string;status:string};
type Period={id:string;season_id:string;period_type:string;period_number:number|null;starts_on:string;ends_on:string};
type Round={id:string;season_division_id:string};
type Config={config_key:string;payload:Record<string,number|string>;is_active:boolean};
type Notice={kind:"success"|"error";text:string};

const todayJakarta=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const moneyless=(value:number)=>Number(value||0).toLocaleString("id-ID");

export default function AdminLicenseEngine({session:_session}:{session:Session}){
 const [seasons,setSeasons]=useState<Season[]>([]);
 const [divisions,setDivisions]=useState<Division[]>([]);
 const [periods,setPeriods]=useState<Period[]>([]);
 const [rounds,setRounds]=useState<Round[]>([]);
 const [configs,setConfigs]=useState<Config[]>([]);
 const [startDate,setStartDate]=useState(todayJakarta());
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState<Notice|null>(null);

 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const [s,d,p,r,c]=await Promise.all([
   supabase.from("license_seasons").select("id,season_key,title,starts_on,ends_on,status").order("created_at",{ascending:false}),
   supabase.from("license_season_divisions").select("id,season_id,division_key,division_name,status"),
   supabase.from("season_calendar_periods").select("id,season_id,period_type,period_number,starts_on,ends_on").order("sort_order"),
   supabase.from("license_rounds").select("id,season_division_id"),
   supabase.from("caleris_configurations").select("config_key,payload,is_active").eq("category","license").eq("is_active",true)
  ]);
  const error=s.error||d.error||p.error||r.error||c.error;
  if(error)setNotice({kind:"error",text:error.message});
  setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);
  setPeriods((p.data||[]) as Period[]);setRounds((r.data||[]) as Round[]);setConfigs((c.data||[]) as Config[]);
  const active=(s.data||[]).find(x=>x.status==="active");
  if(active){
   const off=(p.data||[]).find(x=>x.season_id===active.id&&x.period_type==="off_season");
   if(off)setStartDate(new Date(new Date(off.ends_on+"T00:00:00Z").getTime()+86400000).toISOString().slice(0,10));
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);

 const createSeason=async()=>{
  if(!supabase||!startDate)return;
  setBusy(true);setNotice(null);
  const {data,error}=await supabase.rpc("fia_create_caleris_season",{p_start_date:startDate});
  setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:String(data?.title||"Season CALERIS MASTERS berhasil dibuat")+". Dua divisi, 30 race round, dan kalender 12 periode sudah dibuat otomatis."});
  await load();
 };
 const config=(key:string)=>configs.find(x=>x.config_key===key)?.payload||{};
 const checkin=Number(config("scoring-daily-checkin").points||2);
 const inactivity=config("scoring-inactivity");
 const milestones=configs.filter(x=>x.config_key.startsWith("scoring-milestone-")).map(x=>({threshold:Number(x.payload.minimum_standings_points||0),points:Number(x.payload.license_points||0)})).filter(x=>x.threshold>0&&x.points>0).sort((a,b)=>a.threshold-b.threshold);

 return <section className="workspace license-engine">
  <Link className="back-link" to="/dashboard">← Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MASTERS · FIA AUTOMATION</span><h1 className="page-title">Season & License Engine</h1><p className="page-description">Cukup jadwalkan season. Divisi, kalender, race round, standings, dan scoring lisensi saling terhubung otomatis.</p></header>

  <section className="license-setup-event">
   <div className="license-setup-event-main"><span className="section-eyebrow">OFFICIAL EVENT</span><h2>CALERIS MASTERS</h2><p>Motorsport Roleplay Championship</p></div>
   <div className="license-setup-division-grid">
    <article><span> TIER 1 </span><strong>CALERIS PREMIO</strong><small>Premio · Division 1</small></article>
    <article><span> TIER 2 </span><strong>CALERIS ZWEI</strong><small>Zwei · Division 2</small></article>
   </div>
  </section>

  <section className="workspace-card license-setup-create">
   <div className="section-title-row"><div><span className="section-eyebrow">SEASON SETUP</span><h2>Buat season baru</h2></div><CalendarDays size={20}/></div>
   <p className="license-muted">Nama event dan dua divisi sudah tetap. Sistem otomatis membuat 12 periode, lima Race Period, empat Break Balancing, 15 race per divisi, End Season, dan Off Season.</p>
   <label className="license-setup-date">Mulai Pre Season<input type="date" value={startDate} min={todayJakarta()} onChange={e=>setStartDate(e.target.value)}/></label>
   <button className="action primary license-setup-submit" type="button" disabled={busy||loading||!startDate} onClick={()=>void createSeason()}>{busy?"Membentuk season...":"Buat Caleris Masters Season"}</button>
   {notice&&<div className={"license-notice "+notice.kind}>{notice.kind==="success"?<CheckCircle2 size={16}/>:<ShieldCheck size={16}/>} {notice.text}</div>}
  </section>

  <section className="license-setup-automation">
   <div className="section-title-row"><div><span className="section-eyebrow">CONNECTED ENGINES</span><h2>Semua berjalan otomatis</h2></div><ShieldCheck size={20}/></div>
   <div className="license-setup-flow">
    <article><Flag size={18}/><strong>Season & Division</strong><small>Premio dan Zwei dibuat otomatis</small></article>
    <article><CalendarDays size={18}/><strong>12-Period Calendar</strong><small>Jadwal 42 hari dan 30 race round</small></article>
    <article><Trophy size={18}/><strong>Race & Standings</strong><small>Hasil resmi mengisi poin klasemen kumulatif</small></article>
    <article><ShieldCheck size={18}/><strong>License Scoring</strong><small>Check-in, milestone, inactivity, dan WDC</small></article>
   </div>
  </section>

  <section className="workspace-card license-setup-scoring">
   <div className="section-title-row"><div><span className="section-eyebrow">ACTIVE SCORING RULES</span><h2>Scoring lisensi</h2></div><Trophy size={20}/></div>
   <div className="license-setup-score-grid">
    <article><small>RACE CHECK-IN</small><strong>+{checkin}</strong><span>poin lisensi per race</span></article>
    <article><small>INACTIVITY</small><strong>-{moneyless(Number(inactivity.penalty_points||10))}</strong><span>setiap {moneyless(Number(inactivity.absence_races||5))} race berturut-turut tanpa check-in</span></article>
    {milestones.map(x=><article key={x.threshold}><small>STANDINGS {moneyless(x.threshold)}</small><strong>+{moneyless(x.points)}</strong><span>poin lisensi otomatis</span></article>)}
   </div>
   <p className="license-muted">Poin musiman di-reset saat season baru. WDC diberikan sekali seumur hidup; pencapaian tier yang lebih tinggi memperbarui bonus permanen. Tidak ada input standings atau final WDC manual.</p>
  </section>

  <section className="workspace-card license-setup-history">
   <div className="section-title-row"><div><span className="section-eyebrow">SEASON HISTORY</span><h2>Riwayat season</h2></div><button className="license-small-button" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
   {loading?<p className="license-muted">Memuat season...</p>:seasons.length===0?<p className="license-muted">Belum ada season CALERIS MASTERS.</p>:seasons.map(s=>{
    const ds=divisions.filter(d=>d.season_id===s.id),ps=periods.filter(p=>p.season_id===s.id),rs=rounds.filter(r=>ds.some(d=>d.id===r.season_division_id));
    return <article className="license-setup-season-row" key={s.id}><div><strong>{s.title}</strong><small>{s.starts_on} – {s.ends_on} · {ds.length} divisi · {rs.length} race round · {ps.length}/12 periode</small></div><span className={"license-setup-status "+s.status}>{s.status==="active"?"ACTIVE":s.status==="draft"?"SCHEDULED":"COMPLETED"}</span></article>
   })}
  </section>
 </section>;
}
