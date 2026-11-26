import {useEffect,useState} from "react";
import type {ReactNode} from "react";
import type {Session} from "@supabase/supabase-js";
import {ArrowUpRight,ChevronLeft,FileText,Settings,UserCircle,Users} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import {TeamProfileLink} from "./EntityProfileLink";

type Toast=(kind:"success"|"error"|"warning"|"info",title:string,message?:string)=>void;
type ProfilePageProfile={member_id:string|null;avatar_url:string|null;public_member_id:string;web_nickname:string|null;driver_nickname:string|null;first_name:string|null;last_name:string|null;preferred_role:string|null;account_status:"public"|"active"|"admin"|"suspended"};
type MemberRecord={id:string;member_code:string|null;character_name:string|null;role:string|null;license:string|null;team_id:string|null};
type TeamRecord={id:string;name:string};
type ContractRecord={id:string;duration_label:string|null;starts_on:string|null;ends_on:string|null;salary:number|null;target:unknown;release_clause:number|null;status:string};
function PageHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){return <div className="page-heading"><p className="kicker">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div>}
function EmptyPanel({icon,title,body}:{icon:ReactNode;title:string;body:string}){return <div className="empty-panel">{icon}<strong>{title}</strong><p>{body}</p></div>}

export default function ProfilePage({session,profile,profileReady,toast}:{session:Session;profile:ProfilePageProfile|null;profileReady:boolean;toast:Toast}){
 const [member,setMember]=useState<MemberRecord|null>(null),[team,setTeam]=useState<TeamRecord|null>(null),[contract,setContract]=useState<ContractRecord|null>(null),[fanTotal,setFanTotal]=useState(0),[reputation,setReputation]=useState<{score:number;band:string}|null>(null),[marketValue,setMarketValue]=useState<number|null>(null),[wallets,setWallets]=useState<Record<string,number|null>>({public_member:null,driver:null,team_owner:null,team:null}),[busy,setBusy]=useState(true);
 useEffect(()=>{let active=true;async function load(){if(!supabase||!profileReady){setBusy(!profileReady);return;}setBusy(true);
  const {data:publicWallet,error:publicWalletError}=await supabase.from("economy_wallet_directory").select("balance").eq("account_kind","public_member").eq("profile_user_id",session.user.id).maybeSingle();
  if(!active)return;if(publicWalletError)toast("error","Wallet akun gagal dimuat",publicWalletError.message);
  const nextWallets:Record<string,number|null>={public_member:publicWallet?Number(publicWallet.balance):null,driver:null,team_owner:null,team:null};
  if(profile?.member_id){
   const {data:m,error}=await supabase.from("members").select("id,member_code,character_name,role,license,team_id").eq("id",profile.member_id).maybeSingle();
   if(!active)return;if(error)toast("error","Data member gagal dimuat",error.message);
   const memberData=m as MemberRecord|null;setMember(memberData);
   if(memberData?.role==="Driver"){
    const [fansQ,reputationQ,marketValueQ]=await Promise.all([
     supabase.from("caleris_fan_populations").select("population").eq("entity_kind","driver").eq("member_id",memberData.id),
     supabase.from("caleris_driver_reputation").select("score,band").eq("member_id",memberData.id).maybeSingle(),
     supabase.rpc("member_get_driver_market_values")
    ]);
    if(!active)return;
    if(fansQ.error)toast("error","Total fans gagal dimuat",fansQ.error.message);
    if(reputationQ.error)toast("error","Reputasi gagal dimuat",reputationQ.error.message);
    if(marketValueQ.error)toast("error","Market Value gagal dimuat",marketValueQ.error.message);
    setFanTotal((fansQ.data||[]).reduce((sum:number,row:any)=>sum+Number(row.population||0),0));
    setReputation(reputationQ.data?{score:Number(reputationQ.data.score),band:String(reputationQ.data.band)}:null);
    const ownMarketValue=(marketValueQ.data||[]).find((row:any)=>row.member_id===memberData.id);
    setMarketValue(ownMarketValue?Number(ownMarketValue.market_value_eur):null);
   }else{setFanTotal(0);setReputation(null);setMarketValue(null);}
   if(memberData){
    const {data:roleWalletRows,error:roleWalletError}=await supabase.from("economy_wallet_directory").select("account_kind,balance").eq("member_id",memberData.id).in("account_kind",["driver","team_owner"]).eq("is_active",true);
    if(!active)return;
    if(roleWalletError)toast("error","Wallet karakter gagal dimuat",roleWalletError.message);
    for(const walletRow of roleWalletRows||[]){if(walletRow.account_kind==="driver"||walletRow.account_kind==="team_owner")nextWallets[walletRow.account_kind]=Number(walletRow.balance||0);}
    nextWallets.public_member=Number(publicWallet?.balance||0)+Number(nextWallets.driver||0)+Number(nextWallets.team_owner||0);
    if(memberData.team_id){
     const [{data:t},{data:teamWallet,error:teamWalletError},{data:c,error:contractError}]=await Promise.all([
      supabase.from("teams").select("id,name").eq("id",memberData.team_id).maybeSingle(),
      supabase.from("economy_wallet_directory").select("balance").eq("account_kind","team").eq("team_id",memberData.team_id).maybeSingle(),
      supabase.from("contracts").select("id,duration_label,starts_on,ends_on,salary,target,release_clause,status").eq("member_id",profile.member_id).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle()
     ]);
     if(!active)return;setTeam(t as TeamRecord|null);if(teamWalletError)toast("error","Wallet tim gagal dimuat",teamWalletError.message);nextWallets.team=teamWallet?Number(teamWallet.balance):null;if(contractError)toast("error","Kontrak gagal dimuat",contractError.message);setContract(c as ContractRecord|null);
    }else{setTeam(null);const {data:c,error:contractError}=await supabase.from("contracts").select("id,duration_label,starts_on,ends_on,salary,target,release_clause,status").eq("member_id",profile.member_id).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle();if(!active)return;if(contractError)toast("error","Kontrak gagal dimuat",contractError.message);setContract(c as ContractRecord|null);}
   }else{setTeam(null);setContract(null);}
  }else{setMember(null);setTeam(null);setContract(null);}
  if(active){setWallets(nextWallets);setBusy(false);}
 }void load();return()=>{active=false}},[profile?.member_id,profileReady,session.user.id,toast]);
 const avatar=profile?.avatar_url||session.user.user_metadata?.avatar_url||session.user.user_metadata?.picture||"";
 const webName=profile?.web_nickname||session.user.user_metadata?.full_name||session.user.user_metadata?.name||"Member";
 const info=(label:string,value:ReactNode)=><div className="profile-info-item"><span>{label}</span><strong>{value||"Belum tersedia"}</strong></div>;
 const balanceText=(value:number|null)=>value===null?"Belum tersedia":"¢p "+Number(value).toLocaleString("id-ID");
 const characterWallet=wallets.public_member;
 return <section className="workspace"><Link className="back-link" to="/dashboard"><ChevronLeft size={16}/> Dashboard</Link><PageHeading eyebrow="Member identity" title="My Profile" description="Informasi akun dan identitas karakter Caleris Masters."/><div className="profile-hero-card"><div className="profile-avatar-large">{avatar?<img src={avatar} alt="Foto profil"/>:<UserCircle size={54}/>}</div><div className="profile-hero-copy"><span className="section-eyebrow">ACCOUNT PROFILE</span><h2>{webName}</h2><p>{session.user.email||"Email tidak tersedia"}</p><span className="profile-role-pill">{profile?.account_status==="admin"?"Administrator":profile?.account_status==="active"?"Member aktif":profile?.account_status==="suspended"?"Suspended":"Public"}</span></div><Link className="action profile-edit-action" to="/account/settings"><Settings size={16}/> Edit akun</Link><Link className="action profile-edit-action" to={"/member/"+profile?.public_member_id}><ArrowUpRight size={16}/> Profil publik</Link></div><div className="profile-sections"><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">ACCOUNT</span><h2>Informasi akun</h2></div></div><div className="profile-info-grid">{info("Nama depan",profile?.first_name)}{info("Nama belakang",profile?.last_name)}{info("Nickname web",webName)}{info("Nickname driver",profile?.driver_nickname)}{info("Preferensi role",profile?.preferred_role)}{info("Status akun",profile?.account_status==="admin"?"Administrator":profile?.account_status==="active"?"Member aktif":profile?.account_status==="suspended"?"Suspended":"Public")}{info("Email",session.user.email)}{info("Member ID",profile?.public_member_id)}{info("Saldo member publik",busy?"Memuat...":balanceText(wallets.public_member))}</div></div><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CHARACTER</span><h2>Informasi karakter</h2></div></div>{busy?<p className="muted">Memuat informasi karakter dan wallet...</p>:!member?<EmptyPanel icon={<Users/>} title="Belum terhubung ke member" body="Wallet member publik tetap tersedia. Data karakter dan wallet Driver/Owner akan tampil setelah akun ditautkan ke member oleh administrator."/>:<div className="profile-info-grid">{info("Nickname driver",profile?.driver_nickname||member.character_name)}{info("Role",member.role)}{info("Tim",<TeamProfileLink teamId={team?.id}>{team?.name}</TeamProfileLink>)}{info("License",member.license)}{info("Market Value",member.role==="Driver"?(marketValue===null?"Belum dihitung":new Intl.NumberFormat("id-ID",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(marketValue)):"—")}{info("Total fans",member.role==="Driver"?fanTotal.toLocaleString("id-ID"):"—")}{info("Reputasi",member.role==="Driver"?(reputation?reputation.score.toLocaleString("id-ID")+" · "+reputation.band:"Belum dihitung"):"—")}{info("Saldo karakter",balanceText(characterWallet))}{info("Saldo tim",balanceText(wallets.team))}</div>}</div><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CONTRACT</span><h2>Detail kontrak</h2></div><FileText size={19}/></div>{busy?<p className="muted">Memuat kontrak...</p>:!contract?<EmptyPanel icon={<FileText/>} title="Belum ada kontrak aktif" body="Detail durasi, gaji, target, dan klausul pelepasan akan ditampilkan ketika kontrak tersedia."/>:<div className="profile-info-grid">{info("Durasi",contract.duration_label)}{info("Mulai",contract.starts_on)}{info("Berakhir",contract.ends_on)}{info("Gaji",contract.salary===null?"Belum tersedia":"¢p "+Number(contract.salary).toLocaleString("id-ID"))}{info("Target",contract.target?JSON.stringify(contract.target):"Tidak ditentukan")}{info("Klausul pelepasan",contract.release_clause===null?"Tidak ditentukan":"¢p "+Number(contract.release_clause).toLocaleString("id-ID"))}</div>}</div></div></section>;
}
