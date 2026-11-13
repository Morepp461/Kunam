import {useEffect,useState} from "react";
import {Coins,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";
type Season={id:string;title:string;status:string};
type Config={token_price:number;is_active:boolean};
export default function AdminDevelopmentShopSettings(){
 const [price,setPrice]=useState("0"),[active,setActive]=useState(false),[seasons,setSeasons]=useState<Season[]>([]),[ending,setEnding]=useState(""),[next,setNext]=useState(""),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=async()=>{if(!supabase)return;const [{data:config,error:ce},{data:rows,error:se}]=await Promise.all([supabase.from("caleris_development_shop_config").select("token_price,is_active").eq("singleton",true).maybeSingle(),supabase.from("license_seasons").select("id,title,status").order("created_at",{ascending:false})]);if(ce||se)setNotice(ce?.message||se?.message||"Gagal memuat konfigurasi.");if(config){const c=config as Config;setPrice(String(c.token_price));setActive(c.is_active)}setSeasons((rows||[]) as Season[])};
 useEffect(()=>{void load()},[]);
 const save=async()=>{if(!supabase)return;const n=Number(price);if(!Number.isFinite(n)||n<0||Math.round(n*100)!==n*100){setNotice("Harga harus nol atau lebih dengan maksimal dua angka desimal.");return;}setSaving(true);setNotice("");const {error}=await supabase.rpc("admin_set_development_shop_price",{p_token_price:n,p_is_active:active});setSaving(false);setNotice(error?.message||"Konfigurasi Development Shop berhasil disimpan.");if(!error)await load()};
 const rollover=async()=>{if(!supabase||!ending||!next||ending===next){setNotice("Pilih dua season yang berbeda.");return;}setSaving(true);setNotice("");const {data,error}=await supabase.rpc("admin_rollover_development_season",{p_ending_season_id:ending,p_next_season_id:next});setSaving(false);setNotice(error?.message||("Snapshot akhir season dan baseline berikutnya berhasil dibuat. "+String((data as {snapshot_rows_written?:number})?.snapshot_rows_written||0)+" baris."))};
 return <section className="economy-panel admin-development-shop-settings">
  <div className="economy-panel-heading"><div><span className="section-eyebrow">MARKETPLACE CONTROL</span><h2>Development Shop</h2></div><ShieldCheck size={19}/></div>
  <div className="economy-form">
   <label>Harga Development Token (¢p)<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} disabled={saving}/></label>
   <label className="economy-toggle"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} disabled={saving}/> Shop aktif</label>
   <p className="economy-form-hint">Team Owner membeli TDP untuk timnya. Driver membeli DDP untuk atribut pribadinya. Harga dan status item diatur dari panel Admin, bukan dari halaman Shop.</p>
   <button type="button" className="economy-primary-button" onClick={()=>void save()} disabled={saving}><Coins size={16}/> Simpan konfigurasi Shop</button>
  </div>
  <div className="economy-form admin-season-rollover">
   <span className="section-eyebrow">SEASON DEVELOPMENT CONTROL</span>
   <label>Season yang berakhir<select value={ending} onChange={e=>setEnding(e.target.value)} disabled={saving}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   <label>Season berikutnya<select value={next} onChange={e=>setNext(e.target.value)} disabled={saving}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   <p className="economy-form-hint">Snapshot atribut akhir season disimpan sebagai histori dan disalin menjadi baseline season berikutnya. Nilai atribut aktif tidak di-reset.</p>
   <button type="button" className="economy-secondary-button" onClick={()=>void rollover()} disabled={saving||!ending||!next||ending===next}><RefreshCw size={15}/> Snapshot & jadikan baseline</button>
  </div>
  {notice&&<p className="license-notice" role="status">{notice}</p>}
 </section>;
}