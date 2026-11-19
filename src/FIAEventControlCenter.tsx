import {useState} from "react";
import {ArrowLeft,CalendarDays,Flag,LayoutGrid,ShieldCheck,Trophy,Scale,Route} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import AdminLicenseEngine from "./AdminLicenseEngine";
import AdminSeasonCalendar from "./AdminSeasonCalendar";
import {CircuitPoolInput} from "./CircuitPool";
import RaceControl from "./RaceControl";
import FIAOperations from "./FIAOperations";
import FiaDataExport from "./FiaDataExport";

type Tab="setup"|"calendar"|"circuits"|"results"|"fia";
const cards:Array<{id:Tab;title:string;description:string;eyebrow:string;icon:typeof CalendarDays}>=[
 {id:"setup",title:"Season Setup",description:"Satu kali setup: Premio, Zwei, kalender, dan race round dibuat otomatis.",eyebrow:"01 · FOUNDATION",icon:Flag},
 {id:"calendar",title:"12-Period Calendar",description:"Lihat kalender 12 periode yang sudah dibentuk otomatis; cukup reschedule jika diperlukan.",eyebrow:"02 · SEASON FLOW",icon:CalendarDays},
 {id:"circuits",title:"Circuit Pool",description:"Kelola master circuit. Schedule memilih sirkuit dari database yang sama.",eyebrow:"03 · CIRCUIT DATABASE",icon:Route},
 {id:"results",title:"Race Results",description:"Input klasifikasi, fastest lap, pole, dan hasil resmi race.",eyebrow:"04 · RACE CONTROL",icon:Trophy},
 {id:"fia",title:"FIA Operations",description:"Keputusan FIA, penalti, transfer approval, dan takeover review.",eyebrow:"05 · GOVERNANCE",icon:Scale}
];
export default function FIAEventControlCenter({session,isAdmin}:{session:Session;isAdmin:boolean}){
 const [tab,setTab]=useState<Tab|null>(null);
 const selected=cards.find(x=>x.id===tab);
 return <section className="workspace fia-event-center">
  <header className="page-heading"><span className="section-eyebrow">FIA PANEL · EVENT CONTROL</span><h1 className="page-title">Event Control Center</h1><p className="page-description">Satu ruang kendali untuk konfigurasi dan operasional CALERIS MASTERS. Pilih modul yang diperlukan; seluruh data tetap memakai sumber database yang sama.</p></header>
  {!tab?<><div className="fia-event-center-status"><ShieldCheck size={18}/><div><strong>Season Operations</strong><span>Satu setup membuat dua divisi, 30 race round, dan kalender 12 periode. Hasil race mengalir otomatis ke standings dan scoring lisensi.</span></div></div><div className="fia-event-center-grid">{cards.map(({id,title,description,eyebrow,icon:Icon})=><button type="button" className="fia-event-center-card" key={id} disabled={id==="setup"&&!isAdmin} onClick={()=>setTab(id)}><span className="fia-event-center-card-top"><small>{eyebrow}</small><Icon size={21}/></span><strong>{title}</strong><span>{description}</span><i>{id==="setup"&&!isAdmin?"ADMIN ONLY":"BUKA MODUL"} <LayoutGrid size={13}/></i></button>)}<FiaDataExport isAdmin={isAdmin} isFia={true}/></div></>:<><button type="button" className="fia-event-center-back" onClick={()=>setTab(null)}><ArrowLeft size={16}/> Semua modul event</button><div className="fia-event-center-active"><span className="section-eyebrow">EVENT CONTROL MODULE</span><h2>{selected?.title}</h2></div>{tab==="setup"?<AdminLicenseEngine session={session}/>:tab==="calendar"?<AdminSeasonCalendar/>:tab==="circuits"?<CircuitPoolInput/>:tab==="results"?<RaceControl/>:<FIAOperations/>}</>}
 </section>;
}
