import {useCallback,useEffect,useState} from "react";
import {CalendarCheck,CheckCircle2,Clock3,ShieldCheck} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Member={id:string;character_name:string|null;role:string|null};
type Round={id:string;round_number:number;title:string;season_division_id:string;checkin_opens_at:string;checkin_closes_at:string;status:string;division?:{division_name:string;season?:{title:string}}};
type Checkin={id:string;round_id:string;reward_amount:number;reward_status:string;checkin_at:string};
const time=(v:string)=>new Date(v).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"});
export default function MemberRaceCheckIn({session}:{session:Session}){
 const [member,setMember]=useState<Member|null>(null),[rounds,setRounds]=useState<Round[]>([]),[checkins,setCheckins]=useState<Checkin[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);setNotice("Koneksi database belum tersedia.");return}
  setLoading(true);setNotice("");
  const {data:profile,error:profileError}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(profileError||!profile?.member_id){setMember(null);setRounds([]);setCheckins([]);setNotice(profileError?.message||"Akun belum terhubung ke karakter member.");setLoading(false);return}
  const {data:m,error:mError}=await supabase.from("members").select("id,character_name,role").eq("id",profile.member_id).maybeSingle();
  if(mError||!m){setMember(null);setRounds([]);setCheckins([]);setNotice(mError?.message||"Data member tidak ditemukan.");setLoading(false);return}
  setMember(m as Member);
  const now=new Date().toISOString();
  const {data:r,error:rError}=await supabase.from("license_rounds").select("id,round_number,title,season_division_id,checkin_opens_at,checkin_closes_at,status,license_season_divisions(division_name,license_seasons(title,status))").neq("status","closed").lte("checkin_opens_at",now).gte("checkin_closes_at",now).order("checkin_opens_at");
  if(rError){setNotice(rError.message);setLoading(false);return}
  let current=(r||[]).filter((x:any)=>x.license_season_divisions?.license_seasons?.status==="active").map((x:any)=>({...x,division:{...x.license_season_divisions,season:x.license_season_divisions.license_seasons}})) as Round[];
  if(m.role==="Driver"){const {data:registrations}=await supabase.from("license_season_members").select("season_division_id,license_seasons(status)").eq("member_id",m.id).eq("is_hiatus",false);const activeDivisions=new Set((registrations||[]).filter((x:any)=>x.license_seasons?.status==="active").map((x:any)=>x.season_division_id));current=current.filter(x=>activeDivisions.has(x.season_division_id));}
  setRounds(current);
  if(current.length){const {data:existing,error:e}=await supabase.from("caleris_member_race_checkins").select("id,round_id,reward_amount,reward_status,checkin_at").eq("member_id",m.id).in("round_id",current.map(x=>x.id));if(e)setNotice(e.message);setCheckins((existing||[]) as Checkin[])}else setCheckins([]);
  setLoading(false);
 },[session.user.id]);
 useEffect(()=>{void load()},[load]);
 const checked=new Set(checkins.map(x=>x.round_id));
 const submit=async(round:Round)=>{
  if(!supabase||!member)return;setSaving(true);setNotice("");
  const {data,error}=await supabase.rpc("member_race_checkin",{p_round_id:round.id});
  setSaving(false);
  if(error){setNotice(error.message);return}
  const result=data as {reward_amount?:number;reward_status?:string;license_points?:boolean};
  setNotice("Check-in berhasil. Reward: "+(result.reward_amount??0).toLocaleString("id-ID")+" ¢p · "+(result.license_points?"Poin lisensi Driver juga tercatat.":"Check-in role berhasil dicatat."));
  await load();
 };
 return <section className="workspace member-race-checkin">
  <Link className="back-link" to="/dashboard">← Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">MEMBER ATTENDANCE</span><h1 className="page-title">Race Check-in</h1><p className="page-description">Semua role dapat melakukan check-in pada jendela waktu race. Driver yang terdaftar juga memperoleh poin lisensi melalui sistem yang sudah ada.</p></header>
  {loading?<div className="workspace-card checkin-state"><Clock3/><p>Memeriksa jadwal race...</p></div>:!member?<div className="workspace-card checkin-state"><ShieldCheck/><strong>Member belum terhubung</strong><p>{notice}</p></div>:<><div className="checkin-member-card"><div><span className="section-eyebrow">MEMBER IDENTITY</span><h2>{member.character_name||"Member"}</h2><p>{member.role||"Role belum ditetapkan"}</p></div><span className="empty-tag">{member.role==="Driver"?"DRIVER · LICENSE ELIGIBLE":"MEMBER ATTENDANCE"}</span></div>
   {rounds.length===0?<div className="workspace-card checkin-state"><CalendarCheck/><strong>Tidak ada jendela check-in aktif</strong><p>Tombol check-in hanya tersedia selama waktu race yang ditetapkan FIA/Admin.</p></div>:<div className="checkin-round-list">{rounds.map(round=>{const done=checked.has(round.id);const record=checkins.find(x=>x.round_id===round.id);return <article className="workspace-card checkin-round-card" key={round.id}><div className="checkin-round-copy"><span className="section-eyebrow">{round.division?.season?.title||"Active Season"} · {round.division?.division_name||"Division"}</span><h2>Round {round.round_number} · {round.title}</h2><p>Check-in window {time(round.checkin_opens_at)}–{time(round.checkin_closes_at)} WIB</p>{done&&<small>Reward {record?.reward_status==="paid"?"dibayar":record?.reward_status==="pending"?"menunggu saldo Bank":"belum dikonfigurasi"} · {Number(record?.reward_amount||0).toLocaleString("id-ID")} ¢p</small>}</div>{done?<span className="checkin-done"><CheckCircle2 size={18}/> CHECKED IN</span>:<button className="action primary" disabled={saving} onClick={()=>void submit(round)}>{saving?"Menyimpan...":"Check in sekarang"}</button>}</article>})}</div>}
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
