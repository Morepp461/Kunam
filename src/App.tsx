import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,Fragment} from "react";
import {createPortal} from "react-dom";
import type {ChangeEvent,PointerEvent as ReactPointerEvent,ReactNode} from "react";
import {Link,Navigate,Route,Routes,useLocation,useNavigate,useParams} from "react-router-dom";
import {ArrowUpRight,BookOpen,Check,ChevronDown,ChevronLeft,ChevronRight,ExternalLink,Flag,LoaderCircle,LogIn,Moon,Shield,Sun,UserCircle,Users,X,Camera,CalendarDays,Search} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {missingSupabaseMessage,supabase} from "./lib/supabase";
import "./workspace.css";
import "./stage5-panel.css";
import CaleMascotPreview from "./CaleMascotPreview";
import PanelPage,{panelGroups} from "./PanelPages";
import MainLayout from "./MainLayout";
import DashboardModule from "./DashboardModule";
import ProfileModule from "./ProfileModule";
import CommunityProgression from "./CommunityProgression";
import PublicMemberId from "./PublicMemberId";
import Stage5Panel from "./Stage5Panel";
import AdminConfiguration from "./AdminConfiguration";
import AdminLicenseEngine from "./AdminLicenseEngine";
import AdminPrizepool from "./AdminPrizepool";
import AdminEconomyEngine from "./AdminEconomyEngine";
import AdminAdjustmentCenter from "./AdminAdjustmentCenter";
import AdminQuestEngine from "./AdminQuestEngine";
import QuestPage from "./QuestPage";
import AdminPricingCenter from "./AdminPricingCenter";
import AdminOperations from "./AdminOperations";
import MemberRaceCheckIn from "./MemberRaceCheckIn";
import TeamAffiliate from "./TeamAffiliate";
import TeamEngineMarket from "./TeamEngineMarket";
import DriverTransferMarket from "./DriverTransferMarket";
import TeamTakeoverMarket from "./TeamTakeoverMarket";
import BrandEcosystem from "./BrandEcosystem";
import BrandEcosystemAdmin from "./BrandEcosystemAdmin";
import SponsorshipCentre from "./SponsorshipCentre";
import DevelopmentTokens from "./DevelopmentTokens";
import CalerisIntelligence from "./CalerisIntelligence";
import DriverTraining from "./DriverTraining";
import ShopPage from "./ShopPage";
import AdminTestPersonas from "./AdminTestPersonas";
import AdminUsers from "./AdminUsers";
import AdminTeamInactivity from "./AdminTeamInactivity";
import PublicTeamProfile from "./PublicTeamProfile";
import { TeamProfileLink } from "./EntityProfileLink";
import FIAEventControlCenter from "./FIAEventControlCenter";
import AdminSeasonCalendar from "./AdminSeasonCalendar";
import RaceControl from "./RaceControl";
import LocationSelectors from "./LocationSelectors";
import TeamDriverContracts from "./TeamDriverContracts";
import {CircuitPool,CircuitPoolInput} from "./CircuitPool";
import { AnalyticsConsentSettings, AnalyticsTracker } from "./AnalyticsTracker";

import JobSearch from "./JobSearch";
import PaddockRoleDetails from "./PaddockRoleDetails";
import { optimizeImageToWebp } from "./lib/imageOptimization";
import AdminRegisteredMembers from "./AdminRegisteredMembers";
import DeveloperAPI from "./DeveloperAPI";
import TeamDriverApplications from "./TeamDriverApplications";
import LiveRace from "./LiveRace";
import TeamLivery from "./TeamLivery";

import CashLoanCentre from "./CashLoanCentre";
import "./license-engine.css";
import "./admin-configuration.css";
import "./economy-engine.css";
import "./quest-engine.css";
import "./admin-quest-engine.css";
import "./admin-operations.css";
import "./fia-operations.css";
import "./race-control.css";
import "./member-race-checkin.css";
import "./team-affiliate.css";
import "./driver-transfer-market.css";
import "./team-takeover-market.css";
import "./admin-sponsorship.css";
import "./brand-ecosystem.css";
import "./sponsorship-centre.css";
import "./development-tokens.css";
import "./driver-training.css";
import "./season-calendar.css";
import "./team-contracts.css";
import "./admin-users.css";
import "./caleris-controls.css";

type Kind="success"|"error"|"warning"|"info";
type Notice={id:number;kind:Kind;title:string;message?:string};
type AccountProfile={user_id:string;member_id:string|null;public_member_id:string;avatar_url:string|null;avatar_path:string|null;web_nickname:string|null;driver_nickname:string|null;first_name:string|null;last_name:string|null;date_of_birth:string|null;nationality:string|null;hometown:string|null;preferred_role:string|null;account_status:"public"|"active"|"admin"|"suspended";onboarding_completed:boolean;privacy_accepted_at:string|null};
type PanelAccess={is_admin:boolean;member_role:string|null;main_event:boolean;driver_panel:boolean;team_panel:boolean;fia_panel:boolean};
const NO_PANEL_ACCESS:PanelAccess={is_admin:false,member_role:null,main_event:false,driver_panel:false,team_panel:false,fia_panel:false};
const UI=createContext<{toast:(kind:Kind,title:string,message?:string)=>void;loading:(v:boolean)=>void}|null>(null);
function useUI(){const c=useContext(UI);if(!c)throw Error("UI provider missing");return c;}
function GlobalUI({children}:{children:ReactNode}){
 const [items,setItems]=useState<Notice[]>([]),[busy,setBusy]=useState(false);
 const toast=useCallback((kind:Kind,title:string,message?:string)=>{const id=Date.now()+Math.random();setItems(v=>[...v,{id,kind,title,message}].slice(-4));window.setTimeout(()=>setItems(v=>v.filter(x=>x.id!==id)),4500);},[]);
 useEffect(()=>{const mark=(e:Event)=>{const el=(e.target as HTMLElement|null)?.closest("button,a,[role=button]") as HTMLElement|null;if(!el||el.matches(":disabled,[aria-disabled=true]"))return;const r=el.getBoundingClientRect(),p=e as PointerEvent,x=e instanceof PointerEvent?p.clientX:r.left+r.width/2,y=e instanceof PointerEvent?p.clientY:r.top+r.height/2;const t=document.createElement("i");t.className="tire-trace";t.style.left=x+"px";t.style.top=y+"px";document.body.append(t);window.setTimeout(()=>t.remove(),850);};document.addEventListener("pointerdown",mark,{passive:true});return()=>document.removeEventListener("pointerdown",mark);},[]);
 const value=useMemo(()=>({toast,loading:setBusy}),[toast]);
 return <UI.Provider value={value}>{busy&&<div className="global-progress comet-transition" aria-hidden="true"><span/><i/></div>}{children}<div className="toast-stack" aria-live="polite">{items.map(n=><div className={"toast toast-"+n.kind} key={n.id}><span className="toast-icon">{n.kind==="success"?<Check/>:n.kind==="error"?<X/>:<Flag/>}</span><span className="toast-copy"><strong>{n.title}</strong>{n.message&&<small>{n.message}</small>}</span><button className="toast-close" aria-label="Tutup" onClick={()=>setItems(v=>v.filter(x=>x.id!==n.id))}><X size={15}/></button></div>)}</div></UI.Provider>;
}
export default function App(){return <GlobalUI><Application/></GlobalUI>}
function Application(){
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false),[theme,setTheme]=useState<"dark"|"light">(()=>{try{return localStorage.getItem("caleris-theme")==="light"?"light":"dark"}catch{return "dark"}});
 const [profile,setProfile]=useState<AccountProfile|null>(null),[profileReady,setProfileReady]=useState(false),[isAdmin,setIsAdmin]=useState(false),[isPrimaryOwner,setIsPrimaryOwner]=useState(false),[panelAccess,setPanelAccess]=useState<PanelAccess>(NO_PANEL_ACCESS);
 const location=useLocation();const {toast,loading}=useUI();
 const sessionUserIdRef=useRef<string|null>(null);
 const userId=session?.user.id??null;
 const refreshProfile=useCallback(async()=>{
  if(!supabase||!userId){setProfile(null);setIsAdmin(false);setIsPrimaryOwner(false);setPanelAccess(NO_PANEL_ACCESS);setProfileReady(true);return;}
  setProfileReady(false);
  const [profileResult,adminResult,ownerResult]=await Promise.all([
   supabase.from("profiles").select("user_id,member_id,public_member_id,avatar_url,avatar_path,web_nickname,driver_nickname,first_name,last_name,date_of_birth,nationality,hometown,preferred_role,account_status,onboarding_completed,privacy_accepted_at").eq("user_id",userId).maybeSingle(),
   supabase.from("site_admins").select("user_id").eq("user_id",userId).maybeSingle(),
   supabase.from("caleris_developer_api_owner").select("owner_user_id").eq("singleton",true).maybeSingle()
  ]);
  if(profileResult.error)toast("error","Profil gagal dimuat",profileResult.error.message);
  if(adminResult.error)toast("error","Akses akun gagal diperiksa",adminResult.error.message);
  if(ownerResult.error)toast("error","Akses Developer API gagal diperiksa",ownerResult.error.message);
  let account=profileResult.data as AccountProfile|null;
  if(account?.account_status==="suspended"){
   const {data:banSync}=await supabase.rpc("member_sync_expired_ban");
   if(banSync==="restored"){
    const {data:restored}=await supabase.from("profiles").select("user_id,member_id,public_member_id,avatar_url,avatar_path,web_nickname,driver_nickname,first_name,last_name,date_of_birth,nationality,hometown,preferred_role,account_status,onboarding_completed,privacy_accepted_at").eq("user_id",userId).maybeSingle();
    account=restored as AccountProfile|null;
   }
  }
  const admin=Boolean(adminResult.data?.user_id);
  setIsPrimaryOwner(ownerResult.data?.owner_user_id===userId);
  let memberRole:string|null=null;
  if(account?.member_id){
   const {data:member,error:memberError}=await supabase.from("members").select("role").eq("id",account.member_id).maybeSingle();
   if(memberError)toast("error","Role member gagal dimuat",memberError.message);
   memberRole=typeof member?.role==="string"?member.role:null;
  }
  const access:PanelAccess={
   is_admin:admin,
   member_role:memberRole,
   main_event:admin||account?.onboarding_completed===true,
   driver_panel:admin||memberRole==="Driver",
   team_panel:admin||memberRole==="Owner"||memberRole==="Principal",
   fia_panel:admin||memberRole==="FIA"
  };
  setPanelAccess(access);
  setIsAdmin(admin);
  if(account?.avatar_path){const {data:signed,error:signedError}=await supabase.storage.from("profile-avatars").createSignedUrl(account.avatar_path,3600);if(signedError)toast("error","Foto profil gagal dimuat",signedError.message);account={...account,avatar_url:signed?.signedUrl??null};}
  setProfile(account);
  setIsAdmin(Boolean(adminResult.data?.user_id));
  setProfileReady(true);
 },[userId,toast]);
 useEffect(()=>{if(document.querySelector("script[data-cinematic-motion]"))return;const script=document.createElement("script");script.src="/cinematic-motion.js";script.dataset.cinematicMotion="true";script.async=true;document.body.append(script)},[]);
 useEffect(()=>{document.body.classList.toggle("light",theme==="light");try{localStorage.setItem("caleris-theme",theme)}catch{}},[theme]);
 useEffect(()=>{const markBackground=()=>document.body.classList.toggle("app-backgrounded",document.visibilityState==="hidden");const onPageShow=()=>document.body.classList.remove("app-backgrounded");const onPageHide=()=>document.body.classList.add("app-backgrounded");document.addEventListener("visibilitychange",markBackground);window.addEventListener("pageshow",onPageShow);window.addEventListener("pagehide",onPageHide);markBackground();return()=>{document.removeEventListener("visibilitychange",markBackground);window.removeEventListener("pageshow",onPageShow);window.removeEventListener("pagehide",onPageHide);document.body.classList.remove("app-backgrounded")}},[]);
 useEffect(()=>{if(!supabase){setAuthReady(true);return;}supabase.auth.getSession().then(({data,error})=>{if(error)toast("error","Session gagal dimuat",error.message);sessionUserIdRef.current=data.session?.user.id??null;setSession(data.session);setAuthReady(true)});const {data}=supabase.auth.onAuthStateChange((event,s)=>{const nextUserId=s?.user.id??null;const identityChanged=sessionUserIdRef.current!==nextUserId;sessionUserIdRef.current=nextUserId;setSession(s);if(identityChanged||event==="USER_UPDATED")setProfileReady(false);setAuthReady(true)});return()=>data.subscription.unsubscribe()},[toast]);
 useEffect(()=>{if(authReady)void refreshProfile()},[authReady,refreshProfile]);
 useEffect(()=>{if(!supabase||!session)return;supabase.from("profiles").select("account_status").eq("user_id",session.user.id).maybeSingle().then(({data})=>{if(data?.account_status==="suspended")void refreshProfile()})},[location.pathname,session?.user.id,refreshProfile]);
 useEffect(()=>{window.scrollTo(0,0);loading(true);const timer=window.setTimeout(()=>loading(false),560);return()=>window.clearTimeout(timer)},[location.pathname,loading]);
 if(!authReady)return <div className="auth-loading"><LoaderCircle className="spin"/><span>Memeriksa sesi...</span></div>;
 if(session&&!profileReady)return <div className="auth-loading"><LoaderCircle className="spin"/><span>Memuat akses paddock...</span></div>;
 const needsPaddockAccess=Boolean(session&&!isAdmin&&profile?.onboarding_completed!==true);
 if(session&&profile?.account_status==="suspended")return <SuspendedAccountPage session={session}/>;
 return <MainLayout theme={theme} setTheme={setTheme} session={session} profile={profile} memberId={profile?.member_id??null} isAdmin={isAdmin} isPrimaryOwner={isPrimaryOwner} panelAccess={panelAccess} globalSearch={<GlobalSearch isAdmin={isAdmin} panelAccess={panelAccess}/>} toast={toast} loading={loading}><CalerisSelectOverlay/><AnalyticsTracker/><Routes>
  <Route path="/cale-lab" element={<CaleMascotPreview/>}/>
  <Route path="/" element={session?<Navigate to={needsPaddockAccess?"/paddock-access":"/dashboard"} replace/>:<Home/>}/>
  <Route path="/paddock-access" element={session&&!isAdmin&&(needsPaddockAccess||panelAccess.member_role===null)?<PaddockAccess session={session} onComplete={refreshProfile}/>:<Navigate to={session?"/dashboard":"/"} replace/>}/>
  <Route path="/dashboard" element={session?(needsPaddockAccess?<Navigate to="/paddock-access" replace/>:<DashboardModule session={session} profile={profile} profileReady={profileReady} toast={toast}/>):<Navigate to="/" replace/>}/>
  <Route path="/community" element={session&&!needsPaddockAccess?<CommunityProgression session={session} profile={profile} toast={toast}/>:<Navigate to={session?"/paddock-access":"/"} replace/>}/>
  <Route path="/shop" element={session&&!needsPaddockAccess?<ShopPage session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/financial-centre" element={session&&!needsPaddockAccess?<CashLoanCentre session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/race-checkin" element={session&&!needsPaddockAccess?<MemberRaceCheckIn session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin-workflow" element={session&&!needsPaddockAccess&&isAdmin?<AdminWorkflow session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/configuration" element={session&&!needsPaddockAccess&&isAdmin?<AdminConfiguration session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/prizepool" element={session&&!needsPaddockAccess&&isAdmin?<AdminPrizepool session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/license-engine" element={session&&!needsPaddockAccess&&isAdmin?<AdminLicenseEngine session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/economy-engine" element={session&&!needsPaddockAccess&&isAdmin?<AdminEconomyEngine session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/adjustments" element={session&&!needsPaddockAccess&&isAdmin?<AdminAdjustmentCenter session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/data-adjustments" element={session&&!needsPaddockAccess&&isAdmin?<Navigate to="/admin/adjustments" replace/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/quest-engine" element={session&&!needsPaddockAccess&&isAdmin?<AdminQuestEngine/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/pricing" element={session&&!needsPaddockAccess&&isAdmin?<AdminPricingCenter/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/operations" element={session&&!needsPaddockAccess&&isAdmin?<AdminOperations session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/admin/race-engine-lab" element={session&&!needsPaddockAccess&&isAdmin?<LiveRace/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/live-race" element={<Navigate to="/admin/race-engine-lab" replace/>}/>
  <Route path="/admin/brand-ecosystem" element={session&&!needsPaddockAccess&&isAdmin?<BrandEcosystemAdmin session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/sponsorship" element={session&&!needsPaddockAccess&&isAdmin?<BrandEcosystem session={session} mode="admin"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/daily-checkin" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<MemberRaceCheckIn session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/quest" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.member_role==="Driver")?<QuestPage session={session} scope="driver"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/quests" element={session&&!needsPaddockAccess?<Navigate to={panelAccess.member_role==="Driver"?"/driver-panel/quest":panelAccess.member_role==="Owner"||panelAccess.member_role==="Principal"?"/team-panel/quest":"/dashboard"} replace/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/quest" element={session&&!needsPaddockAccess&&(panelAccess.member_role==="Owner"||panelAccess.member_role==="Principal")?<QuestPage session={session} scope="team_owner"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/license-engine" element={isAdmin?<Navigate to="/admin/license-engine" replace/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/event-control" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<FIAEventControlCenter session={session} isAdmin={isAdmin}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/season-calendar" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<AdminSeasonCalendar/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/punishment-input" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<Navigate to="/fia-panel/event-control" replace/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/race-input" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<RaceControl/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/driver-contracts" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<TeamDriverContracts session={session} isAdmin={isAdmin}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/budget-guard" element={session&&!needsPaddockAccess&&panelAccess.member_role==="Owner"?<CalerisIntelligence session={session} scope="budget"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/contract-renewals" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.member_role==="Owner")?<CalerisIntelligence session={session} scope="renewals"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/roadmap-suggestions" element={session&&!needsPaddockAccess&&panelAccess.member_role==="Owner"?<CalerisIntelligence session={session} scope="roadmap"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/contract-renewals" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.member_role==="Driver")?<CalerisIntelligence session={session} scope="renewals"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/operations-intelligence" element={session&&!needsPaddockAccess&&isAdmin?<CalerisIntelligence session={session} scope="operations"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/custom-livery" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.member_role==="Owner"||panelAccess.member_role==="Principal")?<TeamLivery isAdmin={isAdmin}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/development" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<DevelopmentTokens session={session} asset="TDP"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/sponsorship" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<SponsorshipCentre session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/development" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<DevelopmentTokens session={session} asset="DDP"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/training" element={session&&!needsPaddockAccess&&panelAccess.member_role==="Driver"?<DriverTraining session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/affiliate-team" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<TeamAffiliate session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/engine-market" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<TeamEngineMarket session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/profile" element={session&&!needsPaddockAccess?<ProfileModule session={session} profile={profile} profileReady={profileReady} toast={toast}/>:<Navigate to={session?"/paddock-access":"/"} replace/>}/>
  <Route path="/member/:memberId" element={<PublicMemberProfile session={session}/>} />
  <Route path="/team/:teamId" element={<PublicTeamProfile/>}/>
   <Route path="/member-id/:memberCode" element={<PublicMemberId/>}/>
  <Route path="/account/settings" element={session&&!needsPaddockAccess?<AccountSettings session={session} profile={profile} profileReady={profileReady} onSaved={refreshProfile} theme={theme} setTheme={setTheme}/>:<Navigate to={session?"/paddock-access":"/"} replace/>}/>
  <Route path="/rules" element={<Rules/>}/>
  <Route path="/main-event/circuit-pool" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<CircuitPool/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/fia-panel/circuit-pool-input" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<CircuitPoolInput/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/main-event/job-search" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<JobSearch/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/main-event/take-over" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<TeamTakeoverMarket session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/main-event/transfer-market" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<DriverTransferMarket session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/main-event/registration" element={session&&!isAdmin&&panelAccess.member_role===null?<Navigate to="/paddock-access" replace/>:<Navigate to={session?"/dashboard":"/"} replace/>}/>
  <Route path="/team-panel/driver-registration" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.member_role==="Owner")?<TeamDriverApplications/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/main-event/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/appeal-room" element={session&&!needsPaddockAccess&&isAdmin?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/privacy-policy" element={<LegalBlankPage title="Kebijakan Privasi"/>}/>
  <Route path="/terms-and-conditions" element={<LegalBlankPage title="Syarat & Ketentuan"/>}/>
  <Route path="/auth/callback" element={<AuthCallback/>}/>
  <Route path="/admin/test-personas" element={session&&!needsPaddockAccess&&isAdmin?<AdminTestPersonas/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/team-inactivity" element={session&&!needsPaddockAccess&&isAdmin?<AdminTeamInactivity/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/users" element={session&&!needsPaddockAccess&&isAdmin?<AdminUsers/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/developer-api" element={session&&!needsPaddockAccess&&isPrimaryOwner?<DeveloperAPI session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/registered-members" element={session&&!needsPaddockAccess&&isAdmin?<AdminRegisteredMembers/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin" element={session&&!needsPaddockAccess&&isAdmin?<Admin session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="*" element={<NotFound/>}/>
 </Routes></MainLayout>;
}
function SuspendedAccountPage({session}:{session:Session}){
 const [action,setAction]=useState<{reason:string;expires_at:string|null;action_type:string}|null>(null);
 useEffect(()=>{if(!supabase)return;supabase.from("caleris_user_moderation_actions").select("reason,expires_at,action_type").eq("target_user_id",session.user.id).in("action_type",["temporary_ban","permanent_ban"]).order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>setAction(data as typeof action));},[session.user.id]);
 return <main className="auth-loading"><section className="workspace-card" style={{width:"min(520px,calc(100% - 32px))",padding:28,textAlign:"center"}}>
  <Shield size={34}/><h1>Akses akun ditangguhkan</h1><p>Akun ini sedang dibatasi oleh administrator CALERIS Masters.</p>
  {action?.reason&&<p><strong>Alasan:</strong> {action.reason}</p>}
  {action?.expires_at&&<p><strong>Berakhir:</strong> {new Date(action.expires_at).toLocaleString("id-ID")}</p>}
  {action?.action_type==="permanent_ban"&&<p>Penangguhan ini tidak memiliki tanggal berakhir otomatis.</p>}
  <button className="action" onClick={()=>void supabase?.auth.signOut({scope:"local"})}>Keluar</button>
 </section></main>;
}
function LegalBlankPage({title}:{title:string}){
 return <main className="legal-blank-page" aria-label={title}/>;
}
function Home(){
 const {toast,loading}=useUI();const [invite,setInvite]=useState("");
 useEffect(()=>{if(!supabase)return;supabase.from("site_settings").select("value").eq("key","community_invite_url").maybeSingle().then(({data,error})=>{if(error)toast("error","Link komunitas gagal dimuat",error.message);else if(typeof data?.value==="string")setInvite(data.value)})},[toast]);
 const login=async()=>{if(!supabase){toast("error","Login belum tersedia",missingSupabaseMessage());return;}loading(true);const {error}=await supabase.auth.signInWithOAuth({provider:"discord",options:{redirectTo:window.location.origin+"/auth/callback",scopes:"identify email"}});loading(false);if(error)toast("error","Discord login gagal",error.message)};
 const join=()=>{if(!/^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/i.test(invite)){toast("warning","Link komunitas belum tersedia","Admin belum mengatur tautan undangan Discord yang valid.");return;}window.open(invite,"_blank","noopener,noreferrer")};
 return <section className="hero-copy"><p className="kicker">The race begins here</p><h1>Build your legacy<span>On and off the track</span></h1><p className="description">A world where every decision shapes your career. Join the grid, develop your team, and write your own motorsport story.</p><div className="actions"><Link className="action" to="/rules"><BookOpen/> Rules</Link><button className="action primary" onClick={login}><LogIn/> Login with Discord</button><button className="action" onClick={join}><Users/> Join Our Community <ExternalLink size={14}/></button></div></section>;
}
function PageHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){return <div className="page-heading"><p className="kicker">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div>}
function EmptyPanel({icon,title,body}:{icon:ReactNode;title:string;body:string}){return <div className="empty-panel">{icon}<strong>{title}</strong><p>{body}</p></div>}

const PADDOCK_ROLES=["Driver","Team Owner"] as const;
const CALENDAR_MONTHS=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const CALENDAR_DAYS=["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
function PaddockRolePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false);
 return <div className="settings-field paddock-picker-field"><span>Preferensi role</span><div className="paddock-picker-wrap">
  <button type="button" className={"paddock-select-trigger"+(open?" is-open":"")} aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span>{value||"Pilih role"}</span><ChevronDown size={19}/></button>
  {open&&<div className="paddock-select-menu" role="listbox" aria-label="Preferensi role">{PADDOCK_ROLES.map(role=><button type="button" role="option" aria-selected={value===role} className={value===role?"selected":""} key={role} onClick={()=>{onChange(role);setOpen(false)}}><span>{role}</span>{value===role&&<Check size={17}/>}</button>)}</div>}
 </div></div>;
}
function PaddockDatePicker({value,onChange,max}:{value:string;onChange:(value:string)=>void;max:string}){
 const maxDate=new Date(max+"T12:00:00");
 const initial=value?new Date(value+"T12:00:00"):maxDate;
 const [open,setOpen]=useState(false),[month,setMonth]=useState(initial.getMonth()),[year,setYear]=useState(initial.getFullYear()),[yearPicker,setYearPicker]=useState(false);
 const selected=value?new Date(value+"T12:00:00"):null;
 const firstDay=new Date(year,month,1).getDay(),daysInMonth=new Date(year,month+1,0).getDate();
 const cells=[...Array(firstDay).fill(0),...Array.from({length:daysInMonth},(_,i)=>i+1)];
 const formatted=selected?selected.getDate()+" "+CALENDAR_MONTHS[selected.getMonth()]+" "+selected.getFullYear():"Pilih tanggal lahir";
 const shift=(delta:number)=>{const next=new Date(year,month+delta,1);if(next.getFullYear()<1900||next>maxDate)return;setMonth(next.getMonth());setYear(next.getFullYear());setYearPicker(false)};
 const toggle=()=>{if(!open)setYearPicker(false);setOpen(v=>!v)};
 const calendar=<div className="paddock-calendar paddock-calendar-anchored" role="dialog" aria-label="Pilih tanggal lahir">
  <div className="paddock-calendar-heading"><div><small>PILIH TANGGAL LAHIR</small><button type="button" className="paddock-calendar-year" onClick={()=>setYearPicker(v=>!v)} aria-expanded={yearPicker}>{CALENDAR_MONTHS[month]} {year}<ChevronDown size={15}/></button></div><div className="paddock-calendar-nav"><button type="button" aria-label="Bulan sebelumnya" onClick={()=>shift(-1)} disabled={year===1900&&month===0}><ChevronLeft/></button><button type="button" aria-label="Bulan berikutnya" onClick={()=>shift(1)} disabled={year===maxDate.getFullYear()&&month>=maxDate.getMonth()}><ChevronRight/></button></div></div>
  {yearPicker?<div className="paddock-year-grid">{Array.from({length:maxDate.getFullYear()-1899},(_,i)=>maxDate.getFullYear()-i).map(y=><button type="button" key={y} className={year===y?"chosen":""} onClick={()=>{setYear(y);if(y===maxDate.getFullYear()&&month>maxDate.getMonth())setMonth(maxDate.getMonth());setYearPicker(false)}}>{y}</button>)}</div>:<><div className="paddock-calendar-grid">{CALENDAR_DAYS.map(day=><span className="weekday" key={day}>{day}</span>)}{cells.map((day,index)=>{if(!day)return <span className="empty-day" key={"e"+index}/>;const date=new Date(year,month,day);const iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");const disabled=date>maxDate;return <button type="button" key={iso} disabled={disabled} className={(value===iso?"chosen ":"")+(disabled?"disabled-day":"")} onClick={()=>{onChange(iso);setOpen(false)}}>{day}</button>})}</div></>}
  <div className="paddock-calendar-footer"><button type="button" onClick={()=>setOpen(false)}>Batal</button></div>
 </div>;
 return <div className={"settings-field paddock-picker-field"+(open?" is-open":"")}><span>Tanggal lahir</span><div className="paddock-picker-wrap"><button type="button" className={"paddock-select-trigger paddock-date-trigger"+(open?" is-open":"")} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}><span>{formatted}</span><CalendarDays size={18}/></button>{open&&calendar}</div></div>;
}
function PaddockAccess({session,onComplete}:{session:Session;onComplete:()=>Promise<void>}){
 const {toast,loading}=useUI();
 const [avatarFile,setAvatarFile]=useState<File|null>(null),[avatarPreview,setAvatarPreview]=useState(""),[avatarEditing,setAvatarEditing]=useState(false),[cropX,setCropX]=useState(50),[cropY,setCropY]=useState(50);
 const originalAvatarFileRef=useRef<File|null>(null);
 const [firstName,setFirstName]=useState(""),[dateOfBirth,setDateOfBirth]=useState(""),[nickname,setNickname]=useState(""),[preferredRole,setPreferredRole]=useState(""),[nationality,setNationality]=useState(""),[hometown,setHometown]=useState("");
 const [privacyAccepted,setPrivacyAccepted]=useState(false),[saving,setSaving]=useState(false);
 const [registration,setRegistration]=useState<Record<string,any>|null>(null);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const avatarStageRef=useRef<HTMLDivElement|null>(null),avatarImageRef=useRef<HTMLImageElement|null>(null),avatarDragRef=useRef<{x:number;y:number;cropX:number;cropY:number}|null>(null);
 useEffect(()=>{if(!supabase)return;let active=true;supabase.from("caleris_member_registrations").select("id,requested_role,status,created_at,review_note").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data,error})=>{if(!active)return;if(error)toast("error","Status pengajuan gagal dimuat",error.message);setRegistration(data as Record<string,any>|null)});return()=>{active=false}},[session.user.id,toast]);
 const today=new Date();const maxDate=new Date(today.getFullYear()-13,today.getMonth(),today.getDate());const maxDob=`${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,"0")}-${String(maxDate.getDate()).padStart(2,"0")}`;
 const chooseAvatar=(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>3*1024*1024){setErrors(v=>({...v,avatar:"Gunakan JPG, PNG, atau WEBP maksimal 3 MB."}));e.target.value="";return;}if(avatarPreview)URL.revokeObjectURL(avatarPreview);originalAvatarFileRef.current=file;setAvatarFile(file);setAvatarPreview(URL.createObjectURL(file));setAvatarEditing(true);setCropX(50);setCropY(50);setErrors(v=>({...v,avatar:""}));e.target.value="";};
 const beginAvatarDrag=(e:ReactPointerEvent<HTMLDivElement>)=>{if(!avatarFile)return;e.currentTarget.setPointerCapture(e.pointerId);avatarDragRef.current={x:e.clientX,y:e.clientY,cropX,cropY};};
 const moveAvatarDrag=(e:ReactPointerEvent<HTMLDivElement>)=>{const drag=avatarDragRef.current,stage=avatarStageRef.current,image=avatarImageRef.current;if(!drag||!stage||!image)return;const rect=stage.getBoundingClientRect(),aspect=image.naturalWidth/image.naturalHeight;const overflowX=Math.max(0,rect.height*aspect-rect.width),overflowY=Math.max(0,rect.width/aspect-rect.height);setCropX(Math.max(0,Math.min(100,drag.cropX-(e.clientX-drag.x)/Math.max(1,overflowX)*100)));setCropY(Math.max(0,Math.min(100,drag.cropY-(e.clientY-drag.y)/Math.max(1,overflowY)*100)));};
 const finishAvatarDrag=()=>{avatarDragRef.current=null;};
 const createCroppedAvatar=async(file:File)=>{const image=new Image(),url=URL.createObjectURL(file);image.src=url;try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Foto tidak dapat dibaca."))});const side=Math.min(image.naturalWidth,image.naturalHeight),sx=(image.naturalWidth-side)*(cropX/100),sy=(image.naturalHeight-side)*(cropY/100);const canvas=document.createElement("canvas");canvas.width=640;canvas.height=640;const context=canvas.getContext("2d");if(!context)throw new Error("Browser tidak mendukung pemrosesan foto.");context.drawImage(image,sx,sy,side,side,0,0,640,640);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("Foto gagal diproses.")),file.type,.92));return new File([blob],"caleris-profile."+(file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg"),{type:file.type});}finally{URL.revokeObjectURL(url)}};
 const confirmAvatarCrop=async()=>{if(!avatarFile)return;try{const cropped=await createCroppedAvatar(avatarFile);const preview=URL.createObjectURL(cropped);if(avatarPreview)URL.revokeObjectURL(avatarPreview);setAvatarFile(cropped);setAvatarPreview(preview);setCropX(50);setCropY(50);setAvatarEditing(false);finishAvatarDrag();}catch(error){toast("error","Foto gagal diproses",error instanceof Error?error.message:"Coba pilih foto lain.")}};
 const submit=async(registrationPayload:Record<string,unknown>)=>{
  const next:Record<string,string>={};
  if(!avatarFile)next.avatar="Foto profil harus dipilih.";
  if(!dateOfBirth)next.dateOfBirth="Tanggal lahir harus diisi.";
   if(!nationality)next.nationality="Nationality wajib dipilih.";
   if(!hometown)next.hometown="Hometown wajib dipilih.";
  if(dateOfBirth&&dateOfBirth>maxDob)next.dateOfBirth="Paddock Access hanya tersedia mulai usia 13 tahun.";
  if(!nickname.trim())next.nickname="Nickname harus diisi.";
  if(nickname.trim().length>32)next.nickname="Nickname maksimal 32 karakter.";
  if(!preferredRole)next.preferredRole="Pilih preferensi role.";
  if(!privacyAccepted)next.privacy="Persetujuan privasi diperlukan.";
  setErrors(next);if(Object.keys(next).length)return;
  if(!supabase){toast("error","Supabase belum tersedia",missingSupabaseMessage());return;}
  setSaving(true);loading(true);
  try{
   const croppedAvatar=await createCroppedAvatar(avatarFile!);
   const optimizedAvatar=await optimizeImageToWebp(croppedAvatar,"avatar");
   const path=`${session.user.id}/paddock-${crypto.randomUUID()}.webp`;
   const {error:uploadError}=await supabase.storage.from("profile-avatars").upload(path,optimizedAvatar.file,{upsert:false,contentType:"image/webp"});
   if(uploadError)throw new Error(uploadError.message);
   const {data,error}=await supabase.functions.invoke("complete-paddock-access",{body:{avatarPath:path,firstName,lastName:"",dateOfBirth,nickname,preferredRole,nationality,hometown,privacyAccepted,registrationPayload:{...registrationPayload,requested_role:preferredRole==="Team Owner"?"Owner":"Driver",nickname:nickname.trim(),avatar_path:path}}});
   if(error)throw new Error(error.message);
   if(!data?.success)throw new Error(data?.error||"Paddock Access gagal disimpan.");
   await onComplete();setRegistration({id:data.registration?.registration_id,requested_role:preferredRole==="Team Owner"?"Owner":"Driver",status:"pending",created_at:new Date().toISOString()});toast("success","Pengajuan terkirim","Profil dan pengajuan role berhasil dikirim untuk review Admin.");
  }catch(error){const message=error instanceof Error?error.message:"Terjadi kesalahan.";toast("error","Pendaftaran gagal",message);}
  finally{loading(false);setSaving(false);}
 };
 if(registration?.status==="pending")return <section className="workspace paddock-access-workspace"><div className="paddock-access-shell"><div className="paddock-access-heading"><span className="section-eyebrow">CALERIS MASTERS · MEMBER REGISTRATION</span><h1 className="page-title">Pengajuan Terkirim</h1><p className="page-description">Pendaftaran role dan profilmu sedang diperiksa Admin.</p></div><div className="mer-panel"><Shield/><h2>Menunggu Persetujuan</h2><p>Role akan aktif setelah Admin menyetujui pengajuan.</p><span className="mer-status">PENDING REVIEW</span></div></div></section>;
 return <section className="workspace paddock-access-workspace"><div className="paddock-access-shell"><div className="paddock-access-heading"><span className="section-eyebrow">CALERIS MASTERS · MEMBER REGISTRATION</span><h1 className="page-title">Paddock Access</h1><p className="page-description">Lengkapi identitas dan detail role dalam satu proses pendaftaran.</p></div><div className="paddock-access-form">
  <div className="paddock-avatar-field"><div className="paddock-avatar-preview">{avatarPreview?<img src={avatarPreview} alt="Preview foto profil"/>:<Camera size={28}/>}</div><div className="paddock-avatar-copy"><strong>Foto profil</strong><small>JPG, PNG, WEBP · Maksimal 3 MB</small><div className="paddock-avatar-actions"><label className="action upload-button">Pilih foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar}/></label>{avatarPreview&&!avatarEditing&&<button type="button" className="action avatar-edit-button" onClick={()=>{const original=originalAvatarFileRef.current;if(!original)return;if(avatarPreview)URL.revokeObjectURL(avatarPreview);setAvatarFile(original);setAvatarPreview(URL.createObjectURL(original));setCropX(50);setCropY(50);setAvatarEditing(true);}}>Edit foto</button>}</div>{errors.avatar&&<small className="field-error">{errors.avatar}</small>}</div></div>
  {avatarPreview&&avatarEditing&&<div className="avatar-inline-crop"><span>GESER FOTO UNTUK MENGATUR POSISI</span><div ref={avatarStageRef} className="avatar-inline-stage" onPointerDown={beginAvatarDrag} onPointerMove={moveAvatarDrag} onPointerUp={finishAvatarDrag} onPointerCancel={finishAvatarDrag}><img ref={avatarImageRef} src={avatarPreview} alt="Geser foto profil" draggable={false} style={{objectPosition:cropX+"% "+cropY+"%"}}/></div><button type="button" className="action primary avatar-confirm-button" onClick={confirmAvatarCrop}>Konfirmasi posisi foto</button></div>}
  <div className="paddock-name-fields"><label className="settings-field">Nama panggilan<input value={firstName} onChange={e=>setFirstName(e.target.value)} maxLength={80} autoComplete="nickname" placeholder="Nama panggilan"/></label></div>
  <PaddockDatePicker value={dateOfBirth} max={maxDob} onChange={setDateOfBirth}/>{errors.dateOfBirth&&<small className="field-error">{errors.dateOfBirth}</small>}
   <LocationSelectors nationality={nationality} hometown={hometown} onNationalityChange={setNationality} onHometownChange={setHometown} errors={{nationality:errors.nationality,hometown:errors.hometown}}/>
  <label className="settings-field">Caleris Nickname<input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={32} autoComplete="nickname" placeholder="Caleris Nickname"/>{errors.nickname&&<small className="field-error">{errors.nickname}</small>}</label>
  <PaddockRolePicker value={preferredRole} onChange={setPreferredRole}/>{errors.preferredRole&&<small className="field-error">{errors.preferredRole}</small>}
  {registration?.status==="rejected"&&<div className="mer-notice">Pengajuan sebelumnya ditolak. {registration.review_note?`Catatan Admin: ${registration.review_note}`:"Kamu dapat mengirim pengajuan baru."}</div>}
  <button type="button" role="checkbox" aria-checked={privacyAccepted} className={"privacy-consent"+(privacyAccepted?" is-checked":"")} onClick={()=>{setPrivacyAccepted(value=>!value);setErrors(v=>({...v,privacy:""}));}}><span className="privacy-consent-box" aria-hidden="true">{privacyAccepted&&<Check size={12}/>}</span><span>Saya setuju data diri saya disimpan di database dan hanya digunakan untuk keamanan akun. Data tidak akan dipublikasikan.</span></button>
  {errors.privacy&&<small className="field-error">{errors.privacy}</small>}
  {preferredRole&&<PaddockRoleDetails role={preferredRole==="Team Owner"?"Team Owner":"Driver"} saving={saving} onSubmit={submit}/>}
 </div></div></section>;
}
function AdminWorkflow({session}:{session:Session}){
 const [allowed,setAllowed]=useState(false),[checking,setChecking]=useState(true);const {toast}=useUI();
 useEffect(()=>{let active=true;async function run(){if(!supabase){setChecking(false);return;}const {data,error}=await supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle();if(!active)return;if(error)toast("error","Pemeriksaan akses gagal",error.message);setAllowed(Boolean(data?.user_id));setChecking(false)}void run();return()=>{active=false}},[session.user.id,toast]);
 if(checking)return <div className="center-state"><LoaderCircle className="spin"/><p>Memeriksa akses administrator...</p></div>;
 if(!allowed)return <section className="workspace"><PageHeading eyebrow="Restricted workspace" title="Admin Workflow" description="Workspace operasional khusus administrator CALERIS MASTERS."/><div className="access-denied"><Shield/><h2>Akses administrator diperlukan</h2><p>Admin Workflow hanya tersedia untuk akun yang terdaftar dalam allow-list administrator. Role FIA tidak memberikan akses ke halaman ini.</p></div></section>;
 const sections=[
  {title:"Configuration & Rules",description:"Konfigurasi season, lisensi, ekonomi, hadiah, dan harga.",items:[["Website Configuration","Pengaturan website dan konfigurasi umum","/admin/configuration"],["License Engine","Season, divisi, lisensi, dan scoring","/admin/license-engine"],["Economy Engine","Wallet, tax rules, dan ekonomi","/admin/economy-engine"],["Prizepool","Hadiah dan reward kompetisi","/admin/prizepool"],["Quest Engine","Konfigurasi quest dan reward","/admin/quest-engine"],["Pricing Center","Harga dan parameter development","/admin/pricing"]]},
  {title:"Approvals & Lifecycle",description:"Tindak lanjut registrasi, akun, dan status operasional.",items:[["Registered Members","Review registrasi member dan tim","/admin/registered-members"],["User Management","Akun, role, dan relasi member","/admin/users"],["Team Inactivity","Freeze, kompensasi, dan slot pengganti","/admin/team-inactivity"],["Admin Operations","Pajak, valuation, dan pemetaan tier","/admin/operations"]]},
  {title:"Audit & Intelligence",description:"Pemeriksaan data, penyesuaian, dan monitoring lintas engine.",items:[["Economy Adjustments","Penyesuaian saldo dengan audit trail","/admin/adjustments"],["Operations Intelligence","Monitoring operasional lintas engine","/admin/operations-intelligence"],["Brand Ecosystem","Reputasi, fans, dan brand system","/admin/brand-ecosystem"],["Sponsorship","Kontrak dan operasi sponsorship","/admin/sponsorship"]]},
  {title:"Platform Control",description:"Pengelolaan website dan alat pengujian internal.",items:[["Site Manager","Pengaturan halaman dan identitas publik","/admin"],["Test Personas","Akun/persona pengujian terkelola","/admin/test-personas"],["Race Engine Lab","Kontrol dan observasi Race Engine","/admin/race-engine-lab"]]}
 ];
 return <section className="workspace admin-workflow-hub">
  <PageHeading eyebrow="Control room · Administration" title="Admin Workflow" description="Pusat navigasi untuk konfigurasi, approval, audit, dan kontrol operasional CALERIS MASTERS."/>
  <div className="admin-workflow-intro"><div><span className="section-eyebrow">ADMIN CONTROL ROOM</span><h2>Operational workspace</h2><p>Semua tautan mengarah ke modul Admin yang sudah aktif. Hak akses dan tindakan tetap divalidasi oleh masing-masing modul.</p></div><span className="admin-workflow-access"><Shield size={15}/> ADMIN ONLY</span></div>
  <div className="admin-workflow-grid">{sections.map(section=><section className="workspace-card admin-workflow-section" key={section.title}><div className="section-title-row"><div><span className="section-eyebrow">WORKSPACE</span><h2>{section.title}</h2><p>{section.description}</p></div></div><div className="admin-workflow-links">{section.items.map(([title,description,href])=><Link className="admin-workflow-link" to={href} key={href}><span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={17}/></Link>)}</div></section>)}</div>
  <div className="admin-workflow-notice"><strong>CRM workflow belum diaktifkan</strong><p>Halaman ini tidak membuat pipeline CRM, tugas otomatis, atau perubahan data member. Modul CRM khusus baru dapat ditambahkan setelah definisi status, pemilik tugas, alur approval, dan aturan tindak lanjut disepakati. Sementara itu, seluruh operasi yang sudah tersedia dapat diakses dari hub ini.</p></div>
 </section>;
}
type PublicMemberProfileData={public_member_id:string;display_name:string;first_name:string|null;last_name:string|null;web_nickname:string|null;driver_nickname:string|null;avatar_url:string|null;role?:string|null;character_name?:string|null};
type PublicCharacterData={character_name:string|null;role:string|null;license:string|null;team_name:string|null;team_id:string|null};
function PublicMemberProfile({session}:{session:Session|null}){
 const {memberId=""}=useParams();
 const [profile,setProfile]=useState<PublicMemberProfileData|null>(null),[character,setCharacter]=useState<PublicCharacterData|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const [canRecruit,setCanRecruit]=useState(false),[targetMemberId,setTargetMemberId]=useState("");
 const [isAdminViewer,setIsAdminViewer]=useState(false),[fiaTargetMemberId,setFiaTargetMemberId]=useState(""),[fiaInviteBusy,setFiaInviteBusy]=useState(false),[fiaInviteNotice,setFiaInviteNotice]=useState("");
 const [recruitOpen,setRecruitOpen]=useState(false),[moveType,setMoveType]=useState<"transfer"|"loan">("transfer"),[offerAmount,setOfferAmount]=useState(""),[loanStart,setLoanStart]=useState(""),[loanEnd,setLoanEnd]=useState(""),[recruitNote,setRecruitNote]=useState("");
 const [recruitSaving,setRecruitSaving]=useState(false),[recruitNotice,setRecruitNotice]=useState("");
 useEffect(()=>{let active=true;async function load(){setBusy(true);setError("");if(!supabase){setError("Layanan profil belum tersedia.");setBusy(false);return;}const {data,error:requestError}=await supabase.functions.invoke("member-directory",{body:{action:"profile",memberId}});if(!active)return;if(requestError||!data?.profile){setError(data?.error||"Profil member tidak ditemukan.");setProfile(null);setCharacter(null);}else{setProfile(data.profile as PublicMemberProfileData);setCharacter(data.character as PublicCharacterData|null);}setBusy(false)}void load();return()=>{active=false}},[memberId]);
 useEffect(()=>{let active=true;setIsAdminViewer(false);setFiaTargetMemberId("");setFiaInviteNotice("");async function loadFiaInviteAccess(){if(!supabase||!session||!profile?.public_member_id)return;const [adminResult,targetResult]=await Promise.all([supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle(),supabase.from("caleris_member_directory").select("id").eq("public_member_id",profile.public_member_id).maybeSingle()]);if(!active)return;if(adminResult.error||targetResult.error)return;const admin=Boolean(adminResult.data?.user_id);setIsAdminViewer(admin);setFiaTargetMemberId(admin?targetResult.data?.id||"": "");}void loadFiaInviteAccess();return()=>{active=false}},[session?.user.id,profile?.public_member_id]);
 useEffect(()=>{let active=true;setCanRecruit(false);setTargetMemberId("");async function loadRecruitAccess(){if(!supabase||!session||!profile?.public_member_id||!character||character.role!=="Driver")return;
  const [actorProfile,target]=await Promise.all([
   supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle(),
   supabase.from("caleris_member_directory").select("id,role,team_id").eq("public_member_id",profile.public_member_id).maybeSingle()
  ]);
  if(!active||actorProfile.error||target.error||!actorProfile.data?.member_id||!target.data?.id||target.data.role!=="Driver")return;
  const {data:actor,error:actorError}=await supabase.from("members").select("role,team_id").eq("id",actorProfile.data.member_id).maybeSingle();
  if(!active||actorError||!actor||!actor.team_id||actor.team_id===target.data.team_id||!["Owner","Principal"].includes(actor.role||""))return;
  setTargetMemberId(target.data.id);setCanRecruit(true);
 }void loadRecruitAccess();return()=>{active=false}},[session?.user.id,profile?.public_member_id,character?.role]);
 const submitRecruit=async()=>{if(!supabase||!targetMemberId)return;const value=Number(offerAmount);if(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value){setRecruitNotice("Nominal penawaran tidak valid.");return;}if(moveType==="loan"&&(!loanStart||!loanEnd||loanEnd<=loanStart)){setRecruitNotice("Tanggal mulai dan akhir Loan harus valid.");return;}
  setRecruitSaving(true);setRecruitNotice("");const {error:requestError}=await supabase.rpc("member_start_driver_move",{p_driver_member_id:targetMemberId,p_move_type:moveType,p_offer_amount:value,p_loan_starts_on:moveType==="loan"?loanStart:null,p_loan_ends_on:moveType==="loan"?loanEnd:null,p_note:recruitNote.trim()||null});setRecruitSaving(false);
  if(requestError){setRecruitNotice(requestError.message);return;}setRecruitNotice("Penawaran rekrutmen dikirim kepada pemilik tim saat ini.");setRecruitOpen(false);setOfferAmount("");setLoanStart("");setLoanEnd("");setRecruitNote("");
 };
 const inviteToFia=async()=>{if(!supabase||!fiaTargetMemberId||!isAdminViewer||fiaInviteBusy)return;if(!window.confirm("Undang member ini menjadi anggota FIA? Role sebelumnya akan dilepas."))return;setFiaInviteBusy(true);setFiaInviteNotice("");const {error:inviteError}=await supabase.rpc("admin_invite_member_to_fia",{p_target_member_id:fiaTargetMemberId});setFiaInviteBusy(false);if(inviteError){setFiaInviteNotice(inviteError.message);return;}setCharacter(current=>current?{...current,role:"FIA",team_name:null}:current);setFiaInviteNotice("Member berhasil diundang menjadi anggota FIA.");};
 const info=(label:string,value:ReactNode)=><div className="profile-info-item"><span>{label}</span><strong>{value||"Belum tersedia"}</strong></div>;
 return <section className="workspace"><Link className="back-link" to="/"><ChevronLeft size={16}/> Beranda</Link><PageHeading eyebrow="Public member profile" title="Profil Member" description="Identitas publik CALERIS MASTERS."/>
 {busy?<div className="center-state"><LoaderCircle className="spin"/><p>Memuat profil member...</p></div>:error?<div className="workspace-card"><EmptyPanel icon={<Users/>} title="Profil tidak tersedia" body={error}/></div>:profile?<><div className="profile-hero-card"><div className="profile-avatar-large">{profile.avatar_url?<img src={profile.avatar_url} alt="Foto profil"/>:<UserCircle size={54}/>}</div><div className="profile-hero-copy"><span className="section-eyebrow">CALERIS MEMBER</span><h2>{profile.display_name}</h2><p>Member ID · {profile.public_member_id}</p><span className="profile-role-pill">Public Profile</span>{isAdminViewer&&fiaTargetMemberId&&<button type="button" className="action primary profile-recruit-button" disabled={fiaInviteBusy||character?.role==="FIA"} onClick={()=>void inviteToFia()}><Shield size={15}/>{fiaInviteBusy?"Memproses...":character?.role==="FIA"?"Sudah menjadi FIA":"Invite menjadi anggota FIA"}</button>}{fiaInviteNotice&&<p className="license-notice" role="status">{fiaInviteNotice}</p>}{canRecruit&&<button className="action primary profile-recruit-button" onClick={()=>{setRecruitNotice("");setRecruitOpen(true)}}>Rekrut</button>}</div></div><div className="profile-sections public-profile-sections"><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">ACCOUNT</span><h2>Informasi publik</h2></div></div><div className="profile-info-grid">{info("Nama depan",profile.first_name)}{info("Nama belakang",profile.last_name)}{info("Nickname web",profile.web_nickname)}{info("Nickname driver",profile.driver_nickname)}{info("Member ID",profile.public_member_id)}</div></div><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CHARACTER</span><h2>Informasi karakter</h2></div></div>{character?<div className="profile-info-grid">{info("Nama karakter",character.character_name)}{info("Role",character.role)}{info("Tim",<TeamProfileLink teamId={character.team_id}>{character.team_name}</TeamProfileLink>)}{info("License",character.license)}</div>:<EmptyPanel icon={<Users/>} title="Belum terhubung ke member" body="Informasi karakter akan tersedia setelah akun ditautkan oleh administrator."/>}</div></div></>:null}
 {recruitNotice&&!recruitOpen&&<div className="license-notice" role="status">{recruitNotice}</div>}
 {recruitOpen&&<div className="transfer-recruit-overlay" role="presentation" onClick={()=>{if(!recruitSaving)setRecruitOpen(false)}}><section className="workspace-card transfer-recruit-modal" role="dialog" aria-modal="true" aria-labelledby="recruit-driver-title" onClick={e=>e.stopPropagation()}><div className="section-title-row"><div><span className="section-eyebrow">DRIVER RECRUITMENT</span><h2 id="recruit-driver-title">Rekrut {character?.character_name||profile?.display_name}</h2><p>Penawaran akan dikirim kepada Team Owner saat ini untuk dinegosiasikan.</p></div><button type="button" className="economy-secondary-button" disabled={recruitSaving} onClick={()=>setRecruitOpen(false)}>Tutup</button></div><div className="takeover-form"><label>Jenis perpindahan<select value={moveType} onChange={e=>setMoveType(e.target.value as "transfer"|"loan")}><option value="transfer">Transfer</option><option value="loan">Loan</option></select></label><label>Offer price (¢p)<input type="number" min="0.01" step="0.01" value={offerAmount} onChange={e=>setOfferAmount(e.target.value)} required/></label>{moveType==="loan"&&<><label>Loan mulai<input type="date" value={loanStart} onChange={e=>setLoanStart(e.target.value)} required/></label><label>Loan berakhir<input type="date" value={loanEnd} onChange={e=>setLoanEnd(e.target.value)} required/></label></>}<label>Catatan<textarea rows={3} value={recruitNote} onChange={e=>setRecruitNote(e.target.value)}/></label>{recruitNotice&&<p className="license-notice" role="status">{recruitNotice}</p>}<div className="ops-actions"><button type="button" className="action primary" disabled={recruitSaving} onClick={()=>void submitRecruit()}>{recruitSaving?"Mengirim...":"Kirim penawaran"}</button><button type="button" className="action" disabled={recruitSaving} onClick={()=>setRecruitOpen(false)}>Batal</button></div></div></section></div>}
 </section>;
}
function CalerisSelectOverlay(){
 const [activeSelect,setActiveSelect]=useState<HTMLSelectElement|null>(null),[filter,setFilter]=useState("");
 useEffect(()=>{
  const canUseCustomSheet=(select:HTMLSelectElement|null):select is HTMLSelectElement=>Boolean(
   select&&!select.disabled&&!select.multiple&&select.dataset.nativePopup!=="true"
  );
  const showSelect=(select:HTMLSelectElement)=>{
   select.focus({preventScroll:true});
   setFilter("");
   setActiveSelect(select);
  };
  // Android and several mobile browsers launch the native grey picker on
  // pointerdown, before click capture can cancel it. Intercept the opening
  // gesture itself so only the CALERIS option sheet is ever presented.
  const openSelect=(event:PointerEvent)=>{
   if(event.button!==0||event.isPrimary===false)return;
   const target=event.target;
   if(!(target instanceof Element))return;
   const select=target.closest("select") as HTMLSelectElement|null;
   if(!canUseCustomSheet(select))return;
   event.preventDefault();
   event.stopPropagation();
   showSelect(select);
  };
  // Keep a click-only fallback for assistive/programmatic activation that
  // does not emit pointer events. Pointer activation is already handled above.
  const clickFallback=(event:MouseEvent)=>{
   if(event.detail!==0)return;
   const target=event.target;
   if(!(target instanceof Element))return;
   const select=target.closest("select") as HTMLSelectElement|null;
   if(!canUseCustomSheet(select)||activeSelect===select)return;
   event.preventDefault();
   event.stopPropagation();
   showSelect(select);
  };
  const keyboard=(event:KeyboardEvent)=>{
   const target=event.target;
   if(!(target instanceof HTMLSelectElement)||!canUseCustomSheet(target))return;
   if(["Enter"," ","ArrowDown"].includes(event.key)){
    event.preventDefault();
    event.stopPropagation();
    showSelect(target);
   }else if(event.key==="Escape"&&activeSelect){
    event.preventDefault();
    setActiveSelect(null);
   }
  };
  document.addEventListener("pointerdown",openSelect,true);
  document.addEventListener("click",clickFallback,true);
  document.addEventListener("keydown",keyboard,true);
  return()=>{
   document.removeEventListener("pointerdown",openSelect,true);
   document.removeEventListener("click",clickFallback,true);
   document.removeEventListener("keydown",keyboard,true);
  };
 },[activeSelect]);
 useEffect(()=>{
  if(!activeSelect)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  return()=>{document.body.style.overflow=previousOverflow};
 },[activeSelect]);
 if(!activeSelect)return null;
 const options=Array.from(activeSelect.options).map(option=>({value:option.value,label:option.label||option.textContent||"",disabled:option.disabled,group:option.parentElement instanceof HTMLOptGroupElement?option.parentElement.label:""}));
 const filtered=options.filter(option=>(option.label+" "+option.group).toLocaleLowerCase("id-ID").includes(filter.trim().toLocaleLowerCase("id-ID")));
 const label=activeSelect.labels?.[0];let labelText="";if(label){for(const node of Array.from(label.childNodes)){if(node===activeSelect)break;labelText+=node.textContent||"";}}const title=labelText.replace(/\s+/g," ").trim()||activeSelect.getAttribute("aria-label")||"Pilih opsi";
 const choose=(value:string)=>{
  if(!activeSelect||activeSelect.disabled)return;
  activeSelect.value=value;
  activeSelect.dispatchEvent(new Event("input",{bubbles:true}));
  activeSelect.dispatchEvent(new Event("change",{bubbles:true}));
  activeSelect.focus({preventScroll:true});setActiveSelect(null);setFilter("");
 };
 return createPortal(<div className="caleris-select-backdrop" role="presentation" onPointerDown={event=>{if(event.target===event.currentTarget)setActiveSelect(null)}}><section className="caleris-select-sheet comet-skeleton" role="dialog" aria-modal="true" aria-label={title}><header className="caleris-select-heading"><div><strong>{title}</strong><small>CALERIS MASTERS · SELECT OPTION</small></div><button type="button" aria-label="Tutup pilihan" onClick={()=>setActiveSelect(null)}><X size={18}/></button></header>{options.length>7&&<label className="caleris-select-search"><Search size={16}/><input value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Cari pilihan..."/></label>}<div className="caleris-select-options" role="listbox">{filtered.length?filtered.map((option,index)=><Fragment key={option.value+"-"+index}>{option.group&&(index===0||filtered[index-1]?.group!==option.group)&&<div className="caleris-select-group">{option.group}</div>}<button type="button" role="option" aria-selected={activeSelect.value===option.value} className={"caleris-select-option"+(activeSelect.value===option.value?" is-selected":"")} disabled={option.disabled} onClick={()=>choose(option.value)}><span>{option.label}</span>{activeSelect.value===option.value&&<Check size={18}/>}</button></Fragment>):<p className="caleris-select-empty">Pilihan tidak ditemukan.</p>}</div></section></div>,document.body);
}

function GlobalSearch({isAdmin,panelAccess}:{isAdmin:boolean;panelAccess:PanelAccess}){
 const [query,setQuery]=useState(""),[members,setMembers]=useState<PublicMemberProfileData[]>([]),[teams,setTeams]=useState<{id:string;name:string;member_count:number}[]>([]),[pages,setPages]=useState<{title:string;slug:string;excerpt:string;href:string}[]>([]),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[closing,setClosing]=useState(false),[busy,setBusy]=useState(false),[searchError,setSearchError]=useState("");const navigate=useNavigate(),inputRef=useRef<HTMLInputElement>(null),searchRootRef=useRef<HTMLDivElement>(null),closeTimer=useRef<number|null>(null),[dropdownStyle,setDropdownStyle]=useState({top:0,left:10,width:340,maxHeight:420});
 useEffect(()=>{if(expanded)inputRef.current?.focus()},[expanded]);
 useEffect(()=>{if(!open||!expanded||query.trim().length<1)return;const update=()=>{const rect=searchRootRef.current?.getBoundingClientRect();if(!rect)return;const width=Math.min(440,window.innerWidth-20),left=Math.max(10,Math.min(rect.right-width,window.innerWidth-width-10)),top=rect.bottom+8;setDropdownStyle({top,left,width,maxHeight:Math.max(120,Math.min(560,window.innerHeight-top-16))})};update();window.addEventListener("resize",update);window.addEventListener("scroll",update,true);return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true)}},[open,expanded,query]);
 useEffect(()=>{const term=query.trim();if(term.length<1){setMembers([]);setTeams([]);setPages([]);setSearchError("");setBusy(false);return;}let active=true;const timer=window.setTimeout(async()=>{
  const destinations=[{title:"Dashboard",slug:"shortcut-dashboard",excerpt:"Ringkasan akun dan aktivitas",href:"/dashboard"},{title:"Profil saya",slug:"shortcut-profile",excerpt:"Identitas akun pribadi",href:"/profile"},{title:"Pengaturan akun",slug:"shortcut-settings",excerpt:"Foto, nama, nickname dan tema",href:"/account/settings"},{title:"Official Rules",slug:"shortcut-rules",excerpt:"Peraturan resmi Caleris Masters",href:"/rules"},...(isAdmin?[{title:"Admin Workflow",slug:"shortcut-workflow",excerpt:"Workspace operasional administrator",href:"/admin-workflow"},{title:"Site Manager",slug:"shortcut-admin",excerpt:"Pengaturan website dan Member ID",href:"/admin"}]:[])];
  const accessKeys:Record<string,keyof PanelAccess>={"main-event":"main_event","driver-panel":"driver_panel","team-panel":"team_panel","fia-panel":"fia_panel"};
  const routePages=panelGroups.filter(group=>isAdmin||panelAccess[accessKeys[group.path]]).flatMap(group=>group.tabs.map(tab=>({title:tab.label,slug:"route-"+group.path+"-"+tab.path,excerpt:tab.description,href:"/"+group.path+"/"+tab.path})));
  const globalCards=[["Driver Ranking","Peringkat driver lintas divisi","/main-event/global/driver-ranking"],["Rookie of the Season","Performa rookie terbaik","/main-event/global/rookie-of-the-season"],["Team Ranking","Peringkat konstruktor dan tim","/main-event/global/team-ranking"],["Engine Ranking","Performa paket engine","/main-event/global/engine-ranking"],["Statistic","Statistik kompetisi keseluruhan","/main-event/global/statistic"],["Comparison","Perbandingan driver dan tim","/main-event/global/comparison"],["Driver List","Direktori seluruh driver","/main-event/global/driver-list"],["Team List","Direktori seluruh tim","/main-event/global/team-list"]].map(([title,excerpt,href],i)=>({title,excerpt,href,slug:"global-card-"+i}));
  const cardHeaders=[{title:"Current Event",slug:"card-current-event",excerpt:"Event aktif dan informasi event",href:"/dashboard"},{title:"Statistik",slug:"card-statistics",excerpt:"Overview statistik dashboard",href:"/dashboard"},{title:"Total event",slug:"card-total-events",excerpt:"Jumlah seluruh event",href:"/dashboard"},{title:"Race start",slug:"card-race-start",excerpt:"Informasi jadwal race",href:"/dashboard"},{title:"Points",slug:"card-points",excerpt:"Poin akun dan statistik",href:"/dashboard"},{title:"Account balance",slug:"card-account-balance",excerpt:"Saldo akun Caleris",href:"/profile"},{title:"Informasi akun",slug:"card-account-info",excerpt:"Nama, nickname, role, email dan Member ID",href:"/profile"},{title:"Informasi karakter",slug:"card-character-info",excerpt:"Karakter, role, tim dan saldo",href:"/profile"},{title:"Detail kontrak",slug:"card-contract",excerpt:"Durasi, gaji, target dan klausul pelepasan",href:"/profile"},{title:"Account Preferences",slug:"card-account-preferences",excerpt:"Pengaturan foto profil dan nickname",href:"/account/settings"},...(isAdmin?[{title:"CRM tools",slug:"card-crm-tools",excerpt:"Admin Workflow dan tools CRM",href:"/admin-workflow"},{title:"Member ID Management",slug:"card-member-id",excerpt:"Pengelolaan identitas member",href:"/admin"}]:[])];
  const needle=term.toLocaleLowerCase("id-ID");const localResults=[...destinations,...routePages,...globalCards,...cardHeaders].filter(item=>(item.title+" "+item.excerpt+" "+item.href).toLocaleLowerCase("id-ID").includes(needle));setPages(localResults);setMembers([]);setTeams([]);setSearchError("");setBusy(true);
  if(!supabase){if(active){setSearchError("Koneksi database belum tersedia.");setBusy(false)}return;}
  try{const {data,error}=await supabase.functions.invoke("member-directory",{body:{action:"search",query:term}});if(!active)return;if(error){setSearchError(error.message||"Pencarian member, driver, tim, dan konten gagal.");setBusy(false);return;}
   setMembers((data?.members||[]) as PublicMemberProfileData[]);setTeams((data?.teams||[]) as {id:string;name:string;member_count:number}[]);const contentPages=(data?.pages||[]) as {title:string;slug:string;excerpt:string;href:string}[];const merged=[...contentPages,...localResults].filter((item,index,all)=>all.findIndex(x=>x.slug===item.slug)===index);setPages(merged);setBusy(false);
  }catch(error){if(active){setSearchError(error instanceof Error?error.message:"Pencarian gagal. Coba lagi.");setBusy(false)}}
 },100);return()=>{active=false;window.clearTimeout(timer)}},[query,isAdmin]);
 const go=(href:string)=>{navigate(href);setQuery("");setOpen(false);setExpanded(false);setTeams([]);setSearchError("")};
 const collapse=()=>{if(!expanded||closing)return;setClosing(true);setOpen(false);if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);closeTimer.current=window.setTimeout(()=>{setExpanded(false);setClosing(false);setQuery("");setMembers([]);setTeams([]);setPages([]);setSearchError("");closeTimer.current=null},350)};
 const hasResults=members.length>0||teams.length>0||pages.length>0;
 return <div ref={searchRootRef} className={"global-search"+(expanded?" is-expanded":"")+(closing?" is-closing":"")}>
  <button type="button" className="tire-search-trigger" aria-label={expanded?"Tutup pencarian":"Cari driver, member, konten, dan halaman"} aria-expanded={expanded} onClick={()=>{if(expanded)collapse();else{if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);setClosing(false);setExpanded(true);setOpen(true)}}}>
   <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="#151719" stroke="currentColor" strokeWidth="5"/><circle cx="24" cy="24" r="11.5" fill="#080a0c" stroke="#aeb3b8" strokeWidth="2.2"/><circle cx="24" cy="24" r="5" fill="currentColor"/><path d="M18 7l3 6m9-6-3 6M7 18l7 3m27-3-7 3M7 30l7-3m27 3-7-3M18 41l3-6m9 6-3-6" stroke="#d8dadd" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="tire-sparks" aria-hidden="true"><i/><i/><i/><i/><i/></span>
  </button>
  <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==="Escape")collapse()}} placeholder="Cari driver, member, tim, konten, halaman..." aria-label="Cari driver, member, tim, konten, dan halaman"/>
  {query&&<button type="button" className="search-clear" aria-label="Hapus pencarian" onClick={()=>{setQuery("");setMembers([]);setTeams([]);setPages([]);setSearchError("");inputRef.current?.focus()}}><X size={15}/></button>}
  {open&&expanded&&query.trim().length>=1&&createPortal(<><button className="search-dismiss" aria-label="Tutup hasil pencarian" style={{position:"fixed",inset:0,zIndex:1000}} onClick={()=>setOpen(false)}/><div className="search-results" style={{position:"fixed",top:dropdownStyle.top,left:dropdownStyle.left,right:"auto",width:dropdownStyle.width,maxHeight:dropdownStyle.maxHeight,zIndex:1001}}>{busy?<p className="search-empty">Mencari driver, member, tim, halaman, dan konten terbaru...</p>:null}{searchError&&<p className="search-empty search-error">{searchError}</p>}{!busy&&!hasResults&&!searchError?<p className="search-empty">Tidak ada hasil untuk “{query}”.</p>:null}{members.length>0&&<><span className="search-group-title">DRIVERS & MEMBERS</span>{members.map(item=><button type="button" className="search-result" key={item.public_member_id} onClick={()=>go("/member/"+item.public_member_id)}><span className="search-avatar">{item.avatar_url?<img src={item.avatar_url} alt=""/>:<UserCircle size={20}/>}</span><span><strong>{item.display_name}</strong><small>{[item.role,item.character_name,item.public_member_id].filter(Boolean).join(" · ")}</small></span><ArrowUpRight size={15}/></button>)}</>}{teams.length>0&&<><span className="search-group-title">TEAMS</span>{teams.map(team=><button type="button" className="search-result" key={team.id} onClick={()=>go("/team/"+team.id)}><span className="search-page-icon"><Users size={17}/></span><span><strong>{team.name}</strong><small>{team.member_count} member terdaftar</small></span><ArrowUpRight size={15}/></button>)}</>}{pages.length>0&&<><span className="search-group-title">PAGES & CONTENT</span>{pages.map(item=><button type="button" className="search-result" key={item.slug} onClick={()=>go(item.href)}><span className="search-page-icon"><BookOpen size={17}/></span><span><strong>{item.title}</strong><small>{item.excerpt||item.slug}</small></span><ArrowUpRight size={15}/></button>)}</>}</div></>,document.body)}
 </div>;
}
function AccountSettings({session,profile,profileReady,onSaved,theme,setTheme}:{session:Session;profile:AccountProfile|null;profileReady:boolean;onSaved:()=>Promise<void>;theme:"dark"|"light";setTheme:(v:"dark"|"light")=>void}){
 const [webNickname,setWebNickname]=useState(""),[driverNickname,setDriverNickname]=useState(""),[firstName,setFirstName]=useState(""),[lastName,setLastName]=useState(""),[nationality,setNationality]=useState(""),[hometown,setHometown]=useState(""),[avatarUrl,setAvatarUrl]=useState(""),[avatarPath,setAvatarPath]=useState(""),[uploading,setUploading]=useState(false),[saving,setSaving]=useState(false);const {toast}=useUI();const navigate=useNavigate();
 useEffect(()=>{if(!profileReady)return;setWebNickname(profile?.web_nickname||"");setDriverNickname(profile?.driver_nickname||"");setFirstName(profile?.first_name||"");setLastName(profile?.last_name||"");setNationality(profile?.nationality||"");setHometown(profile?.hometown||"");setAvatarUrl(profile?.avatar_url||"");setAvatarPath(profile?.avatar_path||"")},[profile,profileReady]);
 const uploadAvatar=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file||!supabase)return;if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)||file.size>3*1024*1024){toast("warning","File tidak valid","Gunakan JPG, PNG, WEBP, atau GIF maksimal 3 MB.");e.target.value="";return;}setUploading(true);const ext=file.name.split(".").pop()?.toLowerCase()||"jpg",path=`${session.user.id}/avatar-${Date.now()}.${ext}`;const {error}=await supabase.storage.from("profile-avatars").upload(path,file,{upsert:true,contentType:file.type});if(error)toast("error","Upload foto gagal",error.message);else{const {data}=await supabase.storage.from("profile-avatars").createSignedUrl(path,3600);setAvatarPath(path);setAvatarUrl(data?.signedUrl||"");toast("success","Foto berhasil diunggah","Simpan perubahan untuk memperbarui profil.")}setUploading(false);e.target.value=""};
 const save=async()=>{if(!supabase)return;if(!nationality.trim()||!hometown.trim()){toast("warning","Identitas belum lengkap","Nationality dan hometown wajib dipilih dari daftar.");return;}if(webNickname.trim().length>32||driverNickname.trim().length>32||firstName.trim().length>80||lastName.trim().length>80||nationality.trim().length>80||hometown.trim().length>120){toast("warning","Data terlalu panjang","Nickname maksimal 32 karakter dan nama maksimal 80 karakter.");return;}setSaving(true);const {error}=await supabase.from("profiles").upsert({user_id:session.user.id,avatar_url:null,avatar_path:avatarPath||null,web_nickname:webNickname.trim()||null,driver_nickname:driverNickname.trim()||null,first_name:firstName.trim()||null,last_name:lastName.trim()||null,nationality:nationality.trim()||null,hometown:hometown.trim()||null,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error)toast("error","Profil gagal disimpan",error.message);else{await onSaved();toast("success","Pengaturan akun tersimpan","Informasi profil berhasil diperbarui.");navigate("/profile")}setSaving(false)};
 const currentAvatar=avatarUrl||session.user.user_metadata?.avatar_url||session.user.user_metadata?.picture||"";
 return <section className="workspace settings-workspace"><Link className="back-link" to="/profile"><ChevronLeft size={16}/> Profil</Link><PageHeading eyebrow="Account preferences" title="Pengaturan Akun" description="Perbarui identitas publik, foto profil, dan preferensi tampilan."/><div className="workspace-card settings-card">{!profileReady?<div className="center-state"><LoaderCircle className="spin"/><p>Memuat pengaturan...</p></div>:<><div className="avatar-editor"><div className="profile-avatar-large">{currentAvatar?<img src={currentAvatar} alt="Preview foto profil"/>:<UserCircle size={54}/>}</div><div><strong>Foto profil</strong><p>JPG, PNG, WEBP, atau GIF. Maksimal 3 MB.</p><label className="action upload-button"><Camera size={16}/>{uploading?"Mengunggah...":"Pilih foto"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadAvatar} disabled={uploading} hidden/></label></div></div>
 <div className="settings-fields-grid"><label className="settings-field">Nama depan <span className="optional-label">Opsional</span><input value={firstName} onChange={e=>setFirstName(e.target.value)} maxLength={80} placeholder="Nama depan"/></label><label className="settings-field">Nama belakang <span className="optional-label">Opsional</span><input value={lastName} onChange={e=>setLastName(e.target.value)} maxLength={80} placeholder="Nama belakang"/></label><LocationSelectors nationality={nationality} hometown={hometown} onNationalityChange={setNationality} onHometownChange={setHometown}/></div>
 <label className="settings-field">Nickname web<input value={webNickname} onChange={e=>setWebNickname(e.target.value)} maxLength={32} placeholder="Nama yang tampil di website"/></label><label className="settings-field">Nickname driver<input value={driverNickname} onChange={e=>setDriverNickname(e.target.value)} maxLength={32} placeholder="Nama karakter / driver"/></label>
 <div className="settings-note"><Shield size={16}/><p>Role, tim, saldo, kontrak, dan data karakter resmi tidak dapat diubah melalui pengaturan akun. Hubungi Admin untuk koreksi data tersebut.</p></div>
 <AnalyticsConsentSettings/><div className="theme-preference"><div><span className="section-eyebrow">DISPLAY</span><strong>Mode tampilan</strong><small>Preferensi ini juga berlaku di landing page.</small></div><div className="theme-switch"><button aria-label="Mode terang" aria-pressed={theme==="light"} onClick={()=>setTheme("light")}><Sun size={16}/></button><button aria-label="Mode gelap" aria-pressed={theme==="dark"} onClick={()=>setTheme("dark")}><Moon size={16}/></button></div></div>
 <div className="admin-actions"><button className="action primary" onClick={save} disabled={saving||uploading}>{saving?"Menyimpan...":"Simpan perubahan"}</button><Link className="action" to="/profile">Batal</Link></div></>}</div></section>;
}
type Rule={title:string;body:string};
function Rules(){const [rule,setRule]=useState<Rule|null>(null),[busy,setBusy]=useState(true);const {toast}=useUI();useEffect(()=>{if(!supabase){setBusy(false);return;}supabase.from("site_content").select("content").eq("slug","rules").eq("published",true).maybeSingle().then(({data,error})=>{if(error)toast("error","Rules gagal dimuat",error.message);if(data?.content)setRule(data.content as Rule);setBusy(false)})},[toast]);return <section className="content-panel"><Link to="/" className="back-link"><ChevronLeft size={16}/> Back to home</Link><p className="kicker">Caleris Masters · Regulations</p><h1 className="page-title">Official Rules</h1>{busy?<p className="muted">Memuat regulations...</p>:rule?<article className="rules-content"><h2>{rule.title}</h2><Markdown value={rule.body}/></article>:<Empty icon={<BookOpen/>} title="Rules sedang disiapkan" body="Dokumen peraturan resmi akan dipublikasikan di halaman ini."/>}</section>}
function Markdown({value}:{value:string}){return <div className="markdown-body">{value.split(/\n{2,}/).filter(Boolean).map((b,i)=>{const lines=b.split("\n");if(lines.every(x=>/^[-*] /.test(x)))return <ul key={i}>{lines.map((x,j)=><li key={j}>{x.replace(/^[-*] /,"")}</li>)}</ul>;if(b.startsWith("## "))return <h3 key={i}>{b.slice(3)}</h3>;if(b.startsWith("# "))return <h2 key={i}>{b.slice(2)}</h2>;return <p key={i}>{lines.map((x,j)=><span key={j}>{x}{j<lines.length-1&&<br/>}</span>)}</p>})}</div>}
function AuthCallback(){const {toast}=useUI(),navigate=useNavigate();useEffect(()=>{if(!supabase){toast("error","Supabase belum siap",missingSupabaseMessage());navigate("/",{replace:true});return;}supabase.auth.getSession().then(({data,error})=>{if(error||!data.session){toast("error","Autentikasi gagal",error?.message||"Sesi Discord tidak ditemukan.");navigate("/",{replace:true})}else{toast("success","Login berhasil","Akun Discord berhasil terhubung.");navigate("/dashboard",{replace:true})}})},[navigate,toast]);return <div className="center-state"><LoaderCircle className="spin"/><p>Memverifikasi sesi Discord...</p></div>}
function Admin({session}:{session:Session}){
 const [allowed,setAllowed]=useState(false),[checking,setChecking]=useState(true),[title,setTitle]=useState("Caleris Masters Rules"),[body,setBody]=useState(""),[invite,setInvite]=useState(""),[published,setPublished]=useState(false),[targetMemberId,setTargetMemberId]=useState(""),[newMemberId,setNewMemberId]=useState(""),[changingMemberId,setChangingMemberId]=useState(false);const {toast,loading}=useUI();
 useEffect(()=>{let alive=true;async function run(){if(!supabase)return;const {data:p,error:e}=await supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle();if(!alive)return;if(e)toast("error","Pemeriksaan akses gagal",e.message);const admin=Boolean(p?.user_id);setAllowed(admin);if(admin){const [r,c]=await Promise.all([supabase.from("site_content").select("content,published").eq("slug","rules").maybeSingle(),supabase.from("site_settings").select("value").eq("key","community_invite_url").maybeSingle()]);if(!alive)return;if(r.data?.content){const x=r.data.content as Rule;setTitle(x.title||"Caleris Masters Rules");setBody(x.body||"");setPublished(Boolean(r.data.published));}if(typeof c.data?.value==="string")setInvite(c.data.value);if(r.error)toast("error","Rules gagal dimuat",r.error.message);if(c.error)toast("error","Link komunitas gagal dimuat",c.error.message);}setChecking(false)}void run();return()=>{alive=false}},[session,toast]);
 const saveRules=async(pub:boolean)=>{if(!supabase||!session)return;if(!title.trim()||!body.trim()){toast("warning","Konten belum lengkap","Isi judul dan peraturan sebelum menyimpan.");return;}loading(true);const {error}=await supabase.from("site_content").upsert({slug:"rules",content:{title:title.trim(),body},published:pub,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:"slug"});loading(false);if(error)toast("error","Gagal menyimpan Rules",error.message);else{setPublished(pub);toast("success",pub?"Rules dipublikasikan":"Draft tersimpan","Perubahan berhasil disimpan.")}};
 const saveInvite=async()=>{if(!supabase||!session)return;if(!/^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/i.test(invite.trim())){toast("warning","URL tidak valid","Gunakan tautan discord.gg atau discord.com/invite.");return;}loading(true);const {error}=await supabase.from("site_settings").upsert({key:"community_invite_url",value:invite.trim(),updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:"key"});loading(false);if(error)toast("error","Gagal menyimpan link",error.message);else toast("success","Link komunitas diperbarui","Tombol Join Our Community memakai link terbaru.")};
 const changeMemberId=async()=>{if(!supabase)return;const target=targetMemberId.trim().toUpperCase(),next=newMemberId.trim().toUpperCase();if(!/^[A-Z0-9]{12,16}$/.test(target)||!/^[A-Z0-9]{12,16}$/.test(next)||!/[A-Z]/.test(next)||!/[0-9]/.test(next)){toast("warning","Format Member ID tidak valid","Gunakan 12–16 karakter huruf kapital dan angka.");return;}setChangingMemberId(true);const {data,error}=await supabase.functions.invoke("member-directory",{body:{action:"update_member_id",targetMemberId:target,newMemberId:next}});setChangingMemberId(false);if(error||data?.error)toast("error","Member ID gagal diubah",data?.error||error?.message);else{toast("success","Member ID berhasil diubah",`${data.change.old_member_id} → ${data.change.new_member_id}`);setTargetMemberId(next);setNewMemberId("")}};
 if(checking)return <div className="center-state"><LoaderCircle className="spin"/><p>Memeriksa akses admin...</p></div>;
 if(!allowed)return <section className="content-panel"><Empty icon={<X/>} title="Akses ditolak" body="Halaman ini hanya untuk akun administrator terdaftar."/></section>;
 return <section className="content-panel admin-panel"><p className="kicker">Control room · Administration</p><h1 className="page-title">Site Manager</h1><div className="admin-section"><div className="section-heading"><h2>Rules Editor</h2><span className={published?"status-live":"status-draft"}>{published?"Published":"Draft"}</span></div><label>Judul Rules<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/></label><label>Isi peraturan<textarea rows={14} value={body} onChange={e=>setBody(e.target.value)} placeholder={"# General Regulations\n\nTulis aturan di sini...\n\n## Race Conduct\n- Aturan pertama"}/></label><p className="field-hint">Mendukung heading (# / ##), paragraf, baris baru, dan bullet list (-).</p><div className="admin-actions"><button className="action" onClick={()=>saveRules(false)}>Save Draft</button><button className="action primary" onClick={()=>saveRules(true)}>Publish Rules</button></div></div><div className="admin-section"><h2>Community Invite</h2><label>Discord invite URL<input type="url" value={invite} onChange={e=>setInvite(e.target.value)} placeholder="https://discord.gg/your-invite"/></label><p className="field-hint">Ganti kapan saja saat invite Discord kedaluwarsa.</p><button className="action primary" onClick={saveInvite}>Save Community Link</button></div><div className="admin-section"><h2>Member ID Management</h2><label>Member ID saat ini<input value={targetMemberId} onChange={e=>setTargetMemberId(e.target.value.toUpperCase())} maxLength={16} placeholder="Masukkan Member ID target"/></label><label>Member ID baru<input value={newMemberId} onChange={e=>setNewMemberId(e.target.value.toUpperCase())} maxLength={16} placeholder="12–16 karakter alfanumerik"/></label><p className="field-hint">Hanya Admin yang dapat mengubah Member ID. Database menolak ID duplikat dan mencatat riwayat perubahan.</p><button className="action primary" onClick={changeMemberId} disabled={changingMemberId}>{changingMemberId?"Memproses...":"Ubah Member ID"}</button></div></section>;
}
function Empty({icon,title,body}:{icon:ReactNode;title:string;body:string}){return <div className="empty-state">{icon}<h2>{title}</h2><p>{body}</p><Link className="action" to="/">Kembali ke beranda</Link></div>}
function NotFound(){return <section className="content-panel"><Empty icon={<Flag/>} title="404 · Page not found" body="Halaman yang kamu cari tidak tersedia."/></section>}
