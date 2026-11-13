import {useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {ArrowLeft,ShoppingBag,X,Coins} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Config={token_price:number;is_active:boolean};
export default function ShopPage({session}:{session:Session}){
 const [config,setConfig]=useState<Config>({token_price:0,is_active:false});
 const [loading,setLoading]=useState(true),[open,setOpen]=useState(false),[quantity,setQuantity]=useState("1"),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=async()=>{if(!supabase)return;setLoading(true);const {data,error}=await supabase.from("caleris_development_shop_config").select("token_price,is_active").eq("singleton",true).maybeSingle();if(error)setNotice(error.message);if(data)setConfig(data as Config);setLoading(false)};
 useEffect(()=>{void load()},[session.user.id]);
 const amount=Number(quantity),total=amount*Number(config.token_price||0);
 const money=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
 const buy=async()=>{if(!supabase)return;if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.round(amount*100)!==amount*100){setNotice("Jumlah token harus lebih dari 0 dan maksimal 2 angka desimal.");return;}setSaving(true);setNotice("");const {data,error}=await supabase.rpc("member_purchase_development_tokens",{p_quantity:amount});setSaving(false);if(error){setNotice(error.message);return;}setOpen(false);setQuantity("1");setNotice("Pembelian berhasil: "+amount+" "+String((data as {token_type?:string})?.token_type||"token")+".");};
 return <section className="workspace development-shop-page">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MARKETPLACE</span><h1 className="page-title">Shop</h1><p className="page-description">Pilih item yang ingin kamu beli menggunakan wallet ¢p.</p></header>
  {loading?<div className="workspace-card">Memuat item Shop...</div>:!config.is_active?<div className="workspace-card economy-empty">Shop sedang dinonaktifkan Admin.</div>:
   <div className="shop-item-grid">
    <button type="button" className="shop-item-card" onClick={()=>{setNotice("");setOpen(true)}} aria-haspopup="dialog">
     <span className="shop-item-icon"><Coins size={28}/></span><span className="section-eyebrow">DEVELOPMENT ECONOMY</span><strong>Development Token</strong><span className="shop-item-description">Token pengembangan atribut Driver dan Team.</span><span className="shop-item-price">{money(config.token_price)} <small>/ token</small></span><span className="shop-item-action"><ShoppingBag size={15}/> Lihat item</span>
    </button>
   </div>}
  {notice&&<p className="license-notice" role="status">{notice}</p>}
  {open&&<div className="shop-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setOpen(false)}}><section className="shop-item-modal" role="dialog" aria-modal="true" aria-labelledby="shop-item-title">
   <button type="button" className="shop-modal-close" aria-label="Tutup" onClick={()=>setOpen(false)} disabled={saving}><X size={19}/></button>
   <span className="section-eyebrow">CALERIS MARKETPLACE · ITEM DETAILS</span><h2 id="shop-item-title">Development Token</h2>
   <p>Development Token digunakan untuk meningkatkan atribut Driver (DDP) atau atribut mobil milik tim (TDP). Driver membeli DDP, sedangkan Team Owner membeli TDP untuk tim yang dimilikinya. Hak pembelian mengikuti role akun.</p>
   <div className="shop-modal-price">{money(config.token_price)} <small>/ token</small></div>
   <label className="shop-quantity-field">Jumlah yang dibeli<input type="number" min="0.01" step="0.01" max="100000000" value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={saving}/></label>
   <div className="shop-modal-total"><span>Total pembayaran</span><strong>{money(Number.isFinite(total)?total:0)}</strong></div>
   <p className="economy-form-hint">Pembayaran dipotong dari wallet ¢p dan diproses bersama pencatatan ledger.</p>
   <button type="button" className="economy-primary-button" onClick={()=>void buy()} disabled={saving||!Number.isFinite(amount)||amount<=0||amount>100000000||Math.round(amount*100)!==amount*100}>{saving?"Memproses pembelian...":"Konfirmasi Pembelian"}</button>
  </section></div>}
 </section>;
}