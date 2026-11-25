export type CalePageGuide = {
  title: string;
  purpose: string;
  sections: string[];
};

const guide = (title: string, purpose: string, ...sections: string[]): CalePageGuide => ({
  title, purpose, sections,
});

const guides: Record<string, CalePageGuide> = {
  "/": guide("Beranda", "Halaman pengenalan CALERIS MASTERS dan pintu masuk ke area publik maupun akun.", "Informasi identitas dan gambaran kompetisi.", "Gunakan navigasi utama untuk membuka halaman publik atau masuk ke akun."),
  "/paddock-access": guide("Paddock Access", "Lengkapi identitas akun agar akses ke area member dapat diaktifkan.", "Foto profil dan identitas dasar.", "Nama, kewarganegaraan, kota asal, serta nickname.", "Pilihan role hanya menjadi preferensi onboarding, bukan pemberian akses panel.", "Periksa kembali data dan persetujuan sebelum menyelesaikan onboarding."),
  "/dashboard": guide("Dashboard", "Ringkasan aktivitas akun dan pintasan menuju fitur CALERIS MASTERS yang tersedia untuk role aktif.", "Ringkasan profil, tim, kompetisi, dan aktivitas yang relevan.", "Gunakan kartu pintasan untuk membuka modul terkait; akses tetap mengikuti role akun."),
  "/community": guide("Community Hub", "Pusat progres komunitas, pencapaian, aktivitas, voting, prediksi kejuaraan, Digital ID, dan arsip musim.", "Overview menampilkan XP, level, statistik Driver/Team, milestone, dan aktivitas komunitas.", "Milestone dan badge menunjukkan progres yang dihitung dari data resmi; XP mengikuti konfigurasi Admin.", "Voting memungkinkan satu suara per member dan hasil ditampilkan sesuai status voting.", "Championship Predictor memakai klasemen, jadwal, dan aturan poin resmi sebagai input simulasi, bukan hasil resmi.", "Digital ID mengatur tampilan dan publikasi kartu; kartu baru bersifat privat secara default.", "Yearbook membuat snapshot arsip musim yang dapat dicetak atau disimpan sebagai PDF."),
  "/shop": guide("Shop", "Marketplace CALERIS MASTERS untuk menjelajahi dan memperoleh berbagai item serta produk yang tersedia.", "Jelajahi katalog untuk melihat item, informasi, dan harga yang ditampilkan.", "Periksa detail serta ketentuan setiap item sebelum melakukan pembelian.", "Ketersediaan produk dan kategori dapat bertambah mengikuti pengembangan marketplace."),
  "/economy-guide": guide("Economy Guide", "Pusat referensi sistem keuangan CALERIS MASTERS untuk memahami saldo awal Driver, Team Owner, dan Team; hadiah balapan; biaya maintenance; Wealth Tax Member dan Team; serta dasar valuasi tim.", "Saldo Awal menjelaskan modal satu kali dari VreeoBank untuk Driver, Team Owner, dan Team.", "Race Reward menjelaskan hadiah saldo berdasarkan hasil resmi yang telah dikonfirmasi FIA untuk Driver dan Team pemenang P1.", "Car Maintenance menjelaskan biaya operasional Team untuk setiap Driver berstatus DNF pada hasil resmi, termasuk pengecualian DNS, DSQ, dan draft OCR.", "Wealth Tax menampilkan tier aktif secara terpisah untuk Member Wallet dan Team Wallet. Setiap wallet dikenakan satu tarif flat sesuai tier tertinggi yang terpenuhi, bukan pajak progresif.", "Team Valuation menjelaskan nilai dasar berdasarkan divisi dan faktor yang dipakai dalam penilaian akhir serta negosiasi Take Over.", "Halaman ini adalah panduan aturan dan nominal ekonomi, bukan daftar atau riwayat transaksi."),
  "/financial-centre": guide("Financial Centre", "Ringkasan saldo dan transaksi keuangan karakter yang terhubung ke akun.", "Saldo wallet per kategori dan riwayat transaksi.", "Gunakan rincian transaksi untuk memeriksa sumber, tujuan, nominal, dan status pembayaran."),
  "/race-checkin": guide("Race Check-in", "Konfirmasi kehadiran pada round yang sedang membuka check-in.", "Jadwal dan status check-in menentukan round yang dapat dipilih.", "Kirim check-in satu kali untuk round yang tersedia; reward mengikuti aturan resmi dan status klaim."),
  "/admin-workflow": guide("Admin Workflow", "Pusat navigasi administrator untuk konfigurasi, approval, audit, dan kontrol operasional.", "Configuration & Rules mengelola season, lisensi, ekonomi, hadiah, quest, dan harga.", "Approvals & Lifecycle menangani registrasi, akun, status tim, dan operasi admin.", "Audit & Intelligence memantau penyesuaian, ekonomi, brand, dan sponsorship.", "Modul CRM sengaja belum diaktifkan."),
  "/admin": guide("Site Manager", "Kelola konten dan identitas publik website CALERIS MASTERS.", "Pengaturan halaman dan informasi publik yang memang tersedia di panel.", "Simpan perubahan setelah memeriksa preview dan status publikasi."),
  "/admin/users": guide("Manage User", "Halaman Admin untuk memantau akun, mengatur role dan tim member, serta menangani moderasi akun.", "Ringkasan akun: total akun, profil terhubung, administrator, dan akun yang belum onboarding.", "Pencarian & filter: temukan akun lewat email, nama, Member ID, karakter, tim, atau status.", "Kartu akun: lihat identitas, role aktif, tim, status, karakter, lisensi, dan aktivitas login. Buka detail untuk profil dan riwayat moderasi.", "Role & Tim: atur preferensi, role aktif, nama karakter, atau penempatan tim. Perubahan tim memerlukan alasan audit dan mengikuti aturan kontrak.", "Moderasi: kirim peringatan, ban sementara/permanen, atau cabut ban. Semua tindakan tercatat dalam riwayat."),
  "/admin/configuration": guide("Website Configuration", "Atur konfigurasi umum website dan parameter yang disediakan untuk administrator.", "Gunakan kelompok konfigurasi untuk menemukan parameter yang ingin diubah.", "Periksa nilai aktif dan simpan perubahan melalui kontrol konfigurasi terkait."),
  "/admin/prizepool": guide("Prizepool", "Kelola hadiah dan reward kompetisi.", "Periksa aturan hadiah per season/divisi dan sumber reward.", "Perubahan mengikuti konfigurasi ekonomi serta otorisasi Admin."),
  "/admin/license-engine": guide("License Engine", "Kelola season, divisi, lisensi, scoring, kalender, dan pemrosesan hasil kompetisi.", "Periksa season dan divisi aktif sebelum mengubah konfigurasi.", "Scoring dan hasil resmi menjadi dasar standings, lisensi, dan proses kompetisi."),
  "/admin/economy-engine": guide("Economy Engine", "Pantau wallet, transaksi, pajak, reward, dan proses ekonomi CALERIS.", "Gunakan audit untuk menelusuri transaksi dan saldo.", "Penyesuaian harus mengikuti validasi nominal, otorisasi, dan audit trail."),
  "/admin/adjustments": guide("Economy Adjustments", "Lakukan penyesuaian wallet yang diizinkan dengan jejak audit.", "Pilih akun dan wallet yang tepat.", "Masukkan nominal serta alasan, periksa ringkasan, lalu konfirmasi tindakan."),
  "/admin/data-adjustments": guide("Data Adjustments", "Kelola koreksi data yang disediakan untuk administrator.", "Periksa target dan nilai sebelum perubahan.", "Setiap koreksi harus memiliki alasan dan dapat ditelusuri."),
  "/admin/quest-engine": guide("Quest Engine", "Kelola quest, periode, tingkat kesulitan, dan reward.", "Atur ketentuan quest serta reward yang berlaku.", "Pantau status dan klaim reward agar sesuai konfigurasi."),
  "/admin/pricing": guide("Pricing Center", "Atur harga dan parameter biaya untuk fitur development.", "Periksa item dan nilai harga aktif.", "Perubahan harga memengaruhi transaksi berikutnya, bukan transaksi historis."),
  "/admin/operations": guide("Admin Operations", "Pusat operasi administratif untuk pajak, valuation, dan pemetaan tier.", "Gunakan modul sesuai jenis operasi yang ditampilkan.", "Periksa pratinjau dan catatan audit sebelum menyimpan."),
  "/admin/operations-intelligence": guide("Operations Intelligence", "Pantau status dan indikator lintas engine untuk menemukan proses yang memerlukan tindak lanjut.", "Periksa ringkasan metrik dan status proses.", "Buka detail sumber sebelum menyimpulkan anomali atau melakukan tindakan."),
  "/admin/race-engine-lab": guide("Race Engine Lab", "Area pengujian dan observasi Race Engine yang terpisah dari hasil kompetisi resmi.", "Pilih sesi pengujian dan konfigurasi yang tersedia.", "Hasil lab merupakan data pengujian, bukan klasifikasi resmi."),
  "/admin/live-race": guide("Live Race Control", "Pantau dan kendalikan tampilan sesi balap live yang tersedia.", "Periksa status sesi dan informasi siaran.", "Gunakan kontrol hanya sesuai status dan kewenangan sesi."),
  "/admin/brand-ecosystem": guide("Brand Ecosystem", "Pantau reputasi, fans, merchandise, dan aktivitas brand tim.", "Periksa indikator brand serta data tim yang terkait.", "Gunakan detail untuk memahami sumber perubahan metrik."),
  "/admin/sponsorship": guide("Sponsorship Administration", "Kelola konfigurasi dan pengawasan kontrak sponsorship.", "Periksa penawaran, kontrak, target, dan status pembayaran.", "Perubahan kontrak mengikuti batas negosiasi dan aturan penalti."),
  "/admin/test-personas": guide("Test Personas", "Kelola persona khusus untuk pengujian alur dan hak akses.", "Pilih persona yang tersedia dan periksa role serta timnya.", "Persona hanya untuk Testing; jangan gunakan sebagai akun operasional."),
  "/admin/team-inactivity": guide("Team Inactivity", "Pantau status aktivitas tim, freeze, kompensasi, dan slot pengganti.", "Periksa hasil review aktivitas dan status penyelesaian kompensasi.", "Reaktivasi dan penggantian tim mengikuti aturan lifecycle."),
  "/admin/developer-api": guide("Developer API", "Kelola akses dan dokumentasi API yang disediakan untuk integrasi CALERIS.", "Periksa endpoint, scope, dan status akses.", "Lindungi credential dan gunakan hanya scope yang diperlukan."),
  "/admin/registered-members": guide("Registered Members", "Review pendaftaran member dan tim yang menunggu tindak lanjut.", "Periksa data pendaftar dan kelengkapan identitas.", "Setujui atau tindak lanjuti sesuai aturan registrasi."),
  "/rules": guide("Regulations", "Baca regulasi resmi dan ketentuan kompetisi CALERIS MASTERS.", "Pilih bagian regulasi untuk memahami aturan yang berlaku.", "Periksa season dan divisi yang menjadi konteks aturan."),
  "/profile": guide("Profile", "Lihat dan kelola identitas akun serta informasi karakter yang terhubung.", "Periksa informasi profil dan data karakter.", "Perubahan identitas mengikuti validasi dan aturan privasi."),
  "/account/settings": guide("Account Settings", "Kelola preferensi dan pengaturan akun.", "Periksa setiap pengaturan sebelum menyimpan perubahan."),
  "/auth/callback": guide("Authentication Callback", "Menyelesaikan proses masuk melalui Discord dan mengembalikan pengguna ke halaman yang sesuai.", "Sistem memverifikasi sesi autentikasi dan status onboarding.", "Jika sesi valid, pengguna diarahkan ke halaman tujuan atau Paddock Access bila onboarding belum selesai."),
  "/main-event/circuit-pool": guide("Circuit Pool", "Jelajahi database sirkuit yang tersedia untuk kompetisi.", "Kartu sirkuit menampilkan identitas, negara, dan layout.", "Pilih sirkuit untuk melihat detail dan ketersediaannya sesuai aturan season."),
  "/fia-panel/circuit-pool-input": guide("Circuit Pool Input", "Masukkan atau perbarui master data sirkuit untuk digunakan pada kalender kompetisi.", "Lengkapi nama, negara, dan spesifikasi sirkuit.", "Unggah layout yang sesuai, periksa preview, lalu simpan data master."),
  "/main-event/job-search": guide("Job Search", "Cari lowongan kursi Driver yang dipublikasikan oleh tim.", "Gunakan pencarian dan filter untuk menemukan lowongan.", "Buka detail lowongan untuk melihat persyaratan dan alur pengajuan."),
  "/main-event/take-over": guide("Take Over Market", "Jelajahi penawaran pengambilalihan tim.", "Periksa identitas tim, pemilik, dan ketentuan penawaran.", "Proses takeover mengikuti validasi kepemilikan dan pembayaran."),
  "/main-event/transfer-market": guide("Transfer Market", "Jelajahi Driver dan proses negosiasi transfer atau loan.", "Cari Driver dan periksa tim, lisensi, serta status kontrak.", "Penawaran, persetujuan pihak terkait, dan jendela transfer mengikuti aturan server."),
  "/main-event/registration": guide("Main Event Registration", "Daftarkan identitas peserta dan tim untuk kompetisi.", "Lengkapi informasi peserta dan aset visual yang diminta.", "Periksa hasil optimasi gambar dan data sebelum mengirim pendaftaran."),
  "/team-panel/driver-registration": guide("Driver Registration", "Kirim registrasi Driver yang telah memiliki kontrak ke FIA untuk pemeriksaan roster season.", "Pilih Driver dan season yang sesuai.", "Sistem memvalidasi kontrak, tim, divisi, dan batas roster sebelum pengiriman."),
  "/fia-panel/event-control": guide("Event Control Center", "Pusat kendali FIA untuk menyiapkan season, kalender, circuit, hasil, dan operasi event.", "Season & Divisions mengatur struktur kompetisi.", "Calendar dan Circuit Pool menentukan jadwal serta sirkuit.", "Race Results dan FIA Operations menangani hasil dan proses resmi."),
  "/fia-panel/season-calendar": guide("Season Calendar", "Siapkan kalender 12 periode season dan jadwal round untuk setiap divisi.", "Atur tanggal Pre Season, Race Period, Break Balancing, End Season, dan Off Season.", "Periksa jumlah round dan penempatan sirkuit sebelum menyimpan jadwal."),
  "/fia-panel/race-input": guide("Race Result Input", "Masukkan klasifikasi resmi setelah sesi balap selesai.", "Pilih round dan lengkapi posisi serta status setiap peserta.", "Periksa hasil dan validasi sebelum finalisasi; standings dan proses terkait mengikuti hasil resmi."),
  "/fia-panel/punishment-input": guide("Punishment Input", "Catat peringatan atau sanksi resmi FIA untuk Driver maupun tim.", "Pilih target, jenis sanksi, dan alasan.", "Periksa konsekuensi lalu simpan agar masuk ke riwayat resmi."),
  "/fia-panel/appeal-room": guide("Appeal Room", "Tinjau pengajuan banding dan keputusan FIA.", "Periksa perkara, bukti, dan tanggapan yang tersedia.", "Catat keputusan sesuai kewenangan dan aturan banding."),
  "/privacy-policy": guide("Privacy Policy", "Baca kebijakan pengelolaan dan perlindungan data pengguna.", "Periksa jenis data, penggunaan, penyimpanan, dan hak pengguna."),
  "/terms-and-conditions": guide("Terms & Conditions", "Baca syarat penggunaan platform dan ketentuan partisipasi.", "Periksa kewajiban akun, aturan layanan, dan ketentuan kompetisi."),
};

const panelGuides: Record<string, CalePageGuide> = {
  global: guide("Global Overview", "Ringkasan kompetisi lintas divisi dan pintasan ke statistik utama.", "Kartu ranking, statistik, direktori, dan perbandingan membuka halaman rincian masing-masing."),
  "driver-ranking": guide("Driver Ranking", "Lihat peringkat Driver berdasarkan poin kompetisi resmi.", "Pilih season dan divisi untuk membandingkan posisi serta poin.", "Buka profil Driver dari nama yang tersedia."),
  "rookie-of-the-season": guide("Rookie of the Season", "Lihat kandidat dan statistik rookie terbaik pada season terkait.", "Periksa kriteria rookie dan hasil kompetisi yang ditampilkan.", "Gunakan profil Driver untuk membuka rincian peserta."),
  "team-ranking": guide("Team Ranking", "Lihat peringkat tim berdasarkan hasil konstruktor resmi.", "Bandingkan poin, posisi, dan performa tim.", "Buka profil tim dari nama yang tersedia."),
  "engine-ranking": guide("Engine Ranking", "Bandingkan paket engine berdasarkan atribut dan data kompetisi yang tersedia.", "Periksa atribut dan cakupan data sebelum membandingkan performa."),
  statistic: guide("Competition Statistics", "Jelajahi statistik keseluruhan kompetisi CALERIS MASTERS.", "Gunakan kategori statistik untuk membaca ringkasan hasil dan partisipasi."),
  comparison: guide("Driver & Team Comparison", "Bandingkan data Driver atau tim pada kompetisi.", "Pilih entitas yang ingin dibandingkan dan periksa metrik yang tersedia."),
  "driver-list": guide("Driver Directory", "Jelajahi direktori Driver dan buka profil publik peserta.", "Gunakan pencarian dan filter untuk menemukan Driver.", "Pilih nama Driver untuk membuka profil dan informasi tim."),
  "team-list": guide("Team Directory", "Jelajahi direktori tim dan buka profil publik masing-masing tim.", "Gunakan pencarian dan filter untuk menemukan tim.", "Pilih nama tim untuk melihat roster serta informasi kompetisi."),
  "caleris-premio": guide("Caleris Premio", "Ringkasan kompetisi divisi Premio.", "Gunakan kartu kalender, hasil, klasemen, dan statistik untuk membuka data divisi."),
  "caleris-zwei": guide("Caleris Zwei", "Ringkasan kompetisi divisi Zwei.", "Gunakan kartu kalender, hasil, klasemen, dan statistik untuk membuka data divisi."),
  "transfer-market": guides["/main-event/transfer-market"],
  "fia-announcement": guide("FIA Announcement", "Baca pengumuman resmi yang diterbitkan FIA.", "Pilih pengumuman untuk membaca detail dan konteksnya."),
  "job-search": guides["/main-event/job-search"],
  "take-over": guides["/main-event/take-over"],
  "circuit-pool": guides["/main-event/circuit-pool"],
  regulation: guides["/rules"],
  newsroom: guide("Caleris Newsroom", "Pusat berita resmi, hasil balapan, dan perkembangan paddock.", "Pilih artikel untuk membaca informasi dan pembaruan lengkap."),
  "hall-of-fame": guide("Hall of Fame", "Arsip juara dan pencapaian resmi CALERIS MASTERS.", "Gunakan daftar season dan kategori untuk menelusuri pencapaian."),
  archive: guide("Season Archive", "Jelajahi arsip klasemen dan hasil resmi seluruh season.", "Pilih season dan divisi untuk melihat standings serta hasil yang tersimpan."),
  "daily-checkin": guides["/race-checkin"],
  character: guide("Character", "Lihat identitas karakter Driver, lisensi, tim, dan kontrak.", "Periksa status kontrak dan informasi karakter yang terhubung ke akun."),
  development: guide("Development", "Tingkatkan atribut Driver atau mobil menggunakan token Development yang tersedia.", "Preview memperlihatkan nilai atribut dan kebutuhan token.", "Upgrade memvalidasi saldo token serta batas maksimum atribut sebelum menyimpan.", "Riwayat Development menampilkan catatan peningkatan."),
  "contract-renewals": guide("Contract Renewal", "Tinjau atau kirim penawaran perpanjangan kontrak Driver.", "Periksa season, durasi, gaji, dan ketentuan penawaran.", "Driver memutuskan menerima atau menolak; Owner memantau respons."),
  "driver-contracts": guide("Driver Contracts", "Lihat kontrak Driver yang sudah disepakati dan riwayat pembagian payroll tim.", "Pemilih Tim hanya dapat diubah Admin; Team Owner otomatis melihat tim miliknya. Filter Season mempersempit kontrak yang ditampilkan.", "Kontrak Driver menampilkan lisensi, season, gaji tahunan yang terkunci, rentang band lisensi resmi, dan status kontrak seperti menunggu registrasi FIA, aktif, suspended, atau ended.", "Riwayat pembagian gaji menampilkan Driver, season, persentase kontribusi tim, nominal, status pembayaran, dan tanggal pembayaran. Tombol Refresh memuat ulang data."),
  "driver-registration": guide("Driver Registration", "Kirim roster Driver yang sudah memiliki kontrak ke FIA untuk validasi season dan kelola lamaran kandidat Driver ke tim.", "Pilih season aktif atau draft untuk melihat kontrak yang memenuhi syarat registrasi.", "Daftar roster menampilkan Driver, lisensi, gaji per season, status kontrak, dan status registrasi FIA. Tombol Daftarkan ke FIA mengirim Driver yang eligible ke roster season.", "Bagian Driver Applications menampilkan lamaran kandidat dari formulir Main Event, termasuk identitas, preferensi nomor, julukan, dan tanggal pengajuan. Refresh memuat ulang roster dan lamaran."),
  "appeal-room": guide("FIA Appeal Room", "Tinjau pengajuan banding member atas sanksi dan denda FIA.", "Daftar perkara menampilkan pengajuan banding, waktu pengajuan, status, dan informasi perkara terkait.", "Buka detail untuk meninjau alasan dan bukti, lalu catat keputusan sesuai regulasi. Data denda terkait membantu memeriksa sanksi yang sedang diajukan banding."),
  training: guide("Training", "Jalankan program latihan atribut Driver sesuai jadwal dan cooldown.", "Pilih program dan tingkat kesulitan yang tersedia.", "Periksa biaya, hasil, dan cooldown sebelum memulai sesi."),
  quest: guide("Quest", "Selesaikan Daily Quest dan Period Quest untuk memperoleh reward sesuai role.", "Periksa target, progres, periode, dan status klaim.", "Reward yang memerlukan claim masuk setelah klaim berhasil diproses."),
  "career-history": guide("Career History", "Lihat rekam jejak karier, statistik, dan pencapaian kompetisi.", "Gunakan ringkasan dan arsip season untuk menelusuri hasil resmi."),
  "financial-centre": guides["/financial-centre"],
  appeal: guide("Appeal", "Ajukan atau pantau banding atas sanksi FIA.", "Pilih perkara dan sampaikan alasan serta informasi pendukung.", "Pantau status sampai keputusan FIA tercatat."),
  "team-summary": guide("Team Summary", "Ringkasan profil, roster Driver, dan statistik tim.", "Periksa identitas tim, susunan Driver, divisi, dan performa."),
  "custom-livery": guide("Custom Team Livery", "Atur tampilan visual mobil tim melalui editor livery.", "Pilih warna, pola, nomor mobil, sponsor, dan logo pada area UV.", "Periksa preview sebelum menyimpan livery."),
  "team-hq": guide("Team HQ", "Kelola fasilitas dan aset headquarters yang memengaruhi operasional tim.", "Periksa fasilitas, level, maintenance, biaya, dan efek.", "Upgrade mengikuti biaya dan prasyarat yang ditampilkan."),
  "command-center": guide("Owner Command Center", "Pusat kendali Owner untuk operasi, keuangan, performa, dan sponsorship.", "Gunakan ringkasan untuk melihat status tim.", "Buka modul terkait untuk menindaklanjuti kebutuhan operasional."),
  "budget-guard": guide("Budget Guard", "Rencanakan budget dan pantau peringatan pengeluaran tim.", "Bandingkan saldo, komitmen, dan rencana biaya.", "Gunakan peringatan untuk meninjau pengeluaran sebelum keputusan."),
  "roadmap-suggestions": guide("Driver Roadmap Suggestions", "Berikan rekomendasi target pengembangan kepada Driver.", "Pilih Driver dan susun saran atribut atau target.", "Keputusan akhir pengembangan tetap berada pada Driver."),
  sponsorship: guide("Sponsorship", "Kelola sponsor aktif, tawaran, target, dan pemenuhan kontrak tim.", "Periksa tier sponsor, nilai kontrak, target, dan masa berlaku.", "Negosiasi dan pemutusan kontrak mengikuti batas penawaran serta penalti."),
  scout: guide("Scout", "Cari dan pantau kandidat Driver untuk kebutuhan roster tim.", "Gunakan pencarian dan filter untuk menemukan kandidat.", "Periksa profil, lisensi, dan status kontrak sebelum menghubungi kandidat."),
  "place-job-advert": guide("Place Job Advert", "Publikasikan lowongan kursi Driver untuk tim.", "Lengkapi posisi, persyaratan, dan deskripsi lowongan.", "Periksa preview sebelum iklan dipublikasikan."),
  "affiliate-team": guide("Affiliate Team", "Kelola permintaan dan perjanjian afiliasi antartim.", "Periksa tim mitra, status permintaan, dan ketentuan afiliasi.", "Konfirmasi atau tanggapi permintaan sesuai kewenangan Owner."),
  "engine-market": guide("Engine Market", "Kelola listing engine dan hak penggunaan engine tim.", "Periksa spesifikasi, harga, dan status listing.", "Pembelian penggunaan engine membuat kontrak sesuai season aktif."),
  "event-control": guides["/fia-panel/event-control"],
  "license-engine": guide("FIA License Engine", "Kelola struktur lisensi, season, divisi, dan konfigurasi scoring resmi.", "Periksa season dan divisi aktif sebelum mengubah aturan.", "Validasi aturan scoring dan dampaknya pada standings sebelum publikasi."),
  "rules-input": guide("Rules Input", "Kelola regulasi global dan aturan khusus divisi.", "Pilih cakupan regulasi dan edit ketentuan yang relevan.", "Periksa draft dan publikasi sebelum aturan diberlakukan."),
  "season-calendar": guides["/fia-panel/season-calendar"],
  "announcement-input": guide("Announcement Input", "Susun dan publikasikan pengumuman resmi FIA.", "Lengkapi judul, isi, dan target publikasi.", "Periksa preview sebelum menerbitkan pengumuman."),
  "discord-broadcast": guide("Discord Broadcast", "Kirim pengumuman resmi ke kanal komunitas Discord.", "Periksa isi pesan dan tujuan broadcast.", "Kirim setelah memastikan konten dan kanal sudah benar."),
  "race-input": guides["/fia-panel/race-input"],
  "punishment-input": guides["/fia-panel/punishment-input"],
  "circuit-pool-input": guides["/fia-panel/circuit-pool-input"],
  "team-hq-config": guide("Team HQ Configuration", "Atur fasilitas, biaya, durasi, maintenance, efek, dan unlock Team HQ.", "Periksa level dan prasyarat tiap fasilitas.", "Validasi biaya dan efek sebelum menyimpan konfigurasi."),
};

const adminGuides: Record<string, CalePageGuide> = {
  configuration: guides["/admin/configuration"],
  prizepool: guides["/admin/prizepool"],
  "license-engine": guides["/admin/license-engine"],
  "economy-engine": guides["/admin/economy-engine"],
  adjustments: guides["/admin/adjustments"],
  "data-adjustments": guides["/admin/data-adjustments"],
  "quest-engine": guides["/admin/quest-engine"],
  pricing: guides["/admin/pricing"],
  operations: guides["/admin/operations"],
  "operations-intelligence": guides["/admin/operations-intelligence"],
  "race-engine-lab": guides["/admin/race-engine-lab"],
  "live-race": guides["/admin/live-race"],
  "brand-ecosystem": guides["/admin/brand-ecosystem"],
  sponsorship: guides["/admin/sponsorship"],
  "test-personas": guides["/admin/test-personas"],
  "team-inactivity": guides["/admin/team-inactivity"],
  "developer-api": guides["/admin/developer-api"],
  "registered-members": guides["/admin/registered-members"],
  users: guides["/admin/users"],
};

export function resolveCalePageGuide(pathname: string): CalePageGuide {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const exact = guides[normalized];
  if (exact) return exact;

  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] === "main-event") {
    const slug = parts[1] || "global";
    if (parts.length > 2) {
      const nested = panelGuides[parts[2]] ?? guide(
        parts[2].replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        "Halaman rincian kompetisi untuk data dan aktivitas yang dipilih.",
        "Periksa informasi, filter, dan detail yang tersedia pada halaman ini.",
        "Gunakan tindakan yang tersedia setelah memastikan season, divisi, dan target sudah benar.",
      );
      return nested;
    }
    return panelGuides[slug] ?? guide("Main Event", "Pusat halaman kompetisi dan informasi publik CALERIS MASTERS.", "Pilih kartu atau tab untuk membuka informasi dan aktivitas terkait.");
  }

  if (parts[0] === "driver-panel" || parts[0] === "team-panel" || parts[0] === "fia-panel") {
    const slug = parts[1] || "";
    return panelGuides[slug] ?? guide(
      slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Panel",
      "Halaman kerja untuk mengelola informasi dan aktivitas sesuai role panel.",
      "Periksa ringkasan, data, dan kontrol yang tersedia.",
      "Perubahan hanya dapat dilakukan jika role dan validasi server mengizinkan.",
    );
  }

  if (parts[0] === "admin") {
    const slug = parts[1] || "";
    return adminGuides[slug] ?? guide(
      "Admin " + (slug || "Control"),
      "Halaman administrasi untuk mengelola konfigurasi atau memantau proses CALERIS MASTERS.",
      "Periksa ringkasan dan data yang ditampilkan.", 
      "Gunakan kontrol sesuai hak akses dan periksa audit sebelum menyimpan perubahan.",
    );
  }

  if (parts[0] === "member" || parts[0] === "member-id") {
    return guide("Member Profile", "Lihat profil publik, identitas karakter, role, lisensi, dan tim member.", "Informasi yang ditampilkan mengikuti pengaturan privasi pemilik profil.", "Gunakan tautan tim atau member untuk membuka profil publik terkait.");
  }
  if (parts[0] === "team") {
    return guide("Team Profile", "Lihat profil publik tim, identitas, roster, dan informasi kompetisi yang tersedia.", "Periksa susunan Driver dan informasi divisi.", "Data sensitif dan informasi internal tidak ditampilkan pada profil publik.");
  }
  if (parts[0] === "quests") return panelGuides.quest;
  if (parts[0] === "race-checkin") return guides["/race-checkin"];

  return guide("CALERIS MASTERS", "Halaman ini menampilkan informasi dan fitur sesuai alamat yang sedang dibuka.", "Gunakan navigasi utama untuk menemukan modul terkait.", "Akses dan tindakan mengikuti role akun serta validasi server.");
}
