import {useCallback,useEffect,useState} from "react";
import {RefreshCw,ShieldCheck,Tag} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./team-engine-market.css";

type OwnedEngine={id:string;name:string;asking_price:number|null;is_for_sale:boolean};
type Team={id:string;name:string};
export default function TeamEngineMarket({session}:{session:Session}){
 const [team,setTeam]=useState<Team|null>(null);
 const [engines,setEngines]=useState<OwnedEngine[]>([]);
 const [prices,setPrices]=useState<Record<string,string>>({});
 const [sale,setSale]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Profil member belum terhubung.");setLoading(false);return;}
  const {data:m,error:me}=await supabase.from("members").select("team_id,role").eq("id",p.member_id).maybeSingle();
  if(me||m?.role!=="Owner"||!m.team_id){setNotice(me?.message||"Fitur ini hanya tersedia untuk Team Owner.");setLoading(false);return;}
  const [t,e]=await Promise.all([
   supabase.from("teams").select("id,name").eq("id",m.team_id).maybeSingle(),
   supabase.rpc("team_list_owned_engines")
  ]);
  if(t.error||e.error){setNotice(t.error?.message||e.error?.message||"Gagal memuat engine.");setLoading(false);return;}
  const list=(e.data||[]) as OwnedEngine[];
  setTeam(t.data as Team|null);setEngines(list);
  setPrices(Object.fromEntries(list.map(x=>[x.id,x.asking_price==null?"":String(x.asking_price)])));
  setSale(Object.fromEntries(list.map(x=>[x.id,x.is_for_sale])));
  setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void load();},[load]);
 const save=async(engine:OwnedEngine)=>{
  if(!supabase)return;setSaving(engine.id);setNotice("");
  const isForSale=Boolean(sale[engine.id]);
  const price=Number(prices[engine.id]);
  if(isForSale&&(!Number.isFinite(price)||price<5000000||price>25000000)){setNotice("Harga jual wajib antara €5.000.000 dan €25.000.000.");setSaving("");return;}
  const {error}=await supabase.rpc("team_set_engine_sale_listing",{p_engine_id:engine.id,p_is_for_sale:isForSale,p_asking_price:isForSale?price:null});
  setSaving("");if(error){setNotice(error.message);return;}setNotice(isForSale?"Engine berhasil dipasang di Engine Market.":"Penawaran engine berhasil ditarik.");await load();
 };
 return <section className="workspace tem-workspace">
  <header className="page-heading"><span className="section-eyebrow">TEAM PANEL · ENGINE MARKET</span><h1 className="page-title">Engine Market</h1><p className="page-description">Atur harga penjualan engine milik tim. Harga hanya dapat ditetapkan antara €5 juta dan €25 juta.</p></header>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
  {loading?<div className="workspace-card">Memuat engine tim...</div>:!team?<div className="workspace-card tem-empty"><ShieldCheck/><strong>Akses Team Owner diperlukan</strong></div>:<div className="workspace-card tem-card">
   <div className="tem-head"><div><span className="section-eyebrow">YOUR TEAM</span><h2>{team.name}</h2></div><button className="economy-secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
   {engines.length===0?<p className="muted">Tim belum memiliki engine yang dapat ditawarkan.</p>:engines.map(engine=><article className="tem-engine" key={engine.id}>
    <div className="tem-engine-title"><Tag size={18}/><div><strong>{engine.name}</strong><small>{engine.is_for_sale?"Sedang ditawarkan":"Tidak ditawarkan"}</small></div></div>
    <label className="tem-toggle"><input type="checkbox" checked={Boolean(sale[engine.id])} onChange={e=>setSale(v=>({...v,[engine.id]:e.target.checked}))}/> Tawarkan untuk dijual</label>
    {sale[engine.id]&&<label className="tem-price">Harga jual (€)<input type="number" min="5000000" max="25000000" step="100000" value={prices[engine.id]||""} onChange={e=>setPrices(v=>({...v,[engine.id]:e.target.value}))} placeholder="5.000.000 - 25.000.000"/></label>}
    <button className="action primary" disabled={saving===engine.id} onClick={()=>void save(engine)}>{saving===engine.id?"Menyimpan...":"Simpan penawaran"}</button>
   </article>)}
  </div>}
 </section>;
}
