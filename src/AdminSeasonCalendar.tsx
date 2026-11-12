import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,CalendarDays,Plus,RefreshCw,ShieldCheck,Trash2} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import "./season-calendar.css";
type Season={id:string;title:string;status:string;starts_on:string;ends_on:string};
type Division={id:string;season_id:string;division_name:string};
type Round={id:string;season_division_id:string;round_number:number;title:string;status:string};
type Period={id:string;season_id:string;period_type:string;period_number:number|null;title:string;starts_on:string;ends_on:string;sort_order:number};
type Mapping={id:string;period_id:string;season_division_id:string;round_id:string};
type Draft={key:string;period_type:string;title:string;starts_on:string;ends_on:string;rounds:Record<string,string[]>};
const labels:Record<string,string>={off_season:"Off Season",pre_season:"Pre Season",race_period:"Race Period",race_break:"Break Race Period",end_season:"End Season"};
const makeDraft=(type:string,n:number):Draft=>({key:type+"-"+n+"-"+Math.random().toString(36).slice(2,7),period_type:type,title:labels[type]+(type==="race_period"||type==="race_break"?" "+n:""),starts_on:"",ends_on:"",rounds:{}});
export default function AdminSeasonCalendar(){
 const [seasons,setSeasons]=useState<Season[]>([]),[divisions,setDivisions]=useState<Division[]>([]),[rounds,setRounds]=useState<Round[]>([]),[periods,setPeriods]=useState<Period[]>([]),[mappings,setMappings]=useState<Mapping[]>([]);
 const [seasonId,setSeasonId]=useState(""),[drafts,setDrafts]=useState<Draft[]>([]),[rescheduleId,setRescheduleId]=useState(""),[rescheduleStart,setRescheduleStart]=useState(""),[rescheduleEnd,setRescheduleEnd]="";
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const load=useCallback(async()=>{if(!supabase){setLoading(false);return}setLoading(true);
  const [s,d,r]=await Promise.all([supabase.from("license_seasons").select("id,title,status,starts_on,ends_on").order("created_at",{ascending:false}),supabase.from("license_season_divisions").select("id,season_id,division_name").order("created_at"),supabase.from("license_rounds").select("id,season_division_id,round_number,title,status").order("round_number")]);
  const err=s.error||d.error||r.error;if(err)setNotice({kind:"error",text:err.message});setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);setRounds((r.data||[]) as Round[]);
  const next=seasonId||s.data?.find(x=>x.status==="active")?.id||s.data?.[0]?.id||"";if(!seasonId&&next)setSeasonId(next);
  if(next){const [p,m]=await Promise.all([supabase.from("season_calendar_periods").select("*").eq("season_id",next).order("sort_order"),supabase.from("season_period_rounds").select("*")]);if(p.error||m.error)setNotice({kind:"error",text:p.error?.message||m.error?.message||"Gagal memuat kalender."});setPeriods((p.data||[]) as Period[]);setMappings((m.data||[]) as Mapping[])}else{setPeriods([]);setMappings([])}
  setLoading(false);
 },[seasonId]);
 useEffect(()=>{void load()},[load]);
 const seasonDivisions=useMemo(()=>divisions.filter(x=>x.season_id===seasonId),[divisions,seasonId]);
 const seasonRounds=useMemo(()=>rounds.filter(r=>seasonDivisions.some(d=>d.id===r.season_division_id)),[rounds,seasonDivisions]);
 const activeSeason=seasons.find(s=>s.id===seasonId);
 const hasCalendar=periods.length>0;
 const updateDraft=(key:string,patch:Partial<Draft>)=>setDrafts(cur=>cur.map(d=>d.key===key?{...d,...patch}:d));
 const toggleRound=(draft:Draft,divisionId:string,roundId:string)=>{const current=draft.rounds[divisionId]||[];const next=current.includes(roundId)?current.filter(x=>x!==roundId):[...current,roundId];updateDraft(draft.key,{rounds:{...draft.rounds,[divisionId]:next}})};
 const createDrafts=()=>{let n=1;const next=[makeDraft("off_season",1),makeDraft("pre_season",1),makeDraft("race_period",n),makeDraft("end_season",1)];setDrafts(next)};
 useEffect(()=>{if(seasonId&&!hasCalendar&&drafts.length===0&&seasonDivisions.length)createDrafts()},[seasonId,hasCalendar,seasonDivisions.length,drafts.length]);
 const addRace=()=>setDrafts(cur=>{const n=cur.filter(d=>d.period_type==="race_period").length+1;const endIndex=cur.findIndex(d=>d.period_type==="end_season");const copy=[...cur];copy.splice(endIndex<0?copy.length:endIndex,0,makeDraft("race_period",n));return copy});
 const addBreak=()=>setDrafts(cur=>{const n=cur.filter(d=>d.period_type==="race_break").length+1;const endIndex=cur.findIndex(d=>d.period_type==="end_season");const copy=[...cur];copy.splice(endIndex<0?copy.length:endIndex,0,makeDraft("race_break",n));return copy});
 const removeDraft=(key:string)=>setDrafts(cur=>cur.filter(d=>d.key!==key));
 const availableFor=(draft:Draft,divisionId:string)=>seasonRounds.filter(r=>r.season_division_id===divisionId&&!mappings.some(m=>m.round_id===r.id)&&!drafts.some(other=>other.key!==draft.key&&other.period_type==="race_period"&&(other.rounds[divisionId]||[]).includes(r.id)));
 const saveCalendar=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase||!seasonId)return;
  for(const type of ["off_season","pre_season","end_season"]){if(drafts.filter(d=>d.period_type===type).length!==1){setNotice({kind:"error",text:"Off Season, Pre Season, dan End Season masing-masing harus tepat satu."});return}}
  const races=drafts.filter(d=>d.period_type==="race_period");if(!races.length){setNotice({kind:"error",text:"Season harus memiliki minimal satu Race Period."});return}
  for(const d of drafts){if(!d.title.trim()||!d.starts_on||!d.ends_on||d.ends_on<d.starts_on){setNotice({kind:"error",text:"Lengkapi nama dan tanggal setiap periode."});return}if(d.period_type==="race_period"&&seasonDivisions.some(div=>(d.rounds[div.id]||[]).length<3||(d.rounds[div.id]||[]).length>5)){setNotice({kind:"error",text:"Setiap Race Period wajib berisi 3–5 round untuk setiap divisi."});return}}
  const allSelected=races.flatMap(d=>Object.values(d.rounds).flat());if(new Set(allSelected).size!==allSelected.length){setNotice({kind:"error",text:"Satu round tidak boleh dimasukkan ke lebih dari satu Race Period."});return}
  const unassigned=seasonRounds.filter(r=>!allSelected.includes(r.id));if(unassigned.length){setNotice({kind:"error",text:unassigned.length+" round belum dimasukkan ke Race Period."});return}
  setBusy(true);setNotice(null);
  const payload=drafts.map((d,index)=>({order_index:index+1,period_type:d.period_type,title:d.title,starts_on:d.starts_on,ends_on:d.ends_on,assignments:d.period_type==="race_period"?seasonDivisions.map(div=>({season_division_id:div.id,round_ids:d.rounds[div.id]||[]})):[]}));
  const {data,error}=await supabase.rpc("fia_create_season_calendar",{p_season_id:seasonId,p_periods:payload});setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"Kalender full season berhasil dibentuk. "+String((data as {periods_created?:number})?.periods_created||0)+" periode tersimpan."});setDrafts([]);await load();
 };
 const beginReschedule=(p:Period)=>{setRescheduleId(p.id);setRescheduleStart(p.starts_on);setRescheduleEnd(p.ends_on)};
 const saveReschedule=async(p:Period)=>{if(!supabase||!rescheduleStart||!rescheduleEnd||rescheduleEnd<rescheduleStart){setNotice({kind:"error",text:"Rentang tanggal reschedule tidak valid."});return}setBusy(true);const auth=await supabase.auth.getUser();const {error}=await supabase.from("season_calendar_periods").update({starts_on:rescheduleStart,ends_on:rescheduleEnd,updated_by:auth.data.user?.id}).eq("id",p.id);setBusy(false);if(error)setNotice({kind:"error",text:error.message});else{setNotice({kind:"success",text:"Jadwal berhasil di-reschedule. Riwayat perubahan tersimpan."});setRescheduleId("");await load()}};
 const roundCount=(p:Period)=>mappings.filter(m=>m.period_id===p.id).length;
 return <section className="workspace season-calendar"><Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="season-calendar-heading"><div><span className="section-eyebrow">FIA PANEL · SEASON OPERATIONS</span><h1>Season Calendar</h1><p>Bentuk jadwal satu season penuh, dari Off Season sampai End Season.</p></div><span><ShieldCheck size={16}/> FIA / ADMIN</span></header>
  {notice&&<div className={"season-calendar-notice "+notice.kind}>{notice.text}</div>}
  <section className="season-calendar-card"><label>Season<select value={seasonId} onChange={e=>{setSeasonId(e.target.value);setPeriods([]);setMappings([]);setDrafts([])}}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>{activeSeason&&<p className="season-calendar-muted">Season window: {activeSeason.starts_on} sampai {activeSeason.ends_on}</p>}
   <div className="season-calendar-periods">{loading?<p>Memuat kalender...</p>:periods.length===0?<p>Belum ada kalender untuk season ini.</p>:periods.map(p=><article key={p.id} className="season-calendar-period"><div className="season-calendar-period-main"><span>{labels[p.period_type]}{p.period_number?" "+p.period_number:""}</span><strong>{p.title}</strong><small>{p.starts_on} → {p.ends_on}{p.period_type==="race_period"?" · "+roundCount(p)+" round terhubung":""}</small></div>
    {rescheduleId===p.id?<div className="season-calendar-reschedule"><label>Mulai<input type="date" value={rescheduleStart} onChange={e=>setRescheduleStart(e.target.value)}/></label><label>Selesai<input type="date" value={rescheduleEnd} min={rescheduleStart} onChange={e=>setRescheduleEnd(e.target.value)}/></label><button disabled={busy} onClick={()=>void saveReschedule(p)}>Simpan</button><button className="quiet" onClick={()=>setRescheduleId("")}>Batal</button></div>:<button className="season-calendar-reschedule-button" onClick={()=>beginReschedule(p)}><RefreshCw size={14}/> Reschedule</button>}</article>)}</div>
  </section>
  {seasonId&&!hasCalendar&&<section className="season-calendar-card"><div className="season-calendar-subhead"><div><span className="section-eyebrow">FULL SEASON SCHEDULER</span><h2>Pembentukan jadwal season</h2></div><CalendarDays size={20}/></div>
   {!seasonDivisions.length?<p className="season-calendar-muted">Buat divisi dan round terlebih dahulu di License Scoring Engine.</p>:<form className="season-calendar-form" onSubmit={saveCalendar}>
    {drafts.map((d,index)=><article className="season-calendar-draft" key={d.key}><div className="season-calendar-draft-heading"><strong>{labels[d.period_type]}{d.period_type==="race_period"||d.period_type==="race_break"?" "+(drafts.filter((x,i)=>x.period_type===d.period_type&&i<=index).length):""}</strong>{(d.period_type==="race_period"||d.period_type==="race_break")&&<button type="button" className="season-calendar-remove" onClick={()=>removeDraft(d.key)}><Trash2 size={14}/> Hapus periode</button>}</div>
      <label>Nama periode<input value={d.title} onChange={e=>updateDraft(d.key,{title:e.target.value})} required maxLength={100}/></label><div className="season-calendar-date-row"><label>Tanggal mulai<input type="date" value={d.starts_on} onChange={e=>updateDraft(d.key,{starts_on:e.target.value})} required/></label><label>Tanggal selesai<input type="date" min={d.starts_on||undefined} value={d.ends_on} onChange={e=>updateDraft(d.key,{ends_on:e.target.value})} required/></label></div>
      {d.period_type==="race_period"&&<div className="season-calendar-rounds"><strong>Round dalam Race Period ini</strong><p>Pilih 3–5 round untuk setiap divisi. Seluruh round season wajib terpetakan tepat satu kali.</p>{seasonDivisions.map(div=>{const selected=d.rounds[div.id]||[];return <div className="season-calendar-division" key={div.id}><strong>{div.division_name}<small>{selected.length}/5 dipilih</small></strong><div>{availableFor(d,div.id).map(r=><label key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id)&&selected.length>=5} onChange={()=>toggleRound(d,div.id,r.id)}/><span>R{r.round_number} · {r.title}</span></label>)}{selected.map(id=>{const r=seasonRounds.find(x=>x.id===id);return r?<label key={id}><input type="checkbox" checked onChange={()=>toggleRound(d,div.id,id)}/><span>R{r.round_number} · {r.title}</span></label>:null})}</div></div>})}</div>}
    </article>)}
    <div className="season-calendar-add-row"><button type="button" onClick={addRace}><Plus size={15}/> Tambah Race Period</button><button type="button" onClick={addBreak}><Plus size={15}/> Tambah Break Race Period</button></div>
    <button className="season-calendar-submit" disabled={busy}>{busy?"Menyimpan kalender...":"Bentuk jadwal full season"}</button>
   </form>}
  </section>}
 </section>
}