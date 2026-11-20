import {useCallback,useEffect,useState} from "react";
import {Save,ShieldCheck,SlidersHorizontal} from "lucide-react";
import {supabase} from "./lib/supabase";

type Config={is_enabled:boolean;timezone:string;daily_ad_limit:number;milestones:{ads:number;reward:number}[];gam_network_code:string|null;gam_ad_unit_path:string|null};
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function AdminRewardedAdsConfig(){
 const [config,setConfig]=useState<Config|null>(null);
 const [network,setNetwork]=useState(""),[adUnit,setAdUnit]=useState("");
 const [rewards,setRewards]=useState(["50000","160000","300000"]);
 const [enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setNotice("Koneksi database belum tersedia.");setLoading(false);return;}
  setLoading(true);setNotice("");
  const {data,error}=await supabase.rpc("admin_get_rewarded_ads_config");
  if(error||!data){setNotice(error?.message||"Konfigurasi gagal dimuat.");setLoading(false);return;}
  const value=data as Config;setConfig(value);setNetwork(value.gam_network_code||"");setAdUnit(value.gam_ad_unit_path||"");
  setRewards(value.milestones.map(x=>String(x.reward)));setEnabled(value.is_enabled);setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const save=async()=>{
  if(!supabase||!config)return;
  const parsed=rewards.map(Number);
  if(parsed.some(x=>!Number.isFinite(x)||x<=0||Math.round(x*100)!==x*100)){setNotice("Reward harus lebih besar dari nol dan maksimal dua angka desimal.");return;}
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("admin_update_rewarded_ads_config",{p_is_enabled:enabled,p_milestones:[{ads:1,reward:parsed[0]},{ads:3,reward:parsed[1]},{ads:5,reward:parsed[2]}],p_gam_network_code:network||null,p_gam_ad_unit_path:adUnit||null});
  setSaving(false);
  if(error){setNotice(error.message);return;}
  setNotice("Konfigurasi Rewarded Ads berhasil disimpan.");await load();
 };
 return <section className="workspace-card rewarded-admin-card">
  <div className="section-title-row"><div><span className="section-eyebrow">REWARDED ADS · GOOGLE AD MANAGER</span><h2>Konfigurasi Quest Iklan</h2></div><SlidersHorizontal size={19}/></div>
  <p className="rewarded-admin-description">Milestone kumulatif harian terpisah dari Daily Quest reguler. Pembayaran hanya boleh berjalan setelah callback server Google terverifikasi.</p>
  {loading?<p>Memuat konfigurasi...</p>:<>
   <div className="rewarded-admin-milestones">{[1,3,5].map((ads,i)=><label key={ads}><span><strong>{ads} iklan valid</strong><small>Reward milestone</small></span><div><b>€</b><input type="number" min="0.01" step="0.01" value={rewards[i]} onChange={e=>setRewards(v=>v.map((x,j)=>j===i?e.target.value:x))}/></div><em>{money(Number(rewards[i]||0))}</em></label>)}</div>
   <div className="rewarded-admin-fields"><label>GAM Network Code<input value={network} onChange={e=>setNetwork(e.target.value)} placeholder="Diisi setelah akun Ad Manager disetujui"/></label><label>Ad Unit Path<input value={adUnit} onChange={e=>setAdUnit(e.target.value)} placeholder="/network_code/ad_unit"/></label></div>
   <label className="rewarded-admin-toggle"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Aktifkan Rewarded Ads Quest</label>
   <div className="rewarded-admin-status"><ShieldCheck size={16}/><span>Default aman: nonaktif. Aktivasi ditolak database jika Network Code atau Ad Unit Path belum tersedia. Batas harian 5 iklan, reset 00.00 WIB.</span></div>
   <button className="admin-quest-save" disabled={saving} onClick={()=>void save()}><Save size={15}/>{saving?"Menyimpan...":"Simpan konfigurasi iklan"}</button>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
