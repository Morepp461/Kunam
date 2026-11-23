import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "./lib/supabase";
import { MemberProfileLink, TeamProfileLink } from "./EntityProfileLink";
import "./admin-team-inactivity.css";

type TeamRow={id:string;name:string;division_key:string|null};
type SeasonRow={id:string;title:string;status:string;starts_on:string;ends_on:string};
type StateRow={team_id:string;status:"active"|"awaiting_compensation"|"frozen";frozen_after_season_id:string|null;frozen_at:string|null;reactivated_at:string|null;reactivation_activity_count:number;last_reviewed_season_id:string|null;updated_at:string};
type ReviewRow={id:string;season_id:string;team_id:string;quest_activity_count:number;development_activity_count:number;freeze_triggered:boolean;created_at:string};
type SettlementRow={id:string;team_id:string;season_id:string;member_id:string;remaining_seasons:number;annual_salary_snapshot:number|null;compensation_amount:number;status:"pending"|"paid";transaction_id:string|null;error_note:string|null;created_at:string};
type SlotRow={id:string;season_id:string;division_key:string;replaced_team_id:string;replacement_team_id:string|null;status:"open"|"filled";note:string|null;created_at:string};
const money=(value:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value||0);
export default function AdminTeamInactivity(){
 const [teams,setTeams]=useState<TeamRow[]>([]),[seasons,setSeasons]=useState<SeasonRow[]>([]),[states,setStates]=useState<StateRow[]>([]),[reviews,setReviews]=useState<ReviewRow[]>([]),[settlements,setSettlements]=useState<SettlementRow[]>([]),[slots,setSlots]=useState<SlotRow[]>([]);
 const [members,setMembers]=useState<{id:string;character_name:string|null;public_member_id:string|null}[]>([]);
 const [slotTeams,setSlotTeams]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setError("Koneksi Supabase belum tersedia.");setLoading(false);return;}
  setLoading(true);setError("");
  const [t,s,st,r,sett,sl,m]=await Promise.all([
   supabase.from("teams").select("id,name,division_key").order("name"),
   supabase.from("license_seasons").select("id,title,status,starts_on,ends_on").order("starts_on",{ascending:false}),
   supabase.from("caleris_team_inactivity_states").select("*").order("updated_at",{ascending:false}),
   supabase.from("caleris_team_inactivity_reviews").select("*").order("created_at",{ascending:false}).limit(200),
   supabase.from("caleris_team_freeze_settlements").select("*").order("created_at",{ascending:false}).limit(300),
   supabase.from("caleris_team_replacement_slots").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_member_directory").select("id,character_name,public_member_id").order("character_name")
  ]);
  const failed=[t.error,s.error,st.error,r.error,sett.error,sl.error,m.error].find(Boolean);
  if(failed){setError(failed.message);setLoading(false);return;}
  setTeams((t.data||[]) as TeamRow[]);setSeasons((s.data||[]) as SeasonRow[]);setStates((st.data||[]) as StateRow[]);
  setReviews((r.data||[]) as ReviewRow[]);setSettlements((sett.data||[]) as SettlementRow[]);setSlots((sl.data||[]) as SlotRow[]);setMembers((m.data||[]) as {id:string;character_name:string|null;public_member_id:string|null}[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const teamMap=useMemo(()=>new Map(teams.map(t=>[t.id,t])),[teams]);
 const seasonMap=useMemo(()=>new Map(seasons.map(s=>[s.id,s])),[seasons]);
 const memberMap=useMemo(()=>new Map(members.map(m=>[m.id,m])),[members]);
 const reviewMap=useMemo(()=>new Map(reviews.map(r=>[r.team_id+":"+r.season_id,r])),[reviews]);
 const frozen=states.filter(s=>s.status==="frozen"),pending=states.filter(s=>s.status==="awaiting_compensation");
 const pendingTotal=settlements.filter(s=>s.status==="pending").reduce((sum,s)=>sum+Number(s.compensation_amount),0);
 const openSlot=async(teamId:string)=>{
  if(!supabase)return;setBusy(true);setNotice("");setError("");
  const {error:rpcError}=await supabase.rpc("admin_open_team_replacement_slot",{p_frozen_team_id:teamId,p_note:"Slot pengganti dibuka setelah team inactivity freeze."});
  setBusy(false);if(rpcError){setError(rpcError.message);return;}setNotice("Slot pengganti berhasil dibuka.");await load();
 };
 const fillSlot=async(slotId:string)=>{
  if(!supabase||!slotTeams[slotId])return;setBusy(true);setNotice("");setError("");
  const {error:rpcError}=await supabase.rpc("admin_fill_team_replacement_slot",{p_slot_id:slotId,p_replacement_team_id:slotTeams[slotId]});
  setBusy(false);if(rpcError){setError(rpcError.message);return;}setNotice("Tim pengganti berhasil ditetapkan ke divisi slot.");await load();
 };
 return <section className="workspace admin-team-inactivity">
  <div className="page-heading"><p className="kicker">ADMIN CONTROL · TEAM LIFECYCLE</p><h1 className="page-title">Team Inactivity Control</h1><p className="page-description">Pantau aktivitas Quest dan Development, settlement kompensasi Driver, status freeze, serta slot pengganti untuk season berikutnya.</p></div>
  <div className="admin-inactivity-stats">
   <article><span>FROZEN TEAMS</span><strong>{frozen.length}</strong><small>Sudah menyelesaikan settlement</small></article>
   <article><span>WAITING COMPENSATION</span><strong>{pending.length}</strong><small>Menunggu saldo Team Wallet</small></article>
   <article><span>PENDING COMPENSATION</span><strong>{money(pendingTotal)}</strong><small>Total kewajiban yang belum dibayar</small></article>
   <article><span>OPEN REPLACEMENT SLOTS</span><strong>{slots.filter(s=>s.status==="open").length}</strong><small>Slot pengganti belum terisi</small></article>
  </div>
  <div className="admin-inactivity-toolbar"><div><strong>Team lifecycle status</strong><p>Tim dibekukan setelah satu season penuh tanpa quest selesai maupun upgrade Development.</p></div><button className="action" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={15}/> Refresh</button></div>
  {error&&<div className="admin-inactivity-alert error"><AlertTriangle size={16}/>{error}</div>}
  {notice&&<div className="admin-inactivity-alert success"><CheckCircle2 size={16}/>{notice}</div>}
  {loading?<div className="center-state">Memuat status team...</div>:<div className="workspace-card admin-inactivity-table-wrap">
   <table className="admin-inactivity-table"><thead><tr><th>Team</th><th>Status</th><th>Season review</th><th>Quest</th><th>Development</th><th>Reaktivasi</th><th>Aksi</th></tr></thead><tbody>
    {teams.map(team=>{const state=states.find(s=>s.team_id===team.id);const review=state?.last_reviewed_season_id?reviewMap.get(team.id+":"+state.last_reviewed_season_id):undefined;const status=state?.status||"active";return <tr key={team.id}>
     <td><strong><TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink></strong><small>{team.division_key||"Belum ada divisi"}</small></td>
     <td><span className={"admin-inactivity-status "+status}>{status==="active"?"ACTIVE":status==="frozen"?"FROZEN":"AWAITING COMPENSATION"}</span></td>
     <td>{seasonMap.get(state?.last_reviewed_season_id||"")?.title||"—"}</td>
     <td>{review?.quest_activity_count??"—"}</td><td>{review?.development_activity_count??"—"}</td>
     <td>{state?.reactivation_activity_count??0}/3</td>
     <td>{status==="frozen"?<button className="action" disabled={busy||slots.some(s=>s.replaced_team_id===team.id)} onClick={()=>void openSlot(team.id)}>Buka slot pengganti</button>:status==="awaiting_compensation"?<small>Menunggu dana: {money(settlements.filter(s=>s.team_id===team.id&&s.status==="pending").reduce((sum,s)=>sum+Number(s.compensation_amount),0))}</small>:<small>Monitoring otomatis</small>}</td>
    </tr>})}
   </tbody></table>
   {!teams.length&&<p className="admin-inactivity-empty">Belum ada data team.</p>}
  </div>}
  <div className="admin-inactivity-section-heading"><div><h2>Replacement slots</h2><p>Admin dapat mengisi slot dengan team baru yang belum masuk roster season tujuan.</p></div></div>
  <div className="admin-inactivity-slot-list">
   {slots.map(slot=><article className="workspace-card admin-inactivity-slot" key={slot.id}>
    <div><span className={"admin-inactivity-status "+slot.status}>{slot.status==="open"?"OPEN":"FILLED"}</span><h3>{slot.division_key} · {seasonMap.get(slot.season_id)?.title||"Season"}</h3><p>Menggantikan: <strong><TeamProfileLink teamId={slot.replaced_team_id}>{teamMap.get(slot.replaced_team_id)?.name||"Team"}</TeamProfileLink></strong></p>{slot.note&&<small>{slot.note}</small>}</div>
    {slot.status==="open"?<div className="admin-inactivity-fill"><select value={slotTeams[slot.id]||""} onChange={e=>setSlotTeams(v=>({...v,[slot.id]:e.target.value}))}><option value="">Pilih team pengganti</option>{teams.filter(t=>t.id!==slot.replaced_team_id&&!states.some(s=>s.team_id===t.id&&s.status!=="active")).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="action primary" disabled={busy||!slotTeams[slot.id]} onClick={()=>void fillSlot(slot.id)}>Tetapkan</button></div>:<p>Pengganti: <strong><TeamProfileLink teamId={slot.replacement_team_id}>{teamMap.get(slot.replacement_team_id||"")?.name||"—"}</TeamProfileLink></strong></p>}
   </article>)}
   {!slots.length&&<div className="workspace-card admin-inactivity-empty">Belum ada slot pengganti yang dibuka.</div>}
  </div>
  <div className="admin-inactivity-section-heading"><div><h2>Compensation ledger</h2><p>Setiap kompensasi menggunakan transaksi resmi Team Wallet → Driver Wallet.</p></div></div>
  <div className="workspace-card admin-inactivity-table-wrap"><table className="admin-inactivity-table"><thead><tr><th>Team / Driver</th><th>Season</th><th>Sisa kontrak</th><th>Gaji tahunan</th><th>Kompensasi</th><th>Status</th><th>Transaction</th></tr></thead><tbody>
   {settlements.map(s=><tr key={s.id}><td><strong><TeamProfileLink teamId={s.team_id}>{teamMap.get(s.team_id)?.name||"Team"}</TeamProfileLink></strong><small><MemberProfileLink memberId={memberMap.get(s.member_id)?.public_member_id}>{memberMap.get(s.member_id)?.character_name||"Driver"}</MemberProfileLink></small></td><td>{seasonMap.get(s.season_id)?.title||"Season"}</td><td>{s.remaining_seasons} season</td><td>{s.annual_salary_snapshot?money(Number(s.annual_salary_snapshot)):"—"}</td><td><strong>{money(Number(s.compensation_amount))}</strong></td><td><span className={"admin-inactivity-status "+s.status}>{s.status.toUpperCase()}</span>{s.error_note&&<small className="admin-inactivity-error-note">{s.error_note}</small>}</td><td>{s.transaction_id?<code>{s.transaction_id.slice(0,8)}…</code>:"—"}</td></tr>)}
  </tbody></table>{!settlements.length&&<p className="admin-inactivity-empty">Belum ada settlement kompensasi.</p>}</div>
  <div className="admin-inactivity-footnote"><Activity size={15}/> Reaktivasi membutuhkan minimal 3 aktivitas baru setelah freeze, gabungan Quest selesai dan upgrade Development. Roster season yang sudah dikunci tidak diubah di tengah season.</div>
 </section>;
}
