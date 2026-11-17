import {ClipboardCheck,ImagePlus,ShieldCheck,Table2} from "lucide-react";

export default function RaceControl(){
 return <section className="workspace race-control">
  <header className="page-heading">
   <span className="section-eyebrow">FIA PANEL · OFFICIAL RACE CONTROL</span>
   <h1 className="page-title">Race Result Intake</h1>
   <p className="page-description">Input hasil balapan sekarang menggunakan alur verifikasi berbasis screenshot agar data yang masuk konsisten dengan race result resmi.</p>
  </header>
  <section className="workspace-card race-control-intake">
   <div className="section-title-row"><div><span className="section-eyebrow">IMAGE-ASSISTED WORKFLOW</span><h2>Race Result Verification</h2></div><ImagePlus size={22}/></div>
   <div className="race-intake-steps">
    <article><span>01</span><div><strong>Upload screenshot di percakapan ChatGPT CALERIS</strong><p>Kirim gambar klasifikasi resmi yang menampilkan posisi, driver, tim, grid, waktu, gap, pit stops, fastest lap, pole, dan Driver of the Day.</p></div></article>
    <article><span>02</span><div><strong>Periksa draft hasil pembacaan</strong><p>Data akan disusun menjadi tabel lengkap. Belum ada data yang ditulis ke database pada tahap ini.</p></div></article>
    <article><span>03</span><div><strong>Koreksi dan konfirmasi</strong><p>FIA dapat memperbaiki nama, posisi, status, waktu, dan detail lain. Input database baru dilakukan setelah hasil final dikonfirmasi.</p></div></article>
    <article><span>04</span><div><strong>Proses hasil resmi</strong><p>Hasil final diproses melalui workflow race resmi. Standings, poin, reward, dan statistik dihitung dari data race yang tersimpan.</p></div></article>
   </div>
   <div className="race-intake-safety"><ShieldCheck size={18}/><span><strong>Database protection</strong> · Draft tidak mengubah database. Race yang sudah disahkan tidak boleh diduplikasi; koreksi harus melalui proses pembaruan hasil resmi.</span></div>
  </section>
  <section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">STATISTICS SOURCE</span><h2>Official race data only</h2></div><Table2 size={22}/></div>
   <p className="page-description">Statistik driver dan tim dibaca dari klasifikasi race, hasil resmi, dan standings. Tidak tersedia kolom input manual untuk statistik.</p>
   <div className="race-intake-stat-grid"><span>Driver: Points · Wins · Poles · Podiums · Fastest Laps · Driver of the Day · Completed Races · Gained Positions · Average Position · Points per Race · DNF</span><span>Team: Points · Wins · Poles · Podiums · Fastest Laps · Gained Positions · Completed Races · DNF</span></div>
  </section>
 </section>;
}
