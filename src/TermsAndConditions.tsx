import {FileText,ShieldCheck,Scale,CalendarDays} from "lucide-react";
import "./privacy-policy.css";

const sections=[
 {id:"agreement",title:"1. Persetujuan dan Ruang Lingkup",items:[
  ["Persetujuan","Dengan mengakses atau menggunakan CALERIS MASTERS, kamu menyatakan telah membaca dan memahami Syarat & Ketentuan ini. Jika kamu tidak menyetujuinya, hentikan penggunaan platform."],
  ["Ruang lingkup layanan","CALERIS MASTERS merupakan platform motorsport roleplay yang menyediakan fitur akun member, tim, kompetisi, statistik, aktivitas komunitas, dan fitur pendukung lainnya. Fitur dapat berubah, ditambahkan, atau dihentikan sesuai pengembangan platform."]
 ]},
 {id:"eligibility",title:"2. Kelayakan dan Akun",items:[
  ["Batas usia","Pendaftaran melalui Paddock Access tidak tersedia bagi pengguna berusia di bawah 13 tahun. Dengan mendaftar, kamu menyatakan bahwa informasi usia yang diberikan benar."],
  ["Akun pribadi","Gunakan akun Discord milikmu sendiri dan jaga keamanan aksesnya. Kamu bertanggung jawab atas aktivitas yang dilakukan melalui sesi akunmu, kecuali jika aktivitas tersebut terjadi akibat masalah keamanan yang bukan disebabkan oleh kelalaianmu."],
  ["Informasi yang benar","Berikan informasi yang akurat, tidak menyesatkan, dan perbarui informasi profil apabila diperlukan. Dilarang menyamar sebagai orang lain atau menggunakan identitas yang tidak kamu miliki."]
 ]},
 {id:"membership",title:"3. Keanggotaan dan Role",items:[
  ["Paddock Access","Akses ke fitur dan role tertentu dapat memerlukan proses Paddock Access, pemeriksaan, atau persetujuan sesuai alur yang tersedia di platform."],
  ["Hak akses","Setiap role memiliki akses dan tanggung jawab yang berbeda. Pengguna hanya boleh menggunakan fitur yang tersedia untuk role dan izin akunnya. Upaya melewati pembatasan akses atau menggunakan hak administratif tanpa izin dilarang."],
  ["Perubahan keanggotaan","Status akun, role, afiliasi tim, atau akses fitur dapat berubah mengikuti proses resmi, keputusan pengelola, dan aturan kompetisi yang berlaku."]
 ]},
 {id:"conduct",title:"4. Perilaku Pengguna",items:[
  "Pengguna wajib menjaga komunikasi yang wajar dan menghormati member lain, tim, pengelola, serta komunitas.",
  "Dilarang melakukan pelecehan, ancaman, diskriminasi, spam, penipuan, manipulasi identitas, atau tindakan yang mengganggu penggunaan platform oleh pihak lain.",
  "Dilarang mengeksploitasi bug, memanipulasi request/API, mengakses data tanpa izin, mengganggu infrastruktur, atau mencoba menghindari sistem keamanan dan pembatasan penggunaan.",
  "Dilarang mengirim malware, kode berbahaya, atau konten yang melanggar hukum melalui fitur platform."
 ]},
 {id:"competition",title:"5. Kompetisi dan Sporting Rules",items:[
  ["Aturan resmi","Partisipasi dalam kompetisi CALERIS MASTERS tunduk pada Official Rules, regulasi event, instruksi FIA/pengelola yang berwenang, serta ketentuan khusus yang dipublikasikan untuk setiap event."],
  ["Hasil dan keputusan","Hasil, klasemen, penalti, kalender, dan keputusan kompetisi mengikuti data serta proses resmi yang tersedia di platform. Jika menemukan kesalahan, gunakan kanal pelaporan atau banding yang disediakan."],
  ["Integritas kompetisi","Dilarang memanipulasi hasil, statistik, check-in, transaksi, data balapan, atau proses kompetisi lainnya. Keputusan dan koreksi dilakukan melalui mekanisme resmi."]
 ]},
 {id:"virtual",title:"6. Mata Uang dan Aset Virtual",items:[
  ["Penggunaan internal","Saldo, token development, item, reputasi, statistik, dan aset virtual lainnya digunakan untuk fitur serta simulasi internal CALERIS MASTERS."],
  ["Bukan instrumen keuangan","Aset virtual dalam platform bukan rekening, simpanan, alat pembayaran resmi, investasi, atau janji nilai tukar ke mata uang nyata. Jangan menganggap saldo atau token sebagai uang sungguhan."],
  ["Transaksi platform","Perolehan, penggunaan, transfer, pajak simulasi, hadiah, dan penyesuaian aset virtual mengikuti konfigurasi serta aturan sistem yang berlaku. Pengguna dilarang mengeksploitasi celah transaksi atau memanipulasi saldo."]
 ]},
 {id:"content",title:"7. Konten dan Kekayaan Intelektual",items:[
  ["Konten pengguna","Kamu tetap bertanggung jawab atas foto, nama, logo, livery, teks, dan berkas lain yang kamu unggah. Pastikan kamu memiliki hak atau izin yang diperlukan dan konten tersebut tidak melanggar hak pihak lain."],
  ["Lisensi operasional","Dengan mengunggah konten, kamu memberi CALERIS MASTERS izin terbatas dan non-eksklusif untuk menyimpan, memproses, menampilkan, dan menggunakan konten tersebut sejauh diperlukan untuk menyediakan fitur yang kamu pilih."],
  ["Identitas platform","Nama, logo, desain, materi, dan komponen CALERIS MASTERS yang dimiliki atau digunakan secara sah oleh pengelola tidak boleh disalin, dijual, atau digunakan seolah-olah merupakan layanan resmi lain tanpa izin."]
 ]},
 {id:"thirdparty",title:"8. Layanan Pihak Ketiga",items:[
  "Platform bergantung pada layanan pihak ketiga, termasuk Discord untuk autentikasi, Supabase untuk layanan backend dan penyimpanan, Vercel untuk hosting, Cloudflare Turnstile untuk verifikasi keamanan, serta Google AdSense untuk iklan.",
  "Ketersediaan, syarat penggunaan, dan pemrosesan data oleh penyedia tersebut tunduk pada ketentuan masing-masing. Gangguan pada layanan pihak ketiga dapat memengaruhi sebagian fungsi CALERIS MASTERS."
 ]},
 {id:"enforcement",title:"9. Moderasi, Pembatasan, dan Penegakan Aturan",items:[
  "Pengelola dapat meninjau laporan, menyelidiki dugaan pelanggaran, menghapus konten, membatasi fitur, menangguhkan akun, atau mengambil tindakan lain yang proporsional untuk menjaga keamanan dan integritas platform.",
  "Tindakan dapat dilakukan ketika diperlukan untuk menangani penyalahgunaan, pelanggaran aturan kompetisi, risiko keamanan, kewajiban hukum, atau gangguan terhadap layanan.",
  "Jika tersedia, pengguna dapat menyampaikan klarifikasi atau banding melalui mekanisme resmi. Pengajuan banding tidak menjamin keputusan akan diubah."
 ]},
 {id:"availability",title:"10. Ketersediaan dan Perubahan Layanan",items:[
  "Kami berupaya menjaga platform tetap tersedia, tetapi tidak menjamin layanan selalu bebas gangguan, kesalahan, atau kehilangan konektivitas.",
  "Pemeliharaan, pembaruan, insiden teknis, atau perubahan layanan dapat menyebabkan fitur tidak tersedia sementara. Kami dapat mengubah, menunda, atau menghentikan fitur dengan mempertimbangkan operasional dan keamanan platform."
 ]},
 {id:"disclaimer",title:"11. Batas Tanggung Jawab",items:[
  "CALERIS MASTERS disediakan sebagai platform roleplay dan komunitas. Sejauh diizinkan oleh hukum yang berlaku, layanan disediakan sebagaimana tersedia dan pengelola tidak menjamin bahwa setiap fitur akan selalu memenuhi seluruh kebutuhan atau bebas dari kesalahan.",
  "Ketentuan ini tidak menghapus hak atau tanggung jawab yang tidak dapat dikesampingkan berdasarkan hukum yang berlaku. Pengguna tetap bertanggung jawab atas penggunaan akun dan konten yang dikirimkannya."
 ]},
 {id:"changes",title:"12. Perubahan Syarat & Ketentuan",items:[
  "Syarat & Ketentuan dapat diperbarui seiring perubahan fitur, aturan kompetisi, kebutuhan keamanan, atau ketentuan hukum. Versi terbaru akan ditampilkan pada halaman ini beserta tanggal pembaruannya. Penggunaan platform setelah perubahan dipublikasikan berarti kamu menggunakan layanan berdasarkan ketentuan terbaru."
 ]},
 {id:"contact",title:"13. Kontak dan Pelaporan",items:[
  "Untuk pertanyaan, laporan pelanggaran, atau banding, gunakan kanal Community & Support resmi yang tercantum pada footer website. Sertakan informasi yang relevan agar laporan dapat ditinjau. Jangan pernah mengirimkan kata sandi atau kredensial akun."
 ]}
];

export default function TermsAndConditions(){
 return <main className="privacy-page">
  <header className="privacy-hero">
   <div className="privacy-eyebrow"><FileText size={15}/> CALERIS MASTERS · LEGAL</div>
   <h1>Syarat &amp; <span>Ketentuan</span></h1>
   <p>Ketentuan penggunaan akun, fitur, komunitas, dan kompetisi di platform CALERIS MASTERS.</p>
   <div className="privacy-updated"><CalendarDays size={15}/> Terakhir diperbarui: 24 November 2026</div>
  </header>
  <div className="privacy-layout">
   <aside className="privacy-aside"><strong>DAFTAR ISI</strong><nav aria-label="Daftar isi syarat dan ketentuan">{sections.map(s=><a key={s.id} href={"#"+s.id}>{s.title}</a>)}</nav></aside>
   <article className="privacy-content">
    <div className="privacy-intro"><ShieldCheck size={19}/><p>Ketentuan ini membantu menjaga CALERIS MASTERS sebagai lingkungan roleplay motorsport yang aman, adil, dan tertib. Baca bagian yang relevan sebelum menggunakan fitur atau mengikuti kompetisi.</p></div>
    {sections.map(s=><section className="privacy-section" id={s.id} key={s.id}><h2>{s.title}</h2>{s.items.map((entry,i)=>typeof entry==="string"?<p className="terms-rule" key={i}>{entry}</p>:<div className="privacy-subsection" key={entry[0]}><h3>{entry[0]}</h3><p>{entry[1]}</p></div>)}</section>)}
    <section className="privacy-contact"><Scale size={21}/><div><h2>Gunakan Platform dengan Bertanggung Jawab</h2><p>Dengan menggunakan CALERIS MASTERS, kamu setuju untuk mengikuti ketentuan penggunaan dan Official Rules yang berlaku. Untuk kebijakan mengenai data pribadi, baca halaman Kebijakan Privasi.</p></div></section>
    <footer className="privacy-footnote">Syarat &amp; Ketentuan ini berlaku untuk penggunaan platform CALERIS MASTERS dan dibaca bersama regulasi resmi setiap kompetisi.</footer>
   </article>
  </div>
 </main>;
}
