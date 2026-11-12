import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity, ArrowLeft, ArrowUpRight, BarChart3, CalendarDays,
  CarFront, ChartNoAxesCombined, ClipboardList, FileText, Flag, Gauge,
  Search, Trophy, Users
} from "lucide-react";

type PanelTab = { path: string; label: string; description: string };
type PanelGroup = { path: string; label: string; tabs: PanelTab[] };

export const panelGroups: PanelGroup[] = [
  { path: "main-event", label: "MAIN EVENT", tabs: [
    { path: "global", label: "Global", description: "Overview seluruh kompetisi Caleris Masters." },
    { path: "caleris-premio", label: "Caleris Premio", description: "Data dan statistik khusus divisi Premio." },
    { path: "caleris-zwei", label: "Caleris Zwei", description: "Data dan statistik khusus divisi Zwei." },
    { path: "transfer-market", label: "Transfer Market", description: "Daftar driver dan informasi nilai pasar." },
    { path: "fia-announcement", label: "FIA Announcement", description: "Pengumuman resmi dari FIA." },
    { path: "job-search", label: "Job Search", description: "Lowongan kursi driver yang tersedia." },
    { path: "take-over", label: "Take Over", description: "Pasar pengambilalihan tim." },
    { path: "circuit-pool", label: "Circuit Pool", description: "Database sirkuit Caleris Masters." },
    { path: "regulation", label: "Regulation", description: "Regulasi kompetisi per season." }
  ]},
  { path: "driver-panel", label: "DRIVER PANEL", tabs: [
    { path: "character", label: "Character", description: "Profil karakter dan kontrak driver." },
    { path: "development", label: "Development", description: "Pengembangan delapan atribut driver." },
    { path: "sponsorship", label: "Sponsorship", description: "Sponsor aktif, tawaran, dan target." },
    { path: "quest", label: "Quest", description: "Daily quest dan weekly quest." },
    { path: "career-history", label: "Career History", description: "Rekam jejak karier dan statistik." },
    { path: "financial-centre", label: "Financial Centre", description: "Arus keuangan karakter driver." }
  ]},
  { path: "team-panel", label: "TEAM PANEL", tabs: [
    { path: "team-summary", label: "Team Summary", description: "Profil, susunan driver, dan statistik tim." },
    { path: "development", label: "Development", description: "Pengembangan enam belas atribut mobil." },
    { path: "sponsorship", label: "Sponsorship", description: "Sponsor aktif, tawaran, dan target tim." },
    { path: "driver-registration", label: "Driver Registration", description: "Formulir registrasi driver untuk FIA dan Admin." },
    { path: "quest", label: "Quest", description: "Daily quest dan weekly quest tim." },
    { path: "scout", label: "Scout", description: "Pencarian dan pemantauan driver." },
    { path: "place-job-advert", label: "Place Job Advert", description: "Publikasi lowongan kursi driver." },
    { path: "affiliate-team", label: "Affiliate Team", description: "Daftar, permintaan, dan perjanjian afiliasi." },
    { path: "appeal", label: "Appeal", description: "Pengajuan dan riwayat banding tim." }
  ]},
  { path: "fia-panel", label: "FIA PANEL", tabs: [
    { path: "rules-input", label: "Rules Input", description: "Pengelolaan regulasi global dan divisi." },
    { path: "announcement-input", label: "Announcement Input", description: "Penyusunan dan publikasi pengumuman FIA." },
    { path: "punishment-input", label: "Punishment Input", description: "Pencatatan sanksi driver dan tim." },
    { path: "appeal-room", label: "Appeal Room", description: "Peninjauan dan keputusan banding." }
  ]}
];

const globalCards = [
  ["driver-ranking", "Driver Ranking", "Peringkat driver lintas divisi", Trophy],
  ["rookie-of-the-season", "Rookie of the Season", "Performa rookie terbaik", Flag],
  ["team-ranking", "Team Ranking", "Peringkat konstruktor dan tim", Users],
  ["engine-ranking", "Engine Ranking", "Performa paket engine", Gauge],
  ["statistic", "Statistic", "Statistik kompetisi keseluruhan", BarChart3],
  ["comparison", "Comparison", "Perbandingan driver dan tim", ChartNoAxesCombined],
  ["driver-list", "Driver List", "Direktori seluruh driver", Users],
  ["team-list", "Team List", "Direktori seluruh tim", CarFront]
] as const;

const driverAttributes = ["Race Pace", "Qualifying Pace", "Experience", "Aggression", "Defensive Strength", "Overtake Skill", "Mistake Rate", "Tyre Management"];
const carAttributes = ["Race Pace", "Qualifying Pace", "Engine Power", "Aero Power", "Low Speed Corners", "High Speed Corners", "Traction", "Mechanical Grip", "Team Tyre Management", "Strategy Quality", "Team Morale", "Reliability", "Car Tyre Wear", "Pit Stop Efficiency", "DRS Efficiency", "ERS Efficiency"];

function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><span className="section-eyebrow">{eyebrow}</span><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></header>;
}
function EmptyPanel({ title, body }: { title: string; body: string }) {
  return <div className="panel-empty"><Activity size={24}/><strong>{title}</strong><p>{body}</p><span>STRUCTURE READY · DATA NOT CONNECTED</span></div>;
}
function CardGrid({ items, base, prefix = "" }: { items: readonly (readonly [string,string,string,any])[]; base: string; prefix?: string }) {
  return <div className="panel-card-grid">{items.map(([slug,title,description,Icon])=><Link className="panel-feature-card" key={slug} to={base + prefix + "/" + slug}><span className="panel-feature-icon"><Icon size={20}/></span><span className="panel-feature-copy"><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={16}/></Link>)}</div>;
}
function AttributeChart({ attributes, title }: { attributes: string[]; title: string }) {
  return <div className="workspace-card panel-attribute-card"><div className="section-title-row"><div><span className="section-eyebrow">ATTRIBUTE PROFILE</span><h2>{title}</h2></div><span className="empty-tag">50–100</span></div><p className="panel-note">Setiap atribut memiliki batas nilai minimum 50 dan maksimum 100. Grafik akan terisi setelah data development tersedia.</p><div className="attribute-chart-list">{attributes.map((name)=><div className="attribute-chart-row" key={name}><span>{name}</span><div className="attribute-chart-track"><i/></div><strong>—</strong></div>)}</div></div>;
}
function FilterDirectory({ title, description, fields }: { title: string; description: string; fields: string[] }) {
  const [query,setQuery]=useState("");
  const [filters,setFilters]=useState<Record<string,string>>({});
  return <><div className="panel-filter-bar"><label className="panel-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={"Cari " + title.toLowerCase() + "..."}/></label>{fields.map(field=><label className="panel-filter" key={field}><span>{field}</span><select value={filters[field]||""} onChange={e=>setFilters(v=>({...v,[field]:e.target.value}))}><option value="">Semua</option><option value="available">Tersedia</option><option value="active">Aktif</option></select></label>)}</div><EmptyPanel title={query ? "Tidak ada data yang cocok" : title + " belum tersedia"} body={description + " Filter sudah disiapkan dan akan bekerja pada data resmi setelah modul database diaktifkan."}/></>;
}
function AttributePage({ title, attributes }: { title: string; attributes: string[] }) {
  return <><Heading eyebrow="Development" title={title} description="Panel pengembangan atribut. Nilai atribut dibatasi pada rentang 50 sampai 100."/><AttributeChart attributes={attributes} title={title}/></>;
}

export default function PanelPage() {
  const location=useLocation();
  const parts=location.pathname.split("/").filter(Boolean);
  const group=panelGroups.find(item=>item.path===parts[0]);
  const tab=group?.tabs.find(item=>item.path===parts[1]);
  const detail=parts[2];
  const base=group&&tab?"/"+group.path+"/"+tab.path:"/dashboard";
  if(!group||!tab)return <section className="workspace"><Heading eyebrow="Caleris Workspace" title="Panel tidak ditemukan" description="Halaman yang diminta belum terdaftar."/><EmptyPanel title="Route tidak tersedia" body="Gunakan navigasi panel untuk membuka halaman yang tersedia."/></section>;

  const title=tab.label;
  const isDivision=tab.path==="global"||tab.path==="caleris-premio"||tab.path==="caleris-zwei";
  if(isDivision){
    const cards=tab.path==="global"?globalCards:[["calendar","Calendar","Kalender balap divisi",CalendarDays],["results","Results","Hasil sesi dan balapan",ClipboardList],...globalCards] as const;
    if(detail){
      const selected=cards.find(card=>card[0]===detail);
      return <section className="workspace"><Link className="back-link" to={base}><ArrowLeft size={15}/> Kembali ke {title}</Link><Heading eyebrow={title+" · Event Data"} title={selected?.[1]||detail.replaceAll("-"," ")} description={selected?.[2]||"Detail data kompetisi."}/><EmptyPanel title="Data belum tersedia" body="Halaman detail sudah disiapkan. Data ranking, hasil, statistik, dan visualisasi akan dihubungkan setelah struktur database kompetisi ditetapkan."/></section>;
    }
    return <section className="workspace"><Heading eyebrow="Main Event" title={title} description={tab.description}/><CardGrid items={cards as any} base={base}/></section>;
  }

  if(tab.path==="transfer-market")return <section className="workspace"><Heading eyebrow="Main Event · Driver Market" title={title} description={tab.description}/><div className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">DRIVER DIRECTORY</span><h2>Market Listing</h2></div><span className="empty-tag">ALL DIVISIONS</span></div><FilterDirectory title="Driver" description="Daftar driver akan memuat lisensi, tim, sisa kontrak, gaji, rata-rata atribut, dan market value." fields={["Divisi","Lisensi","Tim","Sisa kontrak","Rentang gaji","Rata-rata atribut","Market value"]}/></div></section>;
  if(tab.path==="job-search")return <section className="workspace"><Heading eyebrow="Main Event · Recruitment" title={title} description={tab.description}/><div className="workspace-card"><FilterDirectory title="Lowongan driver" description="Lowongan berisi tim, divisi, kursi yang tersedia, persyaratan, dan waktu mulai posisi." fields={["Divisi","Tim","Jenis kursi","Waktu tersedia"]}/></div></section>;
  if(tab.path==="take-over")return <section className="workspace"><Heading eyebrow="Main Event · Team Market" title={title} description={tab.description}/><div className="workspace-card"><FilterDirectory title="Take over listing" description="Listing akan menampilkan tim yang ditawarkan, valuasi, divisi, aset, dan ketentuan pengambilalihan." fields={["Divisi","Valuasi","Status listing"]}/></div></section>;
  if(tab.path==="fia-announcement")return <section className="workspace"><Heading eyebrow="Main Event · Official Notice" title={title} description={tab.description}/><EmptyPanel title="Belum ada announcement" body="Pengumuman yang dipublikasikan melalui FIA Panel akan tampil di halaman ini."/></section>;
  if(tab.path==="circuit-pool")return <section className="workspace"><Heading eyebrow="Main Event · Circuit Database" title={title} description={tab.description}/><div className="panel-card-grid"><div className="panel-feature-card static"><span className="panel-feature-icon"><Flag/></span><span className="panel-feature-copy"><strong>Circuit Library</strong><small>Informasi layout, panjang lintasan, karakteristik, dan detail sirkuit.</small></span></div></div><EmptyPanel title="Circuit pool kosong" body="Ini adalah database pool sirkuit, bukan kalender atau jadwal balap."/></section>;
  if(tab.path==="regulation")return <section className="workspace"><Heading eyebrow="Main Event · Sporting Code" title={title} description={tab.description}/><EmptyPanel title="Regulasi belum dipublikasikan" body="Dokumen regulasi akan dikelompokkan berdasarkan season dan divisi."/></section>;

  if(group.path==="driver-panel"){
    if(tab.path==="development")return <section className="workspace"><AttributePage title="Driver Development" attributes={driverAttributes}/></section>;
    if(tab.path==="character")return <section className="workspace"><Heading eyebrow="Driver Panel" title={title} description={tab.description}/><div className="dashboard-lower-grid"><div className="workspace-card"><span className="section-eyebrow">DRIVER IDENTITY</span><h2>Character Profile</h2><EmptyPanel title="Profil driver belum terhubung" body="Identitas, lisensi, tim, divisi, dan statistik karakter akan ditampilkan di sini."/></div><div className="workspace-card"><span className="section-eyebrow">CONTRACT</span><h2>Contract Overview</h2><EmptyPanel title="Belum ada data kontrak" body="Durasi, gaji, target, klausul pelepasan, dan status kontrak akan ditampilkan di sini."/></div></div></section>;
    const descriptions:Record<string,string>={sponsorship:"Sponsor aktif, penawaran brand lain, nilai kerja sama, serta progress target sponsor.",quest:"Daftar daily quest dan weekly quest untuk memperoleh DDP maupun ¢p.", "career-history":"Riwayat season, tim, posisi klasemen, front row, pole rate, sprint win rate, dan race win rate.","financial-centre":"Ringkasan pemasukan, pengeluaran, saldo, dan riwayat transaksi driver."};
    return <section className="workspace"><Heading eyebrow="Driver Panel" title={title} description={tab.description}/><EmptyPanel title={title+" belum diaktifkan"} body={descriptions[tab.path]||tab.description}/></section>;
  }
  if(group.path==="team-panel"){
    if(tab.path==="development")return <section className="workspace"><AttributePage title="Team Car Development" attributes={carAttributes}/></section>;
    if(tab.path==="team-summary")return <section className="workspace"><Heading eyebrow="Team Panel" title={title} description={tab.description}/><div className="dashboard-lower-grid"><div className="workspace-card"><span className="section-eyebrow">TEAM IDENTITY</span><h2>Team Profile</h2><EmptyPanel title="Profil tim belum terhubung" body="Nama, logo, engine, divisi, dan profil tim akan tampil di sini."/></div><div className="workspace-card"><span className="section-eyebrow">DRIVER LINE-UP</span><h2>Driver Statistics</h2><EmptyPanel title="Line-up belum tersedia" body="Profil dan statistik kedua driver akan ditampilkan di sini."/></div></div><div className="workspace-card panel-season-note"><span className="section-eyebrow">SEASON TIMELINE</span><h2>Season Period Configuration</h2><p>Off season, pre season, race periods, balancing breaks, dan end season akan mengikuti konfigurasi periode aktif. Jumlah kalender per race period serta durasi setiap fase tidak ditetapkan secara hardcode.</p><span className="empty-tag">CONFIGURATION-DRIVEN</span></div></section>;
    if(tab.path==="place-job-advert")return <section className="workspace"><Heading eyebrow="Team Panel" title={title} description={tab.description}/><EmptyPanel title="Job advert form belum diaktifkan" body="Team owner nantinya dapat membuat lowongan untuk kursi kosong atau kursi yang akan kosong, lalu meninjau lamaran di halaman ini."/></section>;
    const copy:Record<string,string>={sponsorship:"Daftar sponsor tim, penawaran brand, target, dan progress pencapaian.", "driver-registration":"Form pendaftaran driver yang akan dikirim untuk peninjauan FIA dan Admin.",quest:"Daily quest dan weekly quest untuk mendapatkan DDP maupun ¢p.",scout:"Pencarian driver tim lain berdasarkan lisensi, atribut, performa, dan status kontrak.","affiliate-team":"Daftar affiliate, request masuk/keluar, serta detail perjanjian setiap tim.",appeal:"Pengajuan banding, hasil keputusan FIA, dan riwayat banding tim."};
    return <section className="workspace"><Heading eyebrow="Team Panel" title={title} description={tab.description}/><EmptyPanel title={title+" belum diaktifkan"} body={copy[tab.path]||tab.description}/></section>;
  }
  if(group.path==="fia-panel"){
    if(tab.path==="rules-input")return <section className="workspace"><Heading eyebrow="FIA Panel" title={title} description={tab.description}/><CardGrid base={base} items={[[ "global-regulation","Global Regulation","Regulasi global seluruh kompetisi",FileText],["premio-regulation","Premio Regulation","Regulasi divisi Premio",FileText],["zwei-regulation","Zwei Regulation","Regulasi divisi Zwei",FileText]] as const}/>{detail&&<EmptyPanel title="Editor regulasi belum diaktifkan" body="Editor draft dan publikasi regulasi akan dibuat pada tahap implementasi berikutnya."/>}</section>;
    const copy:Record<string,string>={"announcement-input":"Form penyusunan announcement FIA. Pengumuman yang dipublikasikan akan tampil di Main Event → FIA Announcement.","punishment-input":"Form pencatatan punishment untuk driver atau tim, termasuk dasar regulasi dan status keputusan.","appeal-room":"Daftar pengajuan banding dari driver dan tim untuk ditinjau, diputuskan, dan dicatat riwayat hasilnya."};
    return <section className="workspace"><Heading eyebrow="FIA Panel" title={title} description={tab.description}/><EmptyPanel title={title+" belum diaktifkan"} body={copy[tab.path]||tab.description}/></section>;
  }
  return <section className="workspace"><Heading eyebrow={group.label} title={title} description={tab.description}/><EmptyPanel title="Halaman siap dikembangkan" body="Struktur halaman telah disiapkan."/></section>;
}
