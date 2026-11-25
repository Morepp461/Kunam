import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Inbox, LifeBuoy, LoaderCircle, Mail, MessageSquare, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Ticket = { id:string; user_id:string|null; sender_email:string; sender_name:string|null; subject:string; status:"open"|"pending"|"resolved"|"closed"; priority:"low"|"normal"|"high"|"urgent"; last_message_at:string; created_at:string };
type Message = { id:string; ticket_id:string; direction:"inbound"|"outbound"; sender_email:string; recipient_email:string; subject:string|null; body_text:string|null; body_html:string|null; created_at:string };
const statusLabels:Record<Ticket["status"],string>={open:"Open",pending:"In Progress",resolved:"Resolved",closed:"Closed"};
const dateLabel=(value:string)=>new Date(value).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});
const excerpt=(value:string|null)=>value?.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()||"Tidak ada isi pesan";

export default function SupportCenter({session,isAdmin}:{session:Session;isAdmin:boolean}){
 const [tickets,setTickets]=useState<Ticket[]>([]),[selected,setSelected]=useState<string|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [subject,setSubject]=useState(""),[body,setBody]=useState(""),[reply,setReply]=useState(""),[statusFilter,setStatusFilter]=useState("all"),[priority,setPriority]=useState<Ticket["priority"]>("normal");
 const activeTicket=tickets.find(t=>t.id===selected)||null;
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setError("");
  let query=supabase.from("support_tickets").select("id,user_id,sender_email,sender_name,subject,status,priority,last_message_at,created_at").order("last_message_at",{ascending:false}).limit(150);
  if(!isAdmin)query=query.eq("user_id",session.user.id);
  const {data,error:loadError}=await query;
  if(loadError)setError(loadError.message);
  setTickets((data||[]) as Ticket[]);setLoading(false);
 },[isAdmin,session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);
 const visibleTickets=useMemo(()=>tickets.filter(t=>statusFilter==="all"||t.status===statusFilter),[tickets,statusFilter]);
 const loadMessages=useCallback(async(id:string)=>{
  if(!supabase)return;setError("");
  const {data,error:loadError}=await supabase.from("support_messages").select("id,ticket_id,direction,sender_email,recipient_email,subject,body_text,body_html,created_at").eq("ticket_id",id).order("created_at",{ascending:true});
  if(loadError)setError(loadError.message);setMessages((data||[]) as Message[]);
 },[]);
 useEffect(()=>{if(selected)void loadMessages(selected);else setMessages([])},[selected,loadMessages]);
 const createTicket=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!session.user.email)return;
  if(subject.trim().length<4||body.trim().length<10){setError("Subject minimal 4 karakter dan deskripsi minimal 10 karakter.");return}
  setSaving(true);setError("");setNotice("");
  const {data:ticketId,error:ticketError}=await supabase.rpc("support_create_ticket",{p_subject:subject.trim(),p_body:body.trim(),p_priority:priority});
  if(ticketError||!ticketId){setError(ticketError?.message||"Tiket gagal dibuat.");setSaving(false);return}
  setSubject("");setBody("");setPriority("normal");setNotice("Bug report berhasil dikirim. Simpan ID tiket untuk referensi.");await refresh();setSelected(ticketId);setSaving(false);
 };
 const sendReply=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!activeTicket||reply.trim().length<2)return;
  setSaving(true);setError("");setNotice("");
  const {data,error:invokeError}=await supabase.functions.invoke("resend-support-reply",{body:{ticketId:activeTicket.id,message:reply.trim()}});
  if(invokeError||data?.error){setError(data?.error||invokeError?.message||"Balasan gagal dikirim.");setSaving(false);return}
  setReply("");await loadMessages(activeTicket.id);await refresh();setNotice("Balasan email berhasil dikirim.");setSaving(false);
 };
 const updateTicket=async(patch:Partial<Pick<Ticket,"status"|"priority">>)=>{
  if(!supabase||!activeTicket)return;setSaving(true);setError("");
  const {error:updateError}=await supabase.from("support_tickets").update({...patch,updated_at:new Date().toISOString()}).eq("id",activeTicket.id);
  if(updateError)setError(updateError.message);else{setNotice("Tiket diperbarui.");await refresh()}setSaving(false);
 };
 return <section className="workspace support-page">
  <header className="support-heading"><div><span className="section-eyebrow">{isAdmin?"ADMIN CONTROL · MEMBER SERVICES":"CALERIS MASTERS · MEMBER SERVICES"}</span><h1>{isAdmin?"Support Inbox":"Support Center"}</h1><p>{isAdmin?"Kelola bug report, pertanyaan member, status tiket, dan balasan email.":"Laporkan bug atau kendala CALERIS MASTERS dan pantau perkembangan penanganannya."}</p></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
  <div className="support-stats"><article><Inbox/><span>Total tiket</span><strong>{tickets.length}</strong></article><article><AlertCircle/><span>Open</span><strong>{tickets.filter(t=>t.status==="open").length}</strong></article><article><Clock3/><span>In Progress</span><strong>{tickets.filter(t=>t.status==="pending").length}</strong></article><article><CheckCircle2/><span>Resolved</span><strong>{tickets.filter(t=>t.status==="resolved"||t.status==="closed").length}</strong></article></div>
  {error&&<div className="support-alert error" role="alert">{error}</div>}{notice&&<div className="support-alert success" role="status">{notice}</div>}
  <div className="support-layout">
   <section className="workspace-card support-ticket-column">
    <div className="support-list-heading"><div><h2>{isAdmin?"Incoming tickets":"Laporan saya"}</h2><small>{visibleTickets.length} tiket ditampilkan</small></div>{isAdmin?<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter status"><option value="all">Semua status</option><option value="open">Open</option><option value="pending">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>:<button className="support-new-button" onClick={()=>{setSelected(null);setNotice("");}}><Plus size={15}/> Bug report</button>}</div>
    {loading?<div className="support-empty"><LoaderCircle className="support-spin"/> Memuat tiket...</div>:visibleTickets.length===0?<div className="support-empty"><LifeBuoy size={26}/><strong>Belum ada tiket</strong><span>{isAdmin?"Laporan yang masuk akan muncul di sini.":"Buat laporan pertama jika menemukan bug atau kendala."}</span></div>:<div className="support-ticket-list">{visibleTickets.map(ticket=><button type="button" key={ticket.id} className={"support-ticket-row"+(selected===ticket.id?" active":"")} onClick={()=>setSelected(ticket.id)}><div className="support-ticket-top"><strong>{ticket.subject}</strong><span className={"support-status status-"+ticket.status}>{statusLabels[ticket.status]}</span></div><span className="support-ticket-sender">{isAdmin?ticket.sender_email:"Ticket · "+ticket.id.slice(0,8).toUpperCase()}</span><small>{dateLabel(ticket.last_message_at)}</small></button>)}</div>}
   </section>
   <section className="workspace-card support-conversation">
    {!isAdmin&&!selected?<><div className="support-compose-heading"><span className="section-eyebrow">NEW SUPPORT REQUEST</span><h2>Laporkan kendala</h2><p>Jelaskan langkah yang terjadi, halaman terkait, dan hasil yang kamu harapkan. Jangan sertakan password atau API key.</p></div><form className="support-form" onSubmit={createTicket}><label>Subject<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={180} placeholder="Contoh: Tombol check-in tidak merespons" required/></label><label>Prioritas<select value={priority} onChange={e=>setPriority(e.target.value as Ticket["priority"])}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label><label>Deskripsi bug<textarea value={body} onChange={e=>setBody(e.target.value)} rows={7} maxLength={12000} placeholder="Apa yang kamu lakukan? Apa yang terjadi? Apa yang seharusnya terjadi?" required/></label><button className="economy-primary-button" disabled={saving||!session.user.email}><Send size={15}/>{saving?"Mengirim...":"Kirim bug report"}</button></form></>:!activeTicket?<div className="support-empty"><MessageSquare size={28}/><strong>Pilih tiket</strong><span>Pilih laporan dari daftar untuk melihat percakapan dan statusnya.</span></div>:<><div className="support-conversation-heading"><button className="support-back" onClick={()=>setSelected(null)}><ArrowLeft size={15}/> Kembali</button><span className="section-eyebrow">TICKET · {activeTicket.id.slice(0,8).toUpperCase()}</span><h2>{activeTicket.subject}</h2><p>{activeTicket.sender_email} · Dibuat {dateLabel(activeTicket.created_at)}</p>{isAdmin&&<div className="support-admin-controls"><label>Status<select value={activeTicket.status} onChange={e=>void updateTicket({status:e.target.value as Ticket["status"]})}><option value="open">Open</option><option value="pending">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Prioritas<select value={activeTicket.priority} onChange={e=>void updateTicket({priority:e.target.value as Ticket["priority"]})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div>}</div><div className="support-messages">{messages.map(message=><article key={message.id} className={"support-message "+(message.direction==="outbound"?"from-support":"from-member")}><div className="support-message-meta"><strong>{message.direction==="outbound"?"CALERIS Support":message.sender_email}</strong><time>{dateLabel(message.created_at)}</time></div><p>{excerpt(message.body_text||message.body_html)}</p></article>)}</div>{isAdmin&&<form className="support-reply-form" onSubmit={sendReply}><label>Balas ke {activeTicket.sender_email}<textarea rows={4} value={reply} onChange={e=>setReply(e.target.value)} maxLength={10000} placeholder="Tulis balasan untuk member..." required/></label><button className="economy-primary-button" disabled={saving||reply.trim().length<2}><Mail size={15}/>{saving?"Mengirim...":"Kirim balasan email"}</button></form>}</>}
   </section>
  </div>
  <p className="support-footnote"><ShieldCheck size={14}/> Laporan hanya dapat dilihat oleh pemilik tiket dan administrator CALERIS. Untuk laporan melalui email, gunakan support@calerismasters.com.</p>
 </section>;
}
