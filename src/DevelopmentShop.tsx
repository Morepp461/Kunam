import {useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Config={token_price:number;is_active:boolean};
type Purchase={id:string;token_type:string;quantity:number;unit_price:number;total_price:number;created_at:string};
export default function DevelopmentShop({session}:{session:Session}){
 const [config,setConfig]=useState<Config>({token_price:0,is_active:true});
 const [quantity,setQuantity]=useState("1"),[price,setPrice]=useState("0"),[active,setActive]=useState(true);
 const [admin,setAdmin]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [history,setHistory]=useState<Purchase[]>([]);
 const load=async()=>{
  if(!supabase)return;
  const [{data:c},{data:a},{data:h}]=await Promise.all([
   supabase.from("caleris_development_shop_config").select("token_price,is_active").eq("singleton",true).maybeSingle(),
   supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle(),
   supabase.from("caleris_development_shop_purchases").select("id,token_type,quantity,unit_price,total_price,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(20)
  ]);
  if(c){setConfig(c as Config);setPrice(String(c.token_price));setActive(c.is_active)}
  setAdmin(Boolean(a?.user_id));setHistory((h||[]) as Purchase[]);
 };
 useEffect(()=>{void load()},[session.user.id]);
 const save=async()=>{if(!supabase)return;const n=Number(price);if(!Number.isFinite(n)||n<0){setNotice("Harga token tidak valid.");return;}setSaving(true);const {error}=await supabase.rpc("admin_set_development_shop_price",{p_token_price:n,p_is_active:active});setSaving(false);setNotice(error?.message||"Konfigurasi Shop tersimpan.");if(!error)await load()};
 const buy=async()=>{if(!supabase)return;const n=Number(quantity);if(!Number.isFinite(n)||n<=0||n>100000000||Math.round(n*100)!==n*100){setNotice("Jumlah token harus lebih dari 0, maksimal 2 angka desimal.");return;}setSaving(true);const {data,error}=await supabase.rpc("member_purchase_development_tokens",{p_quantity:n});setSaving(false);setNotice(error?.message||("Pembelian berhasil: "+n+" "+String((data as any)?.token_type||"token")+"."));if(!error){setQuantity("1");await load()}};
 const money=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
 return <section className="workspace-card development-shop-card">
  <div className="section-title-row"><div><span className="section-eyebrow">CALERIS DEVELOPMENT SHOP</span><h2>Development Token</h2></div><strong>{money(config.token_price)} / token</strong></div>
  <p className="economy-form-hint">Team Owner membeli TDP untuk timnya. Driver membeli DDP untuk atribut pribadinya. Seluruh pembayaran bersumber dari VreeoBank dan diproses atomik bersama ledger development.</p>
  {admin&&<div className="economy-form">
   <label>Harga per token (¢p)<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <label className="economy-toggle"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Shop aktif</label>
   <button type="button" className="economy-primary-button" disabled={saving} onClick={()=>void save()}>Simpan harga Shop</button>
  </div>}
  <div className="economy-form">
   <label>Jumlah token<input type="number" min="0.01" step="0.01" value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={!config.is_active||saving}/></label>
   <p className="economy-form-hint">Total pembelian: {money(Number(quantity||0)*Number(config.token_price||0))}</p>
   <button type="button" className="economy-primary-button" disabled={saving||!config.is_active} onClick={()=>void buy()}>{saving?"Memproses...":"Beli Development Token"}</button>
  </div>
  {!config.is_active&&<p className="economy-empty">Development Shop sedang dinonaktifkan Admin.</p>}
  {notice&&<p className="license-notice" role="status">{notice}</p>}
  <div className="ops-record-list">{history.map(item=><article key={item.id}><div><strong>{item.quantity} {item.token_type}</strong><small>{new Date(item.created_at).toLocaleString("id-ID")} · {money(item.unit_price)} / token</small></div><b>{money(item.total_price)}</b></article>)}</div>
 </section>;
}
