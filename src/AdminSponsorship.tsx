import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,RefreshCw,Send,Handshake,Target,Coins,Newspaper} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Sponsor={id:string;name:string;available_budget:number|null;is_active:boolean};
type Season={id:string;title:string};
type Member={id:string;character_name:string|null;role:string|null};
type Team={id:string;name:string};
type Offer={id:string;sponsor_id:string;target_kind:string;target_member_id:string|null;target_team_id:string|null;season_id:string;proposed_amount:number;status:string;terms:Record<string,unknown>;expires_at:string|null};
type Revision={id:string;offer_id:string;actor_kind:string;amount:number;terms:Record<string,unknown>;response:string;created_at:string};
type Contract={id:string;offer_id:string;sponsor_id:string;target_kind:string;target_member_id:string|null;target_team_id:string|null;season_id:string;contract_amount:number;status:string};
type Target={id:string;contract_id:string;title:string;metric_key:string;target_value:number;current_value:number;bonus_amount:number;status:string};
const money=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function AdminSponsorship({session}:{session:Session}){
 const [sponsors,setSponsors]=useState<Sponsor[]>([]),[seasons,setSeasons]=useState<Season[]>([]),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]);
 const [offers,setOffers]=useState<Offer[]>([]),[revisions,setRevisions]=useState<Revision[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[targets,setTargets]=useState<Target[]>([]);
 const [sponsorId,setSponsorId]=useState(""),[targetKind,setTargetKind]=useState<"driver"|"team">("driver"),[targetId,setTargetId]=useState(""),[seasonId,setSeasonId]=useState(""),[amount,setAmount]=useState(""),[terms,setTerms]=useState(""),[expires,setExpires]=useState("");
 const [counterOfferId,setCounterOfferId]=useState<string|null>(null),[counterAmount,setCounterAmount]=useState(""),[counterTerms,setCounterTerms]=useState("");
 const [contractId,setContractId]=useState(""),[targetTitle,setTargetTitle]=useState(""),[metricKey,setMetricKey]=useState(""),[targetValue,setTargetValue]=useState(""),[bonusAmount,setBonusAmount]=useState(""),[dueAt,setDueAt]=useState("");
 const [progressTargetId,setProgressTargetId]=useState(""),[progressValue,setProgressValue]=useState(""),[progressNote,setProgressNote]=useState("");
 const [payoutContractId,setPayoutContractId]=useState(""),[payoutTargetId,setPayoutTargetId]=useState(""),[payoutAmount,setPayoutAmount]=useState(""),[payoutDescription,setPayoutDescription]=useState("");
 const [storyContractId,setStoryContractId]=useState(""),[storyType,setStoryType]=useState(""),[storyHeadline,setStoryHeadline]=useState(""),[storyBody,setStoryBody]=useState(""),[storyVisibility,setStoryVisibility]=useState("participants");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const [s,se,m,t,o,r,c,ta]=await Promise.all([
   supabase.from("caleris_sponsors").select("id,name,available_budget,is_active").order("name"),
   supabase.from("license_seasons").select("id,title").order("starts_on",{ascending:false}),
   supabase.from("members").select("id,character_name,role").order("character_name"),
   supabase.from("teams").select("id,name").order("name"),
   supabase.from("caleris_sponsorship_offers").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_offer_revisions").select("*").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_contracts").select("*").order("started_at",{ascending:false}),
   supabase.from("caleris_sponsorship_targets").select("*").order("created_at",{ascending:false})
  ]);
  const err=[s.error,se.error,m.error,t.error,o.error,r.error,c.error,ta.error].find(Boolean);if(err)setNotice(err.message);
  setSponsors((s.data||[]) as Sponsor[]);setSeasons((se.data||[]) as Season[]);setMembers((m.data||[]) as Member[]);setTeams((t.data||[]) as Team[]);
  setOffers((o.data||[]) as Offer[]);setRevisions((r.data||[]) as Revision[]);setContracts((c.data||[]) as Contract[]);setTargets((ta.data||[]) as Target[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const targetOptions=targetKind==="driver"?members.filter(m=>m.role==="Driver").map(m=>({id:m.id,label:m.character_name||"Driver"})):teams.map(t=>({id:t.id,label:t.name}));
 const memberName=(id:string|null)=>members.find(m=>m.id===id)?.character_name||"Driver";
 const teamName=(id:string|null)=>teams.find(t=>t.id===id)?.name||"Team";
 const sponsorName=(id:string)=>sponsors.find(s=>s.id===id)?.name||"Sponsor";
 const lastRevision=(id:string)=>revisions.find(r=>r.offer_id===id);
 const run=async(action:string,args:Record<string,unknown>,success:string)=>{
  if(!supabase)return;setSaving(true);setNotice("");const {data,error}=await supabase.rpc(action,args);setSaving(false);
  if(error){setNotice(error.message);return}setNotice(success);await refresh();return data;
 };
 const createOffer=async()=>{
  if(!sponsorId||!targetId||!seasonId)return;const value=Number(amount);
  if(!Number.isFinite(value)||value<0||Number(value.toFixed(2))!==value){setNotice("Nilai offer tidak valid.");return}
  await run("admin_create_sponsorship_offer",{p_sponsor_id:sponsorId,p_target_kind:targetKind,p_target_id:targetId,p_season_id:seasonId,p_amount:value,p_terms:{summary:terms.trim()},p_expires_at:expires?new Date(expires).toISOString():null},"Sponsorship offer dibuat dan dikirim ke target.");
  setTargetId("");setAmount("");setTerms("");setExpires("");
 };
 const respondOffer=async(id:string,action:"accept"|"reject"|"counter")=>{
  const value=Number(counterAmount);
  if(action==="counter"&&(!Number.isFinite(value)||value<0||Number(value.toFixed(2))!==value)){setNotice("Nominal counter tidak valid.");return}
  await run("admin_respond_sponsorship_offer",{p_offer_id:id,p_action:action,p_amount:action==="counter"?value:null,p_terms:{summary:counterTerms.trim()}} ,action==="accept"?"Counter member diterima dan kontrak dibuat.":action==="reject"?"Negosiasi sponsor ditolak.":"Counter sponsor dikirim ke member.");
  setCounterOfferId(null);setCounterAmount("");setCounterTerms("");
 };
 const createTarget=async()=>{
  if(!contractId)return;await run("admin_create_sponsorship_target",{p_contract_id:contractId,p_title:targetTitle,p_description:null,p_metric_key:metricKey,p_target_value:Number(targetValue),p_bonus_amount:Number(bonusAmount),p_due_at:dueAt?new Date(dueAt).toISOString():null},"Target sponsorship dibuat.");
  setTargetTitle("");setMetricKey("");setTargetValue("");setBonusAmount("");setDueAt("");
 };
 const recordProgress=async()=>{if(!progressTargetId)return;await run("admin_record_sponsorship_progress",{p_target_id:progressTargetId,p_new_value:Number(progressValue),p_note:progressNote||null},"Progress sponsorship diperbarui.");setProgressValue("");setProgressNote("")};
 const pay=async()=>{if(!payoutContractId)return;await run("admin_pay_sponsorship_contract",{p_contract_id:payoutContractId,p_amount:Number(payoutAmount),p_description:payoutDescription,p_target_id:payoutTargetId||null},"Payout sponsorship berhasil diposting melalui Sponsor Source.");setPayoutAmount("");setPayoutDescription("");setPayoutTargetId("")};
 const story=async()=>{if(!storyContractId)return;await run("admin_create_sponsorship_story_event",{p_contract_id:storyContractId,p_event_type:storyType,p_headline:storyHeadline,p_body:storyBody,p_visibility:storyVisibility},"Story event dipublikasikan.");setStoryType("");setStoryHeadline("");setStoryBody("")};
 return <section className="workspace admin-sponsorship-workspace">
  <Link className="back-link" to="/admin/operations"><ArrowLeft size={16}/> Operations Suite</Link>
  <header className="page-heading"><span className="section-eyebrow">ADMIN CONTROL · SPONSORSHIP</span><h1 className="page-title">Sponsorship Engine</h1><p className="page-description">Kelola offer, negosiasi, kontrak, target, progress, storyline, dan payout dari Sponsor Source.</p></header>
  <div className="sponsor-admin-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">NEW OFFER</span><h2>Buat sponsorship offer</h2></div><Handshake size={18}/></div>
    <div className="economy-form"><label>Sponsor<select value={sponsorId} onChange={e=>setSponsorId(e.target.value)}><option value="">Pilih sponsor</option>{sponsors.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.name} · {s.available_budget==null?"Budget belum diatur":money(s.available_budget)}</option>)}</select></label><label>Target kind<select value={targetKind} onChange={e=>{setTargetKind(e.target.value as "driver"|"team");setTargetId("")}}><option value="driver">Driver</option><option value="team">Team</option></select></label><label>Target<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Pilih target</option>{targetOptions.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label><label>Season<select value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>Contract offer (¢p)<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Offer summary / terms<textarea rows={3} value={terms} onChange={e=>setTerms(e.target.value)} placeholder="Target kontrak, benefit, kewajiban, dan catatan sponsor"/></label><label>Expiry (opsional)<input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)}/></label><button className="economy-primary-button" disabled={saving||!sponsorId||!targetId||!seasonId} onClick={()=>void createOffer()}><Send size={15}/> Kirim offer</button></div>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">OFFER PIPELINE</span><h2>{offers.length} offers</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/></button></div>
    {offers.length===0?<p className="economy-empty">Belum ada sponsorship offer.</p>:<div className="ops-record-list">{offers.map(o=>{const latest=lastRevision(o.id);return <article key={o.id}><div><strong>{sponsorName(o.sponsor_id)} · {o.target_kind==="driver"?memberName(o.target_member_id):teamName(o.target_team_id)}</strong><small>{o.status.toUpperCase()} · Latest {latest?money(latest.amount):money(o.proposed_amount)} · {latest?.actor_kind||"—"}</small></div>{o.status==="negotiating"&&latest?.actor_kind==="member"&&<div className="ops-record-actions"><button onClick={()=>void respondOffer(o.id,"accept")} disabled={saving}>Accept</button><button onClick={()=>{setCounterOfferId(counterOfferId===o.id?null:o.id);setCounterAmount(String(latest.amount));setCounterTerms(String(latest.terms?.summary||""))}}>Counter</button><button onClick={()=>void respondOffer(o.id,"reject")} disabled={saving}>Reject</button></div>}{counterOfferId===o.id&&<div className="sponsor-counter-form"><label>Counter amount<input type="number" min="0" step="0.01" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)}/></label><label>Terms<textarea rows={2} value={counterTerms} onChange={e=>setCounterTerms(e.target.value)}/></label><button onClick={()=>void respondOffer(o.id,"counter")} disabled={saving}>Kirim counter</button></div>}</article>})}</div>}
   </section>
  </div>
  <div className="sponsor-admin-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">CONTRACT TARGETS</span><h2>Targets & progress</h2></div><Target size={18}/></div>
    <div className="economy-form"><label>Active contract<select value={contractId} onChange={e=>setContractId(e.target.value)}><option value="">Pilih kontrak</option>{contracts.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{sponsorName(c.sponsor_id)} · {c.target_kind==="driver"?memberName(c.target_member_id):teamName(c.target_team_id)} · {money(c.contract_amount)}</option>)}</select></label><label>Target title<input value={targetTitle} onChange={e=>setTargetTitle(e.target.value)}/></label><label>Metric key<input value={metricKey} onChange={e=>setMetricKey(e.target.value)} placeholder="Contoh key metrik internal"/></label><label>Target value<input type="number" step="0.01" value={targetValue} onChange={e=>setTargetValue(e.target.value)}/></label><label>Bonus amount (¢p)<input type="number" min="0" step="0.01" value={bonusAmount} onChange={e=>setBonusAmount(e.target.value)}/></label><label>Due date<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label><button className="economy-primary-button" onClick={()=>void createTarget()} disabled={saving||!contractId||!targetTitle||!metricKey}>Buat target</button>
     <label>Target progress<select value={progressTargetId} onChange={e=>setProgressTargetId(e.target.value)}><option value="">Pilih target</option>{targets.map(t=><option key={t.id} value={t.id}>{t.title} · {t.current_value}/{t.target_value}</option>)}</select></label><label>Current value<input type="number" step="0.01" value={progressValue} onChange={e=>setProgressValue(e.target.value)}/></label><label>Progress note<textarea rows={2} value={progressNote} onChange={e=>setProgressNote(e.target.value)}/></label><button className="economy-secondary-button" onClick={()=>void recordProgress()} disabled={saving||!progressTargetId||progressValue===""}>Update progress</button>
    </div>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">CONTRACT REGISTER</span><h2>{contracts.length} contracts</h2></div></div>
    {contracts.length===0?<p className="economy-empty">Belum ada kontrak aktif.</p>:<div className="ops-record-list">{contracts.map(c=><article key={c.id}><div><strong>{sponsorName(c.sponsor_id)} · {c.target_kind==="driver"?memberName(c.target_member_id):teamName(c.target_team_id)}</strong><small>{money(c.contract_amount)} · {c.status.toUpperCase()} · {targets.filter(t=>t.contract_id===c.id).length} targets</small></div></article>)}</div>}
   </section>
  </div>
  <div className="sponsor-admin-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">SPONSOR PAYOUT</span><h2>Pay contract / bonus</h2></div><Coins size={18}/></div>
    <div className="economy-form"><label>Contract<select value={payoutContractId} onChange={e=>{setPayoutContractId(e.target.value);setPayoutTargetId("")}}><option value="">Pilih kontrak aktif</option>{contracts.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{sponsorName(c.sponsor_id)} · {c.target_kind==="driver"?memberName(c.target_member_id):teamName(c.target_team_id)}</option>)}</select></label><label>Achieved target (opsional)<select value={payoutTargetId} onChange={e=>setPayoutTargetId(e.target.value)}><option value="">Contract payment</option>{targets.filter(t=>t.contract_id===payoutContractId&&t.status==="achieved").map(t=><option key={t.id} value={t.id}>{t.title} · Bonus {money(t.bonus_amount)}</option>)}</select></label><label>Amount (¢p)<input type="number" min="0.01" step="0.01" value={payoutAmount} onChange={e=>setPayoutAmount(e.target.value)}/></label><label>Description<input value={payoutDescription} onChange={e=>setPayoutDescription(e.target.value)}/></label><button className="economy-primary-button" onClick={()=>void pay()} disabled={saving||!payoutContractId||!payoutAmount||!payoutDescription}>Pay from Sponsor Source</button></div>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">STORYLINE</span><h2>Sponsor story event</h2></div><Newspaper size={18}/></div>
    <div className="economy-form"><label>Contract<select value={storyContractId} onChange={e=>setStoryContractId(e.target.value)}><option value="">Pilih kontrak</option>{contracts.map(c=><option key={c.id} value={c.id}>{sponsorName(c.sponsor_id)} · {c.target_kind==="driver"?memberName(c.target_member_id):teamName(c.target_team_id)}</option>)}</select></label><label>Event type<input value={storyType} onChange={e=>setStoryType(e.target.value)}/></label><label>Headline<input value={storyHeadline} onChange={e=>setStoryHeadline(e.target.value)}/></label><label>Story body<textarea rows={3} value={storyBody} onChange={e=>setStoryBody(e.target.value)}/></label><label>Visibility<select value={storyVisibility} onChange={e=>setStoryVisibility(e.target.value)}><option value="participants">Participants</option><option value="public">Public</option><option value="admin">Admin</option></select></label><button className="economy-secondary-button" onClick={()=>void story()} disabled={saving||!storyContractId||!storyType||!storyHeadline||!storyBody}>Publish story event</button></div>
   </section>
  </div>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
