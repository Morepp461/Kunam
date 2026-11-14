import {useEffect,useState} from "react";
import {RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";
type Season={id:string;title:string;status:string};
export default function AdminDevelopmentShopSettings(){
 const [seasons,setSeasons]=useState<Season[]>([]),[ending,setEnding]=useState(""),[next,setNext]=useState(""),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=async()=>{if(!supabase)return;const {data,error}=await supabase.from("license_seasons").select("id,title,status").order("created_at",{ascending:false});if(error)setNotice(error.message);setSeasons((data||[]) as Season[])};
 useEffect(()=>{void load()},[]);
 const rollover=async()=>{if(!supabase||!ending||!next||ending===next){setNotice("Pilih dua season yang berbeda.");return;}setSaving(true);setNotice("");const {data,error}=await supabase.rpc("admin_rollover_development_season",{p_ending_season_id:ending,p_next_season_id:next});setSaving(false);setNotice(error?.message||("Snapshot akhir season dan baseline berikutnya berhasil dibuat. "+String((data as {snapshot_rows_written?:number})?.snapshot_rows_written||0)+" baris."))};
 return <section className="economy-panel admin-development-shop-settings">
  <div className="economy-panel-heading"><div><span className="section-eyebrow">SEASON DEVELOPMENT CONTROL</span><h2>Development Season Rollover</h2></div><ShieldCheck size={19}/></div>
  <div className="economy-form">
   <label>Season yang berakhir<select value={ending} onChange={e=>setEnding(e.target.value)} disabled={saving}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   <label>Season berikutnya<select value={next} onChange={e=>setNext(e.target.value)} disabled={saving}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   <p className="economy-form-hint">Snapshot atribut akhir season disimpan sebagai histori dan disalin menjadi baseline season berikutnya. Nilai atribut aktif tidak di-reset. Pengaturan harga Development Shop kini berada di Price Configuration.</p>
   <button type="button" className="economy-secondary-button" onClick={()=>void rollover()} disabled={saving||!ending||!next||ending===next}><RefreshCw size={15}/> Snapshot & jadikan baseline</button>
  </div>
  {notice&&<p className="license-notice" role="status">{notice}</p>}
 </section>;
}