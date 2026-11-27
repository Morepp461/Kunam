import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,ShoppingBag,Lock,CheckCircle2,RefreshCw} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./team-hq.css";

type Capacity={
 base_limit:number;factory_bonus:number;shop_bonus:number;active_projects:number;
 max_projects:number;shop_item_owned:boolean;
};
type ShopStatus={item_name:string;price_idr:number;currency:string;payment_provider:string;is_active:boolean};
const rupiah=(value:number)=>"Rp "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:0});

export default function ShopPage({session}:{session:Session}){
 const [capacity,setCapacity]=useState<Capacity|null>(null);
 const [shopStatus,setShopStatus]=useState<ShopStatus|null>(null);
 const [teamId,setTeamId]=useState<string|null>(null);
 const [isOwner,setIsOwner]=useState(false);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const paymentReturn=typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("payment")==="processing";

 const load=useCallback(async()=>{
  if(!supabase){setError("Supabase belum terhubung.");setLoading(false);return}
  setLoading(true);setError("");
  const [{data:profile,error:profileError},{data:status,error:statusError}]=await Promise.all([
   supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle(),
   supabase.rpc("caleris_midtrans_shop_item_status")
  ]);
  if(profileError){setError(profileError.message);setLoading(false);return}
  if(statusError){setError(statusError.message);setLoading(false);return}
  setShopStatus(status as ShopStatus);
  if(profile?.member_id){
   const {data:member,error:memberError}=await supabase.from("members").select("role,team_id").eq("id",profile.member_id).maybeSingle();
   if(memberError){setError(memberError.message);setLoading(false);return}
   const owner=member?.role==="Owner";
   const currentTeamId=member?.team_id??null;
   setIsOwner(owner);setTeamId(currentTeamId);
   if(currentTeamId){
    const {data,error:capacityError}=await supabase.rpc("member_get_team_hq_project_capacity");
    if(capacityError){setError(capacityError.message);setLoading(false);return}
    setCapacity(data as Capacity);
   }else setCapacity(null);
  }else{setIsOwner(false);setTeamId(null);setCapacity(null)}
  setLoading(false);
 },[session.user.id]);

 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  if(paymentReturn)setNotice("Pembayaran sedang diverifikasi oleh server Midtrans. Hak akses hanya diberikan setelah notifikasi pembayaran valid diterima.");
 },[paymentReturn]);

 const purchase=async()=>{
  if(!supabase||saving||!teamId)return;
  if(!window.confirm("Lanjutkan ke halaman pembayaran Midtrans untuk Additional HQ Project Slot seharga Rp29.900?"))return;
  setSaving(true);setError("");setNotice("");
  const {data,error:paymentError}=await supabase.functions.invoke("midtrans-hq-shop",{
   body:{action:"create_order",team_id:teamId,request_key:crypto.randomUUID()}
  });
  setSaving(false);
  if(paymentError){setError(paymentError.message);return}
  if(data?.status==="already_owned"||data?.status==="paid"){
   setNotice("Tim sudah memiliki item ini.");await load();return;
  }
  if(typeof data?.redirect_url!=="string"||!data.redirect_url.startsWith("https://")){
   setError(data?.error||"Sesi pembayaran belum tersedia.");return;
  }
  window.location.assign(data.redirect_url);
 };

 const itemOwned=Boolean(capacity?.shop_item_owned);
 const itemActive=Boolean(shopStatus?.is_active);
 const itemPrice=shopStatus?.price_idr??29900;

 return <section className="workspace development-shop-page">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS PAID ITEMS</span><h1 className="page-title">Shop</h1><p className="page-description">Shop hanya menyediakan item berbayar dengan pembayaran Rupiah melalui Midtrans. Item akan tersedia setelah konfigurasi merchant dan pengujian Sandbox selesai.</p></header>
  {error&&<p className="team-hq-error" role="alert">{error}</p>}
  {notice&&<p className="team-hq-notice" role="status">{notice}</p>}
  {loading?<section className="workspace-card shop-upcoming-card"><span className="section-eyebrow">CALERIS PAID ITEMS</span><p>Memuat katalog Shop...</p></section>:<>
   <article className="workspace-card hq-slot-shop-card">
    <div className="hq-slot-shop-icon"><ShoppingBag size={24}/></div>
    <div className="hq-slot-shop-copy"><span className="section-eyebrow">TEAM HQ · PERMANENT UPGRADE</span><h2>Additional HQ Project Slot</h2><p>Menambah satu proyek upgrade Team HQ yang dapat berjalan bersamaan. Berlaku permanen untuk tim yang membeli.</p>
     <div className="hq-slot-shop-meta"><span>+1 Active Project</span><span>Midtrans · IDR</span><span>Pembelian satu kali</span></div>
    </div>
    <div className="hq-slot-shop-action">
     <strong>{rupiah(itemPrice)}</strong>
     {itemOwned?<span className="hq-slot-owned"><CheckCircle2 size={15}/> Owned</span>:<button type="button" disabled={!isOwner||!teamId||!itemActive||saving} onClick={()=>void purchase()}>{saving?"Memproses...":itemActive?"Bayar via Midtrans":"Belum tersedia"}</button>}
     {!itemActive&&!itemOwned&&<small><Lock size={12}/> Menunggu konfigurasi merchant dan verifikasi Sandbox.</small>}
     {itemActive&&!isOwner&&!itemOwned&&<small><Lock size={12}/> Khusus Team Owner yang terhubung ke tim.</small>}
    </div>
   </article>
   {capacity&&<section className="workspace-card hq-slot-capacity-card"><div><span className="section-eyebrow">TEAM UPGRADE CAPACITY</span><h3>Kapasitas proyek aktif</h3></div><strong>{capacity.max_projects} slot</strong><p>Base 2{capacity.factory_bonus? " + Factory LV6: 1":""}{capacity.shop_bonus? " + Shop item: 1":""}. Maksimal 4 proyek berjalan bersamaan.</p></section>}
   {!teamId&&<section className="workspace-card shop-upcoming-card"><span className="section-eyebrow">TEAM ITEM</span><p>Item ini hanya dapat dibeli oleh Team Owner yang sudah terhubung ke tim.</p></section>}
   <footer className="assets-marketplace-footnote"><RefreshCw size={14}/> Entitlement hanya diberikan setelah server memverifikasi notifikasi pembayaran Midtrans. Redirect atau callback browser tidak pernah menjadi bukti pembayaran.</footer>
  </>}
 </section>;
}
