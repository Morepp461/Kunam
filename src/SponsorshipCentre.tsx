import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,Handshake,RefreshCw,CheckCircle2,Clock3} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Member={id:string;role:string|null;team_id:string|null;character_name:string|null};
type Offer={id:string;sponsor_id:string;target_kind:string;target_member_id:string|null;target_team_id:string|null;season_id:string;proposed_amount:number;terms:Record<string,unknown>;status:string;expires_at:string|null};
type Revision={id:string;offer_id:string;actor_kind:string;amount:number;terms:Record<string,unknown>;response:string;created_at:string};
type Contract={id:string;sponsor_id:string;target_kind:string;season_id:string;contract_amount:number;terms:Record<string,unknown>;status:string;started_at:string};
type Target={id:string;contract_id:string;title:string;description:string|null;target_value:number;current_value:number;bonus_amount:number;due_at:string|null;status:string};
type Story={id:string;contract_id:string;event_type:string;headline:string;body:string;visibility:string;created_at:string};
type Payout={id:string;contract_id:string;target_id:string|null;amount:number;description:string;paid_at:string};
const cash=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function SponsorshipCentre({session}:{session:Session}){
 const [member,setMember]=useState<Member|null>(null),[offers,setOffers]=useState<Offer[]>([]),[revisions,setRevisions]=useState<Revision[]>([]);
 const [contracts,setContracts]=useState<Contract[]>([]),[targets,setTargets]=useState<Target[]>([]),[stories,setStories]=useState<Story[]>([]),[payouts,setPayouts]=useState<Payout[]>([]);
 const [counterId,setCounterId]=useState<string|null>(null),[counterAmount,setCounterAmount]=useState(""),[counterTerms,setCounterTerms]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setMember(null);setLoading(false);setNotice(pe?.message||"Akun belum terhubung ke member.");return}
  const [m,o,r,c,t,s,pa]=await Promise.all([
   supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle(),
   supabase.from("caleris_sponsorship_offers").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_offer_revisions").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_contracts").select("*").order("started_at",{ascending:false}),
   supabase.from("caleris_sponsorship_targets").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_story_events").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_payouts").select("*").order("paid_at",{ascending:false})
  ]);
  const err=[m.error,o.error,r.error,c.error,t.error,s.error,pa.error].find(Boolean);if(err)setNotice(err.message);
  setMember(m.data as Member|null);setOffers((o.data||[]) as Offer[]);setRevisions((r.data||[]) as Revision[]);
  setContracts((c.data||[]) as Contract[]);setTargets((t.data||[]) as Target[]);setStories((s.data||[]) as Story[]);setPayouts((pa.data||[]) as Payout[]);
  setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void refresh()},[refresh]);
 const latest=(id:string)=>revisions.find(r=>r.offer_id===id);
 const decide=async(id:string,action:"accept"|"reject"|"counter")=>{
  if(!supabase)return;const value=Number(counterAmount);
  if(action==="counter"&&(!Number.isFinite(value)||value<0||Math.round(value*100)!==value*100)){setNotice("Nominal counter-offer tidak valid.");return}
  setSaving(true);setNotice("");const {error}=await supabase.rpc("member_respond_sponsorship_offer",{p_offer_id:id,p_action:action,p_counter_amount:action==="counter"?value:null,p_terms:{summary:counterTerms.trim()}});
  setSaving(false);if(error){setNotice(error.message);return}
  setNotice(action==="accept"?"Offer diterima. Kontrak sponsorship aktif.":action==="reject"?"Offer ditolak.":"Counter-offer dikirim kepada sponsor untuk ditinjau Admin.");
  setCounterId(null);setCounterAmount("");setCounterTerms("");await refresh();
 };
 const sponsorName=(id:string)=>offers.find(o=>o.sponsor_id===id)?.sponsor_id||id;
 return <section className="workspace sponsorship-centre">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">MEMBER WORKSPACE · SPONSORSHIP</span><h1 className="page-title">Sponsorship</h1><p className="page-description">Lihat sponsor offer, negosiasi kontrak, target, bonus, payout, dan storyline yang terkait dengan karakter atau tim kamu.</p></header>
  {loading?<div className="workspace-card"><p>Memuat sponsorship...</p></div>:!member?<div className="workspace-card"><p>Member belum terhubung.</p></div>:<>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">SPONSOR OFFERS</span><h2>Offer masuk</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {offers.length===0?<p className="muted">Belum ada sponsor offer untuk akun atau tim kamu.</p>:<div className="sponsorship-list">{offers.map(o=>{const last=latest(o.id);return <article key={o.id}><div className="sponsorship-item-head"><div><span className="section-eyebrow">{o.target_kind.toUpperCase()} · {o.status.toUpperCase()}</span><h3>{sponsorName(o.sponsor_id)}</h3><strong>{cash(last?.amount??o.proposed_amount)}</strong><p>{String(last?.terms?.summary||o.terms?.summary||"Ketentuan akan ditampilkan di sini.")}</p></div>{o.expires_at&&<small>Expiry {new Date(o.expires_at).toLocaleDateString("id-ID")}</small>}</div>
     {["offered","negotiating"].includes(o.status)&&last?.actor_kind==="admin"&&<div className="sponsorship-actions"><button className="action primary" disabled={saving} onClick={()=>void decide(o.id,"accept")}><CheckCircle2 size={15}/> Accept</button><button className="action" disabled={saving} onClick={()=>void decide(o.id,"counter")}>Negotiate</button><button className="action" disabled={saving} onClick={()=>void decide(o.id,"reject")}>Reject</button></div>}
     {counterId===o.id&&<div className="sponsorship-counter"><label>Counter amount (¢p)<input type="number" min="0" step="0.01" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)}/></label><label>Counter terms<textarea rows={2} value={counterTerms} onChange={e=>setCounterTerms(e.target.value)}/></label><button className="action primary" disabled={saving} onClick={()=>void decide(o.id,"counter")}>Kirim counter-offer</button></div>}
    </article>})}</div>}
   </section>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">ACTIVE CONTRACTS</span><h2>Kontrak & target</h2></div><Handshake size={18}/></div>
    {contracts.length===0?<p className="muted">Belum ada kontrak sponsorship.</p>:<div className="sponsorship-list">{contracts.map(c=><article key={c.id}><div className="sponsorship-item-head"><div><h3>{sponsorName(c.sponsor_id)}</h3><strong>{cash(c.contract_amount)}</strong><p>{c.status.toUpperCase()} · {new Date(c.started_at).toLocaleDateString("id-ID")}</p></div></div>{targets.filter(t=>t.contract_id===c.id).map(t=><div className="sponsorship-target" key={t.id}><div><strong>{t.title}</strong><small>{t.description||t.status} · Bonus {cash(t.bonus_amount)}</small></div><div className="sponsorship-progress"><span>{t.current_value} / {t.target_value}</span><div><i style={{width:Math.min(100,Math.max(0,t.current_value/t.target_value*100))+"%"}}/></div><small>{t.status.toUpperCase()}{t.due_at?" · Due "+new Date(t.due_at).toLocaleDateString("id-ID"):""}</small></div></div>)}</article>)}</div>}
   </section>
   <div className="sponsorship-lower-grid"><section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">STORYLINE</span><h2>Sponsor news</h2></div><Clock3 size={18}/></div>{stories.length===0?<p className="muted">Belum ada storyline sponsorship.</p>:stories.map(s=><article className="sponsorship-story" key={s.id}><small>{s.event_type} · {new Date(s.created_at).toLocaleDateString("id-ID")}</small><h3>{s.headline}</h3><p>{s.body}</p></article>)}</section>
    <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">PAYOUT HISTORY</span><h2>Riwayat payout</h2></div></div>{payouts.length===0?<p className="muted">Belum ada payout sponsorship.</p>:payouts.map(p=><article className="sponsorship-payout" key={p.id}><strong>{cash(p.amount)}</strong><small>{p.description} · {new Date(p.paid_at).toLocaleDateString("id-ID")}</small></article>)}</section>
   </div>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
