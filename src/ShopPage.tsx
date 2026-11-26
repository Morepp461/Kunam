import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,Clock3,ShoppingBag,Lock,CheckCircle2} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Capacity={base_limit:number;factory_bonus:number;shop_bonus:number;active_projects:number;max_projects:number;shop_item_owned:boolean;shop_item_active:boolean;shop_item_price_eur:number|null};
const money=(value:number)=>"€ "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:2});

export default function ShopPage({session}:{session:Session}){
 const [capacity,setCapacity]=useState<Capacity|null>(null);
 const [isAdmin,setIsAdmin]=useState(false);
 const [isOwner,setIsOwner]=useState(false);
 const [price,setPrice]=useState("");
 const [active,setActive]=useState(false);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");

 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);setError("");
  const [{data:profile,error:profileError},{data:admin}]=await Promise.all([
   supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle(),
   supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle()
  ]);
  if(profileError){setError(profileError.message);setLoading(false);return;}
  const adminAccess=Boolean(admin?.user_id);setIsAdmin(adminAccess);
  if(profile?.member_id){
   const {data:member,error:memberError}=await supabase.from("members").select("role,team_id").eq("id",profile.member_id).maybeSingle();
   if(memberError){setError(memberError.message);setLoading(false);return;}
   setIsOwner(member?.role==="Owner");
   if(member?.team_id){
    const {data,error:capacityError}=await supabase.rpc("member_get_team_hq_project_capacity");
    if(capacityError){setError(capacityError.message);setLoading(false);return;}
    setCapacity(data as Capacity);
   }else setCapacity(null);
  }else{setIsOwner(false);setCapacity(null)}
  if(adminAccess){
   const {data,error:configError}=await supabase.rpc("admin_get_team_hq_slot_shop_config");
   if(configError){setError(configError.message);setLoading(false);return;}
   setPrice(config?.price_eur==null?"":String(config.price_eur));
   setActive(Boolean(config?.is_active));
  }
  setLoading(false);
 },[session.user.id]);

 useEffect(()=>{void load()},[load]);

 const saveConfig=async()=>{
  if(!supabase)return;
  const amount=Number(price);
  if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100){setError("Harga harus lebih dari €0 dan maksimal 2 angka desimal.");return}
  setSaving(true);setError("");setNotice("");
  const {error:saveError}=await supabase.rpc("admin_set_team_hq_slot_shop_item",{p_price_eur:amount,p_is_active:active});
  setSaving(false);
  if(saveError){setError(saveError.message);return}
  setNotice("Konfigurasi item Shop berhasil disimpan.");await load();
 };

 const purchase=async()=>{
  if(!supabase||saving)return;
  if(!window.confirm("Beli tambahan satu slot upgrade Team HQ menggunakan saldo Team Wallet?"))return;
  setSaving(true);setError("");setNotice("");
  const {data,error:purchaseError}=await supabase.rpc("member_purchase_team_hq_project_slot",{p_idempotency_key:crypto.randomUUID()});
  setSaving(false);
  if(purchaseError){setError(purchaseError.message);return}
  setNotice(data?.status==="already_owned"?"Tim sudah memiliki item ini.":"Pembelian berhasil. Kapasitas upgrade HQ bertambah satu slot.");
  await load();
 };

 const itemOwned=Boolean(capacity?.shop_item_owned);
 const itemActive=capacity ? Boolean(capacity.shop_item_active) : isAdmin && active;
 const itemPrice=capacity?.shop_item_price_eur??(isAdmin&&price?Number(price):null);

 return <section className="workspace development-shop-page">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MARKETPLACE</span><h1 className="page-title">Shop</h1><p className="page-description">Item permanen untuk pengembangan fasilitas dan operasional tim.</p></header>
  {error&&<p className="team-hq-error" role="alert">{error}</p>}
  {notice&&<p className="team-hq-notice" role="status">{notice}</p>}
  {loading?<section className="workspace-card shop-upcoming-card"><span className="section-eyebrow">CALERIS MARKETPLACE</span><p>Memuat katalog Shop...</p></section>:<>
   <article className="workspace-card hq-slot-shop-card">
    <div className="hq-slot-shop-icon"><ShoppingBag size={24}/></div>
    <div className="hq-slot-shop-copy"><span className="section-eyebrow">TEAM HQ · PERMANENT UPGRADE</span><h2>Additional HQ Project Slot</h2><p>Menambah satu proyek upgrade Team HQ yang dapat berjalan bersamaan. Berlaku permanen untuk tim yang membeli.</p>
     <div className="hq-slot-shop-meta"><span>+1 Active Project</span><span>Team Wallet · EUR</span><span>{itemOwned?"Sudah dimiliki":"Pembelian satu kali"}</span></div>
    </div>
    <div className="hq-slot-shop-action">
     <strong>{itemPrice&&itemActive?money(itemPrice):"Harga belum tersedia"}</strong>
     {itemOwned?<span className="hq-slot-owned"><CheckCircle2 size={15}/> Owned</span>:<button type="button" disabled={!isOwner||!itemActive||!itemPrice||saving} onClick={()=>void purchase()}>{saving?"Memproses...":isOwner?"Beli item":"Khusus Team Owner"}</button>}
     {!itemActive&&!itemOwned&&<small><Lock size={12}/> Item menunggu aktivasi Admin</small>}
    </div>
   </article>
   {capacity&&<section className="workspace-card hq-slot-capacity-card"><div><span className="section-eyebrow">TEAM UPGRADE CAPACITY</span><h3>Kapasitas proyek aktif</h3></div><strong>{capacity.max_projects} slot</strong><p>Base 2{capacity.factory_bonus? " + Factory LV6: 1":""}{capacity.shop_bonus? " + Shop item: 1":""}. Maksimal 4 proyek berjalan bersamaan.</p></section>}
   {isAdmin&&<section className="workspace-card hq-slot-admin-config">
    <span className="section-eyebrow">ADMIN · SHOP CONFIGURATION</span><h3>Additional HQ Project Slot</h3>
    <label>Harga item (€)<input type="number" min="0.01" step="0.01" value={price} onChange={event=>setPrice(event.target.value)} placeholder="Masukkan harga"/></label>
    <label className="hq-slot-admin-toggle"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/> Aktifkan item di Shop</label>
    <button type="button" disabled={saving||!price||Number(price)<=0} onClick={()=>void saveConfig()}>{saving?"Menyimpan...":"Simpan konfigurasi"}</button>
    <small>Harga wajib ditetapkan Admin sebelum item bisa dibeli. Pembayaran dipotong dari Team Wallet dan masuk ke VreeoBank.</small>
   </section>}
   {!capacity&&!isAdmin&&<section className="workspace-card shop-upcoming-card"><span className="section-eyebrow">TEAM ITEM</span><p>Item ini hanya dapat dibeli oleh Team Owner yang sudah terhubung ke tim.</p></section>}
  </>}
 </section>;
}
