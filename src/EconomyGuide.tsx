import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Banknote, Coins, Gauge, ShieldCheck, Trophy, Wallet, Eye, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./economy-guide.css";

type TaxRule = { id:string; tax_scope:"member"|"team"; label:string; minimum_base:number|string; rate_percent:number|string; is_active:boolean; sort_order:number };
type PrizeRule={division_key:string;recipient_type:"driver"|"team";final_position:number;prize_amount:number|string;is_active:boolean};
type DivisionRow={division_key:string;division_name:string;created_at:string};
const money = (value:number) => "€" + value.toLocaleString("id-ID");

export default function EconomyGuide() {
  const [taxRules,setTaxRules]=useState<TaxRule[]>([]);
  const [taxLoading,setTaxLoading]=useState(true); 
  const [prizeRules,setPrizeRules]=useState<PrizeRule[]>([]);
  const [divisionRows,setDivisionRows]=useState<DivisionRow[]>([]); 
  const [prizeLoading,setPrizeLoading]=useState(true); 
  const [prizeError,setPrizeError]=useState("");
  const [selectedPrize,setSelectedPrize]=useState<{division:string;type:"driver"|"team"}|null>(null);
   const [marketValueDetailsOpen,setMarketValueDetailsOpen]=useState(false);
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
      if(!supabase){setPrizeError("Konfigurasi Prizepool tidak dapat dimuat.");setPrizeLoading(false);return;}
      const {data,error}=await supabase.from("caleris_prizepool_rules").select("division_key,recipient_type,final_position,prize_amount,is_active").eq("is_active",true).order("final_position");
      if(!active)return;
      if(error){setPrizeError("Konfigurasi Prizepool gagal dimuat.");setPrizeRules([]);}
      else{setPrizeRules((data||[]) as PrizeRule[]);setPrizeError("");}
      setPrizeLoading(false);
    };
    void loadPrizes();
    const loadDivisions=async()=>{if(!supabase)return;const {data,error}=await supabase.from("license_season_divisions").select("division_key,division_name,created_at").order("created_at");if(active&&!error&&data)setDivisionRows(data as DivisionRow[]);};
    void loadDivisions();
    return()=>{active=false;};
  },[]);
  const memberTax=taxRules.filter(x=>x.tax_scope==="member");
  const teamTax=taxRules.filter(x=>x.tax_scope==="team");
  const renderTax=(rows:TaxRule[])=>rows.map(row=><div key={row.id}><span>{row.label} · mulai {money(Number(row.minimum_base))}</span><strong>{Number(row.rate_percent).toLocaleString("id-ID")}%</strong></div>);
  const prizeGroups=useMemo(()=>[
    {division:"premio",label:"Premio"},{division:"zwei",label:"Zwei"}
  ].flatMap(d=>(["driver","team"] as const).map(type=>({ ...d,type,rows:prizeRules.filter(r=>r.division_key===d.division&&r.recipient_type===type).sort((a,b)=>a.final_position-b.final_position)}))).filter(g=>g.rows.length),[prizeRules]);
  const prizeLabel=(type:"driver"|"team")=>type==="driver"?"Driver":"Team";
  const raceRewardDivisions=useMemo(()=>{
    const byKey=new Map<string,DivisionRow>();
    [...divisionRows].sort((a,b)=>a.created_at.localeCompare(b.created_at)).forEach(row=>{const key=row.division_key.toLowerCase();if(!byKey.has(key))byKey.set(key,row);});
    const others=[...byKey.keys()].filter(key=>!["premio","zwei"].includes(key));
    return ["premio","zwei",...others].filter(key=>byKey.has(key)).map(key=>{
      const tier=key==="premio"?1:key==="zwei"?2:3+others.indexOf(key);
      const multiplier=Math.max(0,1-(tier-1)*0.1);
      return {...byKey.get(key)!,tier,multiplier,driver:[1000000,750000,500000].map(value=>Math.round(value*multiplier)),team:Math.round(1000000*multiplier)};
    });
  },[divisionRows]);
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
      {raceRewardDivisions.map(division=><article className="economy-guide-card" key={division.division_key}>
        <span className="economy-guide-icon"><Trophy size={19}/></span>
        <h2>Race Reward · {division.division_name}</h2>
        <p>Reward saldo dari hasil resmi terkonfirmasi. Tier {division.tier} menggunakan {Math.round(division.multiplier*100)}% nominal Premio.</p>
        <div className="economy-guide-values">
          <div><span>Driver P1</span><strong>{money(division.driver[0])}</strong></div>
          <div><span>Driver P2</span><strong>{money(division.driver[1])}</strong></div>
          <div><span>Driver P3</span><strong>{money(division.driver[2])}</strong></div>
          <div><span>Team · Driver P1</span><strong>{money(division.team)}</strong></div>
        </div>
      </article>)}
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
    <section className="economy-guide-grid economy-guide-detail-grid">
      <article className="economy-guide-card"><span className="economy-guide-icon"><Wallet size={19}/></span><h2>Gaji Driver per Lisensi</h2><p>Rentang gaji tahunan per season mengikuti lisensi aktif dan divalidasi saat kontrak maupun negosiasi.</p><div className="economy-guide-values">
       <div><span>Bronze</span><strong>€5.000.000 – €7.500.000</strong></div><div><span>Silver</span><strong>€7.600.000 – €12.000.000</strong></div><div><span>Gold</span><strong>€12.100.000 – €22.500.000</strong></div><div><span>Super License</span><strong>€22.600.000 – €45.000.000</strong></div>
      </div><small>Gaji tahunan dibayar bertahap pada akhir setiap Race Period.</small></article>
      <article className="economy-guide-card"><span className="economy-guide-icon"><Coins size={19}/></span><h2>Driver Market Value</h2><p>MV adalah referensi nilai pasar Driver di Transfer Market, bukan harga transfer wajib, minimum, atau maksimum.</p><div className="economy-guide-values"><div><span>Base Value · Tier 1</span><strong>{money(18_000_000)}</strong></div><div><span>Growth Factor</span><strong>25%</strong></div><div><span>Premio · Tier 1</span><strong>×1,00</strong></div><div><span>Zwei · Tier 2</span><strong>×0,85</strong></div></div><button className="economy-guide-view-all" onClick={()=>setMarketValueDetailsOpen(true)}><Eye size={14}/> Detail perhitungan Market Value</button><small>MV dapat naik atau turun mengikuti skor Driver dan disesuaikan bertahap menuju Target MV.</small></article>
      <article className="economy-guide-card"><span className="economy-guide-icon"><BadgeDollarSign size={19}/></span><h2>Team Owner Profit Share</h2><p>Di akhir season, sistem menghitung profit bersih positif setiap Team Wallet.</p><div className="economy-guide-highlight"><strong>10%</strong><span>Profit positif Team dibayarkan ke Team Owner Wallet</span></div><small>Jika profit nol atau negatif, tidak ada pembagian. Pencairan setelah seluruh divisi selesai dan Prizepool berhasil dibayarkan.</small></article>
    </section>
    <section className="economy-guide-note">
      <Banknote size={18}/>
      <div><strong>Alur pengelolaan keuangan</strong><p>Semua nominal menggunakan Euro (€). Saldo awal berasal dari VreeoBank dan hanya diberikan satu kali. Reward race diproses dari hasil resmi terkonfirmasi. Penyesuaian Admin wajib melalui wallet ledger dengan alasan dan jejak audit. Driver Transfer Tax telah dihapus; skema Driver Loan tetap terpisah dari pinjaman saldo ke VreeoBank.</p></div>
    </section>
    {marketValueDetailsOpen&&<div className="economy-guide-modal-backdrop" role="presentation" onClick={()=>setMarketValueDetailsOpen(false)}>
      <section className="economy-guide-modal" role="dialog" aria-modal="true" aria-labelledby="market-value-details-title" onClick={e=>e.stopPropagation()}>
       <header><div><span className="section-eyebrow">DRIVER VALUATION ENGINE</span><h2 id="market-value-details-title">Perhitungan Market Value</h2></div><button className="economy-guide-modal-close" onClick={()=>setMarketValueDetailsOpen(false)} aria-label="Tutup"><X size={18}/></button></header>
       <p>Market Value dihitung dari Base Value, skor gabungan tujuh komponen, dan multiplier divisi. Nilai akhir bergerak bertahap menuju Target MV.</p>
       <div className="economy-guide-highlight"><strong>Target MV = €18.000.000 × (MV Score ÷ 100) × Tier Multiplier</strong><span>MV baru = MV lama + (Target MV − MV lama) × 0,25</span></div>
       <h3>Bobot Market Value Score</h3>
       <div className="economy-guide-values">
        <div><span>License · 10%</span><strong>Bronze 25 · Silver 50 · Gold 75 · Super License 100</strong></div>
        <div><span>Contract · 10%</span><strong>100 jika memiliki kontrak aktif, selain itu 0</strong></div>
        <div><span>Performance · 20%</span><strong>Poin klasemen resmi dibandingkan maksimum poin kalender race, termasuk pole bonus</strong></div>
        <div><span>Overall Skill · 20%</span><strong>Rata-rata nilai seluruh atribut Driver yang tersimpan</strong></div>
        <div><span>Achievement · 10%</span><strong>Poin P1/P2/P3 dan Driver of the Day dibandingkan maksimum kalender season</strong></div>
        <div><span>Activity · 10%</span><strong>4 poin per race round yang memiliki check-in, maksimal 100</strong></div>
        <div><span>Reputation · 20%</span><strong>Skor reputasi Driver, dibatasi pada rentang 0–100</strong></div>
       </div>
       <h3>Tier dan nilai awal</h3>
       <div className="economy-guide-values">
        <div><span>Tier 1 · Premio</span><strong>×1,00</strong></div>
        <div><span>Tier 2 · Zwei</span><strong>×0,85</strong></div>
        <div><span>Tier 3</span><strong>×0,70</strong></div>
        <div><span>Tier 4</span><strong>×0,60</strong></div>
       </div>
       <p>Driver baru memulai dari License Score × Base Value × multiplier divisi asal. Setelah data performa dan faktor lainnya tersedia, MV bergerak menuju Target MV menggunakan Growth Factor 0,25. Karena itu, MV bisa naik maupun turun; Base Value bukan jaminan nilai minimum.</p>
       <small>Aturan relasi untuk tier masa depan: MV Tier N tidak boleh melampaui MV terendah pada Tier N−2. Saat ini divisi aktif hanya Premio dan Zwei, sehingga batas relasi tersebut belum berlaku.</small>
      </section>
     </div>}
    {selectedPrize&&<div className="economy-guide-modal-backdrop" role="presentation" onClick={()=>setSelectedPrize(null)}>
      <section className="economy-guide-modal" role="dialog" aria-modal="true" aria-label="Detail Prizepool" onClick={e=>e.stopPropagation()}>
       <header><div><span className="section-eyebrow">FULL PRIZEPOOL</span><h2>{selectedPrize.division==="premio"?"Premio":"Zwei"} · {prizeLabel(selectedPrize.type)}</h2></div><button className="economy-guide-modal-close" onClick={()=>setSelectedPrize(null)} aria-label="Tutup"><X size={18}/></button></header>
       <div className="economy-guide-values">{prizeRules.filter(r=>r.division_key===selectedPrize.division&&r.recipient_type===selectedPrize.type).sort((a,b)=>a.final_position-b.final_position).map(row=><div key={row.final_position}><span>P{row.final_position}</span><strong>{money(Number(row.prize_amount))}</strong></div>)}</div>
      </section>
     </div>}
    <p className="economy-guide-footnote"><BadgeDollarSign size={14}/> Halaman ini menjelaskan aturan, nominal, dan cara kerja ekonomi CALERIS. Halaman ini bukan riwayat transaksi individual.</p>
  </section>;
}
