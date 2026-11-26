import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,RefreshCw,ShieldCheck,Medal,CheckCircle2,AlertCircle} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import {MemberProfileLink} from "./EntityProfileLink";

type Driver={id:string;member_code:string|null;character_name:string|null;license:string|null;role:string;public_member_id?:string|null};
type Band={license_label:string;license_tier:string;sort_order:number};
type Audit={id:string;member_id:string;previous_license:string|null;new_license:string;reason:string;created_at:string};
export default function AdminAdjustmentCenter(_props:{session:Session}){
 const [drivers,setDrivers]=useState<Driver[]>([]),[bands,setBands]=useState<Band[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [driverId,setDriverId]=useState(""),[license,setLicense]=useState(""),[licenseReason,setLicenseReason]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return} setLoading(true);
  const [d,b,h,dir]=await Promise.all([
   supabase.from("members").select("id,member_code,character_name,license,role").eq("role","Driver").order("character_name"),
   supabase.from("caleris_driver_salary_bands").select("license_label,license_tier,sort_order").order("sort_order"),
   supabase.from("caleris_admin_license_assignments").select("id,member_id,previous_license,new_license,reason,created_at").order("created_at",{ascending:false}).limit(30),
   supabase.from("caleris_member_directory").select("id,public_member_id").eq("role","Driver")
  ]);
  const error=d.error||b.error||h.error||dir.error;
  if(error)setNotice({kind:"error",text:error.message});
  const publicIds=new Map((dir.data||[]).map((row:any)=>[row.id,row.public_member_id]));
  setDrivers((d.data||[]).map((driver:any)=>({...driver,public_member_id:publicIds.get(driver.id)||null})) as Driver[]);setBands((b.data||[]) as Band[]);setAudit((h.data||[]) as Audit[]);
  if(b.data?.length&&!license)setLicense(b.data[0].license_label);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const assignLicense=async()=>{
  if(!supabase||!driverId||!license||licenseReason.trim().length<3)return;
  setSaving(true);setNotice(null);
  const {error}=await supabase.rpc("admin_assign_driver_license",{p_member_id:driverId,p_license_label:license,p_reason:licenseReason.trim()});
  setSaving(false);
  if(error)setNotice({kind:"error",text:error.message});
  else{setNotice({kind:"success",text:"Lisensi Driver berhasil diperbarui dan audit tersimpan."});setLicenseReason("");await load()}
 };
 const label=(d:Driver)=>[d.character_name||"Driver",d.member_code||d.id.slice(0,8),"Lisensi: "+(d.license||"Belum ada")].join(" · ");
 return <section className="workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">ADMIN CONTROL · DATA MIGRATION</span><h1 className="page-title">License Adjustments</h1><p className="page-description">Penetapan lisensi Driver melalui jalur resmi dengan audit trail.</p></header>
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
   <div className="section-title-row"><div><span className="section-eyebrow">AUDIT TRAIL</span><h2>Riwayat penetapan lisensi</h2></div><button className="license-small-button" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
   {loading?<p className="license-muted">Memuat data...</p>:audit.length===0?<p className="license-muted">Belum ada penetapan lisensi manual.</p>:<div className="table-wrap"><table><thead><tr><th>Driver</th><th>Sebelumnya</th><th>Lisensi baru</th><th>Alasan</th><th>Waktu</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td><MemberProfileLink memberId={drivers.find(d=>d.id===a.member_id)?.public_member_id}>{drivers.find(d=>d.id===a.member_id)?.character_name||a.member_id.slice(0,8)}</MemberProfileLink></td><td>{a.previous_license||"—"}</td><td>{a.new_license}</td><td>{a.reason}</td><td>{new Date(a.created_at).toLocaleString("id-ID")}</td></tr>)}</tbody></table></div>}
  </div>
  <div className="license-notice"><ShieldCheck size={16}/> Semua aksi dibatasi di server untuk akun pada <code>site_admins</code>. Tidak ada perubahan saldo langsung dari frontend.</div>
 </section>;
}