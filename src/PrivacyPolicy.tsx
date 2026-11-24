import {ShieldCheck,Lock,Mail,CalendarDays} from "lucide-react";
import "./privacy-policy.css";

const sections=[
 {id:"data",title:"1. Data yang Kami Kumpulkan",body:[
  ["Data akun dan autentikasi","Saat kamu masuk menggunakan Discord, Supabase Auth memproses informasi autentikasi yang diperlukan, seperti identitas akun Discord, alamat email yang diberikan oleh penyedia login, serta informasi sesi. Kami tidak menerima kata sandi Discord kamu."],
  ["Data profil dan pendaftaran","Jika kamu melanjutkan Paddock Access, kami dapat memproses nama, nickname, tanggal lahir, kewarganegaraan, kota asal, preferensi role, foto profil, dan informasi pendaftaran role yang kamu kirimkan."],
  ["Data aktivitas platform","Untuk menjalankan fitur, platform dapat memproses identitas member, role, tim, statistik kompetisi, hasil balapan, transaksi dan saldo dalam sistem permainan, quest, pengembangan, sponsorship, serta aktivitas lain yang kamu lakukan. Data keuangan internal dan informasi privat tidak otomatis ditampilkan kepada publik."],
  ["Konten dan berkas","Berkas yang kamu unggah, seperti foto profil, logo, livery, atau materi lain yang didukung fitur, dapat disimpan melalui Supabase Storage. Visibilitasnya mengikuti pengaturan dan izin pada fitur terkait."],
  ["Data teknis dan keamanan","Layanan dapat memproses informasi teknis seperti alamat IP, jenis perangkat dan browser, waktu permintaan, log keamanan, serta data verifikasi Turnstile. Pada beberapa fungsi pencarian dan pembatasan permintaan, alamat IP diproses menjadi keyed hash untuk pembatasan penyalahgunaan, bukan disimpan sebagai alamat IP mentah oleh mekanisme tersebut."]
 ]},
 {id:"purpose",title:"2. Cara Kami Menggunakan Data",body:[
  ["Operasional akun","Memproses login Discord, menjaga sesi, membuat dan mengelola profil, serta memeriksa status dan hak akses akun."],
  ["Fitur CALERIS MASTERS","Menjalankan pendaftaran member, direktori, profil publik, tim, kompetisi, leaderboard, ekonomi permainan, quest, dan fitur lain yang kamu gunakan."],
  ["Keamanan dan pencegahan penyalahgunaan","Memverifikasi permintaan, menerapkan pembatasan akses, mendeteksi aktivitas tidak wajar, menegakkan aturan, dan menangani laporan atau banding."],
  ["Komunikasi layanan","Menampilkan pemberitahuan terkait akun, pendaftaran, perubahan layanan, dan informasi operasional yang relevan."]
 ]},
 {id:"public",title:"3. Informasi Publik dan Profil",body:[
  ["Tampilan publik","Informasi tertentu dapat terlihat oleh pengunjung, misalnya nama atau nickname publik, identitas member, informasi tim, role yang ditampilkan, statistik kompetisi, dan konten yang memang disediakan sebagai halaman publik."],
  ["Digital ID","Digital ID bersifat privat secara default. Informasi Digital ID hanya ditampilkan pada halaman verifikasi publik apabila fitur tersebut diaktifkan atau dipublikasikan melalui pengaturan yang tersedia."],
  ["Kontrol konten","Jangan mengunggah informasi pribadi yang tidak diperlukan. Informasi yang memang dipublikasikan pada halaman publik dapat disalin atau disimpan oleh pihak lain."]
 ]},
 {id:"cookies",title:"4. Cookie dan Penyimpanan Browser",body:[
  ["Penyimpanan fungsional","CALERIS MASTERS menggunakan cookie dan/atau penyimpanan browser seperti localStorage untuk kebutuhan fungsi website, misalnya mempertahankan sesi login melalui Supabase, menyimpan preferensi tema, serta mengingat bahwa pemberitahuan cookie telah ditutup."],
  ["Pemberitahuan cookie","Banner cookie di website merupakan pemberitahuan informasi. Tombol Tutup hanya menyembunyikan banner pada browser tersebut. Banner ini tidak mengatur, memblokir, atau menarik persetujuan untuk cookie dari layanan pihak ketiga."],
  ["Pengaturan browser","Kamu dapat mengelola atau menghapus cookie dan data situs melalui pengaturan browser. Menghapus data tertentu dapat membuat sesi login atau preferensi website perlu diatur kembali."]
 ]},
 {id:"ads",title:"5. Iklan dan Layanan Pihak Ketiga",body:[
  ["Google AdSense","Website memuat layanan Google AdSense untuk menampilkan iklan. Google dan mitra iklannya dapat menggunakan cookie atau teknologi serupa untuk menayangkan, mengukur, membatasi frekuensi, dan mempersonalisasi iklan sesuai pengaturan serta kebijakan Google yang berlaku. Banner cookie CALERIS MASTERS tidak mengendalikan pemrosesan tersebut."],
  ["Penyedia infrastruktur","CALERIS MASTERS menggunakan Supabase untuk autentikasi, database, dan penyimpanan; Vercel untuk hosting/deployment; Discord sebagai penyedia login; serta Cloudflare Turnstile untuk verifikasi keamanan pada proses Paddock Access."],
  ["Kebijakan pihak ketiga","Pemrosesan data oleh penyedia tersebut tunduk pada kebijakan dan pengaturan masing-masing. Silakan tinjau kebijakan privasi penyedia terkait untuk memahami praktik mereka."]
 ]},
 {id:"sharing",title:"6. Pembagian dan Pemrosesan Data",body:[
  ["Penyedia layanan","Data dapat diproses oleh penyedia infrastruktur dan layanan yang disebutkan dalam kebijakan ini sejauh diperlukan untuk mengoperasikan, mengamankan, dan menyediakan fitur website."],
  ["Kewajiban hukum dan keamanan","Data dapat diungkapkan apabila diwajibkan oleh hukum yang berlaku atau diperlukan secara wajar untuk melindungi keamanan pengguna, platform, dan pihak lain."],
  ["Tidak untuk diperjualbelikan","Kami tidak menjual data pribadi pengguna sebagai produk data."]
 ]},
 {id:"retention",title:"7. Penyimpanan dan Penghapusan Data",body:[
  ["Masa penyimpanan","Data disimpan selama diperlukan untuk menyediakan layanan, menjaga keamanan, memenuhi kewajiban hukum, menyelesaikan sengketa, dan menjaga catatan operasional yang sah."],
  ["Penghapusan atau koreksi","Kamu dapat mengajukan permintaan akses, koreksi, atau penghapusan data pribadi melalui kanal Community & Support resmi yang tersedia di footer website. Permintaan akan ditinjau dengan mempertimbangkan verifikasi identitas, kewajiban penyimpanan, keamanan, dan dampaknya terhadap integritas catatan permainan."],
  ["Dampak penghapusan","Penghapusan data tertentu dapat menyebabkan sebagian fitur akun tidak lagi tersedia atau mengganggu catatan kompetisi dan transaksi yang perlu dipertahankan."]
 ]},
 {id:"security",title:"8. Keamanan Data",body:[
  "Kami menerapkan kontrol akses, kebijakan database, pembatasan akses berbasis role, serta mekanisme keamanan yang sesuai dengan fungsi platform. Sebagian data profil dan berkas menggunakan akses terbatas. Namun, tidak ada metode transmisi atau penyimpanan elektronik yang dapat dijamin aman sepenuhnya."
 ]},
 {id:"children",title:"9. Usia Pengguna",body:[
  "Paddock Access saat ini tidak tersedia bagi pengguna berusia di bawah 13 tahun. Proses pendaftaran dapat meminta tanggal lahir untuk memeriksa batas usia tersebut. Jika kamu mengetahui bahwa anak di bawah batas usia tersebut telah memberikan data pribadi melalui proses pendaftaran, hubungi kami melalui kanal Community & Support agar dapat ditinjau."
 ]},
 {id:"changes",title:"10. Perubahan Kebijakan",body:[
  "Kami dapat memperbarui Kebijakan Privasi ini ketika fitur, praktik pemrosesan data, atau ketentuan hukum berubah. Versi terbaru akan dipublikasikan pada halaman ini beserta tanggal pembaruannya. Kami menyarankan kamu memeriksa halaman ini secara berkala."
 ]}
];

export default function PrivacyPolicy(){
 return <main className="privacy-page">
  <header className="privacy-hero">
   <div className="privacy-eyebrow"><ShieldCheck size={15}/> CALERIS MASTERS · LEGAL</div>
   <h1>Kebijakan <span>Privasi</span></h1>
   <p>Penjelasan mengenai data yang diproses ketika kamu mengakses dan menggunakan CALERIS MASTERS.</p>
   <div className="privacy-updated"><CalendarDays size={15}/> Terakhir diperbarui: 24 November 2026</div>
  </header>
  <div className="privacy-layout">
   <aside className="privacy-aside">
    <strong>DAFTAR ISI</strong>
    <nav aria-label="Daftar isi kebijakan privasi">{sections.map(s=><a key={s.id} href={"#"+s.id}>{s.title}</a>)}</nav>
   </aside>
   <article className="privacy-content">
    <div className="privacy-intro"><Lock size={19}/><p>Privasi dan keamanan informasi merupakan bagian penting dari pengelolaan platform. Kebijakan ini menjelaskan kategori data yang digunakan, tujuan pemrosesan, layanan pihak ketiga, serta cara mengajukan permintaan terkait data pribadi.</p></div>
    {sections.map(s=><section className="privacy-section" id={s.id} key={s.id}><h2>{s.title}</h2>{s.body.map((entry,i)=>typeof entry==="string"?<p key={i}>{entry}</p>:<div className="privacy-subsection" key={entry[0]}><h3>{entry[0]}</h3><p>{entry[1]}</p></div>)}</section>)}
    <section className="privacy-contact"><Mail size={21}/><div><h2>Kontak dan Permintaan Privasi</h2><p>Untuk pertanyaan atau permintaan terkait data pribadi, gunakan kanal Community &amp; Support resmi yang tercantum pada footer CALERIS MASTERS. Sertakan informasi yang cukup agar permintaan dapat diverifikasi. Jangan mengirimkan kata sandi atau kredensial akun.</p></div></section>
    <footer className="privacy-footnote">Dengan menggunakan CALERIS MASTERS, kamu dapat membaca kebijakan ini untuk memahami praktik pemrosesan data pada platform. Kebijakan ini bukan pengganti ketentuan hukum yang berlaku.</footer>
   </article>
  </div>
 </main>;
}
