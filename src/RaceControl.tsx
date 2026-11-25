import {lazy,Suspense,useCallback,useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {AlertTriangle,ArrowDown,ArrowUp,CheckCircle2,Flag,Plus,RefreshCw,Save,ShieldCheck,Timer,Trash2,Trophy} from "lucide-react";
import {supabase} from "./lib/supabase";
import {MemberProfileLink,TeamProfileLink} from "./EntityProfileLink";
import {broadcastNewsroomArticle} from "./lib/newsroomBroadcast";
const RaceOCR = lazy(() => import("./RaceOCR"));

type Round={id:string;round_number:number;title:string;season_division_id:string;status:string;session_type:"race"|"sprint";checkin_closes_at:string;circuit_name:string|null;circuit_country_code:string|null;season_division?:{division_name:string;license_seasons?:{title:string}}};
type Member={id:string;public_member_id:string;character_name:string|null;role:string|null;team_id:string|null;nationality:string|null};
type Team={id:string;name:string};type Circuit={id:string;name:string;country_code:string};type Registration={member_id:string;season_division_id:string};
type Tyre="soft"|"medium"|"hard"|"intermediate"|"wet";type FinishStatus="finished"|"dnf"|"dns"|"dsq";
type Entry={memberId:string;driverName:string;teamName:string;driverNumber:string;country:string;flag:string;gridPosition:string;status:FinishStatus;position:string;timeOrLaps:string;gap:string;fastestLap:string;stints:Tyre[]};
const TYRES:{value:Tyre;label:string}[]=[{value:"soft",label:"Soft"},{value:"medium",label:"Medium"},{value:"hard",label:"Hard"},{value:"intermediate",label:"Intermediate"},{value:"wet",label:"Wet"}];
const draft=(m:Member,team:string):Entry=>({memberId:m.id,driverName:m.character_name||"Driver",teamName:team,driverNumber:"",country:m.nationality||"",flag:"",gridPosition:"",status:"finished",position:"",timeOrLaps:"",gap:"",fastestLap:"",stints:[]});
const parseRaceTime=(raw:string):number|null=>{const v=raw.trim().replace(",",".");let m=v.match(/^(\d{1,3}):(\d{2}):(\d{2})\.(\d{3})$/);if(m)return +m[1]*3600000+ +m[2]*60000+ +m[3]*1000+ +m[4];m=v.match(/^(\d{1,3}):(\d{2})\.(\d{3})$/);return m?+m[1]*60000+ +m[2]*1000+ +m[3]:null};
const parseLap=(raw:string):number|null=>{const m=raw.trim().replace(",",".").match(/^(\d{1,3}):(\d{2})\.(\d{3})$/);return m?+m[1]*60000+ +m[2]*1000+ +m[3]:null};
const parseGap=(raw:string):number|null=>{const v=raw.trim().replace(/^\+/,"").replace(",","." );if(!v||/^(winner|—|--|-)$/i.test(v))return 0;if(/laps?/i.test(v))return null;const m=v.match(/^(\d{1,6})(?:\.(\d{1,3}))?$/);return m?Math.round(Number(v)*1000):null};
const parseLaps=(raw:string):number|null=>{const m=raw.trim().match(/^\+?(\d+)\s*laps?$/i);return m?+m[1]:null};
const flagFromCode=(code:string|null)=>code&&/^[A-Z]{2}$/.test(code)?String.fromCodePoint(...code.split("").map(c=>c.charCodeAt(0)+127397)):"🏁";

export default function RaceControl(){
 const [rounds,setRounds]=useState<Round[]>([]),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]),[registrations,setRegistrations]=useState<Registration[]>([]),[circuits,setCircuits]=useState<Circuit[]>([]);
 const [roundId,setRoundId]=useState(""),[circuitId,setCircuitId]=useState(""),[poleTime,setPoleTime]=useState(""),[dotdId,setDotdId]=useState(""),[entries,setEntries]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[draftSaving,setDraftSaving]=useState(false),[draftId,setDraftId]=useState<string|null>(null),[draftState,setDraftState]=useState<"unsaved"|"draft"|"confirmed">("unsaved"),[rawOcrText,setRawOcrText]=useState(""),[sourceImageName,setSourceImageName]=useState(""),[notice,setNotice]=useState<{kind:"error"|"success";text:string}|null>(null);
 const refresh=useCallback(async()=>{if(!supabase)return;setLoading(true);setNotice(null);
  const [r,m,t,reg,c]=await Promise.all([
   supabase.from("license_rounds").select("id,round_number,title,season_division_id,status,session_type,checkin_closes_at,circuit_name,circuit_country_code,license_season_divisions(division_name,license_seasons(title))").neq("status","closed").order("round_number"),
   supabase.from("caleris_member_directory").select("id,public_member_id,character_name,role,team_id,nationality").eq("role","Driver").order("character_name"),
   supabase.from("caleris_team_directory").select("id,name").order("name"),
   supabase.from("license_season_members").select("member_id,season_division_id").eq("is_hiatus",false),
   supabase.from("caleris_circuits").select("id,name,country_code").order("name")
  ]);
  const error=[r.error,m.error,t.error,reg.error,c.error].find(Boolean);if(error){setNotice({kind:"error",text:error.message});setLoading(false);return}
  const all=(r.data||[]) as unknown as Round[],now=Date.now();
  const eligible=all.filter(x=>new Date(x.checkin_closes_at).getTime()<=now&&!all.some(p=>p.season_division_id===x.season_division_id&&p.round_number<x.round_number));
  setRounds(eligible);setMembers((m.data||[]) as Member[]);setTeams((t.data||[]) as Team[]);setRegistrations((reg.data||[]) as Registration[]);setCircuits((c.data||[]) as Circuit[]);
  setRoundId(current=>{if(current&&!eligible.some(x=>x.id===current)){setEntries([]);return ""}return current});setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const round=rounds.find(x=>x.id===roundId);
 const participants=useMemo(()=>round?registrations.filter(x=>x.season_division_id===round.season_division_id).map(x=>members.find(m=>m.id===x.member_id)).filter((m):m is Member=>Boolean(m)).sort((a,b)=>(a.character_name||"").localeCompare(b.character_name||"")):[],[round,registrations,members]);
 const circuit=circuits.find(x=>x.id===circuitId);
 const persistDraft=async(rows:Entry[]=entries,rawText:string=rawOcrText,imageName:string=sourceImageName):Promise<string|null>=>{
  if(!supabase||!round)return null;
  setDraftSaving(true);
  const draftPayload={entries:rows,pole_time:poleTime,driver_of_the_day_member_id:dotdId,circuit_id:circuitId,source:imageName?"ocr":"manual"};
  const {data,error}=await supabase.rpc("fia_save_race_result_draft",{p_round_id:round.id,p_draft_payload:draftPayload,p_raw_ocr_text:rawText||null,p_source_image_name:imageName||null,p_draft_id:draftId});
  setDraftSaving(false);
  if(error){setNotice({kind:"error",text:"Draft gagal disimpan: "+error.message});return null}
  const savedId=String(data);
  setDraftId(savedId);setDraftState("draft");
  setNotice({kind:"success",text:imageName?"OCR berhasil membuat draft. Periksa dan revisi seluruh data sebelum konfirmasi.":"Draft hasil race tersimpan. Hasil belum masuk klasemen."});
  return savedId;
 };
 const handleOcrDraft=async(rows:Entry[],meta:{rawText:string;sourceImageName:string;confidence:number})=>{
  setEntries(rows);setRawOcrText(meta.rawText);setSourceImageName(meta.sourceImageName);
  await persistDraft(rows,meta.rawText,meta.sourceImageName);
 };
 useEffect(()=>{
  if(!round)return;
  const initial=participants.map(m=>draft(m,teams.find(t=>t.id===m.team_id)?.name||"Unassigned"));
  const found=circuits.find(c=>c.name.toLowerCase()===String(round.circuit_name||"").toLowerCase()&&c.country_code===round.circuit_country_code);
  setEntries(initial);setCircuitId(found?.id||"");setPoleTime("");setDotdId("");setDraftId(null);setDraftState("unsaved");setRawOcrText("");setSourceImageName("");
  let active=true;
  const restore=async()=>{
   if(!supabase)return;
   const {data,error}=await supabase.rpc("fia_get_race_result_draft",{p_round_id:round.id});
   if(!active||error||!data)return;
   const saved=data as {id?:string;draft_payload?:Record<string,unknown>;raw_ocr_text?:string|null;source_image_name?:string|null};
   const payload=saved.draft_payload||{};
   if(Array.isArray(payload.entries))setEntries(payload.entries as Entry[]);
   if(typeof payload.pole_time==="string")setPoleTime(payload.pole_time);
   if(typeof payload.driver_of_the_day_member_id==="string")setDotdId(payload.driver_of_the_day_member_id);
   if(typeof payload.circuit_id==="string"&&payload.circuit_id)setCircuitId(payload.circuit_id);
   setDraftId(saved.id||null);setDraftState("draft");setRawOcrText(saved.raw_ocr_text||"");setSourceImageName(saved.source_image_name||"");
   setNotice({kind:"success",text:"Draft tersimpan sebelumnya berhasil dipulihkan. Lanjutkan revisi sebelum konfirmasi."});
  };
  void restore();
  return()=>{active=false};
 },[round?.id,participants,teams,circuits]);
 const update=(id:string,patch:Partial<Entry>)=>setEntries(prev=>prev.map(x=>x.memberId===id?{...x,...patch}:x));
 const updateStint=(id:string,i:number,value:Tyre)=>setEntries(prev=>prev.map(x=>x.memberId===id?{...x,stints:x.stints.map((s,j)=>j===i?value:s)}:x));
 const moveEntry=(index:number,direction:-1|1)=>setEntries(prev=>{const target=index+direction;if(target<0||target>=prev.length)return prev;const next=[...prev];const [item]=next.splice(index,1);next.splice(target,0,item);return next});
 const pole=entries.find(x=>Number(x.gridPosition)===1),fastest=entries.filter(x=>x.fastestLap.trim()).sort((a,b)=>(parseLap(a.fastestLap)||Infinity)-(parseLap(b.fastestLap)||Infinity))[0];
 const update=(id:string,patch:Partial<Entry>)=>setEntries(prev=>prev.map(x=>x.memberId===id?{...x,...patch}:x));
 const updateStint=(id:string,i:number,value:Tyre)=>setEntries(prev=>prev.map(x=>x.memberId===id?{...x,stints:x.stints.map((s,j)=>j===i?value:s)}:x));
 const pole=entries.find(x=>Number(x.gridPosition)===1),fastest=entries.filter(x=>x.fastestLap.trim()).sort((a,b)=>(parseLap(a.fastestLap)||Infinity)-(parseLap(b.fastestLap)||Infinity))[0];
 const submit=async(e:FormEvent)=>{e.preventDefault();if(!supabase||!round||!circuit)return;const fail=(text:string)=>setNotice({kind:"error",text});
  if(!entries.length){fail("Tidak ada Driver aktif pada divisi round ini.");return}
  if(entries.some(x=>!/^[0-9]+$/.test(x.driverNumber)||+x.driverNumber<1)){fail("Nomor mobil setiap Driver wajib diisi.");return}
  if(entries.some(x=>!x.country.trim()||!x.flag.trim())){fail("Negara dan bendera setiap Driver wajib diisi.");return}
  if(entries.some(x=>!/^[0-9]+$/.test(x.gridPosition)||+x.gridPosition<1)||new Set(entries.map(x=>x.gridPosition)).size!==entries.length){fail("Grid position semua Driver wajib diisi dan tidak boleh duplikat.");return}
  const finished=entries.filter(x=>x.status==="finished"),positions=finished.map(x=>+x.position).sort((a,b)=>a-b);
  if(!finished.length||finished.some(x=>!/^[0-9]+$/.test(x.position)||+x.position<1)||positions.some((p,i)=>p!==i+1)){fail("Finishing position wajib berurutan mulai P1 tanpa celah atau duplikat.");return}
  if(entries.some(x=>x.status==="dnf"&&x.position.trim())){fail("Driver DNF/DNS/DSQ tidak boleh memiliki finishing position.");return}
  if(entries.some(x=>x.status==="finished"&&!parseRaceTime(x.timeOrLaps))){fail("Race time wajib memakai format h:mm:ss.mmm atau m:ss.mmm.");return}
  if(entries.some(x=>x.status==="dnf"&&parseLaps(x.timeOrLaps)===null)){fail("Data DNF wajib mencantumkan laps behind, contoh +11 Laps.");return}
  if(entries.some(x=>(x.status==="finished"&&(!x.gap.trim()||parseGap(x.gap)===null))||(x.status==="dnf"&&!x.gap.trim()))){fail("Gap wajib diisi untuk Finished dan DNF.");return}
  if(entries.some(x=>x.status!=="dns"&&!x.stints.length)){fail("Setiap Driver yang start wajib memiliki minimal satu stint ban.");return}
  if(entries.some(x=>x.fastestLap.trim()&&(x.status!=="finished"||!parseLap(x.fastestLap)))){fail("Fastest lap hanya boleh diisi untuk Driver Finished dan memakai format m:ss.mmm.");return}
  const fastestEntries=entries.filter(x=>x.fastestLap.trim());if(fastestEntries.length!==1){fail("Isi fastest lap untuk tepat satu Driver.");return}
  if(!pole){fail("Grid position 1 menentukan Pole Position.");return}
  const poleMs=parseLap(poleTime);if(!poleMs){fail("Pole time wajib memakai format m:ss.mmm.");return}
  if(!dotdId||!entries.some(x=>x.memberId===dotdId&&x.status==="finished")){fail("Driver of the Day harus dipilih dari Driver berstatus Finished.");return}
  if(new Set(entries.map(x=>x.driverNumber)).size!==entries.length){fail("Nomor mobil tidak boleh duplikat.");return}
  const payload=entries.map(x=>({member_id:x.memberId,grid_position:+x.gridPosition,finish_status:x.status,finishing_position:x.status==="finished"?+x.position:null,finish_time_ms:x.status==="finished"?parseRaceTime(x.timeOrLaps):null,fastest_lap_ms:x.fastestLap.trim()?parseLap(x.fastestLap):null,stints:x.stints,driver_number:+x.driverNumber,driver_country:x.country.trim(),driver_flag:x.flag.trim(),laps_behind:x.status==="dnf"?parseLaps(x.timeOrLaps):null,gap_ms:x.status==="finished"?parseGap(x.gap):null}));
  setSaving(true);setNotice(null);
  let activeDraftId=draftId;
  if(!activeDraftId)activeDraftId=await persistDraft(entries,rawOcrText,sourceImageName);
  if(!activeDraftId){setSaving(false);fail("Simpan draft terlebih dahulu sebelum mengesahkan hasil.");return}
  const finalDraftPayload={entries:payload,pole_time:poleTime,driver_of_the_day_member_id:dotdId,circuit_id:circuitId,source:sourceImageName?"ocr":"manual"};
  const {data,error}=await supabase.rpc("fia_confirm_race_result_draft",{p_draft_id:activeDraftId,p_round_id:round.id,p_draft_payload:finalDraftPayload,p_entries:payload,p_driver_of_day_member_id:dotdId,p_pole_time_ms:poleMs,p_circuit_name:circuit.name,p_circuit_country_code:circuit.country_code});
  setSaving(false);if(error){fail(error.message);return}
  const pending=[] as string[];
  if(data?.prizepool?.status==="pending_configuration")pending.push(`Prizepool pending: ${data.prizepool.detail||"konfigurasi belum lengkap"}`);
  if(data?.wealth_tax?.status==="pending_configuration")pending.push(`Wealth Tax pending: ${data.wealth_tax.detail||"konfigurasi belum lengkap"}`);
  if(Number(data?.round_processing?.payroll?.pending||0)>0)pending.push(`${data.round_processing.payroll.pending} payroll tertunda`);
   const podium=finished.sort((a,b)=>Number(a.position)-Number(b.position)).slice(0,3).map(x=>"P"+x.position+" · "+x.driverName+" ("+x.teamName+")").join("\n");
   const raceArticle=[round.title+" · "+circuit.name, "Official podium:\n"+podium, "Pole position: "+pole.driverName, "Fastest lap: "+fastest.driverName, "Driver of the Day: "+(entries.find(x=>x.memberId===dotdId)?.driverName||"Not recorded")].join("\n\n");
   const broadcast=await broadcastNewsroomArticle("Race Report · "+round.title+" at "+circuit.name,raceArticle,"official_race_result");
   setNotice({kind:"success",text:"Race resmi disahkan. "+entries.length+" Driver diproses. "+(pending.length?"Settlement: "+pending.join(", ")+". ":"Settlement yang tersedia berhasil diproses. ")+(broadcast.sent?"Laporan otomatis dikirim ke Discord via Vreeo Pedia.":"Laporan terbit, tetapi Discord belum terkirim: "+(broadcast.error?.message||"integrasi belum dikonfigurasi."))});
  setRoundId("");setCircuitId("");setEntries([]);setDotdId("");setPoleTime("");setDraftId(null);setDraftState("unsaved");setRawOcrText("");setSourceImageName("");await refresh();
 };
 const changeStatus=(x:Entry,status:FinishStatus)=>update(x.memberId,{status,position:"",timeOrLaps:"",gap:""});
 return <section className="workspace race-control" data-grid-field="grid_position" data-finish-time-field="finish_time_ms" data-fastest-lap-field="fastest_lap_ms" data-dotd-field="driver_of_day_member_id" data-stint-ui="race-stint-dots" data-official-submit="fia_submit_race_classification">
  <header className="page-heading"><span className="section-eyebrow">FIA PANEL · OFFICIAL RACE CONTROL</span><h1 className="page-title">Race Result Input</h1><p className="page-description">Input lengkap hasil race dari klasifikasi resmi. Seluruh Driver aktif wajib dimasukkan, termasuk DNF, DNS, dan DSQ.</p></header>
  <section className="workspace-card race-form-card"><div className="section-title-row"><div><span className="section-eyebrow">01 · RACE SESSION</span><h2>Race information</h2></div><Flag size={21}/></div>
   <div className="race-meta-grid">
    <label>Round<select value={roundId} onChange={e=>setRoundId(e.target.value)} required><option value="">Pilih round yang siap disahkan</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.season_division?.license_seasons?.title||"Season"} · {r.season_division?.division_name||"Division"} · R{r.round_number} · {r.title}</option>)}</select></label>
    <label>Circuit<select value={circuitId} onChange={e=>setCircuitId(e.target.value)} disabled={!roundId} required><option value="">Pilih circuit</option>{circuits.map(c=><option key={c.id} value={c.id}>{flagFromCode(c.country_code)} {c.name} · {c.country_code}</option>)}</select></label>
    <div className="race-meta-readonly"><small>SESSION TYPE</small><strong>{round?.session_type==="sprint"?"Sprint":"Race"}</strong></div>
    <div className="race-meta-readonly"><small>REGISTERED DRIVERS</small><strong>{round?participants.length:"—"}</strong></div>
   </div>
   {round&&<p className="race-control-hint"><ShieldCheck size={16}/>{round.season_division?.license_seasons?.title} · {round.season_division?.division_name} · Check-in closed {new Date(round.checkin_closes_at).toLocaleString("id-ID")}. Urutan round dan status final divalidasi server.</p>}
   {circuit&&<p className="race-control-hint">Circuit snapshot: {flagFromCode(circuit.country_code)} {circuit.name} · {circuit.country_code}</p>}
  </section>
  {round&&<form onSubmit={submit} className="race-submit-form">
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">02 · CLASSIFICATION</span><h2>Driver race result</h2></div><div className="race-ocr-status-pill">{draftState==="draft"?"DRAFT · REVIEW REQUIRED":"INPUT WORKSPACE"}</div></div>
    <p className="page-description">Grid P1 otomatis menjadi Pole Position. Masukkan race time, gap, status, fastest lap, dan semua stint ban.</p><Suspense fallback={<div className="race-control-hint" role="status">Memuat modul OCR…</div>}><RaceOCR entries={entries} drivers={participants} teams={teams} onDraft={handleOcrDraft}/></Suspense>
    <div className="race-input-table-wrap"><table className="race-input-table race-complete-table"><thead><tr><th>Driver / Team</th><th>No.</th><th>Country / Flag</th><th>Grid</th><th>Status</th><th>Pos</th><th>Time / Laps Behind</th><th>Gap</th><th>Fastest Lap</th><th>Tyre Stints</th></tr></thead><tbody>
     {entries.map(x=><tr key={x.memberId}>
      <td><div className="race-driver-cell"><div className="race-order-controls"><button type="button" aria-label={`Pindahkan ${x.driverName} ke atas`} onClick={()=>moveEntry(entries.findIndex(y=>y.memberId===x.memberId),-1)} disabled={entries.findIndex(y=>y.memberId===x.memberId)===0}><ArrowUp size={13}/></button><span>{entries.findIndex(y=>y.memberId===x.memberId)+1}</span><button type="button" aria-label={`Pindahkan ${x.driverName} ke bawah`} onClick={()=>moveEntry(entries.findIndex(y=>y.memberId===x.memberId),1)} disabled={entries.findIndex(y=>y.memberId===x.memberId)===entries.length-1}><ArrowDown size={13}/></button></div><div className="race-driver-fields"><select aria-label={`Pilih Driver ${x.driverName}`} value={x.memberId} onChange={e=>{const target=participants.find(m=>m.id===e.target.value);if(!target||entries.some(y=>y.memberId===target.id&&y.memberId!==x.memberId))return;const team=teams.find(t=>t.id===target.team_id);setEntries(prev=>prev.map(y=>y.memberId===x.memberId?{...y,memberId:target.id,driverName:target.character_name||"Driver",teamName:team?.name||"Unassigned",country:target.nationality||y.country}:y))}}>{participants.map(m=><option key={m.id} value={m.id}>{m.character_name||"Driver"} · {teams.find(t=>t.id===m.team_id)?.name||"Unassigned"}</option>)}</select><small><MemberProfileLink memberId={participants.find(m=>m.id===x.memberId)?.public_member_id}>{x.driverName}</MemberProfileLink> · <TeamProfileLink teamId={participants.find(m=>m.id===x.memberId)?.team_id||undefined}>{x.teamName}</TeamProfileLink></small></div></div></td>
      <td><input aria-label={`Nomor mobil ${x.driverName}`} type="number" min="1" value={x.driverNumber} onChange={e=>update(x.memberId,{driverNumber:e.target.value})} placeholder="No." required/></td>
      <td><div className="race-country-fields"><input aria-label={`Negara ${x.driverName}`} value={x.country} onChange={e=>update(x.memberId,{country:e.target.value})} placeholder="Country" required/><input aria-label={`Flag ${x.driverName}`} value={x.flag} onChange={e=>update(x.memberId,{flag:e.target.value})} placeholder="🇮🇩" maxLength={8} required/></div></td>
      <td><input className="race-pos-input" aria-label={`Grid ${x.driverName}`} type="number" min="1" value={x.gridPosition} onChange={e=>update(x.memberId,{gridPosition:e.target.value})} required/></td>
      <td><select aria-label={`Status ${x.driverName}`} value={x.status} onChange={e=>changeStatus(x,e.target.value as FinishStatus)}><option value="finished">Finished</option><option value="dnf">DNF</option><option value="dns">DNS</option><option value="dsq">DSQ</option></select></td>
      <td>{x.status==="finished"?<input className="race-pos-input" aria-label={`Posisi ${x.driverName}`} type="number" min="1" value={x.position} onChange={e=>update(x.memberId,{position:e.target.value})} required/>:<span className="race-status-label">{x.status.toUpperCase()}</span>}</td>
      <td>{x.status==="finished"||x.status==="dnf"?<input className="race-time-input" aria-label={`Race time / laps behind ${x.driverName}`} value={x.timeOrLaps} onChange={e=>update(x.memberId,{timeOrLaps:e.target.value})} placeholder={x.status==="finished"?"1:40:22.061":"+11 Laps"} required/>:<span className="race-status-label">—</span>}</td>
      <td>{x.status==="finished"||x.status==="dnf"?<input className="race-gap-input" aria-label={`Gap ${x.driverName}`} value={x.gap} onChange={e=>update(x.memberId,{gap:e.target.value})} placeholder={x.status==="finished"?"+0.184":"+11 Laps"} required={x.status==="dnf"}/>:<span className="race-status-label">—</span>}</td>
      <td><input className="race-time-input" aria-label={`Fastest lap ${x.driverName}`} value={x.fastestLap} onChange={e=>update(x.memberId,{fastestLap:e.target.value})} placeholder="1:28.412"/></td>
      <td><div className="race-stints">{x.stints.map((stint,i)=><div className="race-stint" key={i}><span className={`race-tyre-dot ${stint}`}/><select aria-label={`Tyre stint ${i+1} ${x.driverName}`} value={stint} onChange={e=>updateStint(x.memberId,i,e.target.value as Tyre)}>{TYRES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select><button type="button" aria-label="Hapus stint" onClick={()=>setEntries(prev=>prev.map(y=>y.memberId===x.memberId?{...y,stints:y.stints.filter((_,j)=>j!==i)}:y))} disabled={x.stints.length===1}><Trash2 size={13}/></button></div>)}<button type="button" className="race-add-stint" onClick={()=>setEntries(prev=>prev.map(y=>y.memberId===x.memberId?{...y,stints:[...y.stints,"soft"]}:y))}><Plus size={13}/> Add stint</button></div></td>
     </tr>)}
    </tbody></table></div>
    <div className="race-tyre-legend">{TYRES.map(t=><span key={t.value}><i className={`race-tyre-dot ${t.value}`}/>{t.label}</span>)}</div>
    <div className="race-form-note"><AlertTriangle size={16}/><span>Semua Driver aktif harus masuk tepat satu kali. Finishing position harus berurutan. Setiap peserta wajib memiliki minimal satu stint ban.</span></div>
   </section>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">03 · RACE AWARDS</span><h2>Official race highlights</h2></div><Trophy size={21}/></div>
    <div className="race-award-grid">
     <label>Pole sitter (automatic)<input value={pole?.driverName||"Ditentukan dari Grid P1"} readOnly/></label>
     <label>Pole lap time<input value={poleTime} onChange={e=>setPoleTime(e.target.value)} placeholder="1:41.158" required/></label>
     <label>Fastest lap driver (automatic)<input value={fastest?.driverName||"Isi fastest lap di tabel"} readOnly/></label>
     <label>Fastest lap time (automatic)<input value={fastest?.fastestLap||"—"} readOnly/></label>
     <label>Driver of the Day<select value={dotdId} onChange={e=>setDotdId(e.target.value)} required><option value="">Pilih Driver of the Day</option>{entries.filter(x=>x.status==="finished").map(x=><option key={x.memberId} value={x.memberId}>{x.driverName} · {x.teamName}</option>)}</select></label>
    </div>
    <p className="race-control-hint"><Timer size={16}/> Pole / fastest lap: m:ss.mmm. Race time: h:mm:ss.mmm atau m:ss.mmm. Gap dalam detik, contoh +3.381; DNF gunakan +11 Laps; DNS dan DSQ tidak memerlukan race time atau gap.</p>
   </section>
   <section className="race-submit-bar"><div><strong>{entries.length} Driver</strong><small>{entries.filter(x=>x.status==="finished").length} Finished · {entries.filter(x=>x.status==="dnf").length} DNF · {entries.filter(x=>x.status==="dns").length} DNS · {entries.filter(x=>x.status==="dsq").length} DSQ</small><small className="race-draft-state">Workflow: {draftState==="draft"?"Draft tersimpan · menunggu konfirmasi":draftState==="confirmed"?"Confirmed":"Belum disimpan"}{sourceImageName?" · OCR: "+sourceImageName:""}</small></div><div className="race-submit-actions"><button className="economy-secondary-button race-submit" type="button" onClick={()=>void persistDraft()} disabled={saving||draftSaving||loading||!entries.length}><Save size={16}/>{draftSaving?"Menyimpan draft...":"Save Draft"}</button><button className="economy-primary-button race-submit" type="submit" disabled={saving||draftSaving||loading||!circuit||!entries.length||draftState!=="draft"||!draftId}><ShieldCheck size={16}/>{saving?"Mengonfirmasi...":"Confirm Official Result"}</button></div></section>
  </form>}
  {!round&&<section className="workspace-card race-empty-state"><Trophy size={28}/><h2>{loading?"Memuat round...":"Tidak ada round yang siap diinput"}</h2><p>Round muncul setelah check-in berakhir, belum ditutup, dan round sebelumnya pada divisi yang sama sudah selesai.</p><button className="economy-secondary-button" type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh round</button></section>}
  {notice&&<div className={`race-notice ${notice.kind}`} role="status">{notice.kind==="success"?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>}<span>{notice.text}</span></div>}
 </section>;
}
