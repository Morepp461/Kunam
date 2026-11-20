import {useState} from "react";
import {Activity,AlertTriangle,ArrowUpRight,CalendarClock,ChevronRight,Clock3,Flag,Gauge,Map,Radio,RadioTower,ShieldCheck,Signal,Zap} from "lucide-react";
import "./live-race.css";

type Driver={position:number;name:string;team:string;number:string;gap:string;lastLap:string;tyre:"S"|"M"|"H"|"I"|"W";pits:number;status:"RUNNING"|"PIT"|"OUT"};
type Race={id:string;division:string;round:string;circuit:string;lap:number;total:number;elapsed:string;drivers:Driver[]};
const RACES:Race[]=[
 {id:"premio",division:"CALERIS PREMIO",round:"ROUND 07",circuit:"Suzuka International Racing Course",lap:18,total:53,elapsed:"00:31:42",drivers:[
  {position:1,name:"Driver 01",team:"Vreeo Racing",number:"07",gap:"LEADER",lastLap:"1:31.284",tyre:"M",pits:1,status:"RUNNING"},
  {position:2,name:"Driver 02",team:"Caleris GP",number:"12",gap:"+2.481",lastLap:"1:31.602",tyre:"M",pits:1,status:"RUNNING"},
  {position:3,name:"Driver 03",team:"Apex Motorsport",number:"21",gap:"+5.903",lastLap:"1:32.014",tyre:"H",pits:0,status:"RUNNING"},
  {position:4,name:"Driver 04",team:"Vreeo Racing",number:"18",gap:"+8.117",lastLap:"1:32.330",tyre:"H",pits:1,status:"RUNNING"},
  {position:5,name:"Driver 05",team:"Caleris GP",number:"33",gap:"+12.806",lastLap:"1:32.108",tyre:"S",pits:2,status:"PIT"}
 ]},
 {id:"zwei",division:"CALERIS ZWEI",round:"ROUND 07",circuit:"Suzuka International Racing Course",lap:12,total:40,elapsed:"00:22:16",drivers:[
  {position:1,name:"Driver 06",team:"Northstar Racing",number:"04",gap:"LEADER",lastLap:"1:34.820",tyre:"M",pits:1,status:"RUNNING"},
  {position:2,name:"Driver 07",team:"Orion Motorsport",number:"16",gap:"+1.775",lastLap:"1:35.012",tyre:"M",pits:1,status:"RUNNING"},
  {position:3,name:"Driver 08",team:"Northstar Racing",number:"28",gap:"+4.116",lastLap:"1:35.221",tyre:"H",pits:0,status:"RUNNING"},
  {position:4,name:"Driver 09",team:"Vertex GP",number:"41",gap:"+7.690",lastLap:"1:35.488",tyre:"H",pits:1,status:"RUNNING"}
 ]}
];
const SPEEDS=[1,5,10,15] as const;
const VIEWS=[{id:"broadcast",label:"Broadcast",icon:Radio},{id:"timing",label:"Timing",icon:Activity},{id:"circuit",label:"Circuit",icon:Map},{id:"telemetry",label:"Telemetry",icon:Gauge},{id:"race-control",label:"Race Control",icon:Flag}] as const;
type View=typeof VIEWS[number]["id"];

export default function LiveRace(){
 const [raceId,setRaceId]=useState(RACES[0].id);
 const [speed,setSpeed]=useState<(typeof SPEEDS)[number]>(1);
 const [view,setView]=useState<View>("broadcast");
 const race=RACES.find(item=>item.id===raceId)||RACES[0];
 return <div className="workspace live-race-workspace">
  <header className="page-heading live-race-heading"><div><span className="eyebrow">CALERIS RACE CONTROL · DEVELOPMENT</span><h1 className="page-title">LIVE RACE</h1><p className="page-description">Race monitoring workspace untuk pengembangan Race Engine.</p></div><span className="live-race-admin-tag"><ShieldCheck size={14}/> ADMIN ONLY</span></header>
  <div className="live-race-preview-notice"><AlertTriangle size={17}/><div><strong>ENGINE PREVIEW · BELUM TERHUBUNG</strong><p>Timing, telemetry, sesi, dan angka di halaman ini adalah data demo untuk menguji tampilan. Belum ada simulasi race sungguhan atau perintah yang dikirim ke worker.</p></div></div>
  <section className="live-race-status-grid">
   <article><span><RadioTower size={15}/> ENGINE STATUS</span><strong className="status-offline">NOT CONNECTED</strong><small>Worker VPS belum diaktifkan</small></article>
   <article><span><Activity size={15}/> DEMO SESSIONS</span><strong>02</strong><small>Contoh dua race bersamaan</small></article>
   <article><span><Signal size={15}/> DATA STREAM</span><strong>PREVIEW</strong><small>Belum menerima telemetry</small></article>
   <article><span><CalendarClock size={15}/> BUILD STAGE</span><strong>UI FOUNDATION</strong><small>Engine dan API menyusul</small></article>
  </section>
  <section className="live-race-session-section">
   <div className="live-race-section-heading"><div><span className="eyebrow">SESSION MONITOR</span><h2>Race Sessions</h2></div><span className="live-race-demo-label">DEMO DATA</span></div>
   <div className="live-race-session-list">{RACES.map(item=><button key={item.id} className={"live-race-session"+(raceId===item.id?" selected":"")} onClick={()=>setRaceId(item.id)} aria-pressed={raceId===item.id}><span className="live-race-session-icon"><Flag size={17}/></span><span className="live-race-session-copy"><strong>{item.division}</strong><small>{item.round} · {item.circuit}</small></span><span className="live-race-session-progress">LAP {item.lap}/{item.total}</span><ChevronRight size={16}/></button>)}</div>
  </section>
  <section className="live-race-main-panel">
   <div className="live-race-main-head"><div><span className="eyebrow">{race.division} · {race.round}</span><h2>{race.circuit}</h2><small>DEMO SESSION · NOT A REAL RACE</small></div><span className="live-race-running"><i/> SIMULATED</span></div>
   <div className="live-race-controls"><div className="live-race-clock"><Clock3 size={16}/><span>RACE CLOCK</span><strong>{race.elapsed}</strong><small>Lap {race.lap} of {race.total}</small></div><div className="live-race-speed-control"><span>LIVE SPEED PREVIEW</span><div>{SPEEDS.map(value=><button key={value} className={speed===value?"active":""} onClick={()=>setSpeed(value)} aria-pressed={speed===value}>{value}×</button>)}</div><small>Kontrol lokal UI, belum mengubah kecepatan engine</small></div></div>
   <nav className="live-race-view-tabs" aria-label="Race display mode">{VIEWS.map(item=>{const Icon=item.icon;return <button key={item.id} className={view===item.id?"active":""} onClick={()=>setView(item.id)} aria-pressed={view===item.id}><Icon size={15}/>{item.label}</button>})}</nav>
   {view==="broadcast"&&<div className="live-race-broadcast-view"><div className="live-race-hero-stats"><div><span>LEADER</span><strong>{race.drivers[0].name}</strong><small>{race.drivers[0].team} · #{race.drivers[0].number}</small></div><div><span>GAP TO P2</span><strong>{race.drivers[1]?.gap||"—"}</strong><small>Current interval</small></div><div><span>SESSION</span><strong>DEMO</strong><small>Lap {race.lap}/{race.total}</small></div></div><TimingTable drivers={race.drivers}/></div>}
   {view==="timing"&&<div className="live-race-content-view"><div className="live-race-subheading"><h3>Live Timing Tower</h3><span>DEMO CLASSIFICATION</span></div><TimingTable drivers={race.drivers} detailed/></div>}
   {view==="circuit"&&<div className="live-race-content-view"><div className="live-race-subheading"><h3>Circuit Overview</h3><span>SCHEMATIC · NOT TO SCALE</span></div><div className="live-race-circuit-placeholder"><div className="live-race-track-art"><svg viewBox="0 0 620 260" role="img" aria-label="Ilustrasi lintasan sirkuit demo"><path d="M90 185 C55 155 65 70 135 55 C185 42 205 92 260 90 C320 88 325 28 390 38 C475 50 465 112 530 120 C590 128 575 195 520 205 C455 218 425 160 365 172 C305 185 300 228 230 220 C165 214 135 220 90 185Z" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/><path d="M90 185 C55 155 65 70 135 55 C185 42 205 92 260 90 C320 88 325 28 390 38 C475 50 465 112 530 120 C590 128 575 195 520 205 C455 218 425 160 365 172 C305 185 300 228 230 220 C165 214 135 220 90 185Z" fill="none" stroke="#f3c75b" strokeWidth="2" strokeDasharray="7 8" strokeLinecap="round"/><path d="M84 174 L98 194" stroke="#f3c75b" strokeWidth="4"/><circle cx="84" cy="174" r="7" fill="#f3c75b"/></svg><span>START / FINISH</span></div><p>Layout sirkuit asli akan dimuat dari Circuit Management setelah integrasi engine selesai. Ilustrasi ini hanya placeholder visual.</p></div></div>}
   {view==="telemetry"&&<div className="live-race-content-view"><div className="live-race-subheading"><h3>Telemetry Preview</h3><span>{race.drivers[0].name} · LAP {race.lap}</span></div><div className="live-race-telemetry-grid"><article><span>SPEED</span><strong>287 <small>km/h</small></strong><svg viewBox="0 0 240 60" preserveAspectRatio="none"><path d="M0 48 L22 40 L43 43 L64 19 L84 25 L106 10 L128 20 L150 8 L174 26 L194 15 L216 28 L240 12" fill="none" stroke="#d7b85d" strokeWidth="2.5"/></svg></article><article><span>THROTTLE</span><strong>96 <small>%</small></strong><svg viewBox="0 0 240 60" preserveAspectRatio="none"><path d="M0 45 L22 44 L43 20 L64 18 L84 18 L106 16 L128 16 L150 40 L174 42 L194 14 L216 13 L240 13" fill="none" stroke="#6dbb92" strokeWidth="2.5"/></svg></article><article><span>ERS DEPLOYMENT</span><strong>72 <small>%</small></strong><svg viewBox="0 0 240 60" preserveAspectRatio="none"><path d="M0 12 L22 18 L43 15 L64 25 L84 20 L106 31 L128 26 L150 35 L174 28 L194 42 L216 38 L240 48" fill="none" stroke="#80aee8" strokeWidth="2.5"/></svg></article></div><p className="live-race-muted-note">Grafik dan angka telemetry merupakan contoh tampilan, bukan hasil pengukuran kendaraan.</p></div>}
   {view==="race-control"&&<div className="live-race-content-view"><div className="live-race-subheading"><h3>Race Control Timeline</h3><span>DEMO EVENTS</span></div><div className="live-race-event-list"><article><span className="event-lap">LAP 18</span><span className="event-marker green"/><div><strong>GREEN FLAG</strong><small>Track clear · Racing conditions</small></div><time>00:31:42</time></article><article><span className="event-lap">LAP 15</span><span className="event-marker gold"/><div><strong>PIT STOP</strong><small>Driver 05 · Soft tyre fitted</small></div><time>00:26:11</time></article><article><span className="event-lap">LAP 09</span><span className="event-marker blue"/><div><strong>FASTEST LAP</strong><small>Driver 02 · 1:30.991</small></div><time>00:15:48</time></article></div></div>}
  </section>
  <footer className="live-race-footer-note"><Zap size={15}/><span>UI ini disiapkan untuk menerima race session, timing, telemetry, event, dan replay dari Race Engine melalui API. Tidak ada tombol untuk memulai race secara manual.</span><a href="/rules">Rules <ArrowUpRight size={13}/></a></footer>
 </div>;
}
function TimingTable({drivers,detailed=false}:{drivers:Driver[];detailed?:boolean}){
 return <div className="live-race-table-wrap"><table className="live-race-timing-table"><thead><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>GAP</th><th>LAST LAP</th><th>TYRE</th>{detailed&&<><th>PITS</th><th>STATUS</th></>}</tr></thead><tbody>{drivers.map(driver=><tr key={driver.number}><td><strong className="driver-position">{String(driver.position).padStart(2,"0")}</strong></td><td><strong>{driver.name}</strong><small>#{driver.number}</small></td><td>{driver.team}</td><td className={driver.position===1?"gap-leader":""}>{driver.gap}</td><td className="lap-time">{driver.lastLap}</td><td><span className={"live-race-tyre tyre-"+driver.tyre.toLowerCase()}>{driver.tyre}</span></td>{detailed&&<><td>{driver.pits}</td><td><span className={"driver-status status-"+driver.status.toLowerCase()}>{driver.status}</span></td></>}</tr>)}</tbody></table></div>;
}
