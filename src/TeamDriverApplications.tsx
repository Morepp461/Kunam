import {useCallback,useEffect,useMemo,useState} from "react";
import {LoaderCircle,RefreshCw,Users,Flag,CheckCircle2} from "lucide-react";
import {supabase} from "./lib/supabase";
import "./main-event-registration.css";

type Application=Record<string,any>;
type Member={id:string;role:string|null;team_id:string|null};
type Team={id:string;name:string;division_key:string|null};
type Season={id:string;title:string;status:string};
type Contract={id:string;season_id:string;member_id:string;annual_salary:number;status:string;members?:{character_name:string|null;license:string|null;team_id:string|null}};
type Registration={season_id:string;member_id:string};

export default function TeamDriverApplications(){
 const [rows,setRows]=useState<Application[]>([]);
 const [team,setTeam]=useState<Team|null>(null),[seasons,setSeasons]=useState<Season[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[registrations,setRegistrations]=useState<Registration[]>([]);
 const [seasonId,setSeasonId]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setNotice("Supabase belum dikonfigurasi.");setLoading(false);return;}
  setLoading(true);setNotice("");
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){setNotice(userError?.message||"Sesi akun tidak ditemukan.");setRows([]);setLoading(false);return;}
  const {data:profile,error:profileError}=await supabase.from("profiles").select("member_id").eq("user_id",user.id).maybeSingle();
  if(profileError||!profile?.member_id){setNotice(profileError?.message||"Karakter Team Owner tidak ditemukan.");setLoading(false);return;}
  const {data:member,error:memberError}=await supabase.from("members").select("id,role,team_id").eq("id",profile.member_id).maybeSingle();
  if(memberError||!member||member.role!=="Owner"||!member.team_id){setNotice(memberError?.message||"Halaman ini hanya tersedia untuk Team Owner.");setLoading(false);return;}
  const [teamResult,seasonResult,applicationResult]=await Promise.all([
   supabase.from("teams").select("id,name,division_key").eq("id",member.team_id).maybeSingle(),
   supabase.from("license_seasons").select("id,title,status").in("status",["active","draft"]).order("starts_on",{ascending:false}),
   supabase.rpc("team_list_driver_applications")
  ]);
  if(teamResult.error||seasonResult.error){setNotice(teamResult.error?.message||seasonResult.error?.message||"Gagal memuat roster.");setLoading(false);return;}
  const nextTeam=teamResult.data as Team|null,nextSeasons=(seasonResult.data||[]) as Season[];
  setTeam(nextTeam);setSeasons(nextSeasons);setRows(Array.isArray(applicationResult.data)?applicationResult.data as Application[]:[]);
  if(!seasonId&&nextSeasons.length)setSeasonId(nextSeasons[0].id);
  if(applicationResult.error)setNotice(applicationResult.error.message);
  if(!nextTeam){setContracts([]);setRegistrations([]);setLoading(false);return;}
  const [contractResult,registrationResult]=await Promise.all([
   supabase.from("economy_driver_contracts").select("id,season_id,member_id,annual_salary,status,members(character_name,license,team_id)").eq("team_id",nextTeam.id).order("created_at",{ascending:false}),
   nextSeasons.length?supabase.from("license_season_members").select("season_id,member_id").in("season_id",nextSeasons.map(s=>s.id)):Promise.resolve({data:[],error:null})
  ]);
  if(contractResult.error||registrationResult.error)setNotice(contractResult.error?.message||registrationResult.error?.message||"Gagal memuat registrasi FIA.");
  setContracts((contractResult.data||[]) as Contract[]);setRegistrations((registrationResult.data||[]) as Registration[]);
  const selected=seasonId||nextSeasons[0]?.id||"";
  if(!seasonId&&selected)setSeasonId(selected);
  setLoading(false);
 },[seasonId]);
 useEffect(()=>{void load()},[load]);
 const selectedSeason=seasons.find(s=>s.id===seasonId);
 const seasonContracts=useMemo(()=>contracts.filter(c=>c.season_id===seasonId),[contracts,seasonId]);
 const registered=(memberId:string)=>registrations.some(r=>r.season_id===seasonId&&r.member_id===memberId);
 const register=async(memberId:string)=>{
  if(!supabase||!seasonId)return;
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("team_register_driver_to_fia",{p_member_id:memberId,p_season_id:seasonId});
  setSaving(false);
  if(error){setNotice(error.message);return;}
  setNotice("Driver berhasil dikirim ke roster FIA untuk "+(selectedSeason?.title||"season")+" .");
  await load();
 };
 const cash=(n:number)=>"€ "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
 return <section className="workspace mer-workspace">
  <header className="page-heading mer-admin-heading"><div><span className="section-eyebrow">TEAM PANEL · DRIVER RECRUITMENT</span><h1 className="page-title">Driver Registration</h1><p className="page-description">Kirim roster Driver yang sudah memiliki kontrak ke FIA. Halaman ini juga digunakan untuk registrasi roster setiap Pre Season.</p></div><button className="mer-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
  {notice&&<div className="mer-notice" role="status">{notice}</div>}
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">FIA ROSTER SUBMISSION</span><h2>{team?.name||"Team"} · Driver Line-up</h2></div><Flag size={19}/></div>
   <label className="license-select">Season<select value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
   {selectedSeason&&<p className="license-muted">Roster untuk {selectedSeason.title}. Hanya Driver dengan kontrak yang sudah disepakati dapat didaftarkan.</p>}
   {loading?<div className="mer-panel"><LoaderCircle className="mer-spin"/> Memuat roster...</div>:!seasonId?<p className="team-contracts-muted">Belum ada season aktif atau draft.</p>:seasonContracts.length===0?<p className="team-contracts-muted">Belum ada kontrak Driver untuk season ini.</p>:<div className="license-list">{seasonContracts.map(c=><article key={c.id}><div><strong>{c.members?.character_name||"Driver"}</strong><small>{c.members?.license||"Lisensi belum tersedia"} · {cash(c.annual_salary)}/season</small><small>Status kontrak: {c.status==="pending_registration"?"Menunggu registrasi FIA":c.status}</small></div>{registered(c.member_id)?<span className="license-success"><CheckCircle2 size={15}/> Registered</span>:<button className="license-small-button" disabled={saving||!["pending_registration","active"].includes(c.status)} onClick={()=>void register(c.member_id)}>{saving?"Mengirim...":"Daftarkan ke FIA"}</button>}</article>)}</div>}
  </section>
  <section className="mer-panel">
   <div className="section-title-row"><div><span className="section-eyebrow">TEAM RECRUITMENT</span><h2>Driver Applications</h2></div><Users size={19}/></div>
   <p className="page-description">Lamaran Driver yang dikirim melalui formulir registrasi Main Event.</p>
   {loading?<div className="mer-panel"><LoaderCircle className="mer-spin"/> Memuat lamaran...</div>:rows.length===0?<div className="mer-panel"><Users/><h2>Belum ada lamaran Driver</h2><p>Lamaran dari kandidat yang memilih tim ini akan muncul di sini.</p></div>:<div className="mer-admin-list">{rows.map(row=><article className="mer-admin-card" key={row.id}><div className="mer-admin-card-head"><div><span className="mer-status">NEW APPLICATION</span><h2>{row.nickname}</h2><p>{row.nationality} · {row.hometown}</p></div><time>{new Date(row.created_at).toLocaleDateString("id-ID",{dateStyle:"medium"})}</time></div><div className="mer-admin-identity"><div className="mer-admin-image">{row.avatar_url?<img src={row.avatar_url} alt="Avatar Driver"/>:<Users/>}</div><div><span>Driver Number</span><strong>{row.driver_number_preference}</strong><span>Julukan</span><strong>{row.driver_epithet||"—"}</strong></div></div></article>)}</div>}
  </section>
 </section>;
}
