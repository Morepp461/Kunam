import {useCallback,useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {CalendarCheck,CheckCircle2,Clock3,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";
type LedgerRow={id:string;season_id:string|null;source_type:string;points_delta:number|string;description:string;created_at:string};
const jakartaDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export default function LicenseCheckIn({session}:{session:Session}){
 const [memberId,setMemberId]=useState<string|null>(null),[memberName,setMemberName]=useState(""),[divisionName,setDivisionName]=useState(""),[seasonTitle,setSeasonTitle]=useState(""),[seasonId,setSeasonId]=useState<string|null>(null);
 const [checkedIn,setCheckedIn]=useState(false),[roundOneReady,setRoundOneReady]=useState(false),[seasonPoints,setSeasonPoints]=useState(0),[wdcPoints,setWdcPoints]=useState(0),[todayPoints,setTodayPoints]=useState(0),[history,setHistory]=useState<LedgerRow[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const today=jakartaDate();
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);setError("Koneksi database belum tersedia.");return}
  const db=supabase;setLoading(true);setError("");
  const {data:profile,error:profileError}=await db.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(profileError||!profile?.member_id){setMemberId(null);setError(profileError?.message||"Akun ini belum terhubung ke karakter member.");setLoading(false);return}
  const {data:member,error:memberError}=await db.from("members").select("id,character_name,role").eq("id",profile.member_id).maybeSingle();
  if(memberError||!member||member.role!=="Driver"){setMemberId(null);setError(memberError?.message||"Daily check-in lisensi hanya tersedia untuk role Driver.");setLoading(false);return}
  setMemberId(member.id);setMemberName(member.character_name||"Driver");
  const {data:season,error:seasonError}=await db.from("license_seasons").select("id,title,status").eq("status","active").maybeSingle();
  if(seasonError||!season){setSeasonId(null);setSeasonTitle("");setDivisionName("");setCheckedIn(false);setHistory([]);setSeasonPoints(0);setWdcPoints(0);setLoading(false);return}
  const {data:registration,error:registrationError}=await db.from("license_season_members").select("season_division_id,is_hiatus").eq("member_id",member.id).eq("season_id",season.id).eq("is_hiatus",false).maybeSingle();
  if(registrationError||!registration){setSeasonId(null);setSeasonTitle("");setDivisionName("");setCheckedIn(false);setHistory([]);setSeasonPoints(0);setWdcPoints(0);setLoading(false);return}
  const [{data:division},{data:roundOne},{data:checkin,error:checkinError},{data:ledger,error:ledgerError}]=await Promise.all([
   db.from("license_season_divisions").select("division_name,status").eq("id",registration.season_division_id).eq("status","active").maybeSingle(),
   db.from("license_rounds").select("checkin_opens_at").eq("season_division_id",registration.season_division_id).order("round_number",{ascending:true}).limit(1).maybeSingle(),
   db.from("license_daily_checkins").select("id").eq("member_id",member.id).eq("checkin_date",today).maybeSingle(),
   db.from("license_score_ledger").select("id,season_id,source_type,points_delta,description,created_at").eq("member_id",member.id).order("created_at",{ascending:false})
  ]);
  if(checkinError||ledgerError){setError(checkinError?.message||ledgerError?.message||"Gagal memuat riwayat lisensi.");setLoading(false);return}
  if(!division){setSeasonId(null);setLoading(false);return}
  setSeasonId(season.id);setSeasonTitle(season.title);setDivisionName(division.division_name);setCheckedIn(Boolean(checkin));
  const ready=Boolean(roundOne?.checkin_opens_at&&today>=new Date(roundOne.checkin_opens_at).toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"}));setRoundOneReady(ready);
  const rows=(ledger||[]) as LedgerRow[];setHistory(rows.slice(0,30));
  setSeasonPoints(rows.filter(x=>x.season_id===season.id&&x.source_type!=="wdc").reduce((sum,x)=>sum+Number(x.points_delta),0));
  setWdcPoints(rows.filter(x=>x.source_type==="wdc").reduce((sum,x)=>sum+Number(x.points_delta),0));
  setTodayPoints(rows.filter(x=>x.source_type==="daily_checkin"&&new Date(x.created_at).toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"})===today).reduce((sum,x)=>sum+Number(x.points_delta),0));
  setLoading(false);
 },[session.user.id,today]);
 useEffect(()=>{void load()},[load]);
 const checkIn=async()=>{if(!supabase||!memberId)return;setSaving(true);setError("");const {error:e}=await supabase.from("license_daily_checkins").insert({member_id:memberId,checkin_date:today});setSaving(false);if(e){setError(e.code==="23505"?"Check-in hari ini sudah tercatat.":e.message);return}await load()};
 return <section className="workspace license-checkin">
  <header className="page-heading"><span className="section-eyebrow">DRIVER PANEL · LICENSE</span><h1 className="page-title">Daily Check-in</h1><p className="page-description">Check-in harian menjadi sumber kehadiran sekaligus perolehan poin lisensi. Satu check-in per hari.</p></header>
  {loading?<div className="workspace-card license-checkin-state"><Clock3/><p>Memuat status lisensi...</p></div>:!memberId?<div className="workspace-card license-checkin-state"><ShieldCheck/><strong>Check-in belum tersedia</strong><p>{error}</p></div>:!seasonId?<div className="workspace-card license-checkin-state"><CalendarCheck/><strong>Belum ada season aktif</strong><p>Check-in poin lisensi tersedia setelah Admin mendaftarkan driver ke divisi season aktif.</p></div>:<>
   <div className="license-checkin-hero"><div><span className="section-eyebrow">ACTIVE SEASON</span><h2>{seasonTitle}</h2><p>{divisionName} · {memberName}</p></div><span className="license-checkin-date">{today}</span></div>
   <div className="workspace-card license-checkin-action">{checkedIn?<><CheckCircle2 size={32}/><strong>Check-in hari ini sudah tercatat</strong><p>Kehadiran tersimpan dan poin lisensi dihitung otomatis sesuai konfigurasi.</p></>:!roundOneReady?<><CalendarCheck size={32}/><strong>Check-in poin belum dimulai</strong><p>Perhitungan dimulai pada tanggal pembukaan Round 1.</p></>:<><CalendarCheck size={32}/><strong>Check-in harian tersedia</strong><p>Catat kehadiran hari ini. Satu check-in per hari.</p><button className="action primary" disabled={saving} onClick={()=>void checkIn()}>{saving?"Menyimpan...":"Check-in sekarang"}</button></>}</div>
   <div className="license-score-grid"><article><span>Skor season ini</span><strong>{seasonPoints.toLocaleString("id-ID")}</strong></article><article><span>Akumulasi bonus WDC</span><strong>{wdcPoints.toLocaleString("id-ID")}</strong></article><article><span>Poin check-in hari ini</span><strong>{todayPoints.toLocaleString("id-ID")}</strong></article></div>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">SCORE LEDGER</span><h2>Riwayat poin lisensi</h2></div><Clock3 size={18}/></div>{history.length?<div className="license-history">{history.map(row=><article key={row.id}><div><strong>{row.description}</strong><small>{new Date(row.created_at).toLocaleString("id-ID")}</small></div><b className={Number(row.points_delta)<0?"negative":"positive"}>{Number(row.points_delta)>0?"+":""}{Number(row.points_delta).toLocaleString("id-ID")}</b></article>)}</div>:<p className="license-muted">Belum ada transaksi poin lisensi.</p>}</section>
  </>}
  {error&&memberId&&<div className="license-notice error" role="alert">{error}</div>}
 </section>;
}
