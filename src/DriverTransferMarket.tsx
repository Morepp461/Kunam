import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,RefreshCw,Send,Clock3} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Member={id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string;division_key:string|null};
type Negotiation={id:string;move_type:string;driver_member_id:string;buyer_team_id:string;seller_team_id:string;agreed_amount:number|null;loan_starts_on:string|null;loan_ends_on:string|null;loan_salary_share_percent:number|null;status:string;created_at:string};
type Offer={id:string;negotiation_id:string;offered_by_member_id:string;offered_amount:number;move_type:string;note:string|null;response:string;loan_starts_on:string|null;loan_ends_on:string|null;loan_salary_share_percent:number|null;created_at:string};
type Affiliation={team_a_id:string;team_b_id:string;status:string};
const cash=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function DriverTransferMarket({session}:{session:Session}){
 const [member,setMember]=useState<Member|null>(null),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]);
 const [negotiations,setNegotiations]=useState<Negotiation[]>([]),[offers,setOffers]=useState<Offer[]>([]),[affiliations,setAffiliations]=useState<Affiliation[]>([]);
 const [driverId,setDriverId]=useState(""),[moveType,setMoveType]=useState<"transfer"|"loan">("transfer"),[offerAmount,setOfferAmount]=useState(""),[loanStart,setLoanStart]=useState(""),[loanEnd,setLoanEnd]=useState(""),[loanShare,setLoanShare]=useState(""),[note,setNote]=useState("");
 const [counterId,setCounterId]=useState<string|null>(null),[counterAmount,setCounterAmount]=useState(""),[counterType,setCounterType]=useState<"transfer"|"loan">("transfer"),[counterStart,setCounterStart]=useState(""),[counterEnd,setCounterEnd]=useState(""),[counterShare,setCounterShare]=useState(""),[counterNote,setCounterNote]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setMember(null);setLoading(false);setNotice(pe?.message||"Akun belum terhubung ke member.");return}
  const [m,t,n,o,a]=await Promise.all([
   supabase.from("caleris_member_directory").select("id,character_name,role,team_id").order("character_name"),
   supabase.from("caleris_team_directory").select("id,name,division_key").order("name"),
   supabase.from("caleris_driver_move_negotiations").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_driver_move_offers").select("*").order("created_at",{ascending:true}),
   supabase.from("caleris_team_affiliations").select("team_a_id,team_b_id,status").eq("status","accepted")
  ]);
  const err=[m.error,t.error,n.error,o.error,a.error].find(Boolean);if(err)setNotice(err.message);
  const allMembers=(m.data||[]) as Member[];setMembers(allMembers);setMember(allMembers.find(x=>x.id===p.member_id)||null);
  setTeams((t.data||[]) as Team[]);setNegotiations((n.data||[]) as Negotiation[]);setOffers((o.data||[]) as Offer[]);setAffiliations((a.data||[]) as Affiliation[]);setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);
 const ownTeamId=member?.team_id||"";
 const canRecruit=Boolean(ownTeamId&&["Owner","Principal"].includes(member?.role||""));
 const drivers=useMemo(()=>members.filter(m=>m.role==="Driver"&&m.team_id&&m.team_id!==ownTeamId&&!negotiations.some(n=>n.driver_member_id===m.id&&["offered","negotiating","seller_accepted","pending_fia","approved_waiting_window","approved","loan_active"].includes(n.status))),[members,ownTeamId,negotiations]);
 const eligibleDrivers=useMemo(()=>moveType==="loan"?drivers.filter(d=>affiliations.some(a=>(a.team_a_id===ownTeamId&&a.team_b_id===d.team_id)||(a.team_b_id===ownTeamId&&a.team_a_id===d.team_id))):drivers,[moveType,drivers,affiliations,ownTeamId]);
 const driverName=(id:string)=>members.find(m=>m.id===id)?.character_name||"Driver";
 const teamName=(id:string)=>teams.find(t=>t.id===id)?.name||"Team";
 const lastOffer=(id:string)=>offers.filter(o=>o.negotiation_id===id).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
 const start=async()=>{
  if(!supabase||!driverId)return;const amount=Number(offerAmount);
  if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100){setNotice("Nominal penawaran tidak valid.");return}
  if(moveType==="loan"&&(!loanStart||!loanEnd||loanEnd<=loanStart||loanShare==="")){setNotice("Tanggal satu season penuh dan porsi gaji Driver Loan wajib diisi.");return}
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("member_start_driver_move",{p_driver_member_id:driverId,p_move_type:moveType,p_offer_amount:amount,p_loan_starts_on:moveType==="loan"?loanStart:null,p_loan_ends_on:moveType==="loan"?loanEnd:null,p_note:note||null,p_loan_salary_share_percent:moveType==="loan"?Number(loanShare):null});
  setSaving(false);if(error){setNotice(error.message);return}
  setNotice("Penawaran terkirim ke Team Owner saat ini. Negosiasi menunggu respons.");setDriverId("");setOfferAmount("");setNote("");setLoanStart("");setLoanEnd("");setLoanShare("");await refresh();
 };
 const respond=async(id:string,action:"accept"|"reject"|"counter")=>{
  if(!supabase)return;let args:any={p_negotiation_id:id,p_action:action};
  if(action==="counter"){
   const amount=Number(counterAmount);if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100){setNotice("Nominal counter-offer tidak valid.");return}
   if(counterType==="loan"&&(!counterStart||!counterEnd||counterEnd<=counterStart||counterShare==="")){setNotice("Tanggal satu season penuh dan porsi gaji Driver Loan wajib diisi.");return}
   args={...args,p_amount:amount,p_move_type:counterType,p_note:counterNote||null,p_loan_starts_on:counterType==="loan"?counterStart:null,p_loan_ends_on:counterType==="loan"?counterEnd:null,p_loan_salary_share_percent:counterType==="loan"?Number(counterShare):null};
  }
  setSaving(true);setNotice("");const {error}=await supabase.rpc("member_respond_driver_move",args);setSaving(false);
  if(error){setNotice(error.message);return}
  setNotice(action==="accept"?"Kesepakatan dikirim ke FIA untuk peninjauan.":action==="reject"?"Penawaran ditolak.":"Counter-offer terkirim.");setCounterId(null);setCounterAmount("");setCounterNote("");await refresh();
 };
 const mine=negotiations.filter(n=>n.buyer_team_id===ownTeamId||n.seller_team_id===ownTeamId);
 return <section className="workspace transfer-market-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">MAIN EVENT · DRIVER MARKET</span><h1 className="page-title">Transfer Market</h1><p className="page-description">Rekrutmen Driver melalui penawaran, negosiasi dua pihak, dan persetujuan akhir FIA.</p></header>
  {loading?<div className="workspace-card"><p>Memuat transfer market...</p></div>:<>
   {canRecruit&&<section className="workspace-card transfer-offer-card"><div><span className="section-eyebrow">TEAM RECRUITMENT</span><h2>Rekrut Driver</h2><p>{teamName(ownTeamId)} · penawaran dikirim kepada Team Owner saat ini.</p></div>
    <div className="transfer-form">
     <label>Driver<select value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Pilih Driver dari tim lain</option>{eligibleDrivers.map(d=><option key={d.id} value={d.id}>{d.character_name||"Driver"} · {teamName(d.team_id||"")}</option>)}</select></label>
     <label>Jenis perpindahan<select value={moveType} onChange={e=>{setMoveType(e.target.value as "transfer"|"loan");setDriverId("")}}><option value="transfer">Permanent Transfer</option><option value="loan">Driver Loan</option></select></label>
     <label>Offer price / fee (¢p)<input type="number" min="0.01" step="0.01" value={offerAmount} onChange={e=>setOfferAmount(e.target.value)} required/></label>
     {moveType==="loan"&&<><div className="transfer-date-row"><label>Loan start<input type="date" value={loanStart} onChange={e=>setLoanStart(e.target.value)}/></label><label>Loan end<input type="date" value={loanEnd} onChange={e=>setLoanEnd(e.target.value)}/></label></div><label>Persentase gaji yang ditanggung tim peminjam<select required value={loanShare} onChange={e=>setLoanShare(e.target.value)}><option value="">Pilih porsi gaji</option>{Array.from({length:11},(_,i)=>i*10).map(v=><option key={v} value={String(v)}>{v}% · Tim asal {100-v}%</option>)}</select></label><p className="economy-form-hint">Driver Loan hanya untuk tim berafiliasi dan wajib mencakup satu season penuh. Total gaji tetap 100%; tim peminjam membayar porsi yang disepakati, tim asal membayar sisanya. Driver otomatis kembali ke tim asal sehari setelah tanggal akhir.</p></>}
     <label>Catatan<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Opsional"/></label>
     {moveType==="loan"&&eligibleDrivers.length===0&&<p className="economy-form-hint">Belum ada Driver yang dapat dipinjam dari tim affiliate aktif.</p>}
     <button className="action primary" onClick={()=>void start()} disabled={saving||!driverId||!eligibleDrivers.some(d=>d.id===driverId)}><Send size={15}/> Kirim penawaran</button>
    </div>
   </section>}
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">NEGOTIATION DESK</span><h2>Negosiasi tim</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {mine.length===0?<p className="muted">Belum ada negosiasi Driver yang terkait dengan tim kamu.</p>:<div className="transfer-negotiation-list">{mine.map(n=>{const last=lastOffer(n.id);const lastMember=last?members.find(m=>m.id===last.offered_by_member_id):null;const canRespond=Boolean(last&&lastMember?.team_id!==ownTeamId&&["offered","negotiating"].includes(n.status));return <article className="transfer-negotiation" key={n.id}>
     <div className="transfer-negotiation-head"><div><span className="section-eyebrow">{n.move_type==="transfer"?"PERMANENT TRANSFER":"DRIVER LOAN"}</span><h3>{driverName(n.driver_member_id)}</h3><p>{teamName(n.buyer_team_id)} ← {teamName(n.seller_team_id)}</p></div><span className="empty-tag">{n.status.replaceAll("_"," ").toUpperCase()}</span></div>
     <div className="transfer-last-offer"><div><small>Latest offer</small><strong>{last?cash(last.offered_amount):n.agreed_amount?cash(n.agreed_amount):"—"}</strong><span>{last?teamName(lastMember?.team_id||""):"Awaiting offer"}</span></div><div><small>Move type</small><strong>{last?.move_type||n.move_type}</strong>{last?.move_type==="loan"&&<span>{last.loan_starts_on} → {last.loan_ends_on} · Peminjam {last.loan_salary_share_percent}% · Asal {100-(last.loan_salary_share_percent||0)}%</span>}</div></div>
     {last?.note&&<p className="transfer-note">{last.note}</p>}
     {canRespond&&<div className="transfer-response-actions"><button className="action primary" disabled={saving} onClick={()=>void respond(n.id,"accept")}>Accept offer</button><button className="action" disabled={saving} onClick={()=>{setCounterId(counterId===n.id?null:n.id);setCounterType(last.move_type as "transfer"|"loan");setCounterAmount("");setCounterStart("");setCounterEnd("");setCounterShare(last?.loan_salary_share_percent==null?"":String(last.loan_salary_share_percent));setCounterNote("")}}>Negotiate</button><button className="action" disabled={saving} onClick={()=>void respond(n.id,"reject")}>Reject</button></div>}
     {counterId===n.id&&<div className="transfer-counter-form"><label>Jenis<select value={counterType} onChange={e=>setCounterType(e.target.value as "transfer"|"loan")}><option value="transfer">Permanent Transfer</option><option value="loan">Driver Loan</option></select></label><label>Counter amount (¢p)<input type="number" min="0.01" step="0.01" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)} required/></label>{counterType==="loan"&&<><div className="transfer-date-row"><label>Loan start<input type="date" value={counterStart} onChange={e=>setCounterStart(e.target.value)}/></label><label>Loan end<input type="date" value={counterEnd} onChange={e=>setCounterEnd(e.target.value)}/></label></div><label>Porsi gaji tim peminjam<select value={counterShare} onChange={e=>setCounterShare(e.target.value)} required><option value="">Pilih porsi gaji</option>{Array.from({length:11},(_,i)=>i*10).map(v=><option key={v} value={String(v)}>{v}% · Tim asal {100-v}%</option>)}</select></label></>}<label>Catatan<textarea rows={2} value={counterNote} onChange={e=>setCounterNote(e.target.value)}/></label><button className="action primary" disabled={saving} onClick={()=>void respond(n.id,"counter")}>Kirim counter-offer</button></div>}
     {n.status==="pending_fia"&&<p className="transfer-status-note"><Clock3 size={15}/> Kesepakatan menunggu peninjauan FIA.</p>}
     {n.status==="approved_waiting_window"&&<p className="transfer-status-note"><Clock3 size={15}/> {n.move_type==="loan"?"Disetujui FIA. Aktivasi hanya pada tanggal mulai season dan membutuhkan saldo fee yang cukup.":"Disetujui FIA. Eksekusi menunggu Transfer Window dan saldo tim yang mencukupi."}</p>}
     {n.status==="executed"&&<p className="transfer-status-note">Transfer permanen selesai. Driver sudah menjadi anggota tim pembeli.</p>}
     {n.status==="loan_active"&&<p className="transfer-status-note">Driver sedang menjalani loan satu season. Tim peminjam menanggung {n.loan_salary_share_percent}% gaji dan tim asal menanggung {100-(n.loan_salary_share_percent||0)}%.</p>}
     {n.status==="loan_returned"&&<p className="transfer-status-note">Masa loan selesai. Driver sudah otomatis kembali ke tim asal.</p>}
     {n.status==="expired"&&<p className="transfer-status-note">Masa mulai loan terlewat sebelum aktivasi FIA dan fee berhasil diproses. Tidak ada perpindahan tim atau pembayaran fee.</p>}
     {n.status==="rejected"&&<p className="transfer-status-note">Negosiasi ditolak dan tidak ada saldo atau tim yang berubah.</p>}
     </article>})}</div>}
   </section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
