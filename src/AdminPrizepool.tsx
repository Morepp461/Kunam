import {useCallback,useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowLeft,Coins,RefreshCw,Save,ShieldCheck,Trophy} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import {TeamProfileLink} from "./EntityProfileLink";
import "./admin-prizepool.css";

type Season={id:string;title:string;status:string};
type Division={id:string;season_id:string;division_key:string;division_name:string;status:string};
type Team={id:string;name:string;division_key:string};
type Standing={id:string;team_id:string;final_points:number;final_position:number};
type Rule={division_key:string;recipient_type:"driver"|"team";final_position:number;prize_amount:number;is_active:boolean};
type Payout={recipient_type:string;recipient_id:string;final_position:number;prize_amount:number;paid_at:string};
type Notice={kind:"success"|"error";text:string};
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
type PrizeGroup={key:string;type:"team"|"driver";label:string;count:number};


export default function AdminPrizepool({session}:{session:Session}){
 const [seasons,setSeasons]=useState<Season[]>([]),[divisions,setDivisions]=useState<Division[]>([]),[teams,setTeams]=useState<Team[]>([]);
 const [rules,setRules]=useState<Rule[]>([]),[standings,setStandings]=useState<Standing[]>([]),[payouts,setPayouts]=useState<Payout[]>([]);
 const [seasonId,setSeasonId]=useState(""),[divisionId,setDivisionId]=useState(""),[teamId,setTeamId]=useState(""),[teamPoints,setTeamPoints]=useState(""),[teamPosition,setTeamPosition]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState<Notice|null>(null),[driverSlots,setDriverSlots]=useState(""),[teamSlots,setTeamSlots]=useState("");
 const load=useCallback(async()=>{
  if(!supabase)return;const db=supabase;
  const [s,d,t,r]=await Promise.all([
   db.from("license_seasons").select("id,title,status").order("created_at",{ascending:false}),
   db.from("license_season_divisions").select("id,season_id,division_key,division_name,status").order("created_at",{ascending:false}),
   db.from("teams").select("id,name,division_key").order("name"),
   db.from("caleris_prizepool_rules").select("*").order("division_key").order("recipient_type").order("final_position")
  ]);
  const err=s.error||d.error||t.error||r.error;if(err){setNotice({kind:"error",text:err.message});return}
  setSeasons((s.data||[]) as Season[]);setDivisions((d.data||[]) as Division[]);setTeams((t.data||[]) as Team[]);setRules((r.data||[]) as Rule[]);
  const chosenDivision=(d.data||[]).find(x=>x.id===divisionId);
  if(!seasonId&&s.data?.length){const chosen=s.data.find(x=>x.status==="active")||s.data[0];setSeasonId(chosen.id)}
  if(!divisionId&&d.data?.length){const chosen=(d.data||[]).find(x=>x.status==="active")||d.data[0];setDivisionId(chosen.id);setSeasonId(chosen.season_id)}
  if(chosenDivision&&chosenDivision.season_id!==seasonId)setDivisionId("");
 },[seasonId,divisionId]);
 useEffect(()=>{void load()},[load]);
 const seasonDivisions=divisions.filter(x=>x.season_id===seasonId);
 const activeDivision=divisions.find(x=>x.id===divisionId);
 const prizeGroups=useMemo<PrizeGroup[]>(()=>Array.from(new Map(divisions.map(d=>[d.division_key,d])).values()).flatMap(d=>["team","driver"].map(type=>{const count=rules.filter(r=>r.division_key===d.division_key&&r.recipient_type===type).reduce((m,r)=>Math.max(m,r.final_position),0);return {key:d.division_key,type:type as "team"|"driver",label:`${d.division_name} · ${type==="team"?"Team":"Driver"}`,count};})).filter(g=>g.count>0),[divisions,rules]);
 const divisionTeams=useMemo(()=>teams.filter(x=>x.division_key===activeDivision?.division_key),[teams,activeDivision?.division_key]);
 const loadDivision=useCallback(async()=>{
  if(!supabase||!divisionId){setStandings([]);setPayouts([]);return}
  const [s,p]=await Promise.all([
   supabase.from("license_team_final_standings").select("*").eq("season_division_id",divisionId).order("final_position"),
   supabase.from("caleris_prizepool_payouts").select("recipient_type,recipient_id,final_position,prize_amount,paid_at").eq("season_division_id",divisionId).order("recipient_type").order("final_position")
  ]);
  if(s.error||p.error){setNotice({kind:"error",text:s.error?.message||p.error?.message||"Data gagal dimuat"});return}
  setStandings((s.data||[]) as Standing[]);setPayouts((p.data||[]) as Payout[]);
 },[divisionId]);
 useEffect(()=>{void loadDivision()},[loadDivision]);
 const generateRules=async()=>{
  if(!supabase||!activeDivision)return;
  const drivers=Number(driverSlots),teamsCount=Number(teamSlots);
  if(!Number.isInteger(drivers)||drivers<1||drivers>100||!Number.isInteger(teamsCount)||teamsCount<1||teamsCount>50){setNotice({kind:"error",text:"Jumlah posisi Driver (1–100) dan Team (1–50) wajib valid."});return}
  setBusy(true);setNotice(null);
  const rows=[...Array.from({length:drivers},(_,i)=>({division_key:activeDivision.division_key,recipient_type:"driver",final_position:i+1,prize_amount:0,is_active:true,updated_by:session.user.id})),...Array.from({length:teamsCount},(_,i)=>({division_key:activeDivision.division_key,recipient_type:"team",final_position:i+1,prize_amount:0,is_active:true,updated_by:session.user.id}))];
  const {error}=await supabase.from("caleris_prizepool_rules").upsert(rows,{onConflict:"division_key,recipient_type,final_position"});
  setBusy(false);if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"Slot Prizepool divisi berhasil dibuat. Nominal awal €0, silakan konfigurasi sebelum pembayaran."});setDriverSlots("");setTeamSlots("");await load();
 };
 const updateRule=async(rule:Rule,value:number)=>{
  if(!supabase||!Number.isFinite(value)||value<0)return;
  setBusy(true);setNotice(null);
  const {error}=await supabase.from("caleris_prizepool_rules").update({prize_amount:value,updated_by:session.user.id,updated_at:new Date().toISOString()}).eq("division_key",rule.division_key).eq("recipient_type",rule.recipient_type).eq("final_position",rule.final_position);
  setBusy(false);if(error){setNotice({kind:"error",text:error.message});return}
  setRules(v=>v.map(x=>x.division_key===rule.division_key&&x.recipient_type===rule.recipient_type&&x.final_position===rule.final_position?{...x,prize_amount:value}:x));
  setNotice({kind:"success",text:"Nilai Prizepool diperbarui."});
 };
 const saveStanding=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!divisionId||!teamId)return;
  setBusy(true);setNotice(null);
  const {error}=await supabase.from("license_team_final_standings").upsert({season_division_id:divisionId,team_id:teamId,final_points:Number(teamPoints),final_position:Number(teamPosition),updated_by:session.user.id},{onConflict:"season_division_id,team_id"});
  setBusy(false);if(error){setNotice({kind:"error",text:error.message});return}
  setTeamId("");setTeamPoints("");setTeamPosition("");setNotice({kind:"success",text:"Final standings Team tersimpan."});await loadDivision();
 };
 const payout=async()=>{
  if(!supabase||!divisionId)return;
  if(!window.confirm("Bayarkan seluruh Prizepool Driver dan Team untuk divisi ini dari VreeoBank? Pembayaran tidak dapat diulang."))return;
  setBusy(true);setNotice(null);
  const {data,error}=await supabase.rpc("payout_season_prizepool",{p_season_division_id:divisionId});
  setBusy(false);if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"Prizepool berhasil dibayarkan. "+String(data?.payout_count||0)+" transaksi tercatat."});await loadDivision();
 };
 const paid=payouts.length>0;
 const missingTeams=divisionTeams.filter(t=>!standings.some(s=>s.team_id===t.id));
 return <section className="workspace prizepool-page">
  <Link className="back-link" to="/admin/license-engine"><ArrowLeft size={16}/> License Scoring Engine</Link>
  <header className="page-heading"><span className="section-eyebrow">ECONOMY · SEASON SETTLEMENT</span><h1 className="page-title">Season Prizepool</h1><p className="page-description">Hadiah dibayarkan berdasarkan final standings setelah divisi difinalisasi. Ini terpisah dari Race Rewards DDP/TDP.</p></header>
  <section className="workspace-card prizepool-card">
   <div className="section-title-row"><div><span className="section-eyebrow">01 · SCHEDULE</span><h2>Konfigurasi Prizepool</h2></div><Coins size={19}/></div>
   <p className="license-muted">Nominal hadiah dalam Euro (€). Setiap divisi memiliki konfigurasi independen. Divisi baru harus dibuatkan slot dan nominal hadiahnya sebelum payout.</p>
   <div className="prizepool-schedule-grid">{prizeGroups.map(group=><section className="prizepool-schedule" key={group.key+group.type}><h3>{group.label}</h3><div className="prizepool-rank-list">{Array.from({length:group.count},(_,i)=>i+1).map(rank=>{const rule=rules.find(x=>x.division_key===group.key&&x.recipient_type===group.type&&x.final_position===rank);return <label key={rank}><span>P{rank}</span><input aria-label={group.label+" posisi "+rank} type="number" min="0" step="0.01" disabled={!rule||busy} value={rule?.prize_amount??""} onChange={e=>setRules(v=>v.map(x=>x.division_key===group.key&&x.recipient_type===group.type&&x.final_position===rank?{...x,prize_amount:Number(e.target.value)}:x))} onBlur={e=>{if(rule)void updateRule(rule,Number(e.currentTarget.value))}}/><small>€</small></label>})}</div></section>)}</div>
   {activeDivision&&<div className="prizepool-entry-form"><label>Slot Driver<input type="number" min="1" max="100" value={driverSlots} onChange={e=>setDriverSlots(e.target.value)} placeholder="Jumlah posisi"/></label><label>Slot Team<input type="number" min="1" max="50" value={teamSlots} onChange={e=>setTeamSlots(e.target.value)} placeholder="Jumlah posisi"/></label><button className="action" type="button" disabled={busy} onClick={()=>void generateRules()}>Buat slot Prizepool divisi terpilih</button></div>}
  </section>
  <section className="workspace-card prizepool-card">
   <div className="section-title-row"><div><span className="section-eyebrow">02 · FINAL TEAM STANDINGS</span><h2>Hasil akhir Team</h2></div><Trophy size={19}/></div>
   <div className="prizepool-select-grid"><label>Season<select value={seasonId} onChange={e=>{setSeasonId(e.target.value);setDivisionId("")}}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label><label>Divisi<select value={divisionId} onChange={e=>setDivisionId(e.target.value)}><option value="">Pilih divisi</option>{seasonDivisions.map(d=><option key={d.id} value={d.id}>{d.division_name} · {d.status}</option>)}</select></label></div>
   {activeDivision&&<><p className="license-muted">Divisi: {activeDivision.division_name} · Status: {activeDivision.status} · Tim: {divisionTeams.length} · Belum masuk standings: {missingTeams.length}</p>
    <form className="prizepool-entry-form" onSubmit={saveStanding}><label>Team<select required value={teamId} onChange={e=>setTeamId(e.target.value)}><option value="">Pilih team</option>{divisionTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Total poin akhir<input required type="number" min="0" step="any" value={teamPoints} onChange={e=>setTeamPoints(e.target.value)}/></label><label>Posisi akhir<input required type="number" min="1" step="1" value={teamPosition} onChange={e=>setTeamPosition(e.target.value)}/></label><button className="action primary" disabled={busy||paid||!teamId}><Save size={15}/> Simpan standings</button></form>
    <div className="license-list">{standings.map(s=><article key={s.id}><div><strong>P{s.final_position} · <TeamProfileLink teamId={s.team_id}>{teams.find(t=>t.id===s.team_id)?.name||"Team"}</TeamProfileLink></strong><small>{Number(s.final_points).toLocaleString("id-ID")} poin</small></div><span className="license-muted">{money(Number(rules.find(r=>r.division_key===activeDivision.division_key&&r.recipient_type==="team"&&r.final_position===s.final_position)?.prize_amount||0))}</span></article>)}</div>
    {paid&&<p className="license-success"><ShieldCheck size={15}/> Prizepool sudah dibayarkan · {payouts.length} transaksi</p>}
    <button className="action primary prizepool-payout" disabled={busy||paid||activeDivision.status!=="completed"||missingTeams.length>0||standings.length!==divisionTeams.length} onClick={()=>void payout()}><Coins size={16}/> Bayarkan Prizepool Driver + Team</button>
    {activeDivision.status!=="completed"&&<p className="license-muted">Finalisasi divisi dan WDC terlebih dahulu melalui License Scoring Engine. Pembayaran hanya tersedia setelah status divisi completed.</p>}
   </>}
  </section>
  {notice&&<div className={"license-notice "+notice.kind}>{notice.text}</div>}
  <div className="license-engine-footer"><button className="license-small-button" onClick={()=>{void load();void loadDivision()}} disabled={busy}><RefreshCw size={14}/> Refresh data</button><span>Admin: {session.user.email||session.user.id}</span></div>
 </section>;
}
