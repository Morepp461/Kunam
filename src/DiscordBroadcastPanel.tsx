import { useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./discord-broadcast.css";

export default function DiscordBroadcastPanel() {
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [event,setEvent]=useState("fia_announcement");
  const [url,setUrl]=useState("https://calerismastersnewgen-mu.vercel.app/");
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState("");
  const [failed,setFailed]=useState(false);

  const send=async()=>{
    if(!supabase||!title.trim()||!description.trim()){setFailed(true);setMessage("Judul dan isi pengumuman wajib diisi.");return;}
    try{
      setSending(true);setMessage("");setFailed(false);
      const {data,error}=await supabase.functions.invoke("caleris-discord-notify",{body:{event,title:title.trim(),description:description.trim(),url:url.trim()||undefined}});
      if(error||data?.error){setFailed(true);setMessage(data?.error||error?.message||"Pengiriman gagal.");}
      else{setMessage("Notifikasi berhasil dikirim ke Discord.");setTitle("");setDescription("");}
    }catch(e){setFailed(true);setMessage(e instanceof Error?e.message:"Pengiriman gagal.");}
    finally{setSending(false);}
  };

  return <section className="workspace discord-broadcast">
    <header><span className="section-eyebrow">FIA · COMMUNITY BROADCAST</span><h1>Discord Broadcast</h1><p>Kirim pengumuman resmi CALERIS ke channel Discord yang terhubung.</p></header>
    <div className="workspace-card discord-broadcast-card">
      <label>Event type<select value={event} onChange={e=>setEvent(e.target.value)}><option value="fia_announcement">FIA Announcement</option><option value="race_result">Official Race Result</option><option value="season_update">Season Update</option><option value="paddock_story">Paddock Story</option></select></label>
      <label>Judul<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={240} placeholder="Judul pengumuman"/></label>
      <label>Isi pengumuman<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={3500} rows={7} placeholder="Tulis informasi resmi untuk komunitas..."/></label>
      <label>Link resmi (opsional)<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://calerismastersnewgen-mu.vercel.app/"/></label>
      {message&&<p className={failed?"discord-broadcast-error":"discord-broadcast-success"} role="status">{message}</p>}
      <button className="action primary" onClick={()=>void send()} disabled={sending||!title.trim()||!description.trim()}><Send size={16}/>{sending?"Mengirim...":"Kirim ke Discord"}</button>
      <p className="discord-broadcast-footnote"><ShieldCheck size={15}/> Endpoint hanya menerima sesi FIA/Admin. Mention Discord dinonaktifkan untuk mencegah ping massal. Tambahkan DISCORD_WEBHOOK_URL pada Supabase Function Secrets agar pengiriman aktif.</p>
    </div>
  </section>;
}
