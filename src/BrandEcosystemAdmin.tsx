import {useCallback,useEffect,useState} from "react";
import {Activity,Coins,Handshake,RefreshCw,ShieldCheck,Users} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import {TeamProfileLink} from "./EntityProfileLink";

type Sponsor={id:string;name:string;tier_key:string|null;available_budget:number|null;is_active:boolean};
type Team={id:string;name:string};
type Offer={id:string;sponsor_id:string;target_team_id:string|null;status:string;proposed_amount:number;counter_count:number;created_at:string;expires_at:string|null};
type Revision={id:string;offer_id:string;actor_kind:string;amount:number;response:string;terms:Record<string,unknown>;created_at:string};
type Contract={id:string;sponsor_id:string;target_team_id:string|null;contract_amount:number;annual_contract_amount:number|null;status:string;duration_seasons:number;renewal_status:string;bonus_pool_total:number;bonus_pool_paid:number};
type Target={contract_id:string;title:string;current_value:number;target_value:number;bonus_amount:number;status:string};
type Payment={contract_id:string;amount:number;status:string;due_at:string;paid_at:string|null};
type Payout={contract_id:string;amount:number;description:string;created_at:string};
type Fan={entity_kind:string;population:number};
const money=(v:number|null|undefined)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
const num=(v:number)=>Number(v||0).toLocaleString("id-ID");
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}):"—";

export default function BrandEcosystemAdmin({session}:{session:Session}){
 const [sponsors,setSponsors]=useState<Sponsor[]>([]);
 const [teams,setTeams]=useState<Team[]>([]);
 const [offers,setOffers]=useState<Offer[]>([]);
 const [revisions,setRevisions]=useState<Revision[]>([]);
 const [contracts,setContracts]=useState<Contract[]>([]);
 const [targets,setTargets]=useState<Target[]>([]);
 const [payments,setPayments]=useState<Payment[]>([]);
 const [payouts,setPayouts]=useState<Payout[]>([]);
 const [fans,setFans]=useState<Fan[]>([]);
 const [teamScores,setTeamScores]=useState<number[]>([]);
 const [driverScores,setDriverScores]=useState<number[]>([]);
 const [trustScores,setTrustScores]=useState<number[]>([]);
 const [reputationWeights,setReputationWeights]=useState<Record<string,number>>({championship:25,race_performance:25,consistency:15,experience:10,fan_popularity:15,professional_record:10,form:5,morale:5,confidence:5});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 const refresh=useCallback(async()=>{
  if(!supabase){setError("Supabase belum dikonfigurasi.");setLoading(false);return;}
  setLoading(true);setError("");
  const [s,t,o,r,c,ta,ps,po,f,tr,dr,trust,weights]=await Promise.all([
   supabase.from("caleris_sponsors").select("id,name,tier_key,available_budget,is_active").order("name"),
   supabase.from("teams").select("id,name").order("name"),
   supabase.from("caleris_sponsorship_offers").select("id,sponsor_id,target_team_id,status,proposed_amount,counter_count,created_at,expires_at").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_offer_revisions").select("id,offer_id,actor_kind,amount,response,terms,created_at").order("created_at").order("id"),
   supabase.from("caleris_sponsorship_contracts").select("id,sponsor_id,target_team_id,contract_amount,annual_contract_amount,status,duration_seasons,renewal_status,bonus_pool_total,bonus_pool_paid").order("started_at",{ascending:false}),
   supabase.from("caleris_sponsorship_targets").select("contract_id,title,current_value,target_value,bonus_amount,status").order("created_at",{ascending:false}),
   supabase.from("caleris_sponsorship_payment_schedule").select("contract_id,amount,status,due_at,paid_at").order("due_at",{ascending:false}),
   supabase.from("caleris_sponsorship_payouts").select("contract_id,amount,description,created_at").order("created_at",{ascending:false}),
   supabase.from("caleris_fan_populations").select("entity_kind,population"),
   supabase.from("caleris_team_reputation").select("score"),
   supabase.from("caleris_driver_reputation").select("score"),
   supabase.from("caleris_sponsorship_season_evaluations").select("trust_score"),
   supabase.from("caleris_brand_ecosystem_config").select("config_value").eq("config_key","driver_reputation_weights").maybeSingle()
  ]);
  const issue=[s.error,t.error,o.error,r.error,c.error,ta.error,ps.error,po.error,f.error,tr.error,dr.error,trust.error,weights.error].find(Boolean);
  if(issue){setError(issue.message);setLoading(false);return;}
  setSponsors((s.data||[]) as Sponsor[]);setTeams((t.data||[]) as Team[]);
  setOffers((o.data||[]) as Offer[]);setRevisions((r.data||[]) as Revision[]);
  setContracts((c.data||[]) as Contract[]);setTargets((ta.data||[]) as Target[]);
  setPayments((ps.data||[]) as Payment[]);setPayouts((po.data||[]) as Payout[]);
  setFans((f.data||[]) as Fan[]);
  setTeamScores((tr.data||[]).map(x=>Number(x.score||0)));
  setDriverScores((dr.data||[]).map(x=>Number(x.score||0)));
  setTrustScores((trust.data||[]).map(x=>Number(x.trust_score||0)));
  setReputationWeights((weights.data?.config_value||{championship:25,race_performance:25,consistency:15,experience:10,fan_popularity:15,professional_record:10,form:5,morale:5,confidence:5}) as Record<string,number>);
  setLoading(false);
 },[session.user.id]);

 useEffect(()=>{void refresh()},[refresh]);
 const sponsorName=(id:string)=>sponsors.find(s=>s.id===id)?.name||"Sponsor";
 const teamName=(id:string|null)=><TeamProfileLink teamId={id||undefined}>{teams.find(t=>t.id===id)?.name||"Team"}</TeamProfileLink>;
 const history=(id:string)=>revisions.filter(r=>r.offer_id===id).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const latest=(id:string)=>history(id).at(-1);
 const awaitingOwner=offers.filter(o=>o.status==="offered"&&latest(o.id)?.actor_kind==="admin");
 const awaitingEngine=offers.filter(o=>o.status==="negotiating"&&latest(o.id)?.actor_kind==="member");
 const activeContracts=contracts.filter(c=>c.status==="active");
 const totalFans=fans.reduce((sum,f)=>sum+Number(f.population||0),0);
 const paidTotal=payouts.reduce((sum,p)=>sum+Number(p.amount||0),0);
 const scheduledTotal=payments.filter(p=>p.status==="scheduled").reduce((sum,p)=>sum+Number(p.amount||0),0);

 if(loading)return <section className="workspace brand-ecosystem"><div className="workspace-card">Memuat status Brand Ecosystem...</div></section>;
 return <section className="workspace brand-ecosystem">
  <Link className="back-link" to="/admin/operations">← Operations Suite</Link>
  <header className="page-heading">
   <span className="section-eyebrow">ADMIN CONTROL · AUTOMATED GAME SYSTEM</span>
   <h1 className="page-title">Brand Ecosystem</h1>
   <p className="page-description">Mesin sponsor, reputasi, fanbase, negosiasi, target, dan pembayaran berjalan otomatis mengikuti aktivitas game.</p>
  </header>
  {error&&<div className="license-notice" role="alert">{error}</div>}
  <div className="section-title-row">
   <div><span className="section-eyebrow">LIVE ENGINE STATUS</span><h2>Ringkasan Sistem</h2></div>
   <button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button>
  </div>
  <div className="brand-stats">
   <article><span>ACTIVE SPONSORS</span><strong>{num(sponsors.filter(s=>s.is_active).length)}</strong><small>Brand dalam sponsor pool</small></article>
   <article><span>ACTIVE CONTRACTS</span><strong>{num(activeContracts.length)}</strong><small>Partnership berjalan</small></article>
   <article><span>FAN POPULATION</span><strong>{num(totalFans)}</strong><small>Regional fans seluruh game</small></article>
   <article><span>SPONSOR PAYOUTS</span><strong>{money(paidTotal)}</strong><small>Sudah dibayarkan ke Economy Ledger</small></article>
  </div>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">REPUTATION CONFIGURATION · READ ONLY</span><h2>Driver Reputation Weights</h2></div></div>
   <p className="brand-card-help">Form, Morale, dan Confidence kini menjadi komponen reputasi Driver. Nilai dihitung dari lima race terakhir, tren lima race sebelumnya, serta status kontrak. Bobot dinormalisasi oleh engine. Pengubahan konfigurasi hanya tersedia di Sponsor Management Center.</p>
   <div className="brand-grid">{Object.entries(reputationWeights).map(([key,value])=><div className="brand-compact-list" key={key}><strong>{key.replaceAll("_"," ")}</strong><span>{Number(value).toLocaleString("id-ID")}</span></div>)}</div>
   <Link className="text-link" to="/admin/sponsorship">Ubah konfigurasi di Sponsor Management Center →</Link>
  </section>
  <section className="brand-grid">
   <article className="workspace-card">
    <span className="section-eyebrow">AUTOMATION</span><h2><Activity size={17}/> Race & Reputation Engine</h2>
    <p className="brand-card-help">Setiap hasil race yang dipublikasikan otomatis memperbarui reputasi tim dan driver, fan growth/decline, progres target sponsor, lalu mencari sponsor yang cocok.</p>
    <div className="brand-compact-list">
     <div><strong>Team Reputation</strong><span>{num(teamScores.length)} tim sudah memiliki skor</span></div>
     <div><strong>Driver Reputation</strong><span>{num(driverScores.length)} driver sudah memiliki skor</span></div>
     <div><strong>Fan Population</strong><span>{num(fans.length)} populasi regional tercatat</span></div>
    </div>
   </article>
   <article className="workspace-card">
    <span className="section-eyebrow">NEGOTIATION ENGINE</span><h2><Handshake size={17}/> Counter & Sponsor Response</h2>
    <p className="brand-card-help">Counter dari Team Owner langsung diproses sponsor engine. Tidak perlu Admin menekan tombol AI Sponsor Respond.</p>
    <div className="brand-compact-list">
     <div><strong>Menunggu keputusan Team Owner</strong><span>{num(awaitingOwner.length)} penawaran</span></div>
     <div><strong>Menunggu respons otomatis sponsor</strong><span>{num(awaitingEngine.length)} negosiasi</span></div>
     <div><strong>Batas negosiasi</strong><span>Maksimal 3 counter dari Team Owner</span></div>
    </div>
   </article>
   <article className="workspace-card">
    <span className="section-eyebrow">AUTOMATIC SETTLEMENT</span><h2><Coins size={17}/> Sponsor Payments</h2>
    <p className="brand-card-help">Pembayaran kontrak yang jatuh tempo dan bonus target yang tercapai diproses otomatis melalui Sponsor Source dan Economy Ledger. Scheduler berjalan setiap 15 menit.</p>
    <div className="brand-compact-list">
     <div><strong>Menunggu jadwal bayar</strong><span>{money(scheduledTotal)}</span></div>
     <div><strong>Riwayat pembayaran</strong><span>{num(payouts.length)} transaksi</span></div>
     <div><strong>Bonus pool aktif</strong><span>{money(activeContracts.reduce((n,c)=>n+Number(c.bonus_pool_total||0)-Number(c.bonus_pool_paid||0),0))} tersisa</span></div>
    </div>
   </article>
   <article className="workspace-card">
    <span className="section-eyebrow">SPONSOR TRUST</span><h2><ShieldCheck size={17}/> Season Evaluation</h2>
    <p className="brand-card-help">Saat divisi menyelesaikan season, Sponsor Trust otomatis dihitung dari pencapaian target, konsistensi, fanbase, eksposur komersial, dan partnership conduct.</p>
    <div className="brand-compact-list">
     <div><strong>Evaluasi tersimpan</strong><span>{num(trustScores.length)} kontrak-season</span></div>
     <div><strong>Rata-rata Trust Score</strong><span>{trustScores.length?num(Math.round(trustScores.reduce((a,b)=>a+b,0)/trustScores.length))+"/100":"Belum ada evaluasi"}</span></div>
    </div>
   </article>
  </section>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">SPONSOR OFFERS</span><h2>Penawaran & Riwayat Counter</h2></div></div>
   <p className="brand-card-help">Alur counter: Sponsor mengirim penawaran awal → Team Owner menerima, menolak, atau counter → sponsor otomatis menerima, menolak, atau membalas dengan angka baru. Maksimal tiga counter dari Owner. Jika sponsor membalas counter, Owner mendapat giliran berikutnya.</p>
   {offers.slice(0,12).map(o=><article className="brand-list-item" key={o.id}>
    <div><strong>{sponsorName(o.sponsor_id)} → {teamName(o.target_team_id)}</strong><span>{money(Number(latest(o.id)?.amount??o.proposed_amount))} · {o.status} · {o.counter_count||0}/3 counter</span>
     <div className="brand-revision-timeline">{history(o.id).map((r,i)=><span key={o.id+"-"+i}>{r.actor_kind==="member"?"Team Owner":"Sponsor"}: {money(Number(r.amount))} <small>({r.response||"menunggu"})</small></span>)}</div>
    </div>
   </article>)}
   {offers.length===0&&<p className="muted">Belum ada penawaran sponsor.</p>}
  </section>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">CONTRACT PORTFOLIO</span><h2>Kontrak & Target</h2></div></div>
   {activeContracts.map(c=><article className="brand-contract" key={c.id}>
    <div className="brand-list-item"><div><strong>{sponsorName(c.sponsor_id)} · {teamName(c.target_team_id)}</strong><span>{money(Number(c.annual_contract_amount??c.contract_amount))} per season · {c.duration_seasons} season</span></div><span className="brand-contract-status">{c.renewal_status}</span></div>
    <div className="brand-progress-meta"><span>Bonus pool terpakai</span><strong>{money(Number(c.bonus_pool_paid))} / {money(Number(c.bonus_pool_total))}</strong></div>
    <div className="brand-progress"><i style={{width:Math.min(100,Number(c.bonus_pool_total)?Number(c.bonus_pool_paid)/Number(c.bonus_pool_total)*100:0)+"%"}}/></div>
    {targets.filter(t=>t.contract_id===c.id).map((t,i)=><div className="brand-target" key={c.id+"-"+i}><div><strong>{t.title}</strong><small>{num(Number(t.current_value))} / {num(Number(t.target_value))} · {t.status}</small></div><span>Bonus {money(Number(t.bonus_amount))}</span></div>)}
   </article>)}
   {activeContracts.length===0&&<p className="muted">Belum ada kontrak aktif.</p>}
  </section>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">PAYMENT LEDGER</span><h2>Jadwal & Riwayat Pembayaran</h2></div></div>
   {[...payments].sort((a,b)=>b.due_at.localeCompare(a.due_at)).slice(0,10).map((p,i)=><article className="brand-list-item" key={p.contract_id+"-"+i}>
    <div><strong>{sponsorName(contracts.find(c=>c.id===p.contract_id)?.sponsor_id||"")} · {teamName(contracts.find(c=>c.id===p.contract_id)?.target_team_id||null)}</strong><span>{money(Number(p.amount))} · jatuh tempo {date(p.due_at)}</span></div><span className="brand-contract-status">{p.status}</span>
   </article>)}
   {payments.length===0&&<p className="muted">Belum ada jadwal pembayaran.</p>}
  </section>
  <p className="brand-note"><Users size={15}/> Admin cukup memantau. Tidak ada tombol manual untuk menghitung reputasi, mengubah fanbase, membuat penawaran, merespons counter, atau memproses settlement.</p>
 </section>;
}
