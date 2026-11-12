import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,Handshake,RefreshCw,ShieldCheck} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Member={id:string;role:string|null;team_id:string|null};
type Team={id:string;name:string;division_key:string|null};
type Affiliation={id:string;team_a_id:string;team_b_id:string;requested_by_team_id:string;status:string;agreement:Record<string,unknown>;created_at:string;updated_at:string};
export default function TeamAffiliate({session}:{session:Session}){
 const [member,setMember]=useState<Member|null>(null),[teams,setTeams]=useState<Team[]>([]),[rows,setRows]=useState<Affiliation[]>([]);
 const [targetId,setTargetId]=useState(""),[note,setNote]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setMember(null);setRows([]);setLoading(false);setNotice(pe?.message||"Akun belum terhubung ke member.");return}
  const [m,t,a]=await Promise.all([
   supabase.from("members").select("id,role,team_id").eq("id",p.member_id).maybeSingle(),
   supabase.from("teams").select("id,name,division_key").order("name"),
   supabase.from("caleris_team_affiliations").select("*").order("created_at",{ascending:false})
  ]);
  const err=[m.error,t.error,a.error].find(Boolean);if(err)setNotice(err.message);
  setMember(m.data as Member|null);setTeams((t.data||[]) as Team[]);setRows((a.data||[]) as Affiliation[]);setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);
 const ownTeam=teams.find(t=>t.id===member?.team_id);
 const eligible=useMemo(()=>teams.filter(t=>t.id!==member?.team_id&&t.division_key&&ownTeam?.division_key&&t.division_key!==ownTeam.division_key&&!rows.some(r=>["pending","accepted"].includes(r.status)&&(r.team_a_id===t.id||r.team_b_id===t.id))),[teams,member?.team_id,ownTeam?.division_key,rows]);
 const create=async()=>{
  if(!supabase||!targetId)return;setSaving(true);setNotice("");
  const {error}=await supabase.rpc("member_request_team_affiliation",{p_target_team_id:targetId,p_agreement:{note:note.trim()}});
  setSaving(false);if(error){setNotice(error.message);return}setNotice("Permintaan affiliate dikirim ke Team Owner tujuan.");setTargetId("");setNote("");await refresh();
 };
 const decide=async(id:string,accept:boolean)=>{
  if(!supabase)return;setSaving(true);const {error}=await supabase.rpc("member_decide_team_affiliation",{p_affiliation_id:id,p_accept:accept});setSaving(false);setNotice(error?.message||(accept?"Affiliate diterima.":"Permintaan affiliate ditolak."));await refresh();
 };
 const terminate=async(id:string)=>{
  if(!supabase||!window.confirm("Akhiri perjanjian affiliate ini?"))return;setSaving(true);const {error}=await supabase.rpc("member_terminate_team_affiliation",{p_affiliation_id:id});setSaving(false);setNotice(error?.message||"Afiliasi diakhiri.");await refresh();
 };
 const teamName=(id:string)=>teams.find(t=>t.id===id)?.name||"Team";
 const canManage=Boolean(member?.team_id&&["Owner","Principal"].includes(member.role||""));
 return <section className="workspace affiliate-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">TEAM PANEL · PARTNERSHIP</span><h1 className="page-title">Affiliate Team</h1><p className="page-description">Satu tim hanya dapat memiliki satu affiliate dan hubungan hanya dapat dibentuk antar-tier berbeda.</p></header>
  {loading?<div className="workspace-card"><p>Memuat data affiliate...</p></div>:!canManage?<div className="workspace-card affiliate-empty"><ShieldCheck/><strong>Akses Team Owner diperlukan</strong><p>Hubungkan akun dengan role Owner atau Principal dan sebuah tim untuk mengelola affiliate.</p></div>:<>
   <div className="workspace-card affiliate-create"><div><span className="section-eyebrow">YOUR TEAM</span><h2>{ownTeam?.name||"Team belum ditentukan"}</h2><p>Tier: {ownTeam?.division_key||"Belum ditetapkan Admin"}</p></div>
    <div className="affiliate-form"><label>Tim dari tier berbeda<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Pilih calon affiliate</option>{eligible.map(t=><option key={t.id} value={t.id}>{t.name} · {t.division_key}</option>)}</select></label><label>Catatan perjanjian (opsional)<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Catatan yang ingin disampaikan ke tim tujuan"/></label><button className="action primary" onClick={()=>void create()} disabled={saving||!targetId}>Kirim permintaan</button></div>
   </div>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">AFFILIATION REGISTER</span><h2>Permintaan & perjanjian</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {rows.length===0?<p className="muted">Belum ada permintaan atau perjanjian affiliate.</p>:<div className="ops-record-list">{rows.map(r=>{const outgoing=r.requested_by_team_id===member?.team_id;const incoming=!outgoing&&(r.team_a_id===member?.team_id||r.team_b_id===member?.team_id);return <article key={r.id}><div><strong>{teamName(r.team_a_id)} × {teamName(r.team_b_id)}</strong><small>{outgoing?"Permintaan keluar":incoming?"Permintaan masuk":"Affiliate"} · {String(r.agreement?.note||"Tanpa catatan")}</small><small>Status: {r.status.toUpperCase()}</small></div><div className="ops-record-actions">{r.status==="pending"&&incoming&&<><button onClick={()=>void decide(r.id,true)} disabled={saving}>Terima</button><button onClick={()=>void decide(r.id,false)} disabled={saving}>Tolak</button></>}{r.status==="accepted"&&(r.team_a_id===member?.team_id||r.team_b_id===member?.team_id)&&<button onClick={()=>void terminate(r.id)} disabled={saving}>Akhiri</button>}</div></article>})}</div>}
   </section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
