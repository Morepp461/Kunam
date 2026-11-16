import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, RefreshCw, ShieldCheck, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./main-event-registration.css";

type Registration=Record<string,any>;
const dateLabel=(value:string)=>new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

export default function AdminRegisteredMembers(){
 const [rows,setRows]=useState<Registration[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 const [notes,setNotes]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{
  if(!supabase){setNotice("Supabase belum dikonfigurasi.");setLoading(false);return;}
  const client=supabase;
  setLoading(true);setNotice("");
  const {data,error}=await supabase.rpc("admin_list_member_registrations_v2");
  if(error){setNotice(error.message);setRows([]);setLoading(false);return;}
  const list=Array.isArray(data)?data as Registration[]:[];
  const signed=await Promise.all(list.map(async row=>{
   let avatarUrl="";
   let teamLogoUrl="";
   if(row.avatar_path){
    const {data:signedData}=await client.storage.from("profile-avatars").createSignedUrl(row.avatar_path,900);
    avatarUrl=signedData?.signedUrl||"";
   }
   if(row.team_logo_path){
    const {data:publicData}=client.storage.from("team-logos").getPublicUrl(row.team_logo_path);
    teamLogoUrl=publicData.publicUrl;
   }
   return {...row,preview_url:avatarUrl,team_logo_url:teamLogoUrl};
  }));
  setRows(signed);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const review=async(row:Registration,decision:"approve"|"reject")=>{
  if(!supabase)return;
  setBusy(row.id);setNotice("");
  const {error}=await supabase.rpc("admin_review_main_event_registration_v2",{p_registration_id:row.id,p_decision:decision,p_review_note:notes[row.id]||null});
  setBusy("");
  if(error){setNotice(error.message);return;}
  setNotice(decision==="approve"?"Pendaftaran disetujui. Role dan wallet telah diproses.":"Pendaftaran ditolak.");
  await load();
 };
 const pending=rows.filter(row=>row.status==="pending");
 return <section className="workspace mer-workspace">
  <header className="page-heading mer-admin-heading"><div><span className="section-eyebrow">ADMIN CONTROL · MAIN EVENT</span><h1 className="page-title">Registered Member</h1><p className="page-description">Pemeriksaan seluruh formulir pendaftaran Driver dan Team Owner sebelum aktivasi role.</p></div><button className="mer-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
  <div className="mer-admin-stats"><article><span>Total pengajuan</span><strong>{rows.length}</strong></article><article><span>Menunggu review</span><strong>{pending.length}</strong></article><article><span>Disetujui</span><strong>{rows.filter(row=>row.status==="approved").length}</strong></article><article><span>Ditolak</span><strong>{rows.filter(row=>row.status==="rejected").length}</strong></article></div>
  {notice&&<div className="mer-notice" role="status">{notice}</div>}
  {loading?<div className="mer-panel">Memuat seluruh formulir...</div>:rows.length===0?<div className="mer-panel"><Clock3/><h2>Belum ada pendaftaran</h2><p>Pengajuan dari Main Event akan muncul di halaman ini.</p></div>:<div className="mer-admin-list">{rows.map(row=><article className="mer-admin-card" key={row.id}>
   <div className="mer-admin-card-head"><div><span className="mer-status">{row.status==="pending"?"PENDING":row.status==="approved"?"APPROVED":"REJECTED"}</span><h2>{row.nickname}</h2><p>{row.email||row.user_id} · {row.requested_role==="Driver"?"Driver":"Team Owner"}</p></div><time>{dateLabel(row.created_at)}</time></div>
   <div className="mer-admin-identity"><div className="mer-admin-image">{row.preview_url?<img src={row.preview_url} alt={row.requested_role==="Driver"?"Avatar Driver":"Logo Tim"}/>:<ShieldCheck/>}</div><div><span>Nationality</span><strong>{row.nationality}</strong><span>Hometown</span><strong>{row.hometown}</strong><span>Member ID</span><strong>{row.member_id||"Belum dibuat"}</strong></div></div>
   {row.requested_role==="Driver"?<div className="mer-admin-details"><div><span>Driver Number</span><strong>{row.driver_number_preference}</strong></div><div><span>Preferensi Tim</span><strong>{row.preferred_team_name||"Belum memilih"}</strong></div><div><span>Julukan</span><strong>{row.driver_epithet||"—"}</strong></div></div>:<div className="mer-admin-details mer-team-details"><div className="mer-admin-logo-preview">{row.team_logo_url?<img src={row.team_logo_url} alt="Logo Tim"/>:"Logo tim belum tersedia"}</div><div><span>Nama Tim</span><strong>{row.team_name}</strong></div><div><span>Base Nation</span><strong>{row.team_base_nation}</strong></div><div><span>Hometown</span><strong>{row.team_hometown}</strong></div><div><span>Tahun Berdiri</span><strong>{row.team_founded_year}</strong></div><div><span>Deskripsi</span><p>{row.team_description}</p></div><div><span>Visi</span><p>{row.team_vision}</p></div><div><span>Target Jangka Panjang</span><p>{row.team_long_term_target}</p></div><div><span>Divisi Awal</span><strong>{row.initial_division?.toUpperCase()||"—"}</strong></div><div><span>Engine</span><strong>{row.engine_choice==="new"?"Pembuatan Baru: "+(row.requested_engine_name||"—"):"Pembelian Engine"}</strong></div><div><span>Engine ID pilihan</span><strong>{row.selected_engine_name||"—"}</strong></div></div>}
   {row.status==="pending"?<div className="mer-review"><label>Catatan Admin (opsional)<textarea value={notes[row.id]||""} onChange={e=>setNotes(v=>({...v,[row.id]:e.target.value}))} rows={2} maxLength={500}/></label><div><button className="mer-reject" onClick={()=>void review(row,"reject")} disabled={Boolean(busy)}><X size={15}/> Tolak</button><button className="mer-approve" onClick={()=>void review(row,"approve")} disabled={Boolean(busy)}>{busy===row.id?"Memproses...":<><Check size={15}/> ACC & Aktifkan</>}</button></div></div>:row.review_note?<p className="mer-review-note">Catatan: {row.review_note}</p>:null}
  </article>)}</div>}
 </section>;
}
