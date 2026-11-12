import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,RefreshCw,Send} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Member={id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string;division_key:string|null;takeover_listed:boolean};
type Takeover={id:string;target_team_id:string;buyer_member_id:string;seller_member_id:string;valuation_id:string;agreed_amount:number|null;status:string;created_at:string};
type Offer={id:string;takeover_id:string;offered_by_member_id:string;offered_amount:number;response:string;note:string|null;created_at:string};
const cash=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function TeamTakeoverMarket({session}:{session:Session}){
 const [member,setMember]=useState<Member|null>(null),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]);
 const [takeovers,setTakeovers]=useState<Takeover[]>([]),[offers,setOffers]=useState<Offer[]>([]);
 const [targetTeamId,setTargetTeamId]=useState(""),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [counterId,setCounterId]=useState<string|null>(null),[counterAmount,setCounterAmount]=useState(""),[counterNote,setCounterNote]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setMember(null);setLoading(false);setNotice(pe?.message||"Akun belum terhubung ke member.");return}
  const [m,t,n,o]=await Promise.all([
   supabase.from("members").select("id,character_name,role,team_id").order("character_name"),
   supabase.from("teams").select("id,name,division_key,takeover_listed").order("name"),
   supabase.from("caleris_team_takeovers").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_team_takeover_offers").select("*").order("created_at",{ascending:true})
  ]);
  const err=[m.error,t.error,n.error,o.error].find(Boolean);if(err)setNotice(err.message);
  const all=(m.data||[]) as Member[];setMembers(all);setMember(all.find(x=>x.id===p.member_id)||null);setTeams((t.data||[]) as Team[]);
  setTakeovers((n.data||[]) as Takeover[]);setOffers((o.data||[]) as Offer[]);setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);
 const ownTeam=teams.find(t=>t.id===member?.team_id);
 const canManage=Boolean(ownTeam&&["Owner","Principal"].includes(member?.role||""));
 const targets=useMemo(()=>teams.filter(t=>t.id!==ownTeam?.id&&t.takeover_listed),[teams,ownTeam?.id]);
 const teamName=(id:string)=>teams.find(t=>t.id===id)?.name||"Team";
 const memberName=(id:string)=>members.find(m=>m.id===id)?.character_name||"Member";
 const lastOffer=(id:string)=>offers.filter(o=>o.takeover_id===id).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
 const setListing=async(value:boolean)=>{if(!supabase)return;setSaving(true);const {error}=await supabase.rpc("member_set_team_takeover_listing",{p_is_listed:value});setSaving(false);setNotice(error?.message||(value?"Tim dibuka untuk Take Over.":"Listing Take Over ditutup."));await refresh()};
 const start=async()=>{if(!supabase||!targetTeamId)return;const value=Number(amount);if(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value){setNotice("Nominal penawaran tidak valid.");return}setSaving(true);const {error}=await supabase.rpc("member_start_team_takeover",{p_target_team_id:targetTeamId,p_offer_amount:value,p_note:note||null});setSaving(false);if(error){setNotice(error.message);return}setNotice("Penawaran Take Over dikirim kepada pemilik tim target.");setTargetTeamId("");setAmount("");setNote("");await refresh()};
 const respond=async(id:string,action:"accept"|"reject"|"counter")=>{if(!supabase)return;const value=Number(counterAmount);if(action==="counter"&&(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value)){setNotice("Counter-offer tidak valid.");return}setSaving(true);const {error}=await supabase.rpc("member_respond_team_takeover",{p_takeover_id:id,p_action:action,p_amount:action==="counter"?value:null,p_note:action==="counter"?counterNote||null:null});setSaving(false);if(error){setNotice(error.message);return}setNotice(action==="accept"?"Kesepakatan dikirim ke FIA.":action==="reject"?"Penawaran ditolak.":"Counter-offer terkirim.");setCounterId(null);setCounterAmount("");setCounterNote("");await refresh()};
 const mine=takeovers.filter(t=>t.target_team_id===ownTeam?.id||members.find(m=>m.id===t.buyer_member_id)?.team_id===ownTeam?.id);
 return <section className="workspace takeover-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">MAIN EVENT · TEAM MARKET</span><h1 className="page-title">Team Take Over</h1><p className="page-description">Negosiasi pengambilalihan tim berdasarkan snapshot valuasi dan persetujuan FIA.</p></header>
  {loading?<div className="workspace-card"><p>Memuat Team Take Over...</p></div>:<>
   {canManage&&<section className="workspace-card takeover-listing-card"><div><span className="section-eyebrow">YOUR TEAM LISTING</span><h2>{ownTeam?.name}</h2><p>Listing saat ini: {ownTeam?.takeover_listed?"Terbuka":"Tertutup"}</p></div><button className="action" disabled={saving} onClick={()=>void setListing(!ownTeam?.takeover_listed)}>{ownTeam?.takeover_listed?"Tutup listing":"Buka untuk Take Over"}</button></section>}
   {canManage&&<section className="workspace-card takeover-offer-card"><div><span className="section-eyebrow">ACQUISITION OFFER</span><h2>Ajukan Take Over</h2><p>Penawaran divalidasi terhadap batas valuasi yang diatur Admin.</p></div><div className="takeover-form"><label>Tim target<select value={targetTeamId} onChange={e=>setTargetTeamId(e.target.value)}><option value="">Pilih tim yang membuka listing</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name} · {t.division_key||"Tier belum ditentukan"}</option>)}</select></label><label>Offer price (¢p)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>Catatan<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="action primary" disabled={saving||!targetTeamId} onClick={()=>void start()}><Send size={15}/> Kirim penawaran</button></div></section>}
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">TAKEOVER NEGOTIATIONS</span><h2>Negosiasi berjalan</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {mine.length===0?<p className="muted">Belum ada negosiasi Take Over untuk tim kamu.</p>:<div className="takeover-list">{mine.map(t=>{const last=lastOffer(t.id);const lastMember=last?members.find(m=>m.id===last.offered_by_member_id):null;const buyerTeam=members.find(m=>m.id===t.buyer_member_id)?.team_id;const canRespond=Boolean(last&&lastMember?.team_id!==ownTeam?.id&&["offered","negotiating"].includes(t.status));return <article key={t.id} className="takeover-item"><div className="takeover-item-head"><div><strong>{teamName(t.target_team_id)}</strong><small>Buyer: {teamName(buyerTeam||"")} · Seller: {memberName(t.seller_member_id)}</small></div><span className="empty-tag">{t.status.replaceAll("_"," ").toUpperCase()}</span></div><div className="takeover-offer-value"><small>Latest offer</small><strong>{last?cash(last.offered_amount):t.agreed_amount?cash(t.agreed_amount):"—"}</strong><small>{lastMember?.team_id?teamName(lastMember.team_id):"—"}</small></div>{last?.note&&<p>{last.note}</p>}{canRespond&&<div className="takeover-actions"><button className="action primary" disabled={saving} onClick={()=>void respond(t.id,"accept")}>Accept</button><button className="action" disabled={saving} onClick={()=>{setCounterId(counterId===t.id?null:t.id);setCounterAmount("");setCounterNote("")}}>Counter</button><button className="action" disabled={saving} onClick={()=>void respond(t.id,"reject")}>Reject</button></div>}{counterId===t.id&&<div className="takeover-form takeover-counter"><label>Counter-offer (¢p)<input type="number" min="0.01" step="0.01" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)}/></label><label>Catatan<textarea rows={2} value={counterNote} onChange={e=>setCounterNote(e.target.value)}/></label><button className="action primary" disabled={saving} onClick={()=>void respond(t.id,"counter")}>Kirim counter-offer</button></div>}{t.status==="pending_fia"&&<small>Menunggu peninjauan FIA.</small>}{t.status==="approved"&&<small>Disetujui FIA. Eksekusi kepemilikan menunggu aturan window dan perlakuan aset/liabilitas.</small>}</article>})}</div>}
   </section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
