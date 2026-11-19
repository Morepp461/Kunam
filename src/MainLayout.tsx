import {useEffect,useState} from "react";
import type {ReactNode} from "react";
import {Link,NavLink,useLocation,useNavigate} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {Activity,ArrowUpRight,ShoppingBag,BookOpen,ChevronDown,Flag,LogOut,Moon,Settings,Sun,UserCircle,Users,X,Menu,Trophy,Medal,ArrowLeftRight,Megaphone,Briefcase,Handshake,Map,UserRound,Gauge,BadgeDollarSign,ListChecks,History,Dumbbell,CalendarCheck,Wallet,Scale,Building2,Wrench,FileSignature,UserPlus,ScanSearch,ClipboardPenLine,Network,Cog,BookMarked,RadioTower,FlagTriangleRight,Gavel,ShieldAlert,MapPinned,Send,Globe,FileText,ClipboardList,Coins,Shield} from "lucide-react";
import {supabase} from "./lib/supabase";
import {panelGroups} from "./PanelPages";

type Toast=(kind:"success"|"error"|"warning"|"info",title:string,message?:string)=>void;
type PanelAccess={is_admin:boolean;member_role:string|null;main_event:boolean;driver_panel:boolean;team_panel:boolean;fia_panel:boolean};
type LayoutProfile={avatar_url:string|null;web_nickname:string|null};
const PANEL_ACCESS_KEYS:Record<string,keyof PanelAccess>={"main-event":"main_event","driver-panel":"driver_panel","team-panel":"team_panel","fia-panel":"fia_panel"};
const panelTabIcons:Record<string,ReactNode>={
 "main-event/global":<Globe size={17}/>,"main-event/caleris-premio":<Trophy size={17}/>,"main-event/caleris-zwei":<Medal size={17}/>,"main-event/transfer-market":<ArrowLeftRight size={17}/>,"main-event/fia-announcement":<Megaphone size={17}/>,"main-event/job-search":<Briefcase size={17}/>,"main-event/take-over":<Handshake size={17}/>,"main-event/circuit-pool":<Map size={17}/>,"main-event/regulation":<BookOpen size={17}/>,"main-event/newsroom":<FileText size={17}/>,"main-event/hall-of-fame":<Trophy size={17}/>,
 "driver-panel/character":<UserRound size={17}/>,"driver-panel/development":<Gauge size={17}/>,"driver-panel/sponsorship":<BadgeDollarSign size={17}/>,"driver-panel/quest":<ListChecks size={17}/>,"driver-panel/career-history":<History size={17}/>,"driver-panel/financial-centre":<Wallet size={17}/>,"driver-panel/training":<Dumbbell size={17}/>,"driver-panel/daily-checkin":<CalendarCheck size={17}/>,"driver-panel/appeal":<Scale size={17}/>,
 "team-panel/team-summary":<Building2 size={17}/>,"team-panel/team-hq":<Building2 size={17}/>,"team-panel/command-center":<Activity size={17}/>,"team-panel/financial-centre":<Wallet size={17}/>,"team-panel/development":<Wrench size={17}/>,"team-panel/sponsorship":<Coins size={17}/>,"team-panel/driver-contracts":<FileSignature size={17}/>,"team-panel/quest":<ClipboardList size={17}/>,"team-panel/driver-registration":<UserPlus size={17}/>,"team-panel/scout":<ScanSearch size={17}/>,"team-panel/place-job-advert":<ClipboardPenLine size={17}/>,"team-panel/affiliate-team":<Network size={17}/>,"team-panel/engine-market":<Cog size={17}/>,"team-panel/appeal":<Shield size={17}/>,
 "fia-panel/event-control":<Flag size={17}/>,"fia-panel/rules-input":<BookMarked size={17}/>,"fia-panel/season-calendar":<CalendarDays size={17}/>,"fia-panel/announcement-input":<RadioTower size={17}/>,"fia-panel/race-input":<FlagTriangleRight size={17}/>,"fia-panel/punishment-input":<Gavel size={17}/>,"fia-panel/appeal-room":<ShieldAlert size={17}/>,"fia-panel/circuit-pool-input":<MapPinned size={17}/>,"fia-panel/team-hq-config":<Building2 size={17}/>,"fia-panel/discord-broadcast":<Send size={17}/>
};

export default function MainLayout({children,theme,setTheme,session,profile,isAdmin,isPrimaryOwner,panelAccess,globalSearch,toast,loading}:{children:ReactNode;theme:string;setTheme:(v:"dark"|"light")=>void;session:Session|null;profile:LayoutProfile|null;isAdmin:boolean;isPrimaryOwner:boolean;panelAccess:PanelAccess;globalSearch:ReactNode;toast:Toast;loading:(value:boolean)=>void}){
const [menuOpen,setMenuOpen]=useState(false),[navOpen,setNavOpen]=useState(false);const navigate=useNavigate();const location=useLocation();
 useEffect(()=>{setMenuOpen(false);setNavOpen(false)},[location.pathname]);
 const logout=async()=>{if(!supabase)return;loading(true);const {error}=await supabase.auth.signOut();loading(false);setMenuOpen(false);if(error)toast("error","Logout gagal",error.message);else{toast("success","Berhasil logout","Sesi akun sudah diakhiri.");navigate("/")}};
 const avatar=profile?.avatar_url||session?.user.user_metadata?.avatar_url||session?.user.user_metadata?.picture||"";
 const nickname=profile?.web_nickname||session?.user.user_metadata?.full_name||session?.user.user_metadata?.name||session?.user.email?.split("@")[0]||"Member";
 const navigationGroups=session?[
  {title:"MAIN",items:[{to:"/dashboard",label:"Dashboard",description:"Ringkasan aktivitas dan perjalananmu.",icon:<Activity size={17}/>},...(!isAdmin&&panelAccess.member_role===null?[{to:"/paddock-access",label:"Paddock Access",description:"Lengkapi profil dan pengajuan role dalam satu formulir.",icon:<Flag size={17}/>}]:[]),{to:"/shop",label:"Shop",description:"Beli Development Token dan item resmi.",icon:<ShoppingBag size={17}/>},{to:"/rules",label:"Official Rules",description:"Peraturan resmi Caleris Masters.",icon:<BookOpen size={17}/>} ]},
  ...panelGroups.filter(group=>panelAccess[PANEL_ACCESS_KEYS[group.path]]).map(group=>({title:group.label,items:group.tabs.filter(tab=>tab.path!=="registration"&&(tab.path!=="training"||panelAccess.member_role==="Driver")&&(!(group.path==="team-panel"&&["driver-registration","engine-market"].includes(tab.path))||isAdmin||panelAccess.member_role==="Owner")&&(!(group.path==="team-panel"&&tab.path==="quest")||panelAccess.member_role==="Owner")).map(tab=>({to:"/"+group.path+"/"+tab.path,label:tab.label,description:tab.description,icon:panelTabIcons[group.path+"/"+tab.path]??<Activity size={17}/> }))})),
  {title:"ACCOUNT",items:[{to:"/profile",label:"Profil saya",description:"Identitas publik dan Member ID.",icon:<UserCircle size={17}/>},{to:"/account/settings",label:"Pengaturan akun",description:"Foto, nama, nickname dan mode tampilan.",icon:<Settings size={17}/>} ]},
  ...(isAdmin?[{title:"ADMIN CONTROL",items:[{to:"/admin-workflow",label:"Admin Workflow",description:"Workspace operasional administrator.",icon:<ClipboardList size={17}/>},{to:"/admin/configuration",label:"Configuration Center",description:"Kelola lisensi, ekonomi, role, dan regulasi.",icon:<Settings size={17}/>},{to:"/admin/economy-engine",label:"Economy Engine",description:"Wallet, transaksi, pajak, denda, dan sumber dana.",icon:<Coins size={17}/>},{to:"/admin/adjustments",label:"License & Wallet Adjustments",description:"Penyesuaian lisensi Driver dan saldo wallet melalui ledger resmi.",icon:<Shield size={17}/>},{to:"/admin/data-adjustments",label:"License & Wallet Adjustments",description:"Penetapan lisensi Driver dan penyesuaian saldo saat migrasi.",icon:<Wallet size={17}/>},{to:"/admin/quest-engine",label:"Quest Engine",description:"Katalog quest dan nominal reward berdasarkan kesulitan.",icon:<Trophy size={17}/>},{to:"/admin/pricing",label:"Price Configuration",description:"Pusat harga, biaya upgrade, pajak, dan bunga pinjaman.",icon:<SlidersHorizontal size={17}/>},{to:"/admin/operations",label:"Operations Suite",description:"Tax rules, race rewards, sponsor pool, dan team valuation.",icon:<Settings size={17}/>},{to:"/admin/brand-ecosystem",label:"Brand Ecosystem",description:"Sponsor network, reputasi, fan growth, fan decline, dan populasi fans.",icon:<Activity size={17}/>},{to:"/admin/sponsorship",label:"Sponsor Management",description:"Pusat pengelolaan sponsor, tier, negosiasi, dan konfigurasi Brand Ecosystem.",icon:<Handshake size={17}/>},{to:"/admin/prizepool",label:"Season Prizepool",description:"Atur hadiah akhir musim dan proses pembayaran dari VreeoBank.",icon:<Coins size={17}/>},{to:"/admin/license-engine",label:"Season & License Engine",description:"Setup season otomatis; race, standings, dan scoring lisensi berjalan terhubung.",icon:<Trophy size={17}/>},{to:"/admin",label:"Site Manager",description:"Rules, komunitas dan pengelolaan Member ID.",icon:<Shield size={17}/>},{to:"/admin/users",label:"Daftar Akun",description:"Seluruh akun, profil, dan konfigurasi role member.",icon:<Users size={17}/>},{to:"/admin/registered-members",label:"Registered Member",description:"Review formulir registrasi Main Event dan aktivasi role.",icon:<ClipboardList size={17}/>},{to:"/admin/test-personas",label:"Test Personas",description:"Berganti konteks Owner dan Driver untuk pengujian.",icon:<Users size={17}/>},...(isPrimaryOwner?[{to:"/admin/developer-api",label:"Developer API & MCP",description:"API key dan koneksi integrasi eksternal.",icon:<Shield size={17}/>}]:[])]}]:[])
 ]:[{title:"MAIN",items:[{to:"/",label:"Beranda",description:"Kembali ke landing page Caleris Masters.",icon:<Flag size={17}/>},{to:"/rules",label:"Official Rules",description:"Peraturan resmi Caleris Masters.",icon:<BookOpen size={17}/>}]}];
 return <div className="site"><div className="scene" aria-hidden="true"><img className="scene-image" src="/assets/Background%202.png" alt=""/><div className="scene-light"/><div className="scene-reflection"/><div className="scene-depth"/><div className="scene-flare"/><canvas className="dust-canvas"/></div>
 <header className="site-header">
  {session&&<button type="button" className="nav-toggle" aria-label="Buka navigasi" aria-expanded={navOpen} onClick={()=>setNavOpen(v=>!v)}><Menu size={21}/></button>}
  <Link className="brand" to={session?"/dashboard":"/"} aria-label="Caleris Masters"><img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="Logo Caleris Masters"/></Link>
  <div className="header-tools">
   {session?<>{globalSearch}<div className="account-menu-wrap"><button className="account-avatar-button" aria-label="Menu akun" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{avatar?<img src={avatar} alt=""/>:<UserCircle size={24}/>}<ChevronDown size={13}/></button>{menuOpen&&<><button className="menu-dismiss" aria-label="Tutup menu" onClick={()=>setMenuOpen(false)}/><div className="account-dropdown"><div className="dropdown-identity"><strong>{nickname}</strong><small>{session.user.email||"Caleris member"}</small></div><Link to="/profile"><UserCircle size={16}/> Kunjungi profil</Link><Link to="/account/settings"><Settings size={16}/> Pengaturan akun</Link><button onClick={logout}><LogOut size={16}/> Logout</button></div></>}</div></>:location.pathname==="/" ? <div className="theme-switch"><button aria-label="Mode terang" aria-pressed={theme==="light"} onClick={()=>setTheme("light")}><Sun size={16}/></button><button aria-label="Mode gelap" aria-pressed={theme==="dark"} onClick={()=>setTheme("dark")}><Moon size={16}/></button></div>:null}
  </div>
 </header>
 {session&&navOpen&&<><button className="drawer-dismiss" aria-label="Tutup navigasi" onClick={()=>setNavOpen(false)}/><aside className="site-drawer"><button type="button" className="drawer-close" aria-label="Tutup navbar" onClick={()=>setNavOpen(false)}><X size={21}/></button><div className="drawer-brand"><img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="Caleris Masters"/></div><nav className="drawer-nav">{navigationGroups.map(group=><section className="drawer-group" key={group.title}><span className="drawer-section">{group.title}</span><div className="drawer-group-items">{group.items.map(item=><NavLink key={item.to} to={item.to} onClick={()=>setNavOpen(false)} className={({isActive})=>"drawer-nav-card"+(isActive?" active":"")}><span className="drawer-nav-icon">{item.icon}</span><span className="drawer-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={15}/></NavLink>)}</div></section>)}</nav><div className="drawer-footer">A MOTORSPORT ROLEPLAY EXPERIENCE</div></aside></>}

 <main className="page-content">{children}</main><SiteFooter/></div>;
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
