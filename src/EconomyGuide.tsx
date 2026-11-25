import { BadgeDollarSign, Banknote, Building2, Coins, Gauge, ShieldCheck, Trophy, Wallet } from "lucide-react";

const money = (value:number) => "€" + value.toLocaleString("id-ID");

const rewardRows = [
  { position: "P1", amount: 1_000_000 },
  { position: "P2", amount: 750_000 },
  { position: "P3", amount: 500_000 },
];

export default function EconomyGuide() {
  return <section className="workspace economy-guide">
    <header className="economy-guide-heading">
      <span className="section-eyebrow">CALERIS MASTERS · ECONOMY</span>
      <h1 className="page-title">Economy Guide</h1>
      <p className="page-description">Panduan mekanisme saldo, reward, biaya operasional, dan valuasi dalam ekosistem CALERIS MASTERS.</p>
    </header>

    <section className="economy-guide-grid">
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Wallet size={19}/></span>
        <h2>Saldo Awal</h2>
        <p>Saldo awal diberikan satu kali ketika entitas dibuat, bukan setiap pergantian musim.</p>
        <div className="economy-guide-values">
          <div><span>Driver</span><strong>{money(5_000_000)}</strong></div>
          <div><span>Team</span><strong>{money(100_000_000)}</strong></div>
        </div>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Trophy size={19}/></span>
        <h2>Race Reward · Driver</h2>
        <p>Hadiah saldo diberikan berdasarkan hasil balapan resmi yang telah dikonfirmasi.</p>
        <div className="economy-guide-values">
          {rewardRows.map(row=><div key={row.position}><span>{row.position}</span><strong>{money(row.amount)}</strong></div>)}
        </div>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Building2 size={19}/></span>
        <h2>Race Reward · Team</h2>
        <p>Team menerima reward ketika salah satu Driver-nya memenangkan balapan.</p>
        <div className="economy-guide-highlight"><strong>{money(1_000_000)}</strong><span>Untuk Team pemenang P1</span></div>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Gauge size={19}/></span>
        <h2>Car Maintenance</h2>
        <p>Biaya maintenance dihitung dari entri DNF pada hasil resmi per round.</p>
        <div className="economy-guide-highlight"><strong>{money(1_000_000)}</strong><span>Per Driver DNF · dibebankan ke Team</span></div>
        <small>DNS, DSQ, hasil OCR draft, dan hasil yang belum dikonfirmasi tidak dikenakan biaya.</small>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><ShieldCheck size={19}/></span>
        <h2>Wealth Tax</h2>
        <p>Pajak kekayaan menggunakan tier flat yang dapat diatur Admin melalui konfigurasi ekonomi.</p>
        <div className="economy-guide-values">
          <div><span>Di atas €200.000</span><strong>5%</strong></div>
          <div><span>Di atas €300.000</span><strong>10%</strong></div>
          <div><span>Di atas €450.000</span><strong>15%</strong></div>
        </div>
        <small>Persentase dan batas nominal mengikuti konfigurasi aktif.</small>
      </article>
      <article className="economy-guide-card">
        <span className="economy-guide-icon"><Coins size={19}/></span>
        <h2>Team Valuation</h2>
        <p>Nilai dasar dihitung dari tier divisi dan berkembang mengikuti skema valuasi yang berlaku.</p>
        <div className="economy-guide-values">
          <div><span>Premio · Tier 1</span><strong>{money(120_000_000)}</strong></div>
          <div><span>Zwei · Tier 2</span><strong>{money(100_000_000)}</strong></div>
          <div><span>Setiap tier berikutnya</span><strong>−{money(20_000_000)}</strong></div>
        </div>
        <small>Rentang penawaran Take Over 40%–200% adalah batas negosiasi pembeli, bukan pengali nilai dasar.</small>
      </article>
    </section>

    <section className="economy-guide-note">
      <Banknote size={18}/>
      <div><strong>Catatan mekanisme keuangan</strong><p>Semua nominal menggunakan Euro (€). Reward race hanya diproses dari hasil resmi terkonfirmasi. Penyesuaian saldo Admin tetap melalui wallet ledger dan wajib memiliki alasan serta jejak audit. Driver Transfer Tax telah dihapus.</p></div>
    </section>
    <p className="economy-guide-footnote"><BadgeDollarSign size={14}/> Halaman ini menjelaskan aturan dan nominal sistem. Riwayat transaksi individual tidak ditampilkan.</p>
  </section>;
}
