import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarDays,CheckCircle2,Flag,Plus,RefreshCw,ShieldCheck,Trophy,Trash2} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Season={id:string;season_key:string;title:string;starts_on:string;ends_on:string;status:"draft"|"active"|"completed"};
type Division={id:string;season_id:string;division_key:string;division_name:string;status:string};
type Period={id:string;season_id:string;period_type:string;period_number:number|null;starts_on:string;ends_on:string};
type Round={id:string;season_division_id:string};
type Circuit={id:string;name:string;country_code:string};
type Config={config_key:string;payload:Record<string,number|string>;is_active:boolean};
type Notice={kind:"success"|"error";text:string};
type RaceSchedule={premio:string[];zwei:string[]};

const todayJakarta=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const moneyless=(value:number)=>Number(value||0).toLocaleString("id-ID");
const defaultSchedule=():RaceSchedule[]=>Array.from({length:5},()=>({premio:["","",""],zwei:["","",""]}));
const periodSequence=["Pre Season","Race Period 1","Break Balancing 1","Race Period 2","Break Balancing 2","Race Period 3","Break Balancing 3","Race Period 4","Break Balancing 4","Race Period 5","End Season","Off Season"];
const addDays=(date:string,days:number)=>{const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};

export default function AdminLicenseEngine({session:_session}:{session:Session}){
 const [seasons,setSeasons]=useState<Season[]>([]);
 const [divisions,setDivisions]=useState<Division[]>([]);
 const [periods,setPeriods]=useState<Period[]>([]);
 const [rounds,setRounds]=useState<Round[]>([]);
 const [circuits,setCircuits]=useState<Circuit[]>([]);
 const [configs,setConfigs]=useState<Config[]>([]);
 const [schedule,setSchedule]=useState<RaceSchedule[]>(defaultSchedule);
 const [startDate,setStartDate]=useState(todayJakarta());
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState<Notice|null>(null);

 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const [s,d,p,r,cfg,ct]=await Promise.all([
   supabase.from("license_seasons").select("id,season_key,title,starts_on,ends_on,status").order("created_at",{ascending:false}),
   supabase.from("license_season_divisions").select("id,season_id,division_key,division_name,status"),
   supabase.from("season_calendar_periods").select("id,season_id,period_type,period_number,starts_on,ends_on").order("sort_order"),
   supabase.from("license_rounds").select("id,season_division_id"),
   supabase.from("caleris_configurations").select("config_key,payload,is_active").eq("category","license").eq("is_active",true),
   supabase.from("caleris_circuits").select("id,name,country_code").order("name")
  ]);
  const error=s.error||d.error||p.error||r.error||cfg.error||ct.error;
  if(error)setNotice({kind:"error",text:error.message});
  setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);
  setPeriods((p.data||[]) as Period[]);setRounds((r.data||[]) as Round[]);
  setConfigs((cfg.data||[]) as Config[]);setCircuits((ct.data||[]) as Circuit[]);
  const active=(s.data||[]).find(x=>x.status==="active");
  if(active){
   const off=(p.data||[]).find(x=>x.season_id===active.id&&x.period_type==="off_season");
   if(off)setStartDate(new Date(new Date(off.ends_on+"T00:00:00Z").getTime()+86400000).toISOString().slice(0,10));
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);

 const totals=useMemo(()=>schedule.reduce((acc,p)=>({premio:acc.premio+p.premio.length,zwei:acc.zwei+p.zwei.length}),{premio:0,zwei:0}),[schedule]);
 const scheduleReady=circuits.length>0&&schedule.every(p=>p.premio.length>=3&&p.premio.length<=5&&p.zwei.length>=3&&p.zwei.length<=5&&p.premio.every(Boolean)&&p.zwei.every(Boolean));
 const periodRows=useMemo(()=>{let offset=0;return periodSequence.map((name,index)=>{const race=name.startsWith("Race Period");const raceIndex=Math.floor(index/2);const days=race?Math.max(schedule[raceIndex].premio.length,schedule[raceIndex].zwei.length):index===0?7:name==="End Season"?5:name==="Off Season"?7:2;const start=addDays(startDate,offset);const end=addDays(start,days-1);offset+=days;return {name,index,race,raceIndex,days,start,end}})},[startDate,schedule]);
 const duplicates=useMemo(()=>{
  const p=schedule.flatMap(x=>x.premio),z=schedule.flatMap(x=>x.zwei);
  return p.some((id,i)=>id&&p.indexOf(id)!==i)||z.some((id,i)=>id&&z.indexOf(id)!==i);
 },[schedule]);
 const updateCircuit=(period:number,division:"premio"|"zwei",slot:number,value:string)=>{
  setSchedule(prev=>prev.map((item,i)=>i===period?{...item,[division]:item[division].map((id,j)=>j===slot?value:id)}:item));
 };
 const addCircuitSlot=(period:number,division:"premio"|"zwei")=>{
  setSchedule(prev=>prev.map((item,i)=>i===period&&item[division].length<5?{...item,[division]:[...item[division],""]}:item));
 };
 const removeCircuitSlot=(period:number,division:"premio"|"zwei",slot:number)=>{
  setSchedule(prev=>prev.map((item,i)=>i===period?{...item,[division]:item[division].filter((_,j)=>j!==slot)}:item));
 };
 const usedInDivision=(division:"premio"|"zwei",currentPeriod:number,currentSlot:number)=>{
  return new Set(schedule[currentPeriod][division].filter((id,j)=>Boolean(id)&&j!==currentSlot));
 };
 const createSeason=async()=>{
  if(!supabase||!startDate||!scheduleReady||duplicates||totals.premio>25||totals.zwei>25)return;
  setBusy(true);setNotice(null);
  const payload=schedule.map((p,i)=>({period_number:i+1,premio_circuits:p.premio,zwei_circuits:p.zwei}));
  const {data,error}=await supabase.rpc("fia_create_caleris_season",{p_start_date:startDate,p_schedule:payload});
  setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:String(data?.title||"Season CALERIS MASTERS berhasil dibuat")+". "+data?.premio_rounds+" race Premio, "+data?.zwei_rounds+" race Zwei, dan 12 periode sudah terjadwal."});
  setSchedule(defaultSchedule());await load();
 };
 const config=(key:string)=>configs.find(x=>x.config_key===key)?.payload||{};
 const checkin=Number(config("scoring-daily-checkin").points||2);
 const inactivity=config("scoring-inactivity");
 const zweiWdc=config("scoring-wdc-zwei");const premioWdc=config("scoring-wdc-premio");
 const milestones=configs.filter(x=>x.config_key.startsWith("scoring-milestone-")).map(x=>({threshold:Number(x.payload.minimum_standings_points||0),points:Number(x.payload.license_points||0)})).filter(x=>x.threshold>0&&x.points>0).sort((a,b)=>a.threshold-b.threshold);

 return <section className="workspace license-engine">
  <Link className="back-link" to="/dashboard">← Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MASTERS · FIA AUTOMATION</span><h1 className="page-title">Season & License Engine</h1><p className="page-description">Atur tanggal dan sirkuit kompetisi. Engine akan membentuk kalender, race round, standings, dan scoring lisensi secara otomatis.</p></header>

  <section className="license-setup-event">
   <div className="license-setup-event-main"><span className="section-eyebrow">OFFICIAL EVENT</span><h2>CALERIS MASTERS</h2><p>Motorsport Roleplay Championship</p></div>
   <div className="license-setup-division-grid">
    <article><span>TIER 1</span><strong>CALERIS PREMIO</strong><small>Premio · Division 1</small></article>
    <article><span>TIER 2</span><strong>CALERIS ZWEI</strong><small>Zwei · Division 2</small></article>
   </div>
  </section>

  <section className="workspace-card license-setup-create">
   <div className="section-title-row"><div><span className="section-eyebrow">SEASON SETUP</span><h2>Buat season & jadwal</h2></div><CalendarDays size={20}/></div>
   <p className="license-muted">Tabel berisi 12 periode tetap. Pilih 3–5 sirkuit untuk setiap Race Period di masing-masing divisi. Maksimal 25 race per divisi.</p>
   <label className="license-setup-date">Mulai Pre Season<input type="date" value={startDate} min={todayJakarta()} onChange={e=>setStartDate(e.target.value)}/></label>
   <div className="license-schedule-summary">
    <span>Premio <strong>{totals.premio}/25</strong> race</span><span>Zwei <strong>{totals.zwei}/25</strong> race</span><span><strong>12</strong> periode</span>
   </div>
   <div className="license-schedule-table-wrap">
    <table className="license-schedule-table">
     <thead><tr><th>Periode</th><th>Jadwal</th><th>Caleris Premio</th><th>Caleris Zwei</th></tr></thead>
     <tbody>
      {periodRows.map(({name,index,race:isRace,raceIndex,days,start,end})=>{
       return <tr key={name}>
        <td><strong>{name}</strong><small>{isRace?"3–5 race per divisi":index===0?"7 hari":name==="End Season"?"5 hari":name==="Off Season"?"7 hari":"2 hari"}</small></td>
        <td><span>{start} – {end}<small className="license-schedule-days">{days} hari</small></span></td>
        {isRace?(["premio","zwei"] as const).map(division=><td key={division}>
         <div className="license-circuit-select-list">
          {schedule[raceIndex][division].map((selected,slot)=>{
           const used=usedInDivision(division,raceIndex,slot);
           return <div className="license-circuit-select-row" key={slot}>
            <select value={selected} onChange={e=>updateCircuit(raceIndex,division,slot,e.target.value)}>
             <option value="">Pilih sirkuit {slot+1}</option>
             {circuits.map(c=><option key={c.id} value={c.id} disabled={used.has(c.id)}>{c.name} · {c.country_code}</option>)}
            </select>
            {schedule[raceIndex][division].length>3&&<button type="button" title="Hapus race" onClick={()=>removeCircuitSlot(raceIndex,division,slot)}><Trash2 size={13}/></button>}
           </div>
          })}
          {schedule[raceIndex][division].length<5&&<button className="license-add-race" type="button" onClick={()=>addCircuitSlot(raceIndex,division)}><Plus size={13}/> Tambah race</button>}
         </div>
        </td>):<td colSpan={2}><span className="license-muted">{name==="Pre Season"?"Registrasi roster & kontrak":name==="End Season"?"Final standings, WDC & payroll":"Masa balancing dan persiapan periode berikutnya"}</span></td>}
       </tr>
      })}
     </tbody>
    </table>
   </div>
   {circuits.length===0&&<div className="license-notice error">Belum ada sirkuit di Circuit Pool. Tambahkan sirkuit terlebih dahulu.</div>}
   {(totals.premio>25||totals.zwei>25)&&<div className="license-notice error">Maksimal 25 race per divisi.</div>}
   {duplicates&&<div className="license-notice error">Sirkuit yang sama boleh digunakan kembali pada Race Period berbeda, tetapi tidak boleh dua kali dalam satu Race Period.</div>}
   <button className="action primary license-setup-submit" type="button" disabled={busy||loading||!startDate||!scheduleReady||duplicates||totals.premio>25||totals.zwei>25} onClick={()=>void createSeason()}>{busy?"Membentuk jadwal & season...":"Buat Caleris Masters Season"}</button>
   {notice&&<div className={"license-notice "+notice.kind}>{notice.kind==="success"?<CheckCircle2 size={16}/>:<ShieldCheck size={16}/>} {notice.text}</div>}
  </section>

  <section className="license-setup-automation">
   <div className="section-title-row"><div><span className="section-eyebrow">CONNECTED ENGINES</span><h2>Semua berjalan otomatis</h2></div><ShieldCheck size={20}/></div>
   <div className="license-setup-flow">
    <article><Flag size={18}/><strong>Season & Division</strong><small>Premio dan Zwei dibuat otomatis</small></article>
    <article><CalendarDays size={18}/><strong>12-Period Calendar</strong><small>3–5 race per periode, maksimal 25 per divisi</small></article>
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
    <article><small>WDC ZWEI · TIER 2</small><strong>+{moneyless(Number(zweiWdc.points||0))}</strong><span>bonus permanen, sekali seumur hidup</span></article>
    <article><small>WDC PREMIO · TIER 1</small><strong>+{moneyless(Number(premioWdc.points||0))}</strong><span>menggantikan nilai Zwei, bukan ditumpuk</span></article>
   </div>
   <p className="license-muted">Poin musiman di-reset saat season baru. WDC diberikan sekali seumur hidup: Zwei +25, lalu Premio +35 menggantikan nilai Zwei (tidak ditumpuk). Perubahan nilai tier memperbarui ledger WDC yang sudah ada. Tidak ada input standings atau final WDC manual.</p>
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
