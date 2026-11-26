import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,RefreshCw} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./driver-market-value.css";

type MarketValue={member_id:string;market_value_eur:number;tier_number:number;division_key:string|null};

const fixedConfig={
 weights:[["License",10],["Contract",10],["Performance",20],["Overall Skill",20],["Achievement",10],["Activity",10],["Reputation",20]] as [string,number][],
 baseValue:18000000,
 growthFactor:0.25,
 tiers:[[1,1],[2,0.85],[3,0.7],[4,0.6]] as [number,number][],
 divisions:[["Caleris Premio","Tier 1"],["Caleris Zwei","Tier 2"]] as [string,string][],
 licenses:[["Bronze",25],["Silver",50],["Gold",75],["Super License",100]] as [string,number][]
};
const money=(value:number)=>"€ "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:2});

export default function AdminDriverMarketEngine({session:_session}:{session:Session}){
 const [values,setValues]=useState<MarketValue[]>([]);
 const [loading,setLoading]=useState(true);
 const [recalculating,setRecalculating]=useState(false);
 const [notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);

 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const {data,error}=await supabase.from("caleris_driver_market_values")
   .select("member_id,market_value_eur,tier_number,division_key")
   .order("market_value_eur",{ascending:false});
  if(error){setNotice({kind:"error",text:error.message});setLoading(false);return}
  setValues((data||[]) as MarketValue[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);

 const recalculate=async()=>{
  if(!supabase)return;
  setRecalculating(true);setNotice(null);
  const {data,error}=await supabase.rpc("admin_recalculate_driver_market_values",{p_member_id:null,p_reason:"admin_manual"});
  setRecalculating(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:String(data??0)+" Driver berhasil dihitung ulang."});
  await load();
 };

 return <section className="workspace driver-market-admin">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MASTERS · ADMIN ENGINE</span><h1 className="page-title">Driver Market Value</h1><p className="page-description">Engine Market Value berjalan otomatis dengan keputusan scoring yang dikunci di backend. Halaman ini hanya untuk monitoring snapshot dan pemeriksaan operasional; tidak ada konfigurasi manual.</p></header>
  {notice&&<div className={"driver-market-notice "+notice.kind}>{notice.text}</div>}
  <div className="driver-market-summary-grid">
   <article className="workspace-card"><span>REGISTERED DRIVER</span><strong>{values.length}</strong><small>Memiliki snapshot Market Value</small></article>
   <article className="workspace-card"><span>BASE VALUE · TIER 1</span><strong>{money(fixedConfig.baseValue)}</strong><small>Nilai tetap sebelum scoring dan multiplier</small></article>
   <article className="workspace-card"><span>GROWTH FACTOR</span><strong>{fixedConfig.growthFactor.toFixed(2)}</strong><small>Konstanta engine, tidak dapat diedit</small></article>
  </div>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">LOCKED ENGINE MODEL</span><h2>Bobot Market Value</h2></div><span className="empty-tag">100%</span></div>
   <div className="s5-table-wrap"><table className="s5-table"><thead><tr><th>Komponen</th><th>Bobot</th></tr></thead><tbody>
    {fixedConfig.weights.map(([label,value])=><tr key={label}><td>{label}</td><td>{value}%</td></tr>)}
   </tbody></table></div>
  </section>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">DIVISION TIER</span><h2>Tier Multiplier</h2></div></div>
   <div className="s5-table-wrap"><table className="s5-table"><thead><tr><th>Tier</th><th>Multiplier</th></tr></thead><tbody>
    {fixedConfig.tiers.map(([tier,multiplier])=><tr key={tier}><td>Tier {tier}</td><td>{multiplier.toFixed(2)}</td></tr>)}
   </tbody></table></div>
   <div className="s5-table-wrap"><table className="s5-table"><thead><tr><th>Divisi</th><th>Tier</th></tr></thead><tbody>
    {fixedConfig.divisions.map(([division,tier])=><tr key={division}><td>{division}</td><td>{tier}</td></tr>)}
   </tbody></table></div>
  </section>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">LICENSE SCORE</span><h2>Konversi Lisensi</h2></div></div>
   <div className="s5-table-wrap"><table className="s5-table"><thead><tr><th>Lisensi</th><th>Score</th></tr></thead><tbody>
    {fixedConfig.licenses.map(([license,score])=><tr key={license}><td>{license}</td><td>{score}</td></tr>)}
   </tbody></table></div>
  </section>
  <div className="driver-market-actions">
   <button className="action" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Refresh snapshot</button>
   <button className="action primary" onClick={()=>void recalculate()} disabled={recalculating}><RefreshCw size={16}/>{recalculating?"Menghitung...":"Recalculate semua Driver"}</button>
  </div>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">CURRENT SNAPSHOT</span><h2>Market Value Driver</h2></div></div>
   {loading?<p>Memuat snapshot Market Value...</p>:<div className="s5-table-wrap"><table className="s5-table"><thead><tr><th>Member ID</th><th>Home Division</th><th>Tier</th><th>Market Value</th></tr></thead><tbody>
    {values.map(v=><tr key={v.member_id}><td>{v.member_id.slice(0,8).toUpperCase()}</td><td>{v.division_key||"—"}</td><td>{v.tier_number}</td><td>{money(v.market_value_eur)}</td></tr>)}
    {values.length===0&&<tr><td colSpan={4}>Belum ada snapshot Market Value.</td></tr>}
   </tbody></table></div>}
  </section>
 </section>
}
