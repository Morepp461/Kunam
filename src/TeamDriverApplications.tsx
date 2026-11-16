import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, Users } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./main-event-registration.css";

type Application=Record<string,any>;
export default function TeamDriverApplications(){
 const [rows,setRows]=useState<Application[]>([]);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setNotice("Supabase belum dikonfigurasi.");setLoading(false);return;}
  const client=supabase;
  setLoading(true);setNotice("");
  const {data,error}=await supabase.rpc("team_list_driver_applications");
  if(error){setNotice(error.message);setRows([]);setLoading(false);return;}
  const list=Array.isArray(data)?data as Application[]:[];
  const withImages=await Promise.all(list.map(async row=>{
   const {data:signed}=await client.storage.from("profile-avatars").createSignedUrl(row.avatar_path,900);
   return {...row,avatar_url:signed?.signedUrl||""};
  }));
  setRows(withImages);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 return <section className="workspace mer-workspace"><header className="page-heading mer-admin-heading"><div><span className="section-eyebrow">TEAM PANEL · DRIVER RECRUITMENT</span><h1 className="page-title">Driver Applications</h1><p className="page-description">Lamaran Driver yang dikirim melalui formulir registrasi Main Event.</p></div><button className="mer-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
 {notice&&<div className="mer-notice">{notice}</div>}
 {loading?<div className="mer-panel"><LoaderCircle className="mer-spin"/> Memuat lamaran...</div>:rows.length===0?<div className="mer-panel"><Users/><h2>Belum ada lamaran Driver</h2><p>Lamaran dari kandidat yang memilih tim ini akan muncul di sini.</p></div>:<div className="mer-admin-list">{rows.map(row=><article className="mer-admin-card" key={row.id}><div className="mer-admin-card-head"><div><span className="mer-status">NEW APPLICATION</span><h2>{row.nickname}</h2><p>{row.nationality} · {row.hometown}</p></div><time>{new Date(row.created_at).toLocaleDateString("id-ID",{dateStyle:"medium"})}</time></div><div className="mer-admin-identity"><div className="mer-admin-image">{row.avatar_url?<img src={row.avatar_url} alt="Avatar Driver"/>:<Users/>}</div><div><span>Driver Number</span><strong>{row.driver_number_preference}</strong><span>Julukan</span><strong>{row.driver_epithet||"—"}</strong></div></div></article>)}</div>}</section>;
}
