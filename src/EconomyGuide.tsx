import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Banknote, Building2, Coins, Gauge, ShieldCheck, Trophy, Wallet, Eye, X } from "lucide-react";
import { supabase } from "./lib/supabase";

type TaxRule = { id:string; tax_scope:"member"|"team"; label:string; minimum_base:number|string; rate_percent:number|string; is_active:boolean; sort_order:number };
type PrizeRule={division_key:string;recipient_type:"driver"|"team";final_position:number;prize_amount:number|string;is_active:boolean};
const money = (value:number) => "€" + value.toLocaleString("id-ID");

const rewardRows = [
  { position: "P1", amount: 1_000_000 },
  { position: "P2", amount: 750_000 },
  { position: "P3", amount: 500_000 },
];

export default function EconomyGuide() {
  const [taxRules,setTaxRules]=useState<TaxRule[]>([]);
  const [taxLoading,setTaxLoading]=useState(true);\n  const [prizeRules,setPrizeRules]=useState<PrizeRule[]>([]);\n  const [prizeLoading,setPrizeLoading]=useState(true);\n  const [prizeError,setPrizeError]=useState("");\n  const [selectedPrize,setSelectedPrize]=useState<{division:string;type:"driver"|"team"}|null>(null);
  const [taxError,setTaxError]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(!supabase){if(active){setTaxError("Konfigurasi pajak tidak dapat dimuat.");setTaxLoading(false);}return;}
      const {data,error}=await supabase.from("caleris_tax_rules")
        .select("id,tax_scope,label,minimum_base,rate_percent,is_active,sort_order")
        .eq("tax_type","wealth").eq("is_active",true)
        .order("tax_scope").order("sort_order");
      if(!active)return;
      if(error){setTaxError("Konfigurasi Wealth Tax gagal dimuat.");setTaxRules([]);}
      else{setTaxRules((data||[]) as TaxRule[]);setTaxError("");}
      setTaxLoading(false);
    };
    void load();
    const loadPrizes=async()=>{
      const {data,error}=await supabase.from("caleris_prizepool_rules").select("division_key,recipient_type,final_position,prize_amount,is_active").eq("is_active",true).order("final_position");
      if(!active)return;
      if(error){setPrizeError("Konfigurasi Prizepool gagal dimuat.");setPrizeRules([]);}
      else{setPrizeRules((data||[]) as PrizeRule[]);setPrizeError("");}
      setPrizeLoading(false);
    };
    void loadPrizes();
    return()=>{active=false;};
  },[]);
  const memberTax=taxRules.filter(x=>x.tax_scope==="member");
  const teamTax=taxRules.filter(x=>x.tax_scope==="team");
  const renderTax=(rows:TaxRule[])=>rows.map(row=><div key={row.id}><span>{row.label} · mulai {money(Number(row.minimum_base))}</span><strong>{Number(row.rate_percent).toLocaleString("id-ID")}%</strong></div>);
  const prizeGroups=useMemo(()=>[
    {division:"premio",label:"Premio"},{division:"zwei",label:"Zwei"}
  ].flatMap(d=>(["driver","team"] as const).map(type=>({ ...d,type,rows:prizeRules.filter(r=>r.division_key===d.division&&r.recipient_type===type).sort((a,b)=>a.final_position-b.final_position)}))).filter(g=>g.rows.length),[prizeRules]);
  const prizeLabel=(type:"driver"|"team")=>type==="driver"?"Driver":"Team";
  return <section className="workspace economy-guide">
    <header className="economy-guide-heading">
      <span className="section-eyebrow">CALERIS MASTERS · ECONOMY</span>
      <h1 className="page-title">Economy Guide</h1>
      <p className="page-description">Pusat referensi keuangan CALERIS MASTERS. Pelajari sumber saldo, hadiah kompetisi, biaya operasional, pajak, dan dasar valuasi untuk memahami bagaimana Driver, Team Owner, dan Team mengelola keuangan mereka.</p>
    </header>

    <section className="economy-guide-grid">
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Wallet size={19}/></span>
        <h2>Saldo Awal</h2>
        <p>Modal awal diberikan satu kali saat wallet pertama kali dibuat. Saldo ini tidak diulang pada pergantian season.</p>
        <div className="economy-guide-values">
          <div><span>Driver Wallet</span><strong>{money(5_000_000)}</strong></div>
          <div><span>Team Owner Wallet</span><strong>{money(10_000_000)}</strong></div>
          <div><span>Team Wallet</span><strong>{money(100_000_000)}</strong></div>
        </div>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Trophy size={19}/></span>
        <h2>Race Reward · Driver</h2>
        <p>Hadiah saldo untuk Driver mengikuti posisi akhir pada hasil balapan resmi yang sudah dikonfirmasi FIA.</p>
        <div className="economy-guide-values">
          {rewardRows.map(row=><div key={row.position}><span>{row.position}</span><strong>{money(row.amount)}</strong></div>)}
        </div>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Building2 size={19}/></span>
        <h2>Race Reward · Team</h2>
        <p>Team memperoleh hadiah saldo apabila salah satu Driver yang terdaftar sebagai bagian dari tim memenangkan P1.</p>
        <div className="economy-guide-highlight"><strong>{money(1_000_000)}</strong><span>Untuk Team pemenang P1</span></div>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Gauge size={19}/></span>
        <h2>Car Maintenance</h2>
        <p>Biaya operasional Team dihitung dari jumlah Driver yang memperoleh status DNF pada hasil resmi setiap round.</p>
        <div className="economy-guide-highlight"><strong>{money(1_000_000)}</strong><span>Per Driver DNF · dibebankan ke Team</span></div>
        <small>DNS, DSQ, hasil OCR draft, dan hasil yang belum dikonfirmasi tidak dikenakan biaya. Koreksi atau pembatalan hasil resmi akan direkonsiliasi.</small>
      </article>
      <article className="economy-guide-card economy-guide-tax-card">
        <span className="economy-guide-icon"><ShieldCheck size={19}/></span>
        <h2>Wealth Tax</h2>
        <p>Pajak kekayaan memakai satu tarif flat berdasarkan tier tertinggi yang terpenuhi. Tarif Member dan Team dikelola terpisah oleh Admin.</p>
        {taxLoading?<small>Memuat konfigurasi pajak aktif...</small>:taxError?<small className="economy-guide-error">{taxError} Silakan coba muat ulang halaman.</small>:<>
          <h3>Member Wallet</h3><div className="economy-guide-values">{memberTax.length?renderTax(memberTax):<small>Belum ada tier Wealth Tax aktif untuk Member.</small>}</div>
          <h3>Team Wallet</h3><div className="economy-guide-values">{teamTax.length?renderTax(teamTax):<small>Belum ada tier Wealth Tax aktif untuk Team.</small>}</div>
        </>}
        <small>Nilai yang ditampilkan dibaca langsung dari konfigurasi aktif database, bukan angka contoh di halaman ini.</small>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Coins size={19}/></span>
        <h2>Team Valuation</h2>
        <p>Valuasi dasar Team ditentukan oleh tier divisi. Penilaian akhir juga mempertimbangkan komponen performa dan aset yang diatur sistem.</p>
        <div className="economy-guide-values">
          <div><span>Premio · Tier 1</span><strong>{money(120_000_000)}</strong></div>
          <div><span>Zwei · Tier 2</span><strong>{money(100_000_000)}</strong></div>
          <div><span>Setiap tier berikutnya</span><strong>−{money(20_000_000)}</strong></div>
        </div>
        <small>Rentang penawaran Take Over 40%–200% merupakan batas negosiasi terhadap valuasi, bukan perubahan nilai dasar.</small>
      </article>
    </section>

    <section className="economy-guide-prize-section">
      <header><div><span className="section-eyebrow">SEASON FINALE · PRIZEPOOL</span><h2>Hadiah Akhir Season</h2><p>Prizepool dibayarkan setelah standings divisi difinalisasi. Nominal mengikuti konfigurasi aktif Admin.</p></div></header>
      {prizeLoading?<p className="economy-guide-muted">Memuat Prizepool...</p>:prizeError?<p className="economy-guide-error">{prizeError}</p>:<div className="economy-guide-grid economy-guide-prize-grid">
       {prizeGroups.map(group=><article className="economy-guide-card" key={group.division+"-"+group.type}>
        <span className="economy-guide-icon"><Trophy size={19}/></span><h2>{group.label} · {prizeLabel(group.type)}</h2>
        <div className="economy-guide-values">{group.rows.slice(0,3).map(row=><div key={row.final_position}><span>P{row.final_position}</span><strong>{money(Number(row.prize_amount))}</strong></div>)}</div>
        {group.rows.length>3&&<button className="economy-guide-view-all" onClick={()=>setSelectedPrize({division:group.division,type:group.type})}><Eye size={14}/> Lihat semua {group.rows.length} posisi</button>}
       </article>)}
      </div>}
    </section>
    <section className="economy-guide-note">
      <Banknote size={18}/>
      <div><strong>Alur pengelolaan keuangan</strong><p>Semua nominal menggunakan Euro (€). Saldo awal berasal dari VreeoBank dan hanya diberikan satu kali. Reward race diproses dari hasil resmi terkonfirmasi. Penyesuaian Admin wajib melalui wallet ledger dengan alasan dan jejak audit. Driver Transfer Tax telah dihapus; skema Driver Loan tetap terpisah dari pinjaman saldo ke VreeoBank.</p></div>
    </section>
    {selectedPrize&&<div className="economy-guide-modal-backdrop" role="presentation" onClick={()=>setSelectedPrize(null)}>
      <section className="economy-guide-modal" role="dialog" aria-modal="true" aria-label="Detail Prizepool" onClick={e=>e.stopPropagation()}>
       <header><div><span className="section-eyebrow">FULL PRIZEPOOL</span><h2>{selectedPrize.division==="premio"?"Premio":"Zwei"} · {prizeLabel(selectedPrize.type)}</h2></div><button className="economy-guide-modal-close" onClick={()=>setSelectedPrize(null)} aria-label="Tutup"><X size={18}/></button></header>
       <div className="economy-guide-values">{prizeRules.filter(r=>r.division_key===selectedPrize.division&&r.recipient_type===selectedPrize.type).sort((a,b)=>a.final_position-b.final_position).map(row=><div key={row.final_position}><span>P{row.final_position}</span><strong>{money(Number(row.prize_amount))}</strong></div>)}</div>
      </section>
     </div>}
    <p className="economy-guide-footnote"><BadgeDollarSign size={14}/> Halaman ini menjelaskan aturan, nominal, dan cara kerja ekonomi CALERIS. Halaman ini bukan riwayat transaksi individual.</p>
  </section>;
}
