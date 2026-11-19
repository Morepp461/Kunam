import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,RefreshCw,ShieldCheck,Wallet,Medal,CheckCircle2,AlertCircle} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Driver={id:string;member_code:string|null;character_name:string|null;license:string|null;role:string};
type Band={license_label:string;license_tier:string;sort_order:number};
type WalletRow={id:string;account_kind:string;member_id:string|null;team_id:string|null;balance:number;display_name:string;is_active:boolean};
type Audit={id:string;member_id:string;previous_license:string|null;new_license:string;reason:string;created_at:string};
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function AdminAdjustmentCenter(_props:{session:Session}){
 const [drivers,setDrivers]=useState<Driver[]>([]),[bands,setBands]=useState<Band[]>([]),[wallets,setWallets]=useState<WalletRow[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [driverId,setDriverId]=useState(""),[license,setLicense]=useState(""),[licenseReason,setLicenseReason]=useState("");
 const [walletKind,setWalletKind]=useState<"driver"|"team_owner"|"team">("driver"),[walletId,setWalletId]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return} setLoading(true);
  const [d,b,w,h]=await Promise.all([
   supabase.from("members").select("id,member_code,character_name,license,role").eq("role","Driver").order("character_name"),
   supabase.from("caleris_driver_salary_bands").select("license_label,license_tier,sort_order").order("sort_order"),
   supabase.from("economy_wallet_directory").select("id,account_kind,member_id,team_id,balance,display_name,is_active").in("account_kind",["driver","team_owner","team"]).eq("is_active",true).order("display_name"),
   supabase.from("caleris_admin_license_assignments").select("id,member_id,previous_license,new_license,reason,created_at").order("created_at",{ascending:false}).limit(30)
  ]);
  const error=d.error||b.error||w.error||h.error;
  if(error)setNotice({kind:"error",text:error.message});
  setDrivers((d.data||[]) as Driver[]);setBands((b.data||[]) as Band[]);setWallets((w.data||[]) as WalletRow[]);setAudit((h.data||[]) as Audit[]);
  if(b.data?.length&&!license)setLicense(b.data[0].license_label);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const selectedWallets=useMemo(()=>wallets.filter(w=>w.account_kind===walletKind),[wallets,walletKind]);
 useEffect(()=>{if(!selectedWallets.some(w=>w.id===walletId))setWalletId(selectedWallets[0]?.id||"")},[selectedWallets,walletId]);
 const assignLicense=async()=>{
  if(!supabase||!driverId||!license||licenseReason.trim().length<3)return;
  setSaving(true);setNotice(null);
  const {error}=await supabase.rpc("admin_assign_driver_license",{p_member_id:driverId,p_license_label:license,p_reason:licenseReason.trim()});
  setSaving(false);
  if(error)setNotice({kind:"error",text:error.message});
  else{setNotice({kind:"success",text:"Lisensi Driver berhasil diperbarui dan audit tersimpan."});setLicenseReason("");await load()}
 };
 const inject=async()=>{
  if(!supabase||!walletId||!reason.trim()||!amount)return;
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value){setNotice({kind:"error",text:"Nominal harus lebih besar dari nol dan maksimal dua desimal."});return}
  setSaving(true);setNotice(null);
  const {error}=await supabase.rpc("admin_inject_wallet_balance",{p_wallet_account_id:walletId,p_amount:value,p_reason:reason.trim(),p_idempotency_key:"admin-wallet-injection:"+crypto.randomUUID()});
  setSaving(false);
  if(error)setNotice({kind:"error",text:error.message});
  else{setNotice({kind:"success",text:"Saldo berhasil ditambahkan melalui VreeoBank dan double-entry ledger. "+money(value)});setAmount("");setReason("");await load()}
 };
 const label=(d:Driver)=>[d.character_name||"Driver",d.member_code||d.id.slice(0,8),"Lisensi: "+(d.license||"Belum ada")].join(" · ");
 return <section className="workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">ADMIN CONTROL · DATA MIGRATION</span><h1 className="page-title">License & Wallet Adjustments</h1><p className="page-description">Penyesuaian data Driver dan saldo akun melalui jalur resmi dengan audit trail.</p></header>
  {notice&&<div className={"license-notice "+notice.kind}>{notice.kind==="success"?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>} {notice.text}</div>}
  <div className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">LICENSE ADMINISTRATION</span><h2>Penetapan lisensi Driver</h2></div><Medal size={20}/></div>
   <p className="license-muted">Akun Driver baru otomatis Bronze. Untuk data lama, pilih Driver dan tier dari data resmi. Riwayat scoring tidak diubah.</p>
   <div className="form-grid">
    <label>Driver<select value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Pilih Driver</option>{drivers.map(d=><option key={d.id} value={d.id}>{label(d)}</option>)}</select></label>
    <label>Lisensi<select value={license} onChange={e=>setLicense(e.target.value)}><option value="">Pilih lisensi</option>{bands.map(b=><option key={b.license_label} value={b.license_label}>{b.license_label}</option>)}</select></label>
    <label className="form-grid-full">Alasan penyesuaian<input value={licenseReason} maxLength={240} onChange={e=>setLicenseReason(e.target.value)} placeholder="Contoh: Migrasi data season sebelumnya"/></label>
   </div>
   <button className="action primary" type="button" disabled={saving||loading||!driverId||!license||licenseReason.trim().length<3} onClick={()=>void assignLicense()}>{saving?"Menyimpan...":"Tetapkan Lisensi"}</button>
  </div>
  <div className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">ECONOMY ENGINE</span><h2>Wallet injection</h2></div><Wallet size={20}/></div>
   <p className="license-muted">Pilih wallet Driver, Owner, atau Tim dari direktori database. Sistem mendanai VreeoBank secara ledger bila saldo bank belum cukup, lalu mengkredit wallet tujuan.</p>
   <div className="form-grid">
    <label>Jenis wallet<select value={walletKind} onChange={e=>setWalletKind(e.target.value as typeof walletKind)}><option value="driver">Driver</option><option value="team_owner">Owner</option><option value="team">Tim</option></select></label>
    <label>Tujuan<select value={walletId} onChange={e=>setWalletId(e.target.value)}><option value="">Pilih wallet</option>{selectedWallets.map(w=><option key={w.id} value={w.id}>{w.display_name} · {money(w.balance)}</option>)}</select></label>
    <label>Nominal (€)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label>
    <label>Catatan<input value={reason} maxLength={240} onChange={e=>setReason(e.target.value)} placeholder="Penyesuaian migrasi saldo"/></label>
   </div>
   <button className="action primary" type="button" disabled={saving||loading||!walletId||!amount||reason.trim().length<3} onClick={()=>void inject()}>{saving?"Memproses transaksi...":"Inject Saldo"}</button>
  </div>
  <div className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">AUDIT TRAIL</span><h2>Riwayat penetapan lisensi</h2></div><button className="license-small-button" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
   {loading?<p className="license-muted">Memuat data...</p>:audit.length===0?<p className="license-muted">Belum ada penetapan lisensi manual.</p>:<div className="table-wrap"><table><thead><tr><th>Driver</th><th>Sebelumnya</th><th>Lisensi baru</th><th>Alasan</th><th>Waktu</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{drivers.find(d=>d.id===a.member_id)?.character_name||a.member_id.slice(0,8)}</td><td>{a.previous_license||"—"}</td><td>{a.new_license}</td><td>{a.reason}</td><td>{new Date(a.created_at).toLocaleString("id-ID")}</td></tr>)}</tbody></table></div>}
  </div>
  <div className="license-notice"><ShieldCheck size={16}/> Semua aksi dibatasi di server untuk akun pada <code>site_admins</code>. Tidak ada perubahan saldo langsung dari frontend.</div>
 </section>;
}