import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,CalendarDays,Plus,RefreshCw,ShieldCheck} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import "./season-calendar.css";
type Season={id:string;title:string;status:string;starts_on:string;ends_on:string};
type Division={id:string;season_id:string;division_name:string};
type Round={id:string;season_division_id:string;round_number:number;title:string;status:string};
type Period={id:string;season_id:string;period_type:string;period_number:number|null;title:string;starts_on:string;ends_on:string;sort_order:number};
type Mapping={id:string;period_id:string;season_division_id:string;round_id:string};
const types=[{id:"off_season",label:"Off Season",single:true},{id:"pre_season",label:"Pre Season",single:true},{id:"race_period",label:"Race Period",single:false},{id:"race_break",label:"Break Race Period",single:false},{id:"end_season",label:"End Season",single:true}];
const typeName=(v:string)=>types.find(x=>x.id===v)?.label||v;
export default function AdminSeasonCalendar(){
 const [seasons,setSeasons]=useState<Season[]>([]),[divisions,setDivisions]=useState<Division[]>([]),[rounds,setRounds]=useState<Round[]>([]),[periods,setPeriods]=useState<Period[]>([]),[mappings,setMappings]=useState<Mapping[]>([]);
 const [seasonId,setSeasonId]=useState(""),[periodType,setPeriodType]=useState("race_period"),[title,setTitle]=useState(""),[startsOn,setStartsOn]=useState(""),[endsOn,setEndsOn]=useState("");
 const [selectedRounds,setSelectedRounds]=useState<Record<string,string[]>>({});
 const [rescheduleId,setRescheduleId]=useState(""),[rescheduleStart,setRescheduleStart]=useState(""),[rescheduleEnd,setRescheduleEnd]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}setLoading(true);
  const [s,d,r]=await Promise.all([supabase.from("license_seasons").select("id,title,status,starts_on,ends_on").order("created_at",{ascending:false}),supabase.from("license_season_divisions").select("id,season_id,division_name").order("created_at"),supabase.from("license_rounds").select("id,season_division_id,round_number,title,status").order("round_number")]);
  const err=s.error||d.error||r.error;if(err)setNotice({kind:"error",text:err.message});
  setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);setRounds((r.data||[]) as Round[]);
  const next=seasonId||s.data?.find(x=>x.status==="active")?.id||s.data?.[0]?.id||"";
  if(!seasonId&&next)setSeasonId(next);
  if(next){const [p,m]=await Promise.all([supabase.from("season_calendar_periods").select("*").eq("season_id",next).order("sort_order"),supabase.from("season_period_rounds").select("*")]);if(p.error||m.error)setNotice({kind:"error",text:p.error?.message||m.error?.message||"Gagal memuat kalender."});setPeriods((p.data||[]) as Period[]);setMappings((m.data||[]) as Mapping[])}else{setPeriods([]);setMappings([])}
  setLoading(false);
 },[seasonId]);
 useEffect(()=>{void load()},[load]);
 const seasonDivisions=useMemo(()=>divisions.filter(x=>x.season_id===seasonId),[divisions,seasonId]);
 const seasonRounds=useMemo(()=>rounds.filter(r=>seasonDivisions.some(d=>d.id===r.season_division_id)&&r.status!=="closed"),[rounds,seasonDivisions]);
 const availableTypes=types.filter(t=>!t.single||!periods.some(p=>p.period_type===t.id));
 const changeType=(v:string)=>{setPeriodType(v);setTitle(v==="race_period"?"Race Period "+(periods.filter(p=>p.period_type==="race_period").length+1):v==="race_break"?"Break Race Period "+(periods.filter(p=>p.period_type==="race_break").length+1):typeName(v));setSelectedRounds({})};
 const toggleRound=(d:string,r:string)=>setSelectedRounds(cur=>{const a=cur[d]||[];return {...cur,[d]:a.includes(r)?a.filter(x=>x!==r):[...a,r]}});
 const createPeriod=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase||!seasonId)return;if(!startsOn||!endsOn||endsOn<startsOn){setNotice({kind:"error",text:"Tanggal periode tidak valid."});return}
  if(types.find(t=>t.id===periodType)?.single&&periods.some(p=>p.period_type===periodType)){setNotice({kind:"error",text:"Jenis periode ini hanya boleh dibuat satu kali per season."});return}
  const assignments=seasonDivisions.map(d=>({division:d,roundIds:selectedRounds[d.id]||[]}));
  if(periodType==="race_period"&&(!seasonDivisions.length||assignments.some(x=>x.roundIds.length<3||x.roundIds.length>5))){setNotice({kind:"error",text:"Setiap divisi harus memilih 3 sampai 5 round untuk Race Period ini."});return}
  setBusy(true);setNotice(null);const number=periodType==="race_period"||periodType==="race_break"?periods.filter(p=>p.period_type===periodType).reduce((m,p)=>Math.max(m,p.period_number||0),0)+1:null;const order=periods.reduce((m,p)=>Math.max(m,p.sort_order),0)+1;
  const assignmentsPayload=assignments.map(x=>({season_division_id:x.division.id,round_ids:x.roundIds}));
  const result=await supabase.rpc("fia_create_season_calendar_period",{p_season_id:seasonId,p_period_type:periodType,p_period_number:number,p_title:title.trim()||typeName(periodType),p_starts_on:startsOn,p_ends_on:endsOn,p_sort_order:order,p_assignments:assignmentsPayload});
  if(result.error){setBusy(false);setNotice({kind:"error",text:result.error.message});return}
  setBusy(false);setTitle("");setStartsOn("");setEndsOn("");setSelectedRounds({});setNotice({kind:"success",text:"Periode season berhasil dibuat."});await load();
 };
 const beginReschedule=(p:Period)=>{setRescheduleId(p.id);setRescheduleStart(p.starts_on);setRescheduleEnd(p.ends_on)};
 const saveReschedule=async(p:Period)=>{if(!supabase||!rescheduleStart||!rescheduleEnd||rescheduleEnd<rescheduleStart){setNotice({kind:"error",text:"Rentang tanggal reschedule tidak valid."});return}setBusy(true);const auth=await supabase.auth.getUser();const {error}=await supabase.from("season_calendar_periods").update({starts_on:rescheduleStart,ends_on:rescheduleEnd,updated_by:auth.data.user?.id}).eq("id",p.id);setBusy(false);if(error)setNotice({kind:"error",text:error.message});else{setNotice({kind:"success",text:"Jadwal berhasil di-reschedule. Riwayat perubahan tersimpan."});setRescheduleId("");await load()}};
 const activeSeason=seasons.find(s=>s.id===seasonId);
 const summary=(p:Period)=>mappings.filter(m=>m.period_id===p.id).length;
 return <section className="workspace season-calendar"><Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="season-calendar-heading"><div><span className="section-eyebrow">FIA PANEL · SEASON OPERATIONS</span><h1>Season Calendar</h1><p>Susun seluruh cakupan periode season dan jadwal Race Period.</p></div><span><ShieldCheck size={16}/> FIA / ADMIN</span></header>
  {notice&&<div className={"season-calendar-notice "+notice.kind}>{notice.text}</div>}
  <section className="season-calendar-card"><label>Season<select value={seasonId} onChange={e=>{setSeasonId(e.target.value);setPeriods([]);setMappings([])}}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   {activeSeason&&<p className="season-calendar-muted">Season window: {activeSeason.starts_on} sampai {activeSeason.ends_on}</p>}
   <div className="season-calendar-periods">{loading?<p>Memuat kalender...</p>:periods.length===0?<p>Belum ada periode untuk season ini.</p>:periods.map(p=><article key={p.id} className="season-calendar-period"><div className="season-calendar-period-main"><span>{typeName(p.period_type)}{p.period_number?" "+p.period_number:""}</span><strong>{p.title}</strong><small>{p.starts_on} → {p.ends_on}{p.period_type==="race_period"?" · "+summary(p)+" round terhubung":""}</small></div>
    {rescheduleId===p.id?<div className="season-calendar-reschedule"><label>Mulai<input type="date" value={rescheduleStart} onChange={e=>setRescheduleStart(e.target.value)}/></label><label>Selesai<input type="date" value={rescheduleEnd} min={rescheduleStart} onChange={e=>setRescheduleEnd(e.target.value)}/></label><button disabled={busy} onClick={()=>void saveReschedule(p)}>Simpan</button><button className="quiet" onClick={()=>setRescheduleId("")}>Batal</button></div>:<button className="season-calendar-reschedule-button" onClick={()=>beginReschedule(p)}><RefreshCw size={14}/> Reschedule</button>}</article>)}</div>
  </section>
  {seasonId&&<section className="season-calendar-card"><div className="season-calendar-subhead"><div><span className="section-eyebrow">FULL SEASON TIMELINE</span><h2>Tambah periode</h2></div><CalendarDays size={20}/></div>
   <form onSubmit={createPeriod} className="season-calendar-form"><label>Jenis periode<select value={periodType} onChange={e=>changeType(e.target.value)}>{availableTypes.map(t=><option key={t.id} value={t.id}>{t.label}{t.single?" · satu kali":" · dapat berulang"}</option>)}</select></label>
    <label>Nama periode<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={100}/></label><div className="season-calendar-date-row"><label>Tanggal mulai<input type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)} required/></label><label>Tanggal selesai<input type="date" value={endsOn} min={startsOn||undefined} onChange={e=>setEndsOn(e.target.value)} required/></label></div>
    {periodType==="race_period"&&<div className="season-calendar-rounds"><strong>Round dalam Race Period</strong><p>Pilih 3–5 round untuk setiap divisi. Round yang sudah masuk periode lain tidak dapat dipilih.</p>{seasonDivisions.map(d=>{const selected=selectedRounds[d.id]||[];return <div className="season-calendar-division" key={d.id}><strong>{d.division_name} <small>{selected.length}/5 dipilih</small></strong><div>{seasonRounds.filter(r=>r.season_division_id===d.id&&!mappings.some(m=>m.round_id===r.id)).map(r=><label key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id)&&selected.length>=5} onChange={()=>toggleRound(d.id,r.id)}/><span>R{r.round_number} · {r.title}</span></label>)}</div></div>})}</div>}
    <button className="season-calendar-submit" disabled={busy||!seasonId||availableTypes.length===0}><Plus size={16}/>{busy?"Menyimpan...":"Simpan periode"}</button>
   </form>
  </section>}
 </section>
}