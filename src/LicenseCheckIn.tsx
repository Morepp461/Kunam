import {useCallback,useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {CalendarCheck,CheckCircle2,Clock3,Flag,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";
type LedgerRow={id:string;season_id:string|null;source_type:string;points_delta:number|string;description:string;created_at:string};
type RaceRound={id:string;round_number:number;title:string;checkin_opens_at:string;checkin_closes_at:string;status:string};
const jakartaDate=(value=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
const jakartaTime=(value:string)=>new Date(value).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"});
export default function LicenseCheckIn({session}:{session:Session}){
 const [memberId,setMemberId]=useState<string|null>(null),[memberName,setMemberName]=useState(""),[divisionName,setDivisionName]=useState(""),[seasonTitle,setSeasonTitle]=useState(""),[seasonId,setSeasonId]=useState<string|null>(null);
 const [todayRound,setTodayRound]=useState<RaceRound|null>(null),[checkedIn,setCheckedIn]=useState(false),[seasonPoints,setSeasonPoints]=useState(0),[wdcPoints,setWdcPoints]=useState(0),[todayPoints,setTodayPoints]=useState(0),[history,setHistory]=useState<LedgerRow[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const today=jakartaDate(),now=new Date();
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);setError("Koneksi database belum tersedia.");return}
  const db=supabase;setLoading(true);setError("");
  const {data:profile,error:profileError}=await db.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(profileError||!profile?.member_id){setMemberId(null);setError(profileError?.message||"Akun ini belum terhubung ke karakter member.");setLoading(false);return}
  const {data:member,error:memberError}=await db.from("members").select("id,character_name,role").eq("id",profile.member_id).maybeSingle();
  if(memberError||!member||member.role!=="Driver"){setMemberId(null);setError(memberError?.message||"Race check-in lisensi hanya tersedia untuk role Driver.");setLoading(false);return}
  setMemberId(member.id);setMemberName(member.character_name||"Driver");
  const {data:season,error:seasonError}=await db.from("license_seasons").select("id,title,status").eq("status","active").maybeSingle();
  if(seasonError||!season){setSeasonId(null);setSeasonTitle("");setDivisionName("");setTodayRound(null);setCheckedIn(false);setHistory([]);setSeasonPoints(0);setWdcPoints(0);setTodayPoints(0);setLoading(false);return}
  const {data:registration,error:registrationError}=await db.from("license_season_members").select("season_division_id,is_hiatus").eq("member_id",member.id).eq("season_id",season.id).eq("is_hiatus",false).maybeSingle();
  if(registrationError||!registration){setSeasonId(null);setSeasonTitle("");setDivisionName("");setTodayRound(null);setCheckedIn(false);setHistory([]);setSeasonPoints(0);setWdcPoints(0);setTodayPoints(0);setLoading(false);return}
  const [{data:division},{data:rounds,error:roundError},{data:ledger,error:ledgerError}]=await Promise.all([
   db.from("license_season_divisions").select("division_name,status").eq("id",registration.season_division_id).eq("status","active").maybeSingle(),
   db.from("license_rounds").select("id,round_number,title,checkin_opens_at,checkin_closes_at,status").eq("season_division_id",registration.season_division_id).neq("status","closed").order("round_number"),
   db.from("license_score_ledger").select("id,season_id,source_type,points_delta,description,created_at").eq("member_id",member.id).order("created_at",{ascending:false})
  ]);
  if(roundError||ledgerError){setError(roundError?.message||ledgerError?.message||"Gagal memuat jadwal race dan riwayat lisensi.");setLoading(false);return}
  if(!division){setSeasonId(null);setTodayRound(null);setLoading(false);return}
  const scheduled=(rounds||[] as RaceRound[]).find(r=>jakartaDate(new Date(r.checkin_opens_at))===today&&jakartaDate(new Date(r.checkin_closes_at))===today&&now>=new Date(r.checkin_opens_at)&&now<=new Date(r.checkin_closes_at))||null;
  setSeasonId(season.id);setSeasonTitle(season.title);setDivisionName(division.division_name);setTodayRound(scheduled);
  let hasCheckedIn=false;
  if(scheduled){
   const {data:checkin,error:checkinError}=await db.from("license_daily_checkins").select("id").eq("member_id",member.id).eq("round_id",scheduled.id).maybeSingle();
   if(checkinError){setError(checkinError.message);setLoading(false);return}
   hasCheckedIn=Boolean(checkin);
  }
  setCheckedIn(hasCheckedIn);
  const rows=(ledger||[]) as LedgerRow[];setHistory(rows.slice(0,30));
  setSeasonPoints(rows.filter(x=>x.season_id===season.id&&x.source_type!=="wdc").reduce((sum,x)=>sum+Number(x.points_delta),0));
  setWdcPoints(rows.filter(x=>x.source_type==="wdc").reduce((sum,x)=>sum+Number(x.points_delta),0));
  setTodayPoints(rows.filter(x=>x.source_type==="daily_checkin"&&scheduled&&new Date(x.created_at).toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"})===today).reduce((sum,x)=>sum+Number(x.points_delta),0));
  setLoading(false);
 },[session.user.id,today]);
 useEffect(()=>{void load()},[load]);
 const checkIn=async()=>{if(!supabase||!memberId||!todayRound)return;setSaving(true);setError("");const {error:e}=await supabase.from("license_daily_checkins").insert({member_id:memberId,round_id:todayRound.id,checkin_date:today});setSaving(false);if(e){setError(e.code==="23505"?"Check-in untuk race ini sudah tercatat.":e.message);return}await load()};
 return <section className="workspace license-checkin">
  <header className="page-heading"><span className="section-eyebrow">DRIVER PANEL · LICENSE</span><h1 className="page-title">Race Check-in</h1><p className="page-description">Absensi hanya tersedia pada tanggal dan periode race yang dijadwalkan Admin. Tidak ada absensi pada hari non-race.</p></header>
  {loading?<div className="workspace-card license-checkin-state"><Clock3/><p>Memuat jadwal race...</p></div>:!memberId?<div className="workspace-card license-checkin-state"><ShieldCheck/><strong>Check-in belum tersedia</strong><p>{error}</p></div>:!seasonId?<div className="workspace-card license-checkin-state"><CalendarCheck/><strong>Belum ada season aktif</strong><p>Check-in tersedia setelah Admin mendaftarkan driver ke divisi season aktif.</p></div>:<>
   <div className="license-checkin-hero"><div><span className="section-eyebrow">ACTIVE SEASON</span><h2>{seasonTitle}</h2><p>{divisionName} · {memberName}</p></div><span className="license-checkin-date">{today}</span></div>
   <div className="workspace-card license-checkin-action">{todayRound?(checkedIn?<><CheckCircle2 size={32}/><strong>Check-in Round {todayRound.round_number} sudah tercatat</strong><p>{todayRound.title} · {jakartaTime(todayRound.checkin_opens_at)}–{jakartaTime(todayRound.checkin_closes_at)} WIB. Kehadiran dan poin lisensi tersimpan.</p></>:<><Flag size={32}/><strong>Race hari ini · Round {todayRound.round_number}</strong><p>{todayRound.title} · Periode check-in {jakartaTime(todayRound.checkin_opens_at)}–{jakartaTime(todayRound.checkin_closes_at)} WIB.</p><button className="action primary" disabled={saving} onClick={()=>void checkIn()}>{saving?"Menyimpan...":"Absen race sekarang"}</button></>):<><CalendarCheck size={32}/><strong>Tidak ada jadwal race hari ini</strong><p>Tombol absen hanya muncul pada tanggal race yang dijadwalkan. Hari tanpa race tidak dihitung sebagai absen.</p></>}</div>
   <div className="license-score-grid"><article><span>Skor season ini</span><strong>{seasonPoints.toLocaleString("id-ID")}</strong></article><article><span>Bonus WDC permanen</span><strong>{wdcPoints.toLocaleString("id-ID")}</strong><small>Hanya satu kali seumur sistem, tidak dapat ditambah atau dikurangi.</small></article><article><span>Poin race hari ini</span><strong>{todayPoints.toLocaleString("id-ID")}</strong></article></div>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">SCORE LEDGER</span><h2>Riwayat poin lisensi</h2></div><Clock3 size={18}/></div>{history.length?<div className="license-history">{history.map(row=><article key={row.id}><div><strong>{row.description}</strong><small>{new Date(row.created_at).toLocaleString("id-ID")}</small></div><b className={Number(row.points_delta)<0?"negative":"positive"}>{Number(row.points_delta)>0?"+":""}{Number(row.points_delta).toLocaleString("id-ID")}</b></article>)}</div>:<p className="license-muted">Belum ada transaksi poin lisensi.</p>}</section>
  </>}
  {error&&memberId&&<div className="license-notice error" role="alert">{error}</div>}
 </section>;
}
