import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,RefreshCw,Send} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Member={id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string;division_key:string|null;takeover_listed:boolean;latest_valuation:number|null;minimum_offer?:number|null;maximum_offer?:number|null};
type Takeover={id:string;target_team_id:string;buyer_member_id:string;seller_member_id:string;valuation_id:string;agreed_amount:number|null;status:string;created_at:string;transaction_id?:string|null;settled_at?:string|null};
type Offer={id:string;takeover_id:string;offered_by_member_id:string;offered_amount:number;response:string;note:string|null;created_at:string};
const cash=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function TeamTakeoverMarket({session}:{session:Session}){
 const [member,setMember]=useState<Member|null>(null),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]),[offerBounds,setOfferBounds]=useState<Record<string,{minimum_offer:number|null;maximum_offer:number|null}>>({});
 const [takeovers,setTakeovers]=useState<Takeover[]>([]),[offers,setOffers]=useState<Offer[]>([]);
 const [targetTeamId,setTargetTeamId]=useState(""),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [counterId,setCounterId]=useState<string|null>(null),[counterAmount,setCounterAmount]=useState(""),[counterNote,setCounterNote]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe){setMember(null);setLoading(false);setNotice(pe.message);return}
  const [m,t,n,o,b]=await Promise.all([
   supabase.from("caleris_member_directory").select("id,character_name,role,team_id").order("character_name"),
   supabase.from("caleris_team_directory").select("id,name,division_key,takeover_listed,latest_valuation").order("name"),
   supabase.from("caleris_team_takeovers").select("id,target_team_id,buyer_member_id,seller_member_id,valuation_id,agreed_amount,status,created_at,transaction_id,settled_at").order("created_at",{ascending:false}),
   supabase.from("caleris_team_takeover_offers").select("*").order("created_at",{ascending:true}),
   supabase.from("caleris_team_takeover_offer_bounds").select("team_id,minimum_offer,maximum_offer")
  ]);
  const err=[m.error,t.error,n.error,o.error,b.error].find(Boolean);
  if(err)setNotice(err.message);
  const all=(m.data||[]) as Member[];
  setMembers(all);setMember(p?.member_id?all.find(x=>x.id===p.member_id)||null:null);
  setTeams((t.data||[]) as Team[]);setOfferBounds(Object.fromEntries((b.data||[]).map((x:any)=>[x.team_id,{minimum_offer:x.minimum_offer,maximum_offer:x.maximum_offer}])));setTakeovers((n.data||[]) as Takeover[]);setOffers((o.data||[]) as Offer[]);
  setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);

 const ownTeam=teams.find(t=>t.id===member?.team_id);
 const canList=Boolean(ownTeam&&member?.role==="Owner");
 const canBuy=Boolean(member&&(member.role===null||member.role==="Driver"||member.role==="FIA"));
 const targets=useMemo(()=>teams,[teams]);
 const selectedTarget=targets.find(t=>t.id===targetTeamId);const selectedBounds=selectedTarget?offerBounds[selectedTarget.id]:null;
 const teamName=(id:string)=>teams.find(t=>t.id===id)?.name||"Team";
 const memberName=(id:string)=>members.find(m=>m.id===id)?.character_name||"Member";
 const memberRole=(id:string)=>members.find(m=>m.id===id)?.role||"Public Member";
 const lastOffer=(id:string)=>offers.filter(o=>o.takeover_id===id).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];

 const setListing=async(value:boolean)=>{
  if(!supabase)return;setSaving(true);
  const {error}=await supabase.rpc("member_set_team_takeover_listing",{p_is_listed:value});
  setSaving(false);setNotice(error?.message||(value?"Tim dibuka untuk Take Over.":"Listing Take Over ditutup."));
  await refresh();
 };
 const start=async()=>{
  if(!supabase||!targetTeamId)return;
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value){setNotice("Nominal penawaran tidak valid.");return}
  setSaving(true);
  const {error}=await supabase.rpc("member_start_team_takeover",{p_target_team_id:targetTeamId,p_offer_amount:value,p_note:note||null});
  setSaving(false);
  if(error){setNotice(error.message);return}
  setNotice("Penawaran Take Over dikirim kepada Team Owner.");
  setTargetTeamId("");setAmount("");setNote("");
  await refresh();
 };
 const respond=async(id:string,action:"accept"|"reject"|"counter")=>{
  if(!supabase)return;
  const value=Number(counterAmount);
  if(action==="counter"&&(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value)){setNotice("Counter-offer tidak valid.");return}
  setSaving(true);
  const {error}=await supabase.rpc("member_respond_team_takeover",{
   p_takeover_id:id,p_action:action,p_amount:action==="counter"?value:null,p_note:action==="counter"?counterNote||null:null
  });
  setSaving(false);
  if(error){setNotice(error.message);return}
  setNotice(action==="accept"?"Kesepakatan dikirim ke FIA untuk ditinjau.":action==="reject"?"Penawaran ditolak.":"Counter-offer terkirim.");
  setCounterId(null);setCounterAmount("");setCounterNote("");
  await refresh();
 };

 const mine=takeovers.filter(t=>t.buyer_member_id===member?.id||t.seller_member_id===member?.id);
 return <section className="workspace takeover-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">MAIN EVENT · TEAM MARKET</span><h1 className="page-title">Team Take Over</h1><p className="page-description">Public Member, Driver, dan FIA dapat mengajukan pembelian tim. Kesepakatan diselesaikan setelah persetujuan FIA.</p></header>
  {loading?<div className="workspace-card"><p>Memuat Team Take Over...</p></div>:<>
   {canList&&<section className="workspace-card takeover-listing-card"><div><span className="section-eyebrow">YOUR TEAM LISTING</span><h2>{ownTeam?.name}</h2><p>Listing saat ini: {ownTeam?.takeover_listed?"Terbuka":"Tertutup"}</p></div><button className="action" disabled={saving} onClick={()=>void setListing(!ownTeam?.takeover_listed)}>{ownTeam?.takeover_listed?"Tutup listing":"Buka untuk Take Over"}</button></section>}
   {canBuy&&<section className="workspace-card takeover-offer-card"><div><span className="section-eyebrow">ACQUISITION OFFER</span><h2>Ajukan Take Over</h2><p>Penawaran mengikuti rentang valuasi dan batas negosiasi yang dikonfigurasi Admin.</p></div><div className="takeover-form"><label>Tim target<select value={targetTeamId} onChange={e=>setTargetTeamId(e.target.value)}><option value="">Pilih tim</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name} · {t.division_key||"Tier belum ditentukan"} · {t.latest_valuation==null?"Valuasi belum dibuat":t.takeover_listed?"Listing terbuka":"Tidak membuka listing"}</option>)}</select>{targets.length===0&&<small>Belum ada tim yang membuka listing dengan valuation snapshot.</small>}</label><label>Offer price (¢p)<input type="number" min={selectedBounds?.minimum_offer??0.01} max={selectedBounds?.maximum_offer??undefined} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/><small>{selectedTarget&&selectedTarget.latest_valuation!=null&&selectedBounds?`Rentang penawaran: ${cash(selectedBounds.minimum_offer||0)} – ${cash(selectedBounds.maximum_offer||0)} · Valuasi ${cash(selectedTarget.latest_valuation||0)}`:selectedTarget?"Valuasi tim belum dibuat oleh Admin. Penawaran belum dapat diajukan.":"Pilih tim untuk melihat batas minimum dan maksimum sesuai konfigurasi Take Over."}</small></label><label>Catatan<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="action primary" disabled={saving||!targetTeamId||!selectedTarget?.latest_valuation||!selectedBounds?.minimum_offer||!selectedBounds?.maximum_offer} onClick={()=>void start()}><Send size={15}/> Kirim penawaran</button></div></section>}
   {!canBuy&&<p className="muted">Hanya Public Member, Driver, atau FIA yang dapat mengajukan pembelian tim. Team Owner dan Principal tidak dapat membeli tim lain.</p>}
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">TAKEOVER NEGOTIATIONS</span><h2>Negosiasi kamu</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {mine.length===0?<p className="muted">Belum ada negosiasi Take Over untuk akun ini.</p>:<div className="takeover-list">{mine.map(t=>{
     const last=lastOffer(t.id);
     const canRespond=Boolean(last&&last.offered_by_member_id!==member?.id&&["offered","negotiating"].includes(t.status));
     return <article key={t.id} className="takeover-item">
      <div className="takeover-item-head"><div><strong>{teamName(t.target_team_id)}</strong><small>Buyer: {memberName(t.buyer_member_id)} ({memberRole(t.buyer_member_id)}) · Seller: {memberName(t.seller_member_id)}</small></div><span className="empty-tag">{t.status.replaceAll("_"," ").toUpperCase()}</span></div>
      <div className="takeover-offer-value"><small>Latest offer</small><strong>{last?cash(last.offered_amount):t.agreed_amount?cash(t.agreed_amount):"—"}</strong><small>{last?memberName(last.offered_by_member_id):"Belum ada penawaran"}</small></div>
      {last?.note&&<p>{last.note}</p>}
      {canRespond&&<div className="takeover-actions"><button className="action primary" disabled={saving} onClick={()=>void respond(t.id,"accept")}>Accept</button><button className="action" disabled={saving} onClick={()=>{setCounterId(counterId===t.id?null:t.id);setCounterAmount("");setCounterNote("")}}>Counter</button><button className="action" disabled={saving} onClick={()=>void respond(t.id,"reject")}>Reject</button></div>}
      {counterId===t.id&&<div className="takeover-form takeover-counter"><label>Counter-offer (¢p)<input type="number" min="0.01" step="0.01" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)}/></label><label>Catatan<textarea rows={2} value={counterNote} onChange={e=>setCounterNote(e.target.value)}/></label><button className="action primary" disabled={saving} onClick={()=>void respond(t.id,"counter")}>Kirim counter-offer</button></div>}
      {t.status==="pending_fia"&&<small>Kesepakatan menunggu persetujuan FIA.</small>}
      {t.status==="completed"&&<small>Take Over selesai. Pembayaran tercatat di ledger dan status pembeli sudah menjadi Owner.</small>}
      {t.status==="cancelled"&&<small>Negosiasi dibatalkan karena pembeli menyelesaikan Take Over lain.</small>}
     </article>
    })}</div>}
   </section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
