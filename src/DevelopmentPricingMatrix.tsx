import {useCallback,useEffect,useState} from "react";
import {Coins,RefreshCw,Save,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";

type PriceRow={license_tier:string;attribute_key:string;cash_eur_per_point:number;is_configured:boolean};
type TeamPriceRow={division_key:string;part_key:string;cash_eur_per_point:number;is_configured:boolean};
const DRIVER:[string,string][]=[["aggression","Aggression"],["defensive_strength","Defensive Strength"],["experience","Experience"],["mistake_rate","Mistake Rate"],["overtake_skill","Overtake Skill"],["qualifying_pace","Qualifying Pace"],["race_pace","Race Pace"],["tyre_management","Tyre Management"]];
const TEAM:[string,string][]=[["race_pace","Race Pace"],["qualifying_pace","Qualifying Pace"],["engine_power","Engine Power"],["aero_power","Aero Power"],["low_speed_corners","Low Speed Corners"],["high_speed_corners","High Speed Corners"],["traction","Traction"],["mechanical_grip","Mechanical Grip"],["team_tyre_management","Team Tyre Management"],["strategy_quality","Strategy Quality"],["team_morale","Team Morale"],["reliability","Reliability"],["car_tyre_wear","Car Tyre Wear"],["pit_stop_efficiency","Pit Stop Efficiency"],["drs_efficiency","DRS Efficiency"],["ers_efficiency","ERS Efficiency"]];
const TIERS=["bronze","silver","gold","super"] as const;
const DIVISIONS=["zwei","premio"] as const;
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:0});
export default function DevelopmentPricingMatrix(){
 const [drivers,setDrivers]=useState<PriceRow[]>([]);
 const [teams,setTeams]=useState<TeamPriceRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState("");
 const [notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
 const load=useCallback(async()=>{
  if(!supabase){setNotice({ok:false,text:"Koneksi Supabase tidak tersedia."});setLoading(false);return;}
  setLoading(true);setNotice(null);
  const [d,t]=await Promise.all([
   supabase.from("caleris_driver_development_tier_pricing").select("license_tier,attribute_key,cash_eur_per_point,is_configured").order("license_tier").order("attribute_key"),
   supabase.from("caleris_team_development_division_pricing").select("division_key,part_key,cash_eur_per_point,is_configured").order("division_key").order("part_key")
  ]);
  if(d.error||t.error){setNotice({ok:false,text:[d.error?.message,t.error?.message].filter(Boolean).join(" · ")});setLoading(false);return;}
  setDrivers((d.data||[]).map(x=>({...x,cash_eur_per_point:Number(x.cash_eur_per_point)})));
  setTeams((t.data||[]).map(x=>({...x,cash_eur_per_point:Number(x.cash_eur_per_point)})));
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const setDriver=(tier:string,key:string,value:string)=>setDrivers(rows=>rows.map(x=>x.license_tier===tier&&x.attribute_key===key?{...x,cash_eur_per_point:Number(value)}:x));
 const setTeam=(division:string,key:string,value:string)=>setTeams(rows=>rows.map(x=>x.division_key===division&&x.part_key===key?{...x,cash_eur_per_point:Number(value)}:x));
 const save=async(scope:"driver"|"team")=>{
  if(!supabase)return;
  const rows=scope==="driver"?drivers:teams;
  if(rows.length!==(scope==="driver"?32:32)||rows.some(x=>!Number.isFinite(x.cash_eur_per_point)||x.cash_eur_per_point<=0)){
   setNotice({ok:false,text:"Seluruh harga harus tersedia dan lebih besar dari €0."});return;
  }
  setSaving(scope);
  const result=scope==="driver"
   ?await supabase.from("caleris_driver_development_tier_pricing").upsert(drivers.map(x=>({...x,is_configured:true,updated_at:new Date().toISOString()})),{onConflict:"license_tier,attribute_key"})
   :await supabase.from("caleris_team_development_division_pricing").upsert(teams.map(x=>({...x,is_configured:true,updated_at:new Date().toISOString()})),{onConflict:"division_key,part_key"});
  setSaving("");
  setNotice({ok:!result.error,text:result.error?.message||(scope==="driver"?"Harga Driver per lisensi":"Harga Team per divisi")+" berhasil disimpan."});
  if(!result.error)await load();
 };
 const field=(value:number,onChange:(v:string)=>void)=><input type="number" min="1" step="1000" value={value} onChange={e=>onChange(e.target.value)}/>;
 return <section className="pricing-panel">
  <div className="pricing-panel-head"><div><small>02 · DEVELOPMENT PRICE MATRIX</small><h2>Harga Berdasarkan Lisensi & Divisi</h2><p>Harga cash per +1 poin. Tarif diverifikasi kembali oleh database saat upgrade, bukan hanya oleh UI.</p></div><Coins/></div>
  {loading?<div className="pricing-loading"><RefreshCw className="spin"/> Memuat matriks harga...</div>:<>
   <div className="pricing-security"><ShieldCheck size={16}/><span>Driver memakai tier lisensi aktifnya. Team memakai divisi yang ditetapkan pada tim: Caleris Zwei atau Caleris Premio. DDP/TDP tetap 1 token = +1 poin.</span></div>
   <h3>Driver Development · per Lisensi</h3>
   {TIERS.map(tier=><article className="pricing-reward-list" key={tier}><div className="pricing-reward-head"><strong>{tier.toUpperCase()}</strong><span>{money(drivers.filter(x=>x.license_tier===tier).reduce((sum,x)=>sum+x.cash_eur_per_point*50,0))} untuk seluruh atribut 50→100</span></div><div className="pricing-price-list">{DRIVER.map(([key,label])=>{const row=drivers.find(x=>x.license_tier===tier&&x.attribute_key===key);return <label key={key}><span>{label}</span>{field(row?.cash_eur_per_point??0,v=>setDriver(tier,key,v))}<small>€ / poin</small></label>})}</div></article>)}
   <button className="pricing-save" disabled={saving!==""} onClick={()=>void save("driver")}><Save size={15}/>{saving==="driver"?"Menyimpan...":"Simpan harga Driver per lisensi"}</button>
   <h3>Team Development · per Divisi</h3>
   {DIVISIONS.map(division=><article className="pricing-reward-list" key={division}><div className="pricing-reward-head"><strong>CALERIS {division.toUpperCase()}</strong><span>{money(teams.filter(x=>x.division_key===division).reduce((sum,x)=>sum+x.cash_eur_per_point*50,0))} untuk seluruh part 50→100</span></div><div className="pricing-price-list">{TEAM.map(([key,label])=>{const row=teams.find(x=>x.division_key===division&&x.part_key===key);return <label key={key}><span>{label}</span>{field(row?.cash_eur_per_point??0,v=>setTeam(division,key,v))}<small>€ / poin</small></label>})}</div></article>)}
   <button className="pricing-save" disabled={saving!==""} onClick={()=>void save("team")}><Save size={15}/>{saving==="team"?"Menyimpan...":"Simpan harga Team per divisi"}</button>
  </>}
  {notice&&<div className={notice.ok?"pricing-message success":"pricing-message error"} role="status">{notice.text}</div>}
 </section>;
}
