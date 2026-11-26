import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,Plus,RefreshCw,Save,Trash2} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./driver-market-value.css";

type NumericMap=Record<string,number>;
type MarketConfig={
 weights:NumericMap;
 base_value_eur:number;
 growth_factor:number;
 tier_multipliers:NumericMap;
 tier_order:NumericMap;
 initial_license_scores:NumericMap;
};
type MarketValue={member_id:string;market_value_eur:number;mv_score:number;tier_number:number;division_key:string|null};

const weightLabels:[string,string][]=[
 ["license","License"],["contract","Contract"],["performance","Performance"],
 ["skill","Overall Skill"],["achievement","Achievement"],["activity","Activity"],["reputation","Reputation"]
];
const emptyConfig:MarketConfig={
 weights:{license:10,contract:10,performance:20,skill:20,achievement:10,activity:10,reputation:20},
 base_value_eur:10000000,growth_factor:0.25,
 tier_multipliers:{"1":1,"2":0.85,"3":0.7,"4":0.6},
 tier_order:{premio:1,zwei:2},
 initial_license_scores:{"Bronze":25,"Silver":50,"Gold":75,"Super License":100}
};
const money=(value:number)=>"€ "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:2});

export default function AdminDriverMarketEngine({session:_session}:{session:Session}){
 const [config,setConfig]=useState<MarketConfig>(emptyConfig);
 const [values,setValues]=useState<MarketValue[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [recalculating,setRecalculating]=useState(false);
 const [notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const [newTier,setNewTier]=useState("");
 const [newDivision,setNewDivision]=useState("");
 const [newLicense,setNewLicense]=useState("");

 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return}
  setLoading(true);
  const [cfg,mv]=await Promise.all([
   supabase.rpc("admin_get_driver_market_config"),
   supabase.from("caleris_driver_market_values").select("member_id,market_value_eur,mv_score,tier_number,division_key").order("market_value_eur",{ascending:false})
  ]);
  if(cfg.error){setNotice({kind:"error",text:cfg.error.message});setLoading(false);return}
  if(mv.error){setNotice({kind:"error",text:mv.error.message});setLoading(false);return}
  setConfig({...emptyConfig,...(cfg.data||{})} as MarketConfig);
  setValues((mv.data||[]) as MarketValue[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);

 const weightTotal=useMemo(()=>Object.values(config.weights||{}).reduce((a,b)=>a+Number(b||0),0),[config.weights]);
 const setMapValue=(field:"weights"|"tier_multipliers"|"tier_order"|"initial_license_scores",key:string,value:number)=>{
  setConfig(current=>({...current,[field]:{...current[field],[key]:value}}));
 };
 const removeMapKey=(field:"tier_multipliers"|"tier_order"|"initial_license_scores",key:string)=>{
  setConfig(current=>{const next={...current[field]};delete next[key];return {...current,[field]:next}});
 };
 const addMapKey=(field:"tier_multipliers"|"tier_order"|"initial_license_scores",key:string,value:number)=>{
  const clean=key.trim();
  if(!clean||!Number.isFinite(value)||Object.prototype.hasOwnProperty.call(config[field],clean)){setNotice({kind:"error",text:"Key kosong, nilai tidak valid, atau sudah digunakan."});return}
  setMapValue(field,clean,value);
  if(field==="tier_multipliers")setNewTier("");
  if(field==="tier_order")setNewDivision("");
  if(field==="initial_license_scores")setNewLicense("");
 };

 const save=async()=>{
  if(!supabase)return;
  if(Math.abs(weightTotal-100)>0.0001){setNotice({kind:"error",text:"Total bobot harus tepat 100%."});return}
  if(Number(config.base_value_eur)<=0||Number(config.growth_factor)<0||Number(config.growth_factor)>1){setNotice({kind:"error",text:"Base Value atau Growth Factor tidak valid."});return}
  setSaving(true);setNotice(null);
  const {error}=await supabase.rpc("admin_configure_driver_market",{
   p_weights:config.weights,p_base_value_eur:Number(config.base_value_eur),
   p_growth_factor:Number(config.growth_factor),p_tier_multipliers:config.tier_multipliers,
   p_tier_order:config.tier_order,p_initial_license_scores:config.initial_license_scores
  });
  setSaving(false);
  if(error){setNotice({kind:"error",text:error.message});return}
  setNotice({kind:"success",text:"Konfigurasi Driver Market Value tersimpan."});
  await load();
 };
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
  <header className="page-heading"><span className="section-eyebrow">CALERIS MASTERS · ADMIN ENGINE</span><h1 className="page-title">Driver Market Value</h1><p className="page-description">Atur scoring, nilai dasar, tier, lisensi, dan kalkulasi Market Value Driver. Rincian scoring dan histori tetap berada di backend.</p></header>
  {notice&&<div className={"driver-market-notice "+notice.kind}>{notice.text}</div>}
  {loading?<div className="workspace-card"><p>Memuat konfigurasi Market Value...</p></div>:<>
   <div className="driver-market-summary-grid">
    <article className="workspace-card"><span>REGISTERED DRIVER</span><strong>{values.length}</strong><small>Memiliki snapshot Market Value</small></article>
    <article className="workspace-card"><span>BASE VALUE · TIER 1</span><strong>{money(config.base_value_eur)}</strong><small>Nilai dasar sebelum scoring dan multiplier</small></article>
    <article className="workspace-card"><span>WEIGHT TOTAL</span><strong>{weightTotal.toFixed(2)}%</strong><small>Wajib tepat 100%</small></article>
   </div>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">SCORING MODEL</span><h2>Bobot komponen</h2></div><span className="empty-tag">{weightTotal.toFixed(2)} / 100%</span></div>
    <div className="driver-market-weight-grid">
     {weightLabels.map(([key,label])=><label key={key}>{label}<div className="driver-market-input-suffix"><input type="number" min="0" max="100" step="0.1" value={config.weights[key]??0} onChange={e=>setMapValue("weights",key,Number(e.target.value))}/><span>%</span></div></label>)}
    </div>
   </section>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">VALUE CURVE</span><h2>Base Value & Growth Factor</h2></div></div>
    <div className="driver-market-weight-grid driver-market-two-col">
     <label>Base Value Tier 1 (€)<input type="number" min="1" step="100000" value={config.base_value_eur} onChange={e=>setConfig(v=>({...v,base_value_eur:Number(e.target.value)}))}/></label>
     <label>Growth Factor (0–1)<input type="number" min="0" max="1" step="0.01" value={config.growth_factor} onChange={e=>setConfig(v=>({...v,growth_factor:Number(e.target.value)}))}/></label>
    </div>
   </section>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">DIVISION TIER</span><h2>Tier Multiplier</h2></div></div>
    <div className="driver-market-map-list">
     {Object.entries(config.tier_multipliers).sort((a,b)=>Number(a[0])-Number(b[0])).map(([key,value])=><div className="driver-market-map-row" key={key}><label>Tier {key}<input type="number" min="0.01" max="1" step="0.01" value={value} onChange={e=>setMapValue("tier_multipliers",key,Number(e.target.value))}/></label>{key!=="1"&&<button className="driver-market-icon-button" title="Hapus tier" onClick={()=>removeMapKey("tier_multipliers",key)}><Trash2 size={15}/></button>}</div>)}
    </div>
    <div className="driver-market-add-row"><input placeholder="Nomor tier baru" type="number" min="2" value={newTier} onChange={e=>setNewTier(e.target.value)}/><button className="action" onClick={()=>addMapKey("tier_multipliers",newTier,0.5)}><Plus size={15}/> Tambah tier</button></div>
   </section>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">DIVISION ORDER</span><h2>Pemetaan divisi ke tier</h2></div></div>
    <div className="driver-market-map-list">
     {Object.entries(config.tier_order).map(([key,value])=><div className="driver-market-map-row" key={key}><label>Division Key<input value={key} readOnly/></label><label>Tier Number<input type="number" min="1" step="1" value={value} onChange={e=>setMapValue("tier_order",key,Number(e.target.value))}/></label><button className="driver-market-icon-button" title="Hapus pemetaan" onClick={()=>removeMapKey("tier_order",key)}><Trash2 size={15}/></button></div>)}
    </div>
    <div className="driver-market-add-row"><input placeholder="division_key baru" value={newDivision} onChange={e=>setNewDivision(e.target.value)}/><button className="action" onClick={()=>addMapKey("tier_order",newDivision,3)}><Plus size={15}/> Tambah divisi</button></div>
   </section>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">LICENSE SCORE</span><h2>Konversi lisensi</h2></div></div>
    <div className="driver-market-map-list">
     {Object.entries(config.initial_license_scores).map(([key,value])=><div className="driver-market-map-row" key={key}><label>License<input value={key} readOnly/></label><label>Score (0–100)<input type="number" min="0" max="100" step="1" value={value} onChange={e=>setMapValue("initial_license_scores",key,Number(e.target.value))}/></label>{!["Bronze","Silver","Gold","Super License"].includes(key)&&<button className="driver-market-icon-button" title="Hapus lisensi" onClick={()=>removeMapKey("initial_license_scores",key)}><Trash2 size={15}/></button>}</div>)}
    </div>
    <div className="driver-market-add-row"><input placeholder="Nama lisensi" value={newLicense} onChange={e=>setNewLicense(e.target.value)}/><button className="action" onClick={()=>addMapKey("initial_license_scores",newLicense,50)}><Plus size={15}/> Tambah lisensi</button></div>
   </section>
   <div className="driver-market-actions"><button className="action primary" onClick={()=>void save()} disabled={saving}><Save size={16}/>{saving?"Menyimpan...":"Simpan konfigurasi"}</button><button className="action" onClick={()=>void recalculate()} disabled={recalculating}><RefreshCw size={16}/>{recalculating?"Menghitung...":"Recalculate semua Driver"}</button></div>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">CURRENT SNAPSHOT</span><h2>Market Value Driver</h2></div><button className="economy-secondary-button" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></div>
    <div className="s5-table-wrap"><table className="s5-table"><thead><tr><th>Member ID</th><th>Home Division</th><th>Tier</th><th>MV Score</th><th>Market Value</th></tr></thead><tbody>
     {values.map(v=><tr key={v.member_id}><td>{v.member_id.slice(0,8).toUpperCase()}</td><td>{v.division_key||"—"}</td><td>{v.tier_number}</td><td>{Number(v.mv_score||0).toFixed(2)}</td><td>{money(v.market_value_eur)}</td></tr>)}
     {values.length===0&&<tr><td colSpan={5}>Belum ada snapshot Market Value.</td></tr>}
    </tbody></table></div>
   </section>
  </>}
 </section>
}
