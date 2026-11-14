import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import type {ChangeEvent,FormEvent,PointerEvent as ReactPointerEvent,ReactNode} from "react";
import {Link,Navigate,NavLink,Route,Routes,useLocation,useNavigate,useParams} from "react-router-dom";
import {Activity,ArrowUpRight,ShoppingBag,BookOpen,Check,ChevronDown,ChevronLeft,ChevronRight,ClipboardList,ExternalLink,Flag,LoaderCircle,LogIn,LogOut,Moon,Settings,SlidersHorizontal,Shield,Sun,UserCircle,Users,X,Camera,CalendarDays,Wallet,FileText,Menu,Trophy,Coins} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {missingSupabaseMessage,supabase} from "./lib/supabase";
import "./workspace.css";
import "./stage5-panel.css";
import PanelPage, { panelGroups } from "./PanelPages";
import Stage5Panel from "./Stage5Panel";
import AdminConfiguration from "./AdminConfiguration";
import AdminLicenseEngine from "./AdminLicenseEngine";
import AdminEconomyEngine from "./AdminEconomyEngine";
import AdminPricingCenter from "./AdminPricingCenter";
import AdminOperations from "./AdminOperations";
import FIAOperations from "./FIAOperations";
import MemberRaceCheckIn from "./MemberRaceCheckIn";
import TeamAffiliate from "./TeamAffiliate";
import DriverTransferMarket from "./DriverTransferMarket";
import TeamTakeoverMarket from "./TeamTakeoverMarket";
import AdminSponsorship from "./AdminSponsorship";
import SponsorshipCentre from "./SponsorshipCentre";
import DevelopmentTokens from "./DevelopmentTokens";
import ShopPage from "./ShopPage";
import AdminTestPersonas from "./AdminTestPersonas";
import AdminUsers from "./AdminUsers";
import AdminSeasonCalendar from "./AdminSeasonCalendar";
import LocationSelectors from "./LocationSelectors";
import TeamDriverContracts from "./TeamDriverContracts";
import {CircuitPool,CircuitPoolInput} from "./CircuitPool";
import JobSearch from "./JobSearch";

import CashLoanCentre from "./CashLoanCentre";
import "./license-engine.css";
import "./admin-configuration.css";
import "./economy-engine.css";
import "./admin-operations.css";
import "./fia-operations.css";
import "./member-race-checkin.css";
import "./team-affiliate.css";
import "./driver-transfer-market.css";
import "./team-takeover-market.css";
import "./admin-sponsorship.css";
import "./sponsorship-centre.css";
import "./development-tokens.css";
import "./season-calendar.css";
import "./team-contracts.css";
import "./admin-users.css";

type Kind="success"|"error"|"warning"|"info";
type Notice={id:number;kind:Kind;title:string;message?:string};
type AccountProfile={user_id:string;member_id:string|null;public_member_id:string;avatar_url:string|null;avatar_path:string|null;web_nickname:string|null;driver_nickname:string|null;first_name:string|null;last_name:string|null;date_of_birth:string|null;nationality:string|null;hometown:string|null;preferred_role:string|null;account_status:"public"|"active"|"admin"|"suspended";onboarding_completed:boolean;privacy_accepted_at:string|null};
type PanelAccess={is_admin:boolean;member_role:string|null;main_event:boolean;driver_panel:boolean;team_panel:boolean;fia_panel:boolean};
const NO_PANEL_ACCESS:PanelAccess={is_admin:false,member_role:null,main_event:false,driver_panel:false,team_panel:false,fia_panel:false};
const PANEL_ACCESS_KEYS:Record<string,keyof PanelAccess>={"main-event":"main_event","driver-panel":"driver_panel","team-panel":"team_panel","fia-panel":"fia_panel"};
type MemberRecord={id:string;member_code:string|null;character_name:string|null;role:string|null;license:string|null;team_id:string|null};
type TeamRecord={id:string;name:string};
type ContractRecord={id:string;duration_label:string|null;starts_on:string|null;ends_on:string|null;salary:number|null;target:unknown;release_clause:number|null;status:string};
const UI=createContext<{toast:(kind:Kind,title:string,message?:string)=>void;loading:(v:boolean)=>void}|null>(null);
function useUI(){const c=useContext(UI);if(!c)throw Error("UI provider missing");return c;}
function GlobalUI({children}:{children:ReactNode}){
 const [items,setItems]=useState<Notice[]>([]),[busy,setBusy]=useState(false);
 const toast=useCallback((kind:Kind,title:string,message?:string)=>{const id=Date.now()+Math.random();setItems(v=>[...v,{id,kind,title,message}].slice(-4));window.setTimeout(()=>setItems(v=>v.filter(x=>x.id!==id)),4500);},[]);
 useEffect(()=>{const mark=(e:Event)=>{const el=(e.target as HTMLElement|null)?.closest("button,a,[role=button]") as HTMLElement|null;if(!el||el.matches(":disabled,[aria-disabled=true]"))return;const r=el.getBoundingClientRect(),p=e as PointerEvent,x=e instanceof PointerEvent?p.clientX:r.left+r.width/2,y=e instanceof PointerEvent?p.clientY:r.top+r.height/2;const t=document.createElement("i");t.className="tire-trace";t.style.left=x+"px";t.style.top=y+"px";document.body.append(t);window.setTimeout(()=>t.remove(),850);};document.addEventListener("pointerdown",mark,{passive:true});return()=>document.removeEventListener("pointerdown",mark);},[]);
 const value=useMemo(()=>({toast,loading:setBusy}),[toast]);
 return <UI.Provider value={value}>{busy&&<div className="global-progress"><span/></div>}{children}<div className="toast-stack" aria-live="polite">{items.map(n=><div className={"toast toast-"+n.kind} key={n.id}><span className="toast-icon">{n.kind==="success"?<Check/>:n.kind==="error"?<X/>:<Flag/>}</span><span className="toast-copy"><strong>{n.title}</strong>{n.message&&<small>{n.message}</small>}</span><button className="toast-close" aria-label="Tutup" onClick={()=>setItems(v=>v.filter(x=>x.id!==n.id))}><X size={15}/></button></div>)}</div></UI.Provider>;
}
export default function App(){return <GlobalUI><Application/></GlobalUI>}
function Application(){
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false),[theme,setTheme]=useState<"dark"|"light">(()=>{try{return localStorage.getItem("caleris-theme")==="light"?"light":"dark"}catch{return "dark"}});
 const [profile,setProfile]=useState<AccountProfile|null>(null),[profileReady,setProfileReady]=useState(false),[isAdmin,setIsAdmin]=useState(false),[panelAccess,setPanelAccess]=useState<PanelAccess>(NO_PANEL_ACCESS);
 const location=useLocation();const {toast,loading}=useUI();
 const refreshProfile=useCallback(async()=>{
  if(!supabase||!session){setProfile(null);setIsAdmin(false);setPanelAccess(NO_PANEL_ACCESS);setProfileReady(true);return;}
  setProfileReady(false);
  const [profileResult,adminResult]=await Promise.all([
   supabase.from("profiles").select("user_id,member_id,public_member_id,avatar_url,avatar_path,web_nickname,driver_nickname,first_name,last_name,date_of_birth,nationality,hometown,preferred_role,account_status,onboarding_completed,privacy_accepted_at").eq("user_id",session.user.id).maybeSingle(),
   supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle()
  ]);
  if(profileResult.error)toast("error","Profil gagal dimuat",profileResult.error.message);
  if(adminResult.error)toast("error","Akses akun gagal diperiksa",adminResult.error.message);
  let account=profileResult.data as AccountProfile|null;
  const admin=Boolean(adminResult.data?.user_id);
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
 },[session,toast]);
 useEffect(()=>{if(document.querySelector("script[data-cinematic-motion]"))return;const script=document.createElement("script");script.src="/cinematic-motion.js";script.dataset.cinematicMotion="true";script.async=true;document.body.append(script)},[]);
 useEffect(()=>{document.body.classList.toggle("light",theme==="light");try{localStorage.setItem("caleris-theme",theme)}catch{}},[theme]);
 useEffect(()=>{if(!supabase){setAuthReady(true);return;}supabase.auth.getSession().then(({data,error})=>{if(error)toast("error","Session gagal dimuat",error.message);setSession(data.session);setAuthReady(true)});const {data}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);setProfileReady(false);setAuthReady(true)});return()=>data.subscription.unsubscribe()},[toast]);
 useEffect(()=>{if(authReady)void refreshProfile()},[authReady,refreshProfile]);
 useEffect(()=>{window.scrollTo(0,0);loading(true);const frame=requestAnimationFrame(()=>loading(false));return()=>cancelAnimationFrame(frame)},[location.pathname,loading]);
 if(!authReady)return <div className="auth-loading"><LoaderCircle className="spin"/><span>Memeriksa sesi...</span></div>;
 if(session&&!profileReady)return <div className="auth-loading"><LoaderCircle className="spin"/><span>Memuat akses paddock...</span></div>;
 const needsPaddockAccess=Boolean(session&&!isAdmin&&profile?.onboarding_completed!==true);
 return <Shell theme={theme} setTheme={setTheme} session={session} profile={profile} isAdmin={isAdmin} panelAccess={panelAccess}><Routes>
  <Route path="/" element={session?<Navigate to={needsPaddockAccess?"/paddock-access":"/dashboard"} replace/>:<Home/>}/>
  <Route path="/paddock-access" element={session?(needsPaddockAccess?<PaddockAccess session={session} onComplete={refreshProfile}/>:<Navigate to="/dashboard" replace/>):<Navigate to="/" replace/>}/>
  <Route path="/dashboard" element={session?(needsPaddockAccess?<Navigate to="/paddock-access" replace/>:<Dashboard session={session} profile={profile} profileReady={profileReady}/>):<Navigate to="/" replace/>}/>
  <Route path="/shop" element={session&&!needsPaddockAccess?<ShopPage session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/financial-centre" element={session&&!needsPaddockAccess?<CashLoanCentre session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/race-checkin" element={session&&!needsPaddockAccess?<MemberRaceCheckIn session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin-workflow" element={session&&!needsPaddockAccess&&isAdmin?<AdminWorkflow session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/configuration" element={session&&!needsPaddockAccess&&isAdmin?<AdminConfiguration session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/license-engine" element={session&&!needsPaddockAccess&&isAdmin?<AdminLicenseEngine session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/economy-engine" element={session&&!needsPaddockAccess&&isAdmin?<AdminEconomyEngine session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/pricing" element={session&&!needsPaddockAccess&&isAdmin?<AdminPricingCenter/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/operations" element={session&&!needsPaddockAccess&&isAdmin?<AdminOperations session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/sponsorship" element={session&&!needsPaddockAccess&&isAdmin?<AdminSponsorship/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/daily-checkin" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<MemberRaceCheckIn session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/license-engine" element={isAdmin?<Navigate to="/admin/license-engine" replace/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/season-calendar" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<AdminSeasonCalendar/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/punishment-input" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<FIAOperations/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/driver-contracts" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<TeamDriverContracts session={session} isAdmin={isAdmin}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/development" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<DevelopmentTokens session={session} asset="TDP"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/sponsorship" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<SponsorshipCentre session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/development" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<DevelopmentTokens session={session} asset="DDP"/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/sponsorship" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<SponsorshipCentre session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/affiliate-team" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<TeamAffiliate session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/profile" element={session&&!needsPaddockAccess?<ProfilePage session={session} profile={profile} profileReady={profileReady}/>:<Navigate to={session?"/paddock-access":"/"} replace/>}/>
  <Route path="/member/:memberId" element={<PublicMemberProfile session={session}/>} />
  <Route path="/account/settings" element={session&&!needsPaddockAccess?<AccountSettings session={session} profile={profile} profileReady={profileReady} onSaved={refreshProfile} theme={theme} setTheme={setTheme}/>:<Navigate to={session?"/paddock-access":"/"} replace/>}/>
  <Route path="/rules" element={<Rules/>}/>
  <Route path="/main-event/circuit-pool" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<CircuitPool/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/fia-panel/circuit-pool-input" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<CircuitPoolInput/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/main-event/job-search" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<JobSearch/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
   <Route path="/main-event/take-over" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<TeamTakeoverMarket session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/main-event/transfer-market" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<DriverTransferMarket session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/main-event/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.main_event)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/driver-panel/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.driver_panel)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/team-panel/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.team_panel)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/fia-panel/*" element={session&&!needsPaddockAccess&&(isAdmin||panelAccess.fia_panel)?<Stage5Panel session={session} isAdmin={isAdmin} fallback={<PanelPage/>}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/privacy-policy" element={<LegalBlankPage title="Kebijakan Privasi"/>}/>
  <Route path="/terms-and-conditions" element={<LegalBlankPage title="Syarat & Ketentuan"/>}/>
  <Route path="/auth/callback" element={<AuthCallback/>}/>
  <Route path="/admin/test-personas" element={session&&!needsPaddockAccess&&isAdmin?<AdminTestPersonas/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin/users" element={session&&!needsPaddockAccess&&isAdmin?<AdminUsers/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="/admin" element={session&&!needsPaddockAccess&&isAdmin?<Admin session={session}/>:<Navigate to={session?(needsPaddockAccess?"/paddock-access":"/dashboard"):"/"} replace/>}/>
  <Route path="*" element={<NotFound/>}/>
 </Routes></Shell>;
}
function Shell({children,theme,setTheme,session,profile,isAdmin,panelAccess}:{children:ReactNode;theme:string;setTheme:(v:"dark"|"light")=>void;session:Session|null;profile:AccountProfile|null;isAdmin:boolean;panelAccess:PanelAccess}){
 const {toast,loading}=useUI();const [menuOpen,setMenuOpen]=useState(false),[navOpen,setNavOpen]=useState(false);const navigate=useNavigate();const location=useLocation();
 useEffect(()=>{setMenuOpen(false);setNavOpen(false)},[location.pathname]);
 const logout=async()=>{if(!supabase)return;loading(true);const {error}=await supabase.auth.signOut();loading(false);setMenuOpen(false);if(error)toast("error","Logout gagal",error.message);else{toast("success","Berhasil logout","Sesi akun sudah diakhiri.");navigate("/")}};
 const avatar=profile?.avatar_url||session?.user.user_metadata?.avatar_url||session?.user.user_metadata?.picture||"";
 const nickname=profile?.web_nickname||session?.user.user_metadata?.full_name||session?.user.user_metadata?.name||session?.user.email?.split("@")[0]||"Member";
 const navigationGroups=session?[
  {title:"MAIN",items:[{to:"/dashboard",label:"Dashboard",description:"Ringkasan aktivitas dan perjalananmu.",icon:<Activity size={17}/>},{to:"/shop",label:"Shop",description:"Beli Development Token dan item resmi.",icon:<ShoppingBag size={17}/>},{to:"/rules",label:"Official Rules",description:"Peraturan resmi Caleris Masters.",icon:<BookOpen size={17}/>} ]},
  ...panelGroups.filter(group=>panelAccess[PANEL_ACCESS_KEYS[group.path]]).map(group=>({title:group.label,items:group.tabs.map(tab=>({to:"/"+group.path+"/"+tab.path,label:tab.label,description:tab.description,icon:<Activity size={17}/> }))})),
  {title:"ACCOUNT",items:[{to:"/profile",label:"Profil saya",description:"Identitas publik dan Member ID.",icon:<UserCircle size={17}/>},{to:"/account/settings",label:"Pengaturan akun",description:"Foto, nama, nickname dan mode tampilan.",icon:<Settings size={17}/>} ]},
  ...(isAdmin?[{title:"ADMIN CONTROL",items:[{to:"/admin-workflow",label:"Admin Workflow",description:"Workspace operasional administrator.",icon:<ClipboardList size={17}/>},{to:"/admin/configuration",label:"Configuration Center",description:"Kelola lisensi, ekonomi, role, dan regulasi.",icon:<Settings size={17}/>},{to:"/admin/economy-engine",label:"Economy Engine",description:"Wallet, transaksi, pajak, denda, dan sumber dana.",icon:<Coins size={17}/>},{to:"/admin/pricing",label:"Price Configuration",description:"Pusat harga, biaya upgrade, pajak, dan bunga pinjaman.",icon:<SlidersHorizontal size={17}/>},{to:"/admin/operations",label:"Operations Suite",description:"Tax rules, race rewards, sponsor pool, dan team valuation.",icon:<Settings size={17}/>},{to:"/admin/license-engine",label:"License Scoring Engine",description:"Kelola season, check-in, standings, dan validasi WDC.",icon:<Trophy size={17}/>},{to:"/admin",label:"Site Manager",description:"Rules, komunitas dan pengelolaan Member ID.",icon:<Shield size={17}/>},{to:"/admin/users",label:"Daftar Akun",description:"Seluruh akun, profil, dan konfigurasi role member.",icon:<Users size={17}/>},{to:"/admin/test-personas",label:"Test Personas",description:"Berganti konteks Owner dan Driver untuk pengujian.",icon:<Users size={17}/>}]}]:[])
 ]:[{title:"MAIN",items:[{to:"/",label:"Beranda",description:"Kembali ke landing page Caleris Masters.",icon:<Flag size={17}/>},{to:"/rules",label:"Official Rules",description:"Peraturan resmi Caleris Masters.",icon:<BookOpen size={17}/>}]}];
 return <div className="site"><div className="scene" aria-hidden="true"><img className="scene-image" src="/assets/Background%202.png" alt=""/><div className="scene-light"/><div className="scene-reflection"/><div className="scene-depth"/><div className="scene-flare"/><canvas className="dust-canvas"/></div>
 <header className="site-header">
  {session&&<button type="button" className="nav-toggle" aria-label="Buka navigasi" aria-expanded={navOpen} onClick={()=>setNavOpen(v=>!v)}><Menu size={21}/></button>}
  <Link className="brand" to={session?"/dashboard":"/"} aria-label="Caleris Masters"><img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="Logo Caleris Masters"/></Link>
  <div className="header-tools">
   {session?<><GlobalSearch isAdmin={isAdmin}/><div className="account-menu-wrap"><button className="account-avatar-button" aria-label="Menu akun" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{avatar?<img src={avatar} alt=""/>:<UserCircle size={24}/>}<ChevronDown size={13}/></button>{menuOpen&&<><button className="menu-dismiss" aria-label="Tutup menu" onClick={()=>setMenuOpen(false)}/><div className="account-dropdown"><div className="dropdown-identity"><strong>{nickname}</strong><small>{session.user.email||"Caleris member"}</small></div><Link to="/profile"><UserCircle size={16}/> Kunjungi profil</Link><Link to="/account/settings"><Settings size={16}/> Pengaturan akun</Link><button onClick={logout}><LogOut size={16}/> Logout</button></div></>}</div></>:location.pathname==="/" ? <div className="theme-switch"><button aria-label="Mode terang" aria-pressed={theme==="light"} onClick={()=>setTheme("light")}><Sun size={16}/></button><button aria-label="Mode gelap" aria-pressed={theme==="dark"} onClick={()=>setTheme("dark")}><Moon size={16}/></button></div>:null}
  </div>
 </header>
 {session&&navOpen&&<><button className="drawer-dismiss" aria-label="Tutup navigasi" onClick={()=>setNavOpen(false)}/><aside className="site-drawer"><button type="button" className="drawer-close" aria-label="Tutup navbar" onClick={()=>setNavOpen(false)}><X size={21}/></button><div className="drawer-brand"><img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="Caleris Masters"/></div><nav className="drawer-nav">{navigationGroups.map(group=><section className="drawer-group" key={group.title}><span className="drawer-section">{group.title}</span><div className="drawer-group-items">{group.items.map(item=><NavLink key={item.to} to={item.to} onClick={()=>setNavOpen(false)} className={({isActive})=>"drawer-nav-card"+(isActive?" active":"")}><span className="drawer-nav-icon">{item.icon}</span><span className="drawer-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={15}/></NavLink>)}</div></section>)}</nav><div className="drawer-footer">A MOTORSPORT ROLEPLAY EXPERIENCE</div></aside></>}

 <main className="page-content">{children}</main><SiteFooter/></div>;
}

function LegalBlankPage({title}:{title:string}){
 return <main className="legal-blank-page" aria-label={title}/>;
}
function SiteFooter(){
 return <footer className="site-footer">
  <div className="footer-main">
   <section className="footer-column footer-caleris">
    <Link to="/" className="footer-brand footer-brand-caleris" aria-label="Caleris Masters">
     <img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="Logo Caleris Masters"/>
    </Link>
    <p>Platform Motorsport Roleplay yang menghubungkan pembalap, tim, dan pengelola dalam satu ekosistem kompetisi.</p>
   </section>
   <section className="footer-column footer-vreeo">
    <img className="footer-vreeo-logo" src="/assets/Untitled%20design_20261103_142659_0000.png" alt="Logo Vreeo"/>
    <h2>TENTANG VREEO</h2>
    <p>Komunitas game Android Indonesia yang menghadirkan beberapa event menarik.</p>
    <div className="footer-directors">
     <h2>DIRECTOR OF VREEO.ID</h2>
     <nav aria-label="Director of Vreeo.id">
      <a href="https://www.instagram.com/lllllaaaaa44444?rpxt=MXo5OGFyOWY5YXV2" target="_blank" rel="noopener noreferrer">Muhammad Ovella ↗</a>
      <a href="https://www.instagram.com/pradana.3?psln=bWVkaGp6aWJuMG0=" target="_blank" rel="noopener noreferrer">Agung Pradana ↗</a>
      <a href="https://www.instagram.com/alfredo_owenzaus?dlrf=MWh0d3F6czBwbXpxNw==" target="_blank" rel="noopener noreferrer">Muhammad Alfarel ↗</a>
      <a href="https://www.instagram.com/liam_amir26?xtok=aXJhOG1vZHFldGs1" target="_blank" rel="noopener noreferrer">Liam Amir ↗</a>
      <a href="https://www.instagram.com/_suhanda08?exln=dXp5MGIyaWN5dGgy" target="_blank" rel="noopener noreferrer">Suhanda Arbawi ↗</a>
     </nav>
    </div>
   </section>
   <section className="footer-column footer-support">
    <h2>COMMUNITY &amp; SUPPORT</h2>
    <nav aria-label="Community and support">
     <a href="https://sociabuzz.com/vreeo/support" target="_blank" rel="noreferrer">Dukung Vreeo · Socialbuzz ↗</a>
     <a href="https://discord.gg/yat2qWuyy" target="_blank" rel="noreferrer">Gabung Discord ↗</a>
     <Link to="/privacy-policy">Kebijakan Privasi</Link>
     <Link to="/terms-and-conditions">Syarat &amp; Ketentuan</Link>
    </nav>
   </section>
  </div>
  <div className="footer-bottom">© {new Date().getFullYear()} CALERIS MASTERS · POWERED BY VREEO</div>
 </footer>;
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

const PADDOCK_ROLES=["FIA","Team Owner","Driver"] as const;
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
 const {toast,loading}=useUI();const navigate=useNavigate();
 const [avatarFile,setAvatarFile]=useState<File|null>(null),[avatarPreview,setAvatarPreview]=useState(""),[avatarEditing,setAvatarEditing]=useState(false),[cropX,setCropX]=useState(50),[cropY,setCropY]=useState(50);
 const originalAvatarFileRef=useRef<File|null>(null);
 const [firstName,setFirstName]=useState(""),[dateOfBirth,setDateOfBirth]=useState(""),[nickname,setNickname]=useState(""),[preferredRole,setPreferredRole]=useState(""),[nationality,setNationality]=useState(""),[hometown,setHometown]=useState("");
 const [privacyAccepted,setPrivacyAccepted]=useState(false),[saving,setSaving]=useState(false);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const avatarStageRef=useRef<HTMLDivElement|null>(null),avatarImageRef=useRef<HTMLImageElement|null>(null),avatarDragRef=useRef<{x:number;y:number;cropX:number;cropY:number}|null>(null);
 const today=new Date();const maxDate=new Date(today.getFullYear()-13,today.getMonth(),today.getDate());const maxDob=`${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,"0")}-${String(maxDate.getDate()).padStart(2,"0")}`;
 const chooseAvatar=(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>3*1024*1024){setErrors(v=>({...v,avatar:"Gunakan JPG, PNG, atau WEBP maksimal 3 MB."}));e.target.value="";return;}if(avatarPreview)URL.revokeObjectURL(avatarPreview);originalAvatarFileRef.current=file;setAvatarFile(file);setAvatarPreview(URL.createObjectURL(file));setAvatarEditing(true);setCropX(50);setCropY(50);setErrors(v=>({...v,avatar:""}));e.target.value="";};
 const beginAvatarDrag=(e:ReactPointerEvent<HTMLDivElement>)=>{if(!avatarFile)return;e.currentTarget.setPointerCapture(e.pointerId);avatarDragRef.current={x:e.clientX,y:e.clientY,cropX,cropY};};
 const moveAvatarDrag=(e:ReactPointerEvent<HTMLDivElement>)=>{const drag=avatarDragRef.current,stage=avatarStageRef.current,image=avatarImageRef.current;if(!drag||!stage||!image)return;const rect=stage.getBoundingClientRect(),aspect=image.naturalWidth/image.naturalHeight;const overflowX=Math.max(0,rect.height*aspect-rect.width),overflowY=Math.max(0,rect.width/aspect-rect.height);setCropX(Math.max(0,Math.min(100,drag.cropX-(e.clientX-drag.x)/Math.max(1,overflowX)*100)));setCropY(Math.max(0,Math.min(100,drag.cropY-(e.clientY-drag.y)/Math.max(1,overflowY)*100)));};
 const finishAvatarDrag=()=>{avatarDragRef.current=null;};
 const createCroppedAvatar=async(file:File)=>{const image=new Image(),url=URL.createObjectURL(file);image.src=url;try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Foto tidak dapat dibaca."))});const side=Math.min(image.naturalWidth,image.naturalHeight),sx=(image.naturalWidth-side)*(cropX/100),sy=(image.naturalHeight-side)*(cropY/100);const canvas=document.createElement("canvas");canvas.width=640;canvas.height=640;const context=canvas.getContext("2d");if(!context)throw new Error("Browser tidak mendukung pemrosesan foto.");context.drawImage(image,sx,sy,side,side,0,0,640,640);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("Foto gagal diproses.")),file.type,.92));return new File([blob],"caleris-profile."+(file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg"),{type:file.type});}finally{URL.revokeObjectURL(url)}};
 const confirmAvatarCrop=async()=>{if(!avatarFile)return;try{const cropped=await createCroppedAvatar(avatarFile);const preview=URL.createObjectURL(cropped);if(avatarPreview)URL.revokeObjectURL(avatarPreview);setAvatarFile(cropped);setAvatarPreview(preview);setCropX(50);setCropY(50);setAvatarEditing(false);finishAvatarDrag();}catch(error){toast("error","Foto gagal diproses",error instanceof Error?error.message:"Coba pilih foto lain.")}};
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();const next:Record<string,string>={};
  if(!avatarFile)next.avatar="Foto profil harus dipilih.";
  if(!dateOfBirth)next.dateOfBirth="Tanggal lahir harus diisi.";
   if(!nationality)next.nationality="Nationality wajib dipilih.";
   if(!hometown)next.hometown="Hometown wajib dipilih.";
  else if(dateOfBirth>maxDob)next.dateOfBirth="Paddock Access hanya tersedia mulai usia 13 tahun.";
  if(!nickname.trim())next.nickname="Nickname harus diisi.";
  if(nickname.trim().length>32)next.nickname="Nickname maksimal 32 karakter.";
  if(!preferredRole)next.preferredRole="Pilih preferensi role.";
  if(!privacyAccepted)next.privacy="Persetujuan privasi diperlukan.";
  setErrors(next);if(Object.keys(next).length)return;
  if(!supabase){toast("error","Supabase belum tersedia",missingSupabaseMessage());return;}
  setSaving(true);loading(true);
  try{
   const croppedAvatar=await createCroppedAvatar(avatarFile!);
   const ext=croppedAvatar.name.split(".").pop()?.toLowerCase()||"jpg";
   const path=`${session.user.id}/paddock-${crypto.randomUUID()}.${ext}`;
   const {error:uploadError}=await supabase.storage.from("profile-avatars").upload(path,croppedAvatar,{upsert:false,contentType:croppedAvatar.type});
   if(uploadError)throw new Error(uploadError.message);
   const {data,error}=await supabase.functions.invoke("complete-paddock-access",{body:{avatarPath:path,firstName,lastName:"",dateOfBirth,nickname,preferredRole,nationality,hometown,privacyAccepted}});
   if(error)throw new Error(error.message);
   if(!data?.success)throw new Error(data?.error||"Paddock Access gagal disimpan.");
   await onComplete();toast("success","Paddock Access disetujui","Profil akun berhasil dibuat.");navigate("/dashboard",{replace:true});
  }catch(error){const message=error instanceof Error?error.message:"Terjadi kesalahan.";toast("error","Pendaftaran gagal",message);}
  finally{loading(false);setSaving(false);}
 };
 return <section className="workspace paddock-access-workspace"><div className="paddock-access-shell"><div className="paddock-access-heading"><span className="section-eyebrow">CALERIS MASTERS · MEMBER REGISTRATION</span><h1 className="page-title">Paddock Access</h1><p className="page-description">Lengkapi identitas untuk membuka akses ke paddock Caleris Masters.</p></div><form className="paddock-access-form" onSubmit={submit} noValidate>
  <div className="paddock-avatar-field"><div className="paddock-avatar-preview">{avatarPreview?<img src={avatarPreview} alt="Preview foto profil"/>:<Camera size={28}/>}</div><div className="paddock-avatar-copy"><strong>Foto profil</strong><small>JPG, PNG, WEBP · Maksimal 3 MB</small><div className="paddock-avatar-actions"><label className="action upload-button">Pilih foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar}/></label>{avatarPreview&&!avatarEditing&&<button type="button" className="action avatar-edit-button" onClick={()=>{const original=originalAvatarFileRef.current;if(!original)return;if(avatarPreview)URL.revokeObjectURL(avatarPreview);setAvatarFile(original);setAvatarPreview(URL.createObjectURL(original));setCropX(50);setCropY(50);setAvatarEditing(true);}}>Edit foto</button>}</div>{errors.avatar&&<small className="field-error">{errors.avatar}</small>}</div></div>
  {avatarPreview&&avatarEditing&&<div className="avatar-inline-crop"><span>GESER FOTO UNTUK MENGATUR POSISI</span><div ref={avatarStageRef} className="avatar-inline-stage" onPointerDown={beginAvatarDrag} onPointerMove={moveAvatarDrag} onPointerUp={finishAvatarDrag} onPointerCancel={finishAvatarDrag}><img ref={avatarImageRef} src={avatarPreview} alt="Geser foto profil" draggable={false} style={{objectPosition:cropX+"% "+cropY+"%"}}/></div><button type="button" className="action primary avatar-confirm-button" onClick={confirmAvatarCrop}>Konfirmasi posisi foto</button></div>}
  <div className="paddock-name-fields"><label className="settings-field">Nama panggilan<input value={firstName} onChange={e=>setFirstName(e.target.value)} maxLength={80} autoComplete="nickname" placeholder="Nama panggilan"/></label></div>
  <PaddockDatePicker value={dateOfBirth} max={maxDob} onChange={setDateOfBirth}/>{errors.dateOfBirth&&<small className="field-error">{errors.dateOfBirth}</small>}
   <LocationSelectors nationality={nationality} hometown={hometown} onNationalityChange={setNationality} onHometownChange={setHometown} errors={{nationality:errors.nationality,hometown:errors.hometown}}/>
  <label className="settings-field">Caleris Nickname<input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={32} autoComplete="nickname" placeholder="Caleris Nickname"/>{errors.nickname&&<small className="field-error">{errors.nickname}</small>}</label>
  <PaddockRolePicker value={preferredRole} onChange={setPreferredRole}/>{errors.preferredRole&&<small className="field-error">{errors.preferredRole}</small>}
  <label className="privacy-consent"><input type="checkbox" checked={privacyAccepted} onChange={e=>{setPrivacyAccepted(e.target.checked);setErrors(v=>({...v,privacy:""}));}}/><span>Saya setuju data diri saya disimpan di database dan hanya digunakan untuk keamanan akun. Data tidak akan dipublikasikan.</span></label>
  {errors.privacy&&<small className="field-error">{errors.privacy}</small>}
    <button className="action primary paddock-submit" type="submit" disabled={saving}>{saving?"Memproses akses...":"Submit Paddock Access"}</button>
 </form></div></section>;
}
function Dashboard({session,profile,profileReady}:{session:Session;profile:AccountProfile|null;profileReady:boolean}){
  const {toast}=useUI();const [isAdmin,setIsAdmin]=useState(false);
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
      const {data:wallets}=await supabase.from("economy_wallet_accounts").select("balance").eq("member_id",ownMember.id).eq("is_active",true);
      const balance=(wallets||[]).reduce((sum:number,row:any)=>sum+Number(row.balance||0),0);
      if(active){setStatsScope("STATISTIK AKUN");setStatCards([{label:"Season entered",value:String(seasonCount),detail:"Total season terdaftar",icon:<CalendarDays/>},{label:"Account balance",value:"¢p "+balance.toLocaleString("id-ID"),detail:"Total saldo wallet pribadi",icon:<Wallet/>},{label:"Role",value:ownMember.role||"Member",detail:"Role akun saat ini",icon:<Users/>},{label:"Team",value:ownMember.team_id?"Terhubung":"Independent",detail:"Status afiliasi tim",icon:<Flag/>}]);}
    }
    if(active)setStatsLoading(false);
  }
  void loadStats();return()=>{active=false};
  },[profile?.member_id,profileReady,session.user.id,toast]);
  const name=profile?.web_nickname||session.user.user_metadata?.full_name||session.user.user_metadata?.name||"Member";
  return <section className="workspace"><PageHeading eyebrow="Member command center" title={`Welcome, ${name}`} description="Ringkasan aktivitas, event, dan perjalananmu di Caleris Masters."/><div style={{display:"flex",justifyContent:"flex-end",gap:18,flexWrap:"wrap",marginBottom:12}}><Link className="action primary" to="/race-checkin">Race Check-in <ArrowUpRight size={15}/></Link><Link className="text-link" to="/financial-centre">Financial Centre <ArrowUpRight size={15}/></Link></div><div className="dashboard-event-card"><div><span className="section-eyebrow">CURRENT EVENT</span><h2>Belum ada event aktif</h2><p>Informasi event akan muncul di sini setelah event pertama dipublikasikan.</p></div><div className="event-mark"><Flag size={25}/><span>CALERIS<br/>MASTERS</span></div></div><div className="section-title-row"><div><span className="section-eyebrow">OVERVIEW · {statsScope}</span><h2>{ownDashboardTitle(statsScope)}</h2></div><span className="empty-tag">{statsLoading?"Memuat statistik":"Data akun"}</span></div><div className="stat-grid">{(statCards.length?statCards:[{label:"Season",value:"—",detail:"Belum ada data",icon:<CalendarDays/>},{label:"Race start",value:"—",detail:"Belum ada data",icon:<Flag/>},{label:"Points",value:"—",detail:"Belum ada data",icon:<Activity/>},{label:"Race wins",value:"—",detail:"Belum ada data",icon:<Trophy/>}]).map(item=><div className="stat-card" key={item.label}><span className="stat-icon">{item.icon}</span><span className="stat-label">{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div><div className="dashboard-lower-grid"><div className="workspace-card"><span className="section-eyebrow">YOUR PROFILE</span><h2>Informasi akun</h2><p>{profileReady?(profile?.driver_nickname||"Nickname driver belum diatur"):"Memuat profil..."}</p><Link className="text-link" to="/profile">Lihat profil <ArrowUpRight size={15}/></Link></div><div className="workspace-card"><span className="section-eyebrow">QUICK ACCESS</span><h2>Workspace</h2><p>{isAdmin?"Akses administrasi tersedia.":"Kelola informasi akun dan profilmu."}</p>{isAdmin?<Link className="text-link" to="/admin-workflow">Buka Admin Workflow <ArrowUpRight size={15}/></Link>:<Link className="text-link" to="/account/settings">Pengaturan akun <ArrowUpRight size={15}/></Link>}</div></div></section>;
}
function ownDashboardTitle(scope:string){return scope==="STATISTIK TIM"?"Statistik Tim":scope==="STATISTIK DRIVER"?"Statistik Driver":"Statistik Akun";}

function AdminWorkflow({session}:{session:Session}){
 const [allowed,setAllowed]=useState(false),[checking,setChecking]=useState(true);const {toast}=useUI();
 useEffect(()=>{let active=true;async function run(){if(!supabase){setChecking(false);return;}const {data,error}=await supabase.from("site_admins").select("user_id").eq("user_id",session.user.id).maybeSingle();if(!active)return;if(error)toast("error","Pemeriksaan akses gagal",error.message);setAllowed(Boolean(data?.user_id));setChecking(false)}void run();return()=>{active=false}},[session.user.id,toast]);
 if(checking)return <div className="center-state"><LoaderCircle className="spin"/><p>Memeriksa akses administrator...</p></div>;
 if(!allowed)return <section className="workspace"><PageHeading eyebrow="Restricted workspace" title="Admin Workflow" description="Workspace operasional khusus administrator CALERIS MASTERS."/><div className="access-denied"><Shield/><h2>Akses administrator diperlukan</h2><p>Admin Workflow hanya tersedia untuk akun yang terdaftar dalam allow-list administrator. Role FIA tidak memberikan akses ke halaman ini.</p></div></section>;
 return <section className="workspace"><PageHeading eyebrow="Control room · Administration" title="Admin Workflow" description="Workspace untuk tools operasional dan CRM CALERIS MASTERS."/><div className="workflow-placeholder"><div className="workflow-placeholder-icon"><ClipboardList size={27}/></div><span className="section-eyebrow">WORKSPACE READY</span><h2>CRM tools belum ditambahkan</h2><p>Area ini sudah disiapkan untuk tools CRM yang akan kamu berikan. Belum ada workflow, data, atau tindakan administrasi yang dibuat.</p><span className="empty-tag">Awaiting CRM specification</span></div></section>;
}
function ProfilePage({session,profile,profileReady}:{session:Session;profile:AccountProfile|null;profileReady:boolean}){
 const [member,setMember]=useState<MemberRecord|null>(null),[team,setTeam]=useState<TeamRecord|null>(null),[contract,setContract]=useState<ContractRecord|null>(null),[wallets,setWallets]=useState<Record<string,number|null>>({public_member:null,driver:null,team_owner:null,team:null}),[busy,setBusy]=useState(true);const {toast}=useUI();
 useEffect(()=>{let active=true;async function load(){if(!supabase||!profileReady){setBusy(!profileReady);return;}setBusy(true);
  const {data:publicWallet,error:publicWalletError}=await supabase.from("economy_wallet_directory").select("balance").eq("account_kind","public_member").eq("profile_user_id",session.user.id).maybeSingle();
  if(!active)return;if(publicWalletError)toast("error","Wallet akun gagal dimuat",publicWalletError.message);
  const nextWallets:Record<string,number|null>={public_member:publicWallet?Number(publicWallet.balance):null,driver:null,team_owner:null,team:null};
  if(profile?.member_id){
   const {data:m,error}=await supabase.from("members").select("id,member_code,character_name,role,license,team_id").eq("id",profile.member_id).maybeSingle();
   if(!active)return;if(error)toast("error","Data member gagal dimuat",error.message);
   const memberData=m as MemberRecord|null;setMember(memberData);
   if(memberData){
    const walletKind=memberData.role==="Driver"?"driver":memberData.role==="Owner"?"team_owner":null;
    if(walletKind){const {data:w,error:walletError}=await supabase.from("economy_wallet_directory").select("balance").eq("account_kind",walletKind).eq("member_id",memberData.id).maybeSingle();if(!active)return;if(walletError)toast("error","Wallet karakter gagal dimuat",walletError.message);nextWallets[walletKind]=w?Number(w.balance):null;}
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
 const characterWallet=member?.role==="Driver"?wallets.driver:member?.role==="Owner"?wallets.team_owner:null;
 return <section className="workspace"><Link className="back-link" to="/dashboard"><ChevronLeft size={16}/> Dashboard</Link><PageHeading eyebrow="Member identity" title="My Profile" description="Informasi akun dan identitas karakter Caleris Masters."/><div className="profile-hero-card"><div className="profile-avatar-large">{avatar?<img src={avatar} alt="Foto profil"/>:<UserCircle size={54}/>}</div><div className="profile-hero-copy"><span className="section-eyebrow">ACCOUNT PROFILE</span><h2>{webName}</h2><p>{session.user.email||"Email tidak tersedia"}</p><span className="profile-role-pill">{profile?.account_status==="admin"?"Administrator":profile?.account_status==="active"?"Member aktif":profile?.account_status==="suspended"?"Suspended":"Public"}</span></div><Link className="action profile-edit-action" to="/account/settings"><Settings size={16}/> Edit akun</Link><Link className="action profile-edit-action" to={"/member/"+profile?.public_member_id}><ArrowUpRight size={16}/> Profil publik</Link></div><div className="profile-sections"><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">ACCOUNT</span><h2>Informasi akun</h2></div></div><div className="profile-info-grid">{info("Nama depan",profile?.first_name)}{info("Nama belakang",profile?.last_name)}{info("Nickname web",webName)}{info("Nickname driver",profile?.driver_nickname)}{info("Preferensi role",profile?.preferred_role)}{info("Status akun",profile?.account_status==="admin"?"Administrator":profile?.account_status==="active"?"Member aktif":profile?.account_status==="suspended"?"Suspended":"Public")}{info("Email",session.user.email)}{info("Member ID",profile?.public_member_id)}{info("Saldo member publik",busy?"Memuat...":balanceText(wallets.public_member))}</div></div><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CHARACTER</span><h2>Informasi karakter</h2></div></div>{busy?<p className="muted">Memuat informasi karakter dan wallet...</p>:!member?<EmptyPanel icon={<Users/>} title="Belum terhubung ke member" body="Wallet member publik tetap tersedia. Data karakter dan wallet Driver/Owner akan tampil setelah akun ditautkan ke member oleh administrator."/>:<div className="profile-info-grid">{info("Nickname driver",profile?.driver_nickname||member.character_name)}{info("Role",member.role)}{info("Tim",team?.name)}{info("License",member.license)}{info("Saldo karakter",balanceText(characterWallet))}{info("Saldo tim",balanceText(wallets.team))}</div>}</div><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CONTRACT</span><h2>Detail kontrak</h2></div><FileText size={19}/></div>{busy?<p className="muted">Memuat kontrak...</p>:!contract?<EmptyPanel icon={<FileText/>} title="Belum ada kontrak aktif" body="Detail durasi, gaji, target, dan klausul pelepasan akan ditampilkan ketika kontrak tersedia."/>:<div className="profile-info-grid">{info("Durasi",contract.duration_label)}{info("Mulai",contract.starts_on)}{info("Berakhir",contract.ends_on)}{info("Gaji",contract.salary===null?"Belum tersedia":"¢p "+Number(contract.salary).toLocaleString("id-ID"))}{info("Target",contract.target?JSON.stringify(contract.target):"Tidak ditentukan")}{info("Klausul pelepasan",contract.release_clause===null?"Tidak ditentukan":"¢p "+Number(contract.release_clause).toLocaleString("id-ID"))}</div>}</div></div></section>;
}
type PublicMemberProfileData={public_member_id:string;display_name:string;first_name:string|null;last_name:string|null;web_nickname:string|null;driver_nickname:string|null;avatar_url:string|null};
type PublicCharacterData={character_name:string|null;role:string|null;license:string|null;team_name:string|null};
function PublicMemberProfile({session}:{session:Session|null}){
 const {memberId=""}=useParams();
 const [profile,setProfile]=useState<PublicMemberProfileData|null>(null),[character,setCharacter]=useState<PublicCharacterData|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const [canRecruit,setCanRecruit]=useState(false),[targetMemberId,setTargetMemberId]=useState("");
 const [recruitOpen,setRecruitOpen]=useState(false),[moveType,setMoveType]=useState<"transfer"|"loan">("transfer"),[offerAmount,setOfferAmount]=useState(""),[loanStart,setLoanStart]=useState(""),[loanEnd,setLoanEnd]=useState(""),[recruitNote,setRecruitNote]=useState("");
 const [recruitSaving,setRecruitSaving]=useState(false),[recruitNotice,setRecruitNotice]=useState("");
 useEffect(()=>{let active=true;async function load(){setBusy(true);setError("");if(!supabase){setError("Layanan profil belum tersedia.");setBusy(false);return;}const {data,error:requestError}=await supabase.functions.invoke("member-directory",{body:{action:"profile",memberId}});if(!active)return;if(requestError||!data?.profile){setError(data?.error||"Profil member tidak ditemukan.");setProfile(null);setCharacter(null);}else{setProfile(data.profile as PublicMemberProfileData);setCharacter(data.character as PublicCharacterData|null);}setBusy(false)}void load();return()=>{active=false}},[memberId]);
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
 const info=(label:string,value:ReactNode)=><div className="profile-info-item"><span>{label}</span><strong>{value||"Belum tersedia"}</strong></div>;
 return <section className="workspace"><Link className="back-link" to="/"><ChevronLeft size={16}/> Beranda</Link><PageHeading eyebrow="Public member profile" title="Profil Member" description="Identitas publik CALERIS MASTERS."/>
 {busy?<div className="center-state"><LoaderCircle className="spin"/><p>Memuat profil member...</p></div>:error?<div className="workspace-card"><EmptyPanel icon={<Users/>} title="Profil tidak tersedia" body={error}/></div>:profile?<><div className="profile-hero-card"><div className="profile-avatar-large">{profile.avatar_url?<img src={profile.avatar_url} alt="Foto profil"/>:<UserCircle size={54}/>}</div><div className="profile-hero-copy"><span className="section-eyebrow">CALERIS MEMBER</span><h2>{profile.display_name}</h2><p>Member ID · {profile.public_member_id}</p><span className="profile-role-pill">Public Profile</span>{canRecruit&&<button className="action primary profile-recruit-button" onClick={()=>{setRecruitNotice("");setRecruitOpen(true)}}>Rekrut</button>}</div></div><div className="profile-sections public-profile-sections"><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">ACCOUNT</span><h2>Informasi publik</h2></div></div><div className="profile-info-grid">{info("Nama depan",profile.first_name)}{info("Nama belakang",profile.last_name)}{info("Nickname web",profile.web_nickname)}{info("Nickname driver",profile.driver_nickname)}{info("Member ID",profile.public_member_id)}</div></div><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">CHARACTER</span><h2>Informasi karakter</h2></div></div>{character?<div className="profile-info-grid">{info("Nama karakter",character.character_name)}{info("Role",character.role)}{info("Tim",character.team_name)}{info("License",character.license)}</div>:<EmptyPanel icon={<Users/>} title="Belum terhubung ke member" body="Informasi karakter akan tersedia setelah akun ditautkan oleh administrator."/>}</div></div></>:null}
 {recruitNotice&&!recruitOpen&&<div className="license-notice" role="status">{recruitNotice}</div>}
 {recruitOpen&&<div className="transfer-recruit-overlay" role="presentation" onClick={()=>{if(!recruitSaving)setRecruitOpen(false)}}><section className="workspace-card transfer-recruit-modal" role="dialog" aria-modal="true" aria-labelledby="recruit-driver-title" onClick={e=>e.stopPropagation()}><div className="section-title-row"><div><span className="section-eyebrow">DRIVER RECRUITMENT</span><h2 id="recruit-driver-title">Rekrut {character?.character_name||profile?.display_name}</h2><p>Penawaran akan dikirim kepada Team Owner saat ini untuk dinegosiasikan.</p></div><button type="button" className="economy-secondary-button" disabled={recruitSaving} onClick={()=>setRecruitOpen(false)}>Tutup</button></div><div className="takeover-form"><label>Jenis perpindahan<select value={moveType} onChange={e=>setMoveType(e.target.value as "transfer"|"loan")}><option value="transfer">Transfer</option><option value="loan">Loan</option></select></label><label>Offer price (¢p)<input type="number" min="0.01" step="0.01" value={offerAmount} onChange={e=>setOfferAmount(e.target.value)} required/></label>{moveType==="loan"&&<><label>Loan mulai<input type="date" value={loanStart} onChange={e=>setLoanStart(e.target.value)} required/></label><label>Loan berakhir<input type="date" value={loanEnd} onChange={e=>setLoanEnd(e.target.value)} required/></label></>}<label>Catatan<textarea rows={3} value={recruitNote} onChange={e=>setRecruitNote(e.target.value)}/></label>{recruitNotice&&<p className="license-notice" role="status">{recruitNotice}</p>}<div className="ops-actions"><button type="button" className="action primary" disabled={recruitSaving} onClick={()=>void submitRecruit()}>{recruitSaving?"Mengirim...":"Kirim penawaran"}</button><button type="button" className="action" disabled={recruitSaving} onClick={()=>setRecruitOpen(false)}>Batal</button></div></div></section></div>}
 </section>;
}
function GlobalSearch({isAdmin}:{isAdmin:boolean}){
 const [query,setQuery]=useState(""),[members,setMembers]=useState<PublicMemberProfileData[]>([]),[teams,setTeams]=useState<{id:string;name:string;member_count:number}[]>([]),[pages,setPages]=useState<{title:string;slug:string;excerpt:string;href:string}[]>([]),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[closing,setClosing]=useState(false),[busy,setBusy]=useState(false),[searchError,setSearchError]=useState("");const navigate=useNavigate(),inputRef=useRef<HTMLInputElement>(null),searchRootRef=useRef<HTMLDivElement>(null),closeTimer=useRef<number|null>(null),[dropdownStyle,setDropdownStyle]=useState({top:0,left:10,width:340,maxHeight:420});
 useEffect(()=>{if(expanded)inputRef.current?.focus()},[expanded]);
 useEffect(()=>{if(!open||!expanded||query.trim().length<1)return;const update=()=>{const rect=searchRootRef.current?.getBoundingClientRect();if(!rect)return;const width=Math.min(420,window.innerWidth-20),left=Math.max(10,Math.min(rect.right-width,window.innerWidth-width-10)),top=rect.bottom+8;setDropdownStyle({top,left,width,maxHeight:Math.max(120,Math.min(520,window.innerHeight-top-16))})};update();window.addEventListener("resize",update);window.addEventListener("scroll",update,true);return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true)}},[open,expanded,query]);
 useEffect(()=>{const term=query.trim();if(term.length<1){setMembers([]);setTeams([]);setPages([]);setSearchError("");setBusy(false);return;}let active=true;const timer=window.setTimeout(async()=>{
  const destinations=[{title:"Dashboard",slug:"shortcut-dashboard",excerpt:"Ringkasan akun dan aktivitas",href:"/dashboard"},{title:"Profil saya",slug:"shortcut-profile",excerpt:"Identitas akun pribadi",href:"/profile"},{title:"Pengaturan akun",slug:"shortcut-settings",excerpt:"Foto, nama, nickname dan tema",href:"/account/settings"},{title:"Official Rules",slug:"shortcut-rules",excerpt:"Peraturan resmi Caleris Masters",href:"/rules"},...(isAdmin?[{title:"Admin Workflow",slug:"shortcut-workflow",excerpt:"Workspace operasional administrator",href:"/admin-workflow"},{title:"Site Manager",slug:"shortcut-admin",excerpt:"Pengaturan website dan Member ID",href:"/admin"}]:[])];
  const cardHeaders=[{title:"Current Event",slug:"card-current-event",excerpt:"Event aktif dan informasi event",href:"/dashboard"},{title:"Statistik",slug:"card-statistics",excerpt:"Overview statistik dashboard",href:"/dashboard"},{title:"Total event",slug:"card-total-events",excerpt:"Jumlah seluruh event",href:"/dashboard"},{title:"Race start",slug:"card-race-start",excerpt:"Informasi jadwal race",href:"/dashboard"},{title:"Points",slug:"card-points",excerpt:"Poin akun dan statistik",href:"/dashboard"},{title:"Account balance",slug:"card-account-balance",excerpt:"Saldo akun Caleris",href:"/profile"},{title:"Informasi akun",slug:"card-account-info",excerpt:"Nama, nickname, role, email dan Member ID",href:"/profile"},{title:"Informasi karakter",slug:"card-character-info",excerpt:"Karakter, role, tim dan saldo",href:"/profile"},{title:"Detail kontrak",slug:"card-contract",excerpt:"Durasi, gaji, target dan klausul pelepasan",href:"/profile"},{title:"Account Preferences",slug:"card-account-preferences",excerpt:"Pengaturan foto profil dan nickname",href:"/account/settings"},...(isAdmin?[{title:"CRM tools",slug:"card-crm-tools",excerpt:"Admin Workflow dan tools CRM",href:"/admin-workflow"},{title:"Member ID Management",slug:"card-member-id",excerpt:"Pengelolaan identitas member",href:"/admin"}]:[])];
  const needle=term.toLocaleLowerCase("id-ID");const localResults=[...destinations,...cardHeaders].filter(item=>(item.title+" "+item.excerpt).toLocaleLowerCase("id-ID").includes(needle));setPages(localResults);setMembers([]);setTeams([]);setSearchError("");setBusy(true);
  if(!supabase){if(active){setSearchError("Koneksi database belum tersedia.");setBusy(false)}return;}
  try{const {data,error}=await supabase.functions.invoke("member-directory",{body:{action:"search",query:term}});if(!active)return;if(error){setSearchError(error.message||"Pencarian member dan tim gagal.");setBusy(false);return;}
   setMembers((data?.members||[]) as PublicMemberProfileData[]);setTeams((data?.teams||[]) as {id:string;name:string;member_count:number}[]);const contentPages=(data?.pages||[]) as {title:string;slug:string;excerpt:string;href:string}[];const merged=[...contentPages,...localResults].filter((item,index,all)=>all.findIndex(x=>x.slug===item.slug)===index);setPages(merged);setBusy(false);
  }catch(error){if(active){setSearchError(error instanceof Error?error.message:"Pencarian gagal. Coba lagi.");setBusy(false)}}
 },100);return()=>{active=false;window.clearTimeout(timer)}},[query,isAdmin]);
 const go=(href:string)=>{navigate(href);setQuery("");setOpen(false);setExpanded(false);setTeams([]);setSearchError("")};
 const collapse=()=>{if(!expanded||closing)return;setClosing(true);setOpen(false);if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);closeTimer.current=window.setTimeout(()=>{setExpanded(false);setClosing(false);setQuery("");setMembers([]);setTeams([]);setPages([]);setSearchError("");closeTimer.current=null},1000)};
 const hasResults=members.length>0||teams.length>0||pages.length>0;
 return <div ref={searchRootRef} className={"global-search"+(expanded?" is-expanded":"")+(closing?" is-closing":"")}>
  <button type="button" className="tire-search-trigger" aria-label={expanded?"Tutup pencarian":"Cari member dan halaman"} aria-expanded={expanded} onClick={()=>{if(expanded)collapse();else{if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);setClosing(false);setExpanded(true);setOpen(true)}}}>
   <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="#151719" stroke="currentColor" strokeWidth="5"/><circle cx="24" cy="24" r="11.5" fill="#080a0c" stroke="#aeb3b8" strokeWidth="2.2"/><circle cx="24" cy="24" r="5" fill="currentColor"/><path d="M18 7l3 6m9-6-3 6M7 18l7 3m27-3-7 3M7 30l7-3m27 3-7-3M18 41l3-6m9 6-3-6" stroke="#d8dadd" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="tire-sparks" aria-hidden="true"><i/><i/><i/><i/><i/></span>
  </button>
  <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==="Escape")collapse()}} placeholder="Cari member, tim, halaman, card..." aria-label="Cari member, tim, halaman, dan judul card"/>
  {query&&<button type="button" className="search-clear" aria-label="Hapus pencarian" onClick={()=>{setQuery("");setMembers([]);setTeams([]);setPages([]);setSearchError("");inputRef.current?.focus()}}><X size={15}/></button>}
  {open&&expanded&&query.trim().length>=1&&createPortal(<><button className="search-dismiss" aria-label="Tutup hasil pencarian" style={{position:"fixed",inset:0,zIndex:1000}} onClick={()=>setOpen(false)}/><div className="search-results" style={{position:"fixed",top:dropdownStyle.top,left:dropdownStyle.left,right:"auto",width:dropdownStyle.width,maxHeight:dropdownStyle.maxHeight,zIndex:1001}}>{busy?<p className="search-empty">Mencari member, tim, dan konten...</p>:null}{searchError&&<p className="search-empty search-error">{searchError}</p>}{!busy&&!hasResults&&!searchError?<p className="search-empty">Tidak ada hasil untuk “{query}”.</p>:null}{members.length>0&&<><span className="search-group-title">MEMBERS</span>{members.map(item=><button type="button" className="search-result" key={item.public_member_id} onClick={()=>go("/member/"+item.public_member_id)}><span className="search-avatar">{item.avatar_url?<img src={item.avatar_url} alt=""/>:<UserCircle size={20}/>}</span><span><strong>{item.display_name}</strong><small>{item.public_member_id}</small></span><ArrowUpRight size={15}/></button>)}</>}{teams.length>0&&<><span className="search-group-title">TEAMS</span>{teams.map(team=><button type="button" className="search-result" key={team.id} onClick={()=>{setQuery(team.name);setOpen(true)}}><span className="search-page-icon"><Users size={17}/></span><span><strong>{team.name}</strong><small>{team.member_count} member terdaftar</small></span><ArrowUpRight size={15}/></button>)}</>}{pages.length>0&&<><span className="search-group-title">PAGES & CARD HEADERS</span>{pages.map(item=><button type="button" className="search-result" key={item.slug} onClick={()=>go(item.href)}><span className="search-page-icon"><BookOpen size={17}/></span><span><strong>{item.title}</strong><small>{item.excerpt||item.slug}</small></span><ArrowUpRight size={15}/></button>)}</>}</div></>,document.body)}
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
 <div className="theme-preference"><div><span className="section-eyebrow">DISPLAY</span><strong>Mode tampilan</strong><small>Preferensi ini juga berlaku di landing page.</small></div><div className="theme-switch"><button aria-label="Mode terang" aria-pressed={theme==="light"} onClick={()=>setTheme("light")}><Sun size={16}/></button><button aria-label="Mode gelap" aria-pressed={theme==="dark"} onClick={()=>setTheme("dark")}><Moon size={16}/></button></div></div>
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
