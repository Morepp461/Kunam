import {useState} from "react";
import {ArrowLeft,CalendarDays,Flag,LayoutGrid,ShieldCheck,Trophy,Scale,Route} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import AdminLicenseEngine from "./AdminLicenseEngine";
import AdminSeasonCalendar from "./AdminSeasonCalendar";
import {CircuitPoolInput} from "./CircuitPool";
import RaceControl from "./RaceControl";
import FIAOperations from "./FIAOperations";

type Tab="setup"|"calendar"|"circuits"|"results"|"fia";
const cards:Array<{id:Tab;title:string;description:string;eyebrow:string;icon:typeof CalendarDays}>=[
 {id:"setup",title:"Season & Divisions",description:"Konfigurasi season, divisi, roster, round, dan standings.",eyebrow:"01 · FOUNDATION",icon:Flag},
 {id:"calendar",title:"12-Period Calendar",description:"Susun Pre Season hingga Off Season. Durasi dan urutan divisi dihitung otomatis.",eyebrow:"02 · SEASON FLOW",icon:CalendarDays},
 {id:"circuits",title:"Circuit Pool",description:"Kelola master circuit. Schedule memilih sirkuit dari database yang sama.",eyebrow:"03 · CIRCUIT DATABASE",icon:Route},
 {id:"results",title:"Race Results",description:"Input klasifikasi, fastest lap, pole, dan hasil resmi race.",eyebrow:"04 · RACE CONTROL",icon:Trophy},
 {id:"fia",title:"FIA Operations",description:"Keputusan FIA, penalti, transfer approval, dan takeover review.",eyebrow:"05 · GOVERNANCE",icon:Scale}
];
export default function FIAEventControlCenter({session}:{session:Session}){
 const [tab,setTab]=useState<Tab|null>(null);
 const selected=cards.find(x=>x.id===tab);
 return <section className="workspace fia-event-center">
  <header className="page-heading"><span className="section-eyebrow">FIA PANEL · EVENT CONTROL</span><h1 className="page-title">Event Control Center</h1><p className="page-description">Satu ruang kendali untuk konfigurasi dan operasional CALERIS MASTERS. Pilih modul yang diperlukan; seluruh data tetap memakai sumber database yang sama.</p></header>
  {!tab?<><div className="fia-event-center-status"><ShieldCheck size={18}/><div><strong>Season Operations</strong><span>Konfigurasi dasar season dan divisi menjadi fondasi. Kalender 12 periode mengatur siklus berikutnya.</span></div></div><div className="fia-event-center-grid">{cards.map(({id,title,description,eyebrow,icon:Icon})=><button type="button" className="fia-event-center-card" key={id} onClick={()=>setTab(id)}><span className="fia-event-center-card-top"><small>{eyebrow}</small><Icon size={21}/></span><strong>{title}</strong><span>{description}</span><i>BUKA MODUL <LayoutGrid size={13}/></i></button>)}</div></>:<><button type="button" className="fia-event-center-back" onClick={()=>setTab(null)}><ArrowLeft size={16}/> Semua modul event</button><div className="fia-event-center-active"><span className="section-eyebrow">EVENT CONTROL MODULE</span><h2>{selected?.title}</h2></div>{tab==="setup"?<AdminLicenseEngine session={session}/>:tab==="calendar"?<AdminSeasonCalendar/>:tab==="circuits"?<CircuitPoolInput/>:tab==="results"?<RaceControl/>:<FIAOperations/>}</>}
 </section>;
}
