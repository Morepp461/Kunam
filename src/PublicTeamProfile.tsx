import { useEffect,useState } from "react";
import { Link,useParams } from "react-router-dom";
import { ChevronLeft,LoaderCircle,Users,UserCircle,Shield,Flag,Palette } from "lucide-react";
import { supabase } from "./lib/supabase";
import { MemberProfileLink } from "./EntityProfileLink";
import { Preview3D, normalizeTeamLiveryDesign, type Sponsor } from "./TeamLivery";
import type { Design } from "./TeamLivery";
import "./public-team-profile.css";

type TeamProfile={id:string;name:string;division_key:string|null};
type RosterMember={member_id:string;character_name:string|null;role:string|null;license:string|null;public_member_id:string|null;display_name:string;avatar_url:string|null};
export default function PublicTeamProfile(){
 const {teamId=""}=useParams();
 const [team,setTeam]=useState<TeamProfile|null>(null),[roster,setRoster]=useState<RosterMember[]>([]),[livery,setLivery]=useState<Design|null>(null),[sponsors,setSponsors]=useState<Sponsor[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let active=true;async function load(){setBusy(true);setError("");if(!supabase){setError("Layanan profil tim belum tersedia.");setBusy(false);return;}const {data,error:requestError}=await supabase.functions.invoke("member-directory",{body:{action:"team_profile",teamId}});if(!active)return;if(requestError||!data?.team){setError(data?.error||"Profil tim tidak ditemukan.");setTeam(null);setRoster([]);setLivery(null);setSponsors([]);}else{setTeam(data.team as TeamProfile);setRoster((data.roster||[]) as RosterMember[]);setLivery(data.livery?normalizeTeamLiveryDesign(data.livery):null);setSponsors((data.sponsors||[]) as Sponsor[]);}setBusy(false)}void load();return()=>{active=false}},[teamId]);
 return <section className="workspace public-team-profile"><Link className="back-link" to="/main-event/global/team-list"><ChevronLeft size={16}/> Team List</Link>
  <div className="public-team-hero"><span className="section-eyebrow">CALERIS MASTERS · TEAM PROFILE</span>{busy?<div className="center-state"><LoaderCircle className="spin"/><p>Mempersiapkan Data...</p></div>:error?<div className="workspace-card"><Users size={28}/><h2>Profil tim tidak tersedia</h2><p>{error}</p></div>:team&&<><div className="public-team-title"><div className="public-team-mark"><Shield size={30}/></div><div><h1>{team.name}</h1><p><Flag size={13}/> {team.division_key||"Belum terdaftar di divisi"}</p></div></div><p className="public-team-id">TEAM PROFILE · {team.id}</p></>}</div>
  {team&&!busy&&!error&&<div className="public-team-content">
   {livery&&<section className="workspace-card public-team-livery"><div className="section-title-row"><div><span className="section-eyebrow">TEAM IDENTITY</span><h2><Palette size={17}/> Official Team Livery</h2><p>Warna, nomor mobil, sponsor aktif, dan identitas visual tim</p></div></div><Preview3D design={livery} sponsors={sponsors}/><div className="public-team-sponsor-strip">{sponsors.map(sponsor=><div className="public-team-sponsor" key={sponsor.id}>{sponsor.logo_url?<img src={sponsor.logo_url} alt={sponsor.name} loading="lazy"/>:<strong>{sponsor.name}</strong>}</div>)}</div></section>}
   <div className="workspace-card public-team-roster"><div className="section-title-row"><div><span className="section-eyebrow">OFFICIAL ROSTER</span><h2>Anggota Tim</h2><p>{roster.length} member terdaftar</p></div></div>
    {roster.length?<div className="public-team-roster-grid">{roster.map(member=><article className="public-team-member" key={member.member_id}><div className="public-team-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:<UserCircle size={32}/>}</div><div className="public-team-member-copy"><strong>{member.public_member_id?<MemberProfileLink memberId={member.public_member_id}>{member.display_name||member.character_name||"Member"}</MemberProfileLink>:(member.display_name||member.character_name||"Member")}</strong><small>{member.role||"Member"}{member.license?" · "+member.license:""}</small></div></article>)}</div>:<p className="public-team-empty">Belum ada anggota tim yang terhubung ke profil publik.</p>}
   </div>
  </div>}
 </section>;
}
