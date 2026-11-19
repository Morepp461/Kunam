import {useCallback,useEffect,useState} from "react";
import {RefreshCw,Save,Tag} from "lucide-react";
import {supabase} from "./lib/supabase";

type Engine={id:string;name:string;manufacturer:string|null;owner_team_name:string|null;is_for_sale:boolean;asking_price:number|null;race_pace:number;qualifying_pace:number;engine_power:number};
export default function AdminEngineMarket(){
 const [rows,setRows]=useState<Engine[]>([]),[prices,setPrices]=useState<Record<string,string>>({}),[listed,setListed]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(""),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{if(!supabase)return;setLoading(true);setNotice("");const {data,error}=await supabase.rpc("admin_list_engine_marketplace");if(error)setNotice(error.message);const list=(data||[]) as Engine[];setRows(list);setPrices(Object.fromEntries(list.map(e=>[e.id,e.asking_price==null?"":String(e.asking_price)])));setListed(Object.fromEntries(list.map(e=>[e.id,Boolean(e.is_for_sale)])));setLoading(false)},[]);
 useEffect(()=>{void refresh()},[refresh]);
 const save=async(e:Engine)=>{if(!supabase)return;const isListed=Boolean(listed[e.id]),price=Number(prices[e.id]);if(isListed&&(!Number.isFinite(price)||price<5000000||price>25000000)){setNotice("Harga hak penggunaan Engine harus €5 juta sampai €25 juta.");return;}setSaving(e.id);setNotice("");const {error}=await supabase.rpc("admin_configure_engine_usage_offer",{p_engine_id:e.id,p_is_listed:isListed,p_usage_price:isListed?price:null});setSaving("");if(error){setNotice(error.message);return;}setNotice("Listing dan harga hak penggunaan Engine tersimpan.");await refresh();};
 return <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">ADMIN ONLY · ENGINE MARKET</span><h2>Konfigurasi hak penggunaan Engine</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
 {notice&&<div className="license-notice" role="status">{notice}</div>}
 {loading?<p>Memuat Engine...</p>:rows.length?rows.map(e=><article className="ops-record" key={e.id}><div><strong><Tag size={14}/> {e.name}</strong><small>Pemilik: {e.owner_team_name||"Tidak ada"} · Race Pace {e.race_pace} · Qualifying Pace {e.qualifying_pace} · Engine Power {e.engine_power}</small></div><div className="ops-form-grid"><label><input type="checkbox" checked={Boolean(listed[e.id])} onChange={x=>setListed(v=>({...v,[e.id]:x.target.checked}))}/> Tampilkan di market</label><label>Harga penggunaan (€)<input type="number" min="5000000" max="25000000" step="100000" value={prices[e.id]||""} onChange={x=>setPrices(v=>({...v,[e.id]:x.target.value}))}/></label><button className="action primary" disabled={saving===e.id} onClick={()=>void save(e)}><Save size={14}/>{saving===e.id?"Menyimpan...":"Simpan listing"}</button></div></article>):<p className="muted">Belum ada Engine.</p>}
 </section>;
}
