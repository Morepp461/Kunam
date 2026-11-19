import {useEffect,useState} from "react";
import type {ReactNode} from "react";
import type {Session} from "@supabase/supabase-js";
import {Activity,ArrowUpRight,CalendarDays,Flag,Trophy,Users,Wallet} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import RaceScheduleDashboard from "./RaceScheduleDashboard";
import NotificationsCenter from "./NotificationsCenter";

type Toast=(kind:"success"|"error"|"warning"|"info",title:string,message?:string)=>void;
type DashboardProfile={member_id:string|null;web_nickname:string|null;driver_nickname:string|null};
function PageHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){return <div className="page-heading"><p className="kicker">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div>}
function ownDashboardTitle(scope:string){return scope==="STATISTIK TIM"?"Statistik Tim":scope==="STATISTIK DRIVER"?"Statistik Driver":"Statistik Akun";}

export default function Dashboard({session,profile,profileReady,toast}:{session:Session;profile:DashboardProfile|null;profileReady:boolean;toast:Toast}){
const [isAdmin,setIsAdmin]=useState(false);
  const [statCards,setStatCards]=useState<{label:string;value:string;detail:string;icon:ReactNode}[]>([]);
  const [statsLoading,setStatsLoading]=useState(true),[statsScope,setStatsScope]=useState("STATISTIK MEMBER");
  useEffect(()=>{let active=true;async function check(){if(!supabase)return;const {data,error}=await supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle();if(!active)return;if(error)toast("error","Role gagal diperiksa",error.message);setIsAdmin(Boolean(data?.user_id))}void check();return()=>{active=false}},[session.user.id,toast]);
  useEffect(()=>{let active=true;async function loadStats(){
    if(!supabase||!profileReady){setStatsLoading(!profileReady);return;}
    setStatsLoading(true);
    const empty=[{label:"Season",value:"—",detail:"Belum ada data",icon:<CalendarDays/>},{label:"Race start",value:"—",detail:"Belum ada data",icon:<Flag/>},{label:"Points",value:"—",detail:"Belum ada data",icon:<Activity/>},{label:"Race wins",value:"—",detail:"Belum ada data",icon:<Trophy/>}];
    if(!profile?.member_id){if(active){setStatsScope("STATISTIK MEMBER");setStatCards(empty);setStatsLoading(false)}return;}
    const {data:ownMember,error:memberError}=await supabase.from("members").select("id,role,team_id").eq("id",profile.member_id).maybeSingle();
    if(!active)return;
    if(memberError){toast("error","Statistik gagal dimuat",memberError.message);setStatCards(empty);setStatsLoading(false);return;}
    if(!ownMember){setStatCards(empty);setStatsLoading(false);return;}
    const [activeSeasonsQ,registrationsQ]=await Promise.all([
      supabase.from("license_seasons").select("id").eq("status","active"),
      supabase.from("license_season_members").select("season_id").eq("member_id",ownMember.id)
    ]);
    const activeSeasonIds=(activeSeasonsQ.data||[]).map((row:any)=>row.id);
    const seasonCount=new Set((registrationsQ.data||[]).map((row:any)=>row.season_id)).size;
    let divisionIds:string[]=[],roundIds:string[]=[];
    if(activeSeasonIds.length){
      const {data:divisions}=await supabase.from("license_season_divisions").select("id").in("season_id",activeSeasonIds);
      divisionIds=(divisions||[]).map((row:any)=>row.id);
    }
    if(divisionIds.length){
      const {data:rounds}=await supabase.from("license_rounds").select("id").in("season_division_id",divisionIds).neq("status","cancelled");
      roundIds=(rounds||[]).map((row:any)=>row.id);
    }
    if(ownMember.role==="Driver"){
      const [entriesQ,pointsQ,winsQ]=await Promise.all([
        roundIds.length?supabase.from("caleris_race_result_entries").select("round_id").eq("member_id",ownMember.id).in("round_id",roundIds):Promise.resolve({data:[],error:null}),
        roundIds.length?supabase.from("license_round_standings").select("points_total").eq("member_id",ownMember.id).in("round_id",roundIds):Promise.resolve({data:[],error:null}),
        roundIds.length?supabase.from("caleris_race_results").select("id").eq("winner_member_id",ownMember.id).in("round_id",roundIds):Promise.resolve({data:[],error:null})
      ]);
      const races=new Set((entriesQ.data||[]).map((row:any)=>row.round_id)).size;
      const points=(pointsQ.data||[]).reduce((sum:number,row:any)=>sum+Number(row.points_total||0),0);
      if(active){setStatsScope("STATISTIK DRIVER");setStatCards([
        {label:"Season entered",value:String(seasonCount),detail:"Total season terdaftar",icon:<CalendarDays/>},
        {label:"Race start",value:String(races),detail:"Klasifikasi resmi tercatat",icon:<Flag/>},
        {label:"Season points",value:points.toLocaleString("id-ID"),detail:"Poin pada season aktif",icon:<Activity/>},
        {label:"Race wins",value:String((winsQ.data||[]).length),detail:"Kemenangan season aktif",icon:<Trophy/>}
      ]);}
    }else if(ownMember.role==="Owner"&&ownMember.team_id){
      const [teamMembersQ,entriesQ]=await Promise.all([
        supabase.from("members").select("id").eq("team_id",ownMember.team_id).eq("role","Driver"),
        roundIds.length?supabase.from("caleris_race_result_entries").select("round_id,member_id").eq("team_id",ownMember.team_id).in("round_id",roundIds):Promise.resolve({data:[],error:null})
      ]);
      const teamMemberIds=(teamMembersQ.data||[]).map((row:any)=>row.id);
      const teamEntries=entriesQ.data||[];
      const roundStandingsQ=teamMemberIds.length&&roundIds.length?await supabase.from("license_round_standings").select("round_id,member_id,points_total").in("member_id",teamMemberIds).in("round_id",roundIds):{data:[]};
      const teamEntryKeys=new Set(teamEntries.map((row:any)=>row.round_id+":"+row.member_id));
      const teamPoints=(roundStandingsQ.data||[]).filter((row:any)=>teamEntryKeys.has(row.round_id+":"+row.member_id)).reduce((sum:number,row:any)=>sum+Number(row.points_total||0),0);
      const raceStarts=new Set(teamEntries.map((row:any)=>row.round_id)).size;
      const winnersQ=roundIds.length?await supabase.from("caleris_race_results").select("round_id,winner_member_id").in("round_id",roundIds):{data:[]};
      const teamWins=(winnersQ.data||[]).filter((winner:any)=>teamEntries.some((entry:any)=>entry.round_id===winner.round_id&&entry.member_id===winner.winner_member_id)).length;
      if(active){setStatsScope("STATISTIK TIM");setStatCards([
        {label:"Active drivers",value:String(teamMembersQ.data?.length||0),detail:"Driver terdaftar di tim",icon:<Users/>},
        {label:"Race start",value:String(raceStarts),detail:"Round dengan klasifikasi tim",icon:<Flag/>},
        {label:"Team points",value:teamPoints.toLocaleString("id-ID"),detail:"Poin season aktif",icon:<Activity/>},
        {label:"Team wins",value:String(teamWins),detail:"Kemenangan season aktif",icon:<Trophy/>}
      ]);}
    }else{
      const [{data:roleWallets},{data:publicWallet}]=await Promise.all([
        supabase.from("economy_wallet_accounts").select("balance").eq("member_id",ownMember.id).in("account_kind",["driver","team_owner"]).eq("is_active",true),
        supabase.from("economy_wallet_accounts").select("balance").eq("account_kind","public_member").eq("profile_user_id",session.user.id).eq("is_active",true).maybeSingle()
      ]);
      const balance=(roleWallets||[]).reduce((sum:number,row:any)=>sum+Number(row.balance||0),0)+Number(publicWallet?.balance||0);
      if(active){setStatsScope("STATISTIK AKUN");setStatCards([{label:"Season entered",value:String(seasonCount),detail:"Total season terdaftar",icon:<CalendarDays/>},{label:"Account balance",value:"¢p "+balance.toLocaleString("id-ID"),detail:"Total saldo wallet pribadi",icon:<Wallet/>},{label:"Role",value:ownMember.role||"Member",detail:"Role akun saat ini",icon:<Users/>},{label:"Team",value:ownMember.team_id?"Terhubung":"Independent",detail:"Status afiliasi tim",icon:<Flag/>}]);}
    }
    if(active)setStatsLoading(false);
  }
  void loadStats();return()=>{active=false};
  },[profile?.member_id,profileReady,session.user.id,toast]);
  const name=profile?.web_nickname||session.user.user_metadata?.full_name||session.user.user_metadata?.name||"Member";
  return <section className="workspace"><PageHeading eyebrow="Member command center" title={`Welcome, ${name}`} description="Ringkasan aktivitas, event, dan perjalananmu di Caleris Masters."/><NotificationsCenter memberId={profile?.member_id||null}/><div className="dashboard-action-row"><Link className="action primary" to="/race-checkin">Race Check-in <ArrowUpRight size={15}/></Link><Link className="text-link" to="/financial-centre">Financial Centre <ArrowUpRight size={15}/></Link></div><RaceScheduleDashboard session={session} memberId={profile?.member_id||null} isAdmin={isAdmin}/><div className="dashboard-event-card"><div><span className="section-eyebrow">CURRENT EVENT</span><h2>Belum ada event aktif</h2><p>Informasi event akan muncul di sini setelah event pertama dipublikasikan.</p></div><div className="event-mark"><Flag size={25}/><span>CALERIS<br/>MASTERS</span></div></div><div className="section-title-row"><div><span className="section-eyebrow">OVERVIEW · {statsScope}</span><h2>{ownDashboardTitle(statsScope)}</h2></div><span className="empty-tag">{statsLoading?"Memuat statistik":"Data akun"}</span></div><div className="stat-grid">{(statCards.length?statCards:[{label:"Season",value:"—",detail:"Belum ada data",icon:<CalendarDays/>},{label:"Race start",value:"—",detail:"Belum ada data",icon:<Flag/>},{label:"Points",value:"—",detail:"Belum ada data",icon:<Activity/>},{label:"Race wins",value:"—",detail:"Belum ada data",icon:<Trophy/>}]).map(item=><div className="stat-card" key={item.label}><span className="stat-icon">{item.icon}</span><span className="stat-label">{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div><div className="dashboard-lower-grid"><div className="workspace-card"><span className="section-eyebrow">YOUR PROFILE</span><h2>Informasi akun</h2><p>{profileReady?(profile?.driver_nickname||"Nickname driver belum diatur"):"Memuat profil..."}</p><Link className="text-link" to="/profile">Lihat profil <ArrowUpRight size={15}/></Link></div><div className="workspace-card"><span className="section-eyebrow">QUICK ACCESS</span><h2>Workspace</h2><p>{isAdmin?"Akses administrasi tersedia.":"Kelola informasi akun dan profilmu."}</p>{isAdmin?<Link className="text-link" to="/admin-workflow">Buka Admin Workflow <ArrowUpRight size={15}/></Link>:<Link className="text-link" to="/account/settings">Pengaturan akun <ArrowUpRight size={15}/></Link>}</div></div></section>;
}
function ownDashboardTitle(scope:string){return scope==="STATISTIK TIM"?"Statistik Tim":scope==="STATISTIK DRIVER"?"Statistik Driver":"Statistik Akun";}

