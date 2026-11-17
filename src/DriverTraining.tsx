import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Activity, ArrowLeft, BadgeCheck, Clock3, Gauge, ShieldAlert, TimerReset, Trophy, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "./lib/supabase";

type Training={training_key:string;attribute_key:string;title:string;tagline:string;briefing:string;scenario:string};
type Mode={training_key:string;mode_key:"light"|"normal"|"hard";duration_seconds:number;cooldown_seconds:number;success_chance:number;success_gain:number;failure_loss:number};
type Attempt={id:string;training_key:string;mode_key:string;status:string;started_at:string;completes_at:string;expires_at:string;resolved_at:string|null;cooldown_until:string|null;attribute_before:number;attribute_after:number|null;attribute_delta:number|null;created_at:string;success_chance:number};
type Attribute={attribute_key:string;current_value:number};
type ActiveAttempt={attempt_id:string;training_key:string;mode_key:string;completes_at:string;expires_at:string;duration_seconds:number};
const labels:Record<string,string>={race_pace:"Race Pace",qualifying_pace:"Qualifying Pace",experience:"Experience",aggression:"Aggression",defensive_strength:"Defensive Strength",overtake_skill:"Overtake Skill",mistake_rate:"Mistake Rate",tyre_management:"Tyre Management"};
const modeNames:Record<string,string>={light:"Ringan",normal:"Normal",hard:"Hard"};
const modeColors:Record<string,string>={light:"light",normal:"normal",hard:"hard"};
const fmt=(seconds:number)=>{const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h? h+"j "+m+"m":m?m+"m "+s+"d":s+" detik"};
const dateTime=(value:string)=>new Date(value).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});
const money=(value:number)=>"€ "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:2});

export default function DriverTraining({session}:{session:Session}){
 const [memberId,setMemberId]=useState<string|null>(null),[memberName,setMemberName]=useState("Driver");
 const [trainings,setTrainings]=useState<Training[]>([]),[modes,setModes]=useState<Mode[]>([]);
 const [attributes,setAttributes]=useState<Attribute[]>([]),[attempts,setAttempts]=useState<Attempt[]>([]);
 const [active,setActive]=useState<ActiveAttempt|null>(null),[selectedMode,setSelectedMode]=useState<"light"|"normal"|"hard">("normal");
 const [selectedTraining,setSelectedTraining]=useState("race_pace"),[secondsLeft,setSecondsLeft]=useState(0);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState(""),[result,setResult]=useState<any>(null);
 const refresh=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Akun belum terhubung ke member.");setLoading(false);return;}
  const {data:m,error:me}=await supabase.from("members").select("id,role,character_name").eq("id",p.member_id).maybeSingle();
  if(me||!m||m.role!=="Driver"){setNotice(me?.message||"Training hanya tersedia untuk role Driver.");setLoading(false);return;}
  setMemberId(m.id);setMemberName(m.character_name||"Driver");
  const [c,md,a,h]=await Promise.all([
   supabase.from("caleris_driver_training_catalog").select("training_key,attribute_key,title,tagline,briefing,scenario").eq("is_active",true).order("training_key"),
   supabase.from("caleris_driver_training_modes").select("training_key,mode_key,duration_seconds,cooldown_seconds,success_chance,success_gain,failure_loss").eq("is_active",true),
   supabase.from("caleris_driver_development_attributes").select("attribute_key,current_value").eq("member_id",m.id),
   supabase.from("caleris_driver_training_attempts").select("id,training_key,mode_key,status,started_at,completes_at,expires_at,resolved_at,cooldown_until,attribute_before,attribute_after,attribute_delta,created_at,success_chance").eq("member_id",m.id).order("created_at",{ascending:false}).limit(60)
  ]);
  const err=[c.error,md.error,a.error,h.error].find(Boolean);
  if(err){setNotice(err.message);setLoading(false);return;}
  const rows=(h.data||[]) as Attempt[];
  setTrainings((c.data||[]) as Training[]);setModes((md.data||[]) as Mode[]);
  setAttributes((a.data||[]) as Attribute[]);setAttempts(rows);
  const current=rows.find(x=>x.status==="started"&&new Date(x.expires_at).getTime()>Date.now());
  if(current)setActive({attempt_id:current.id,training_key:current.training_key,mode_key:current.mode_key as ActiveAttempt["mode_key"],completes_at:current.completes_at,expires_at:current.expires_at,duration_seconds:Math.max(0,Math.round((new Date(current.completes_at).getTime()-new Date(current.started_at).getTime())/1000))});
  else setActive(null);
  setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{if(!active){setSecondsLeft(0);return;}const tick=()=>setSecondsLeft(Math.max(0,Math.ceil((new Date(active.completes_at).getTime()-Date.now())/1000)));tick();const timer=window.setInterval(tick,250);return()=>window.clearInterval(timer)},[active]);
 const currentValues=useMemo(()=>Object.fromEntries(attributes.map(a=>[a.attribute_key,Number(a.current_value)])),[attributes]);
 const selected=trainings.find(t=>t.training_key===selectedTraining)||trainings[0];
 const selectedModes=modes.filter(m=>m.training_key===selected?.training_key);
 const mode=selectedModes.find(m=>m.mode_key===selectedMode)||selectedModes[0];
 const value=Number(currentValues[selected?.attribute_key]??50);
 const bestDirection=selected?.attribute_key==="mistake_rate";
 const atLimit=selected?(bestDirection?value<=50:value>=100):false;
 const lastResolved=attempts.filter(a=>a.training_key===selected?.training_key&&(a.status==="success"||a.status==="failed")).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
 const cooldownUntil=lastResolved?.cooldown_until?new Date(lastResolved.cooldown_until).getTime():0;
 const cooldownLeft=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
 const start=async()=>{
  if(!supabase||!selected||!mode||active||saving||atLimit||cooldownLeft>0)return;
  setSaving(true);setNotice("");setResult(null);
  const {data,error}=await supabase.functions.invoke("economy-workflows",{body:{action:"start_driver_training",trainingKey:selected.training_key,modeKey:mode.mode_key}});
  setSaving(false);
  if(error||data?.error){setNotice(data?.error||error?.message||"Latihan gagal dimulai.");return;}
  const r=data.result;
  setActive({attempt_id:r.attempt_id,training_key:r.training_key,mode_key:r.mode_key,completes_at:r.completes_at,expires_at:r.expires_at,duration_seconds:r.duration_seconds});
  setSelectedTraining(r.training_key);setSelectedMode(r.mode_key);await refresh();
 };
 const complete=async()=>{
  if(!supabase||!active||secondsLeft>0||saving)return;
  setSaving(true);setNotice("");
  const {data,error}=await supabase.functions.invoke("economy-workflows",{body:{action:"complete_driver_training",attemptId:active.attempt_id}});
  setSaving(false);
  if(error||data?.error){setNotice(data?.error||error?.message||"Hasil latihan gagal diproses.");return;}
  setResult(data.result);setActive(null);await refresh();
 };
 const modeCopy=(m:Mode)=>({light:"Sesi pemanasan dengan tekanan rendah dan hasil yang lebih konsisten.",normal:"Program standar untuk perkembangan yang seimbang.",hard:"Simulasi intensif dengan potensi hasil besar dan risiko lebih tinggi."}[m.mode_key]);
 const activeTraining=trainings.find(t=>t.training_key===active?.training_key);
 return <section className="workspace driver-training-workspace">
  <div className="development-page-actions"><Link className="back-link" to="/driver-panel/development"><ArrowLeft size={16}/> Driver Development</Link><span className="training-driver-label"><Activity size={14}/> {memberName}</span></div>
  <header className="page-heading"><span className="section-eyebrow">DRIVER PERFORMANCE PROGRAM</span><h1 className="page-title">Training Centre</h1><p className="page-description">Delapan program latihan untuk mengembangkan atribut Driver. Pilih skema, tentukan intensitas, jalani timer, lalu lihat hasil simulasi. Tidak menggunakan saldo wallet maupun DDP.</p></header>
  <div className="training-intro-grid"><article className="training-intro-card"><span><Gauge size={18}/> ATTRIBUTE LAB</span><strong>8</strong><small>Program latihan spesifik atribut</small></article><article className="training-intro-card"><span><Zap size={18}/> TRAINING MODES</span><strong>3</strong><small>Ringan · Normal · Hard</small></article><article className="training-intro-card"><span><TimerReset size={18}/> FAIR PLAY</span><strong>1×</strong><small>Satu sesi aktif, cooldown per latihan</small></article></div>
  {loading?<div className="workspace-card">Memuat Training Centre...</div>:notice&&!memberId?<div className="workspace-card training-notice">{notice}</div>:<>
   {active&&<section className="training-active-card"><div className="training-active-top"><span className="section-eyebrow">SESSION IN PROGRESS</span><span className="training-live-pill">LIVE SESSION</span></div><h2>{activeTraining?.title||"Driver Training"}</h2><p>{activeTraining?.scenario}</p><div className="training-timer"><strong>{String(Math.floor(secondsLeft/60)).padStart(2,"0")}:{String(secondsLeft%60).padStart(2,"0")}</strong><span>{secondsLeft>0?"Selesaikan simulasi sesuai waktu yang ditetapkan":"Waktu selesai · sesi siap diproses"}</span></div><div className="training-timer-track"><i style={{width:Math.max(0,Math.min(100,100-secondsLeft/Math.max(1,active.duration_seconds)*100))+"%"}}/></div><button className="training-primary-button" disabled={secondsLeft>0||saving} onClick={()=>void complete()}>{saving?"Memproses hasil...":secondsLeft>0?"Latihan sedang berlangsung":"Selesaikan Latihan"}</button></section>}
   <div className="training-layout"><section className="training-programs"><div className="training-section-heading"><div><span className="section-eyebrow">01 · TRAINING PROGRAMS</span><h2>Pilih Program Latihan</h2></div><span>{trainings.length} PROGRAM</span></div><div className="training-program-grid">{trainings.map(t=>{const v=Number(currentValues[t.attribute_key]??50),isSelected=t.training_key===selected?.training_key,limit=t.attribute_key==="mistake_rate"?v<=50:v>=100;const last=attempts.filter(a=>a.training_key===t.training_key&&(a.status==="success"||a.status==="failed")).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];const wait=last?.cooldown_until?Math.max(0,Math.ceil((new Date(last.cooldown_until).getTime()-Date.now())/1000)):0;return <button type="button" key={t.training_key} className={"training-program-card"+(isSelected?" selected":"")} onClick={()=>{setSelectedTraining(t.training_key);setResult(null)}}><span className="training-program-top"><span>{labels[t.attribute_key]}</span><b>{v.toFixed(2)}</b></span><strong>{t.title}</strong><p>{t.tagline}</p><span className="training-program-footer">{limit?"LIMIT TERCAPAI":wait>0?"COOLDOWN "+fmt(wait):"AVAILABLE"}</span></button>})}</div></section>
    <aside className="training-detail-panel">{selected&&<><span className="section-eyebrow">02 · SELECTED PROGRAM</span><h2>{selected.title}</h2><p className="training-tagline">{selected.tagline}</p><div className="training-attribute-readout"><span>{labels[selected.attribute_key]}</span><strong>{value.toFixed(2)}<small>/100</small></strong><div><i style={{width:Math.max(0,Math.min(100,value))+"%"}}/></div>{bestDirection&&<small>Semakin rendah semakin baik.</small>}</div><p className="training-briefing">{selected.briefing}</p><div className="training-scenario"><span>MISSION BRIEF</span><strong>{selected.scenario}</strong></div><div className="training-section-heading compact"><div><span className="section-eyebrow">03 · INTENSITY</span><h3>Pilih Mode</h3></div></div><div className="training-mode-list">{selectedModes.map(m=><button type="button" key={m.mode_key} className={"training-mode-option "+modeColors[m.mode_key]+(selectedMode===m.mode_key?" selected":"")} onClick={()=>setSelectedMode(m.mode_key)}><span><b>{modeNames[m.mode_key]}</b><small>{modeCopy(m)}</small></span><strong>{Math.round(Number(m.success_chance))}%<small>SUCCESS</small></strong></button>)}</div>{mode&&<div className="training-risk-grid"><div><span>DURASI</span><strong>{fmt(mode.duration_seconds)}</strong></div><div><span>COOLDOWN</span><strong>{fmt(mode.cooldown_seconds)}</strong></div><div><span>BERHASIL</span><strong className="positive">+{mode.success_gain.toFixed(2)}</strong></div><div><span>GAGAL</span><strong className="negative">-{mode.failure_loss.toFixed(2)}</strong></div></div>}{cooldownLeft>0&&<div className="training-cooldown-note"><Clock3 size={16}/> Program ini dapat diulang dalam {fmt(cooldownLeft)}.</div>}{atLimit&&<div className="training-cooldown-note"><BadgeCheck size={16}/> Atribut sudah mencapai batas latihan.</div>}<button className="training-primary-button" onClick={()=>void start()} disabled={!mode||saving||Boolean(active)||cooldownLeft>0||atLimit}>{saving?"Menyiapkan sesi...":active?"Selesaikan sesi aktif":cooldownLeft>0?"Training Cooldown":atLimit?"Batas atribut tercapai":"Mulai Training"}</button><small className="training-footnote">Hasil ditentukan server setelah timer selesai. Menutup halaman tidak membatalkan sesi. Satu sesi aktif per Driver.</small></>}</aside>
   </div>
   {result&&<section className={"training-result-card "+(result.status==="success"?"success":"failed")}><div>{result.status==="success"?<Trophy size={24}/>:<ShieldAlert size={24}/>}<span className="section-eyebrow">TRAINING RESULT</span></div><h2>{result.status==="success"?"TRAINING COMPLETED":"TRAINING FAILED"}</h2><p>{result.status==="expired"?"Sesi melewati batas penyelesaian dan tidak menghasilkan perubahan atribut.":result.status==="success"?"Latihan berhasil. Atribut mendapatkan peningkatan.": "Latihan gagal. Atribut mengalami penurunan sesuai risiko mode."}</p>{result.status!=="expired"&&<div className="training-result-stats"><span>{labels[result.attribute_key]||"Attribute"}<strong>{Number(result.previous_value).toFixed(2)} → {Number(result.new_value).toFixed(2)}</strong></span><span>PERUBAHAN<strong className={Number(result.attribute_delta)>=0?"positive":"negative"}>{Number(result.attribute_delta)>0?"+":""}{Number(result.attribute_delta).toFixed(2)}</strong></span><span>SUCCESS ROLL<strong>{Number(result.success_roll).toFixed(2)} / {Number(result.success_chance).toFixed(0)}%</strong></span></div>}</section>}
   <section className="workspace-card training-history-card"><div className="training-section-heading"><div><span className="section-eyebrow">04 · SESSION LOG</span><h2>Riwayat Training</h2></div><span>{attempts.filter(a=>a.status!=="started").length} SELESAI</span></div>{attempts.filter(a=>a.status!=="started").length===0?<p className="muted">Belum ada riwayat latihan.</p>:<div className="training-history-list">{attempts.filter(a=>a.status!=="started").slice(0,12).map(a=><article key={a.id}><div><strong>{trainings.find(t=>t.training_key===a.training_key)?.title||labels[a.training_key]||a.training_key}</strong><small>{dateTime(a.created_at)} · {modeNames[a.mode_key]||a.mode_key}</small></div><span className={"training-history-status "+a.status}>{a.status==="success"?"BERHASIL":a.status==="failed"?"GAGAL":"EXPIRED"}</span><b className={Number(a.attribute_delta)>=0?"positive":"negative"}>{a.attribute_delta===null?"—":(Number(a.attribute_delta)>0?"+":"")+Number(a.attribute_delta).toFixed(2)}</b></article>)}</div>}</section>
  </>}
  {notice&&memberId&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
