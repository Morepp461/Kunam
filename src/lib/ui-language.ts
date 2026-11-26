export type UiLanguage = "id" | "en";

const EN_TO_ID: Record<string,string> = {
 "Account Settings":"Pengaturan Akun","Account preferences":"Preferensi akun","App language":"Bahasa aplikasi","My Profile":"Profil Saya",
 "Public Profile":"Profil Publik","Driver Profile":"Profil Pembalap","Profile":"Profil","Dashboard":"Dasbor","Home":"Beranda",
 "Settings":"Pengaturan","Account":"Akun","First name":"Nama depan","Last name":"Nama belakang","Web nickname":"Nama panggilan web",
 "Driver nickname":"Nama panggilan pembalap","Hometown":"Kota asal","Nationality":"Kebangsaan","License":"Lisensi",
 "Optional":"Opsional","Required":"Wajib","Save changes":"Simpan perubahan","Save":"Simpan","Cancel":"Batal","Close":"Tutup",
 "Delete":"Hapus","Update":"Perbarui","Refresh":"Segarkan","Upload":"Unggah","Choose photo":"Pilih foto","Profile photo":"Foto profil",
 "Display mode":"Mode tampilan","Light mode":"Mode terang","Dark mode":"Mode gelap","Transfer Market":"Bursa Transfer",
 "Transfer Market Directory":"Direktori Bursa Transfer","Market Value":"Nilai Pasar","Base Value":"Nilai Dasar",
 "Driver Market Value":"Nilai Pasar Pembalap","Team HQ":"Markas Tim","Team Management":"Manajemen Tim","Facilities":"Fasilitas",
 "Facility Directory":"Daftar Fasilitas","Active project":"Proyek aktif","Upgrade Facility":"Tingkatkan fasilitas",
 "Transfer Window":"Jendela Transfer","Permanent Transfer":"Transfer Permanen","Driver Loan":"Peminjaman Pembalap",
 "Free Agent":"Pembalap Bebas","Free Agent Contract Desk":"Meja Kontrak Pembalap Bebas","Driver Recruitment":"Rekrutmen Pembalap",
 "Recruit Driver":"Rekrut Pembalap","Recruit":"Rekrut","All licenses":"Semua lisensi","All nationalities":"Semua kebangsaan",
 "All countries":"Semua negara","All teams":"Semua tim","All drivers":"Semua pembalap","Search":"Cari","Search drivers...":"Cari pembalap...",
 "Search driver / public":"Cari pembalap / publik","Select":"Pilih","Team Owner":"Pemilik Tim","Driver":"Pembalap","Team":"Tim",
 "Owner":"Pemilik","Member":"Anggota","Members":"Anggota","Character":"Karakter","Division":"Divisi","Season":"Musim",
 "Race":"Balapan","Round":"Putaran","Points":"Poin","Leaderboard":"Klasemen","Standings":"Klasemen","Statistics":"Statistik",
 "Performance":"Performa","Achievement":"Pencapaian","Reputation":"Reputasi","Activity":"Aktivitas","Contract":"Kontrak",
 "Skill":"Kemampuan","License Score":"Skor Lisensi","Tier Multiplier":"Pengali Tier","Growth Factor":"Faktor Pertumbuhan",
 "Salary":"Gaji","Annual salary":"Gaji tahunan","Latest annual salary":"Gaji tahunan terbaru","Offer date":"Tanggal penawaran",
 "Accept salary":"Terima penawaran gaji","Counter-offer":"Penawaran balasan","Reject":"Tolak","Offer":"Penawaran",
 "Submit offer":"Kirim penawaran","Contract duration":"Durasi kontrak","Current team":"Tim saat ini","Current division":"Divisi saat ini",
 "Notifications":"Notifikasi","Notification":"Notifikasi","Delete all notifications":"Hapus semua notifikasi",
 "Mark as read":"Tandai sudah dibaca","Mark all as read":"Tandai semua sudah dibaca","No notifications yet.":"Belum ada notifikasi.",
 "Loading notifications...":"Memuat notifikasi...","Loading...":"Memuat...","Loading":"Memuat","No data available":"Data belum tersedia",
 "Digital ID":"ID Digital","Verified Member":"Anggota Terverifikasi","Member ID":"ID Anggota","Account Progression":"Progres Akun",
 "Account Level":"Level Akun","Cumulative XP":"Total XP","Milestones":"Tonggak pencapaian","Achievements":"Pencapaian",
 "Completed":"Selesai","Official Rules":"Peraturan Resmi","Support Center":"Pusat Bantuan","Team Profile":"Profil Tim",
 "Public identity card and earned achievements.":"Kartu identitas publik dan pencapaian yang diraih.",
 "REGISTERED DRIVER":"PEMBALAP TERDAFTAR","BASE VALUE · TIER 1":"NILAI DASAR · TIER 1","LOCKED ENGINE MODEL":"MODEL ENGINE TERKUNCI",
 "LICENSE SCORE":"SKOR LISENSI","DRIVER PROFILE":"PROFIL PEMBALAP","DRIVER RECRUITMENT":"REKRUTMEN PEMBALAP",
 "GLOBAL DRIVER & PUBLIC DIRECTORY":"DIREKTORI PEMBALAP & PUBLIK","FREE AGENT CONTRACT DESK":"MEJA KONTRAK PEMBALAP BEBAS",
 "TRANSFER WINDOW":"JENDELA TRANSFER","NEGOTIATION DESK":"MEJA NEGOSIASI","PRE-CONTRACT DESK":"MEJA PRE-KONTRAK",
 "Team Summary":"Ringkasan Tim","Driver List":"Daftar Pembalap","Team List":"Daftar Tim","Driver Exhibition":"Pameran Pembalap",
 "Account information":"Informasi akun","Character information":"Informasi karakter","Public information":"Informasi publik",
 "Profile information":"Informasi profil","Driver details":"Detail pembalap","Public identity":"Identitas publik",
 "Contract details":"Detail kontrak","No active contract":"Belum ada kontrak aktif","Not available":"Belum tersedia",
 "No public achievements available.":"Belum ada pencapaian publik.","Recalculate all Drivers":"Hitung ulang semua Pembalap",
 "Refresh snapshot":"Perbarui snapshot","English":"English","Indonesian":"Bahasa Indonesia","Privacy Policy":"Kebijakan Privasi",
 "Terms and Conditions":"Syarat dan Ketentuan","Select country / nationality":"Pilih negara / kebangsaan",
 "Loading countries...":"Memuat negara...","Select a nationality first":"Pilih kebangsaan terlebih dahulu","Loading cities...":"Memuat kota...",
 "Server date":"Tanggal server","Independent":"Tanpa Tim","Under Contract":"Terikat Kontrak","Transfer List":"Daftar Transfer","Loan List":"Daftar Peminjaman",
 "Overview":"Ringkasan","Season Overview":"Ringkasan Musim","Team Overview":"Ringkasan Tim","Driver Overview":"Ringkasan Pembalap",
 "Official Championship Standings":"Klasemen Kejuaraan Resmi","Driver Ranking":"Peringkat Pembalap","Team Ranking":"Peringkat Tim",
 "Engine Ranking":"Peringkat Mesin","Rookie of the Season":"Pendatang Baru Terbaik Musim Ini","Race Results":"Hasil Balapan",
 "Race Schedule":"Jadwal Balapan","Race Calendar":"Kalender Balapan","Upcoming Events":"Acara Mendatang","Completed Events":"Acara Selesai",
 "Event Details":"Detail Acara","Join Community":"Gabung Komunitas","Contact Us":"Hubungi Kami",
 "Frequently Asked Questions":"Pertanyaan yang Sering Diajukan","Help Center":"Pusat Bantuan","Documentation":"Dokumentasi",
 "Regulations":"Regulasi","View Details":"Lihat Detail","View Profile":"Lihat Profil","View All":"Lihat Semua",
 "Show More":"Tampilkan Lebih Banyak","Show Less":"Tampilkan Lebih Sedikit","Read More":"Baca Selengkapnya",
 "Learn More":"Pelajari Lebih Lanjut","Back to Dashboard":"Kembali ke Dasbor","Go to Dashboard":"Buka Dasbor",
 "Access Denied":"Akses Ditolak","Permission Denied":"Izin Ditolak","Page Not Found":"Halaman Tidak Ditemukan",
 "Something went wrong":"Terjadi kesalahan","Please try again":"Silakan coba lagi","Failed to load":"Gagal memuat",
 "Failed to save":"Gagal menyimpan","Processing...":"Memproses...","Saving...":"Menyimpan...","Submitting...":"Mengirim...",
 "Are you sure?":"Apakah kamu yakin?","Confirm action":"Konfirmasi tindakan","Available":"Tersedia","Unavailable":"Tidak tersedia",
 "Active":"Aktif","Inactive":"Tidak aktif","Pending":"Menunggu","Approved":"Disetujui","Rejected":"Ditolak","Expired":"Kedaluwarsa",
 "Cancelled":"Dibatalkan","Failed":"Gagal","Success":"Berhasil","Error":"Kesalahan","Warning":"Peringatan","Information":"Informasi",
 "Status":"Status","Date":"Tanggal","Time":"Waktu","Name":"Nama","Role":"Peran","Type":"Jenis","Category":"Kategori",
 "Description":"Deskripsi","Details":"Detail","History":"Riwayat","Action":"Tindakan","Actions":"Tindakan","Price":"Harga",
 "Amount":"Jumlah","Cost":"Biaya","Duration":"Durasi","Level":"Level","Current":"Saat ini","Total":"Total","Balance":"Saldo",
 "Wallet":"Dompet","Shop":"Toko","Quest":"Misi","Daily Quest":"Misi Harian","Period Quest":"Misi Periode","Reward":"Hadiah",
 "Claim Reward":"Klaim Hadiah","Development":"Pengembangan","Development Tokens":"Token Pengembangan","Upgrade Part":"Tingkatkan Komponen",
 "Engine":"Mesin","Aero":"Aerodinamika","Reliability":"Keandalan","Strategy":"Strategi","Morale":"Moral","Fans":"Penggemar",
 "Payroll":"Penggajian","Transfer Fee":"Biaya Transfer","Wealth Tax":"Pajak Kekayaan","Currency":"Mata Uang",
 "Token Development":"Token Pengembangan","Driver Development":"Pengembangan Pembalap","Team Development":"Pengembangan Tim",
 "Check-in":"Check-in","Check-in Reminder":"Pengingat Check-in","Race Result":"Hasil Balapan","Push Notification":"Notifikasi Push",
 "Theme":"Tema","Language":"Bahasa","Public":"Publik","Private":"Privat","Verified":"Terverifikasi","Drivers":"Pembalap",
 "Teams":"Tim","Negotiation":"Negosiasi","Counter Offer":"Penawaran Balasan","Pre-contract":"Pre-kontrak","Principal":"Principal",
 "Agent":"Agen","Journalist":"Jurnalis","Main Event":"Acara Utama","Paddock Access":"Akses Paddock","Current Season":"Musim Berjalan",
 "Active Season":"Musim Aktif","Previous Season":"Musim Sebelumnya","Next Season":"Musim Berikutnya","Race Period":"Periode Balapan",
 "Break Period":"Periode Jeda","End Season":"Akhir Musim","Off Season":"Musim Jeda","Prize":"Hadiah","Purchase":"Pembelian",
 "Buy":"Beli","Sell":"Jual","Sponsor":"Sponsor","Sponsorship":"Sponsorship","Interest":"Bunga","Euro":"Euro","Caleris Pound":"Caleris Pound","Search...":"Cari...","Select...":"Pilih...","Type to search...":"Ketik untuk mencari...",
 "No active projects":"Tidak ada proyek aktif","No active contracts":"Tidak ada kontrak aktif","No pending offers":"Tidak ada penawaran tertunda",
 "No results found":"Hasil tidak ditemukan","No drivers found":"Pembalap tidak ditemukan","No teams found":"Tim tidak ditemukan" 
};

const ID_TO_EN: Record<string,string> = {
 "Pengaturan Akun":"Account Settings","Preferensi akun":"Account preferences","Bahasa aplikasi":"App language","Bahasa Indonesia":"Indonesian",
 "Profil Saya":"My Profile","Profil Publik":"Public Profile","Profil Pembalap":"Driver Profile","Profil":"Profile","Dasbor":"Dashboard",
 "Beranda":"Home","Pengaturan":"Settings","Akun":"Account","Nama depan":"First name","Nama belakang":"Last name",
 "Nama panggilan web":"Web nickname","Nama panggilan pembalap":"Driver nickname","Kota asal":"Hometown","Kebangsaan":"Nationality",
 "Lisensi":"License","Opsional":"Optional","Wajib":"Required","Simpan perubahan":"Save changes","Simpan":"Save","Batal":"Cancel",
 "Tutup":"Close","Hapus":"Delete","Perbarui":"Update","Segarkan":"Refresh","Unggah":"Upload","Pilih foto":"Choose photo",
 "Foto profil":"Profile photo","Mode tampilan":"Display mode","Mode terang":"Light mode","Mode gelap":"Dark mode",
 "Bursa Transfer":"Transfer Market","Direktori Bursa Transfer":"Transfer Market Directory","Nilai Pasar":"Market Value",
 "Nilai Dasar":"Base Value","Nilai Pasar Pembalap":"Driver Market Value","Markas Tim":"Team HQ","Manajemen Tim":"Team Management",
 "Fasilitas":"Facilities","Daftar Fasilitas":"Facility Directory","Proyek aktif":"Active project","Tingkatkan fasilitas":"Upgrade Facility",
 "Jendela Transfer":"Transfer Window","Transfer Permanen":"Permanent Transfer","Peminjaman Pembalap":"Driver Loan",
 "Pembalap Bebas":"Free Agent","Meja Kontrak Pembalap Bebas":"Free Agent Contract Desk","Rekrutmen Pembalap":"Driver Recruitment",
 "Rekrut Pembalap":"Recruit Driver","Rekrut":"Recruit","Semua lisensi":"All licenses","Semua kebangsaan":"All nationalities",
 "Semua negara":"All countries","Semua tim":"All teams","Semua pembalap":"All drivers","Cari":"Search","Cari pembalap...":"Search drivers...",
 "Cari pembalap / publik":"Search driver / public","Pemilik Tim":"Team Owner","Pembalap":"Driver","Tim":"Team","Pemilik":"Owner",
 "Anggota":"Member","Karakter":"Character","Divisi":"Division","Musim":"Season","Balapan":"Race","Putaran":"Round","Poin":"Points",
 "Klasemen":"Leaderboard","Statistik":"Statistics","Performa":"Performance","Reputasi":"Reputation",
 "Aktivitas":"Activity","Kontrak":"Contract","Kemampuan":"Skill","Skor Lisensi":"License Score","Pengali Tier":"Tier Multiplier",
 "Faktor Pertumbuhan":"Growth Factor","Gaji":"Salary","Gaji tahunan":"Annual salary","Gaji tahunan terbaru":"Latest annual salary",
 "Tanggal penawaran":"Offer date","Terima penawaran gaji":"Accept salary","Penawaran balasan":"Counter-offer","Tolak":"Reject",
 "Penawaran":"Offer","Kirim penawaran":"Submit offer","Durasi kontrak":"Contract duration","Tim saat ini":"Current team",
 "Divisi saat ini":"Current division","Notifikasi":"Notifications","Hapus semua notifikasi":"Delete all notifications",
 "Tandai sudah dibaca":"Mark as read","Tandai semua sudah dibaca":"Mark all as read","Belum ada notifikasi.":"No notifications yet.",
 "Memuat notifikasi...":"Loading notifications...","Memuat...":"Loading...","Memuat":"Loading","Data belum tersedia":"No data available",
 "ID Digital":"Digital ID","Anggota Terverifikasi":"Verified Member","ID Anggota":"Member ID","Progres Akun":"Account Progression",
 "Level Akun":"Account Level","Total XP":"Cumulative XP","Tonggak pencapaian":"Milestones","Pencapaian":"Achievements","Selesai":"Completed",
 "Peraturan Resmi":"Official Rules","Pusat Bantuan":"Support Center","Profil Tim":"Team Profile",
 "Kartu identitas publik dan pencapaian yang diraih.":"Public identity card and earned achievements.",
 "PEMBALAP TERDAFTAR":"REGISTERED DRIVER","NILAI DASAR · TIER 1":"BASE VALUE · TIER 1","MODEL ENGINE TERKUNCI":"LOCKED ENGINE MODEL",
 "SKOR LISENSI":"LICENSE SCORE","PROFIL PEMBALAP":"DRIVER PROFILE","REKRUTMEN PEMBALAP":"DRIVER RECRUITMENT",
 "DIREKTORI PEMBALAP & PUBLIK":"GLOBAL DRIVER & PUBLIC DIRECTORY","MEJA KONTRAK PEMBALAP BEBAS":"FREE AGENT CONTRACT DESK",
 "JENDELA TRANSFER":"TRANSFER WINDOW","MEJA NEGOSIASI":"NEGOTIATION DESK","MEJA PRE-KONTRAK":"PRE-CONTRACT DESK",
 "Ringkasan Tim":"Team Summary","Daftar Pembalap":"Driver List","Daftar Tim":"Team List","Pameran Pembalap":"Driver Exhibition",
 "Informasi akun":"Account information","Informasi karakter":"Character information","Informasi publik":"Public information",
 "Informasi profil":"Profile information","Detail pembalap":"Driver details","Identitas publik":"Public identity",
 "Detail kontrak":"Contract details","Belum ada kontrak aktif":"No active contract","Belum tersedia":"Not available",
 "Belum ada pencapaian publik.":"No public achievements available.","Hitung ulang semua Pembalap":"Recalculate all Drivers",
 "Perbarui snapshot":"Refresh snapshot","Kebijakan Privasi":"Privacy Policy","Syarat dan Ketentuan":"Terms and Conditions",
 "Tanggal server":"Server date","Tanpa Tim":"Independent","Terikat Kontrak":"Under Contract","Daftar Transfer":"Transfer List",
 "Daftar Peminjaman":"Loan List","Pilih negara / kebangsaan":"Select country / nationality","Memuat negara...":"Loading countries...",
 "Pilih kebangsaan terlebih dahulu":"Select a nationality first","Memuat kota...":"Loading cities...",
 "Ringkasan":"Overview","Ringkasan Musim":"Season Overview","Ringkasan Pembalap":"Driver Overview",
 "Klasemen Kejuaraan Resmi":"Official Championship Standings","Peringkat Pembalap":"Driver Ranking","Peringkat Tim":"Team Ranking",
 "Peringkat Mesin":"Engine Ranking","Pendatang Baru Terbaik Musim Ini":"Rookie of the Season","Hasil Balapan":"Race Results",
 "Jadwal Balapan":"Race Schedule","Kalender Balapan":"Race Calendar","Acara Mendatang":"Upcoming Events","Acara Selesai":"Completed Events",
 "Detail Acara":"Event Details","Gabung Komunitas":"Join Community","Hubungi Kami":"Contact Us",
 "Pertanyaan yang Sering Diajukan":"Frequently Asked Questions","Dokumentasi":"Documentation","Regulasi":"Regulations",
 "Lihat Detail":"View Details","Lihat Profil":"View Profile","Lihat Semua":"View All","Tampilkan Lebih Banyak":"Show More",
 "Tampilkan Lebih Sedikit":"Show Less","Baca Selengkapnya":"Read More","Pelajari Lebih Lanjut":"Learn More",
 "Kembali ke Dasbor":"Back to Dashboard","Buka Dasbor":"Go to Dashboard","Akses Ditolak":"Access Denied",
 "Izin Ditolak":"Permission Denied","Halaman Tidak Ditemukan":"Page Not Found","Terjadi kesalahan":"Something went wrong",
 "Silakan coba lagi":"Please try again","Gagal memuat":"Failed to load","Gagal menyimpan":"Failed to save","Memproses...":"Processing...",
 "Menyimpan...":"Saving...","Mengirim...":"Submitting...","Apakah kamu yakin?":"Are you sure?","Konfirmasi tindakan":"Confirm action",
 "Tersedia":"Available","Tidak tersedia":"Unavailable","Aktif":"Active","Tidak aktif":"Inactive","Menunggu":"Pending",
 "Disetujui":"Approved","Ditolak":"Rejected","Kedaluwarsa":"Expired","Dibatalkan":"Cancelled","Gagal":"Failed","Berhasil":"Success",
 "Kesalahan":"Error","Peringatan":"Warning","Informasi":"Information","Tanggal":"Date","Waktu":"Time","Nama":"Name","Peran":"Role",
 "Jenis":"Type","Kategori":"Category","Deskripsi":"Description","Detail":"Details","Riwayat":"History","Tindakan":"Action",
 "Harga":"Price","Jumlah":"Amount","Biaya":"Cost","Durasi":"Duration","Saldo":"Balance","Dompet":"Wallet","Toko":"Shop",
 "Misi":"Quest","Misi Harian":"Daily Quest","Misi Periode":"Period Quest","Hadiah":"Reward","Klaim Hadiah":"Claim Reward",
 "Pengembangan":"Development","Token Pengembangan":"Development Tokens","Tingkatkan Komponen":"Upgrade Part","Mesin":"Engine",
 "Aerodinamika":"Aero","Keandalan":"Reliability","Strategi":"Strategy","Moral":"Morale","Penggemar":"Fans","Penggajian":"Payroll",
 "Biaya Transfer":"Transfer Fee","Pajak Kekayaan":"Wealth Tax","Mata Uang":"Currency","Pengembangan Pembalap":"Driver Development",
 "Pengembangan Tim":"Team Development","Pengingat Check-in":"Check-in Reminder","Notifikasi Push":"Push Notification","Tema":"Theme",
 "Bahasa":"Language","Publik":"Public","Privat":"Private","Terverifikasi":"Verified","Negosiasi":"Negotiation",
 "Penawaran Balasan":"Counter Offer","Pre-kontrak":"Pre-contract","Agen":"Agent","Jurnalis":"Journalist","Acara Utama":"Main Event",
 "Akses Paddock":"Paddock Access","Musim Berjalan":"Current Season","Musim Aktif":"Active Season","Musim Sebelumnya":"Previous Season",
 "Musim Berikutnya":"Next Season","Periode Balapan":"Race Period","Periode Jeda":"Break Period","Akhir Musim":"End Season",
 "Musim Jeda":"Off Season","Pembelian":"Purchase","Beli":"Buy","Jual":"Sell","Bunga":"Interest",
 "Belum dihitung":"Not calculated","Catatan":"Notes","Rentang lisensi:":"License range:",
 "Gaji tahunan (€)":"Annual salary (€)","Market Value gagal dimuat":"Market Value failed to load",
 "Reputasi gagal dimuat":"Reputation failed to load",
 "Pilihan ini diterapkan ke antarmuka CALERIS MASTERS. Halaman About Us tetap berbahasa Inggris.":"This preference is applied to the CALERIS MASTERS interface. The About Us page remains in English.",
 "Hanya Team Owner dengan roster kurang dari dua Driver yang dapat merekrut Free Agent.":"Only the Team Owner can recruit a Free Agent when the roster has fewer than two Drivers.",
 "Negosiasi gaji langsung dengan Driver. Tidak ada transfer fee; roster baru aktif setelah kesepakatan dan registrasi FIA.":"Negotiate salary directly with the Driver. There is no transfer fee; the new roster becomes active after agreement and FIA registration.",
 "Penawaran kontrak dikirim kepada Free Agent. Driver belum masuk roster tim sampai kesepakatan dan registrasi FIA selesai.":"The contract offer has been sent to the Free Agent. The Driver will not join the team roster until the agreement and FIA registration are complete.",
 "Transfer Window hanya terbuka pada End Season dan Off Season.":"The Transfer Window is only open during End Season and Off Season.",
 "Permanent Transfer dan Driver Loan harus melalui persetujuan FIA.":"Permanent Transfer and Driver Loan require FIA approval."
};

const EXTRA_EN_TO_ID: Record<string,string> = {
 "Tier":"Tingkat","Edit":"Ubah","/ season":"/ musim","records":"catatan","Season ·":"Musim ·","Pilih season":"Pilih musim",
 "Pilih Driver":"Pilih Pembalap","← Dashboard":"← Dasbor","Pilih team":"Pilih tim","TEAM REPUTATION":"REPUTASI TIM",
 "active contracts":"kontrak aktif","Team Wallet":"Dompet Tim","points ·":"poin ·","Race Check-in":"Check-in Balapan",
 "HQ effect · level 0–":"Dampak Markas · level 0–","Open":"Buka","Season berikutnya":"Musim berikutnya",
 "Wallet mismatch":"Ketidaksesuaian saldo dompet","Daily reward":"Hadiah harian","masih pending":"masih tertunda",
 "race round ·":"putaran balapan ·","Team Valuation":"Valuasi Tim","Driver Number":"Nomor Pembalap",
 "Team Brand Identity":"Identitas Merek Tim","Nickname web":"Nama panggilan web","Nickname driver":"Nama panggilan pembalap",
 "CALERIS MASTERS · MEMBER REGISTRATION":"CALERIS MASTERS · PENDAFTARAN ANGGOTA","member terdaftar":"anggota terdaftar",
 "Team Reputation":"Reputasi Tim","Driver Reputation":"Reputasi Pembalap","ACTIVE CONTRACTS":"KONTRAK AKTIF",
 "per season ·":"per musim ·","season ·":"musim ·","ACTIVE DRIVERS":"PEMBALAP AKTIF","Official results":"Hasil resmi",
 "NEW APPLICATION":"PENGAJUAN BARU","Remove":"Hapus","Achievement Badges":"Lencana Pencapaian","/ token":"/ token",
 "DRIVER DIRECTORY":"DIREKTORI PEMBALAP","Latest offer":"Penawaran terbaru","OFFICIAL CLASSIFICATION":"KLASEMEN RESMI",
 "Closed round":"Putaran ditutup","15–35 PSI · test profile":"15–35 PSI · profil uji","ATTRIBUTE PROFILE":"PROFIL ATRIBUT",
 "Schedule":"Jadwal","No registered drivers":"Belum ada pembalap terdaftar","Race Pace":"Kecepatan Balap",
 "Engine Power":"Daya Mesin","Selling price (€)":"Harga jual (€)","License & Wallet Adjustments":"Penyesuaian Lisensi & Dompet",
 "LICENSE ADMINISTRATION":"ADMINISTRASI LISENSI","ECONOMY ENGINE":"MESIN EKONOMI","Wallet injection":"Penambahan saldo dompet",
 "Jenis wallet":"Jenis dompet","Pilih wallet":"Pilih dompet","ADMIN CONTROL · SYSTEM SETTINGS":"KONTROL ADMIN · PENGATURAN SISTEM",
 "Configuration Center":"Pusat Konfigurasi","CONFIGURATION LIBRARY":"PUSTAKA KONFIGURASI","Configuration":"Konfigurasi",
 "CONFIGURATION DETAIL":"DETAIL KONFIGURASI","SEASON DEVELOPMENT CONTROL":"KONTROL PENGEMBANGAN MUSIM",
 "Development Season Rollover":"Pergantian Musim Pengembangan","CALERIS MASTERS · ADMIN ENGINE":"CALERIS MASTERS · MESIN ADMIN",
 "DIVISION TIER":"TINGKAT DIVISI","CURRENT SNAPSHOT":"SNAPSHOT SAAT INI","Home Division":"Divisi Asal",
 "SYSTEM HEALTH & FINANCIAL RECONCILIATION":"KESEHATAN SISTEM & REKONSILIASI KEUANGAN","Payroll pending":"Penggajian tertunda",
 "Race check-in":"Check-in balapan","dicoba · Race check-in":"dicoba · Check-in balapan",
 "Automated Payroll Preparation":"Persiapan Penggajian Otomatis","ADMIN CONTROL · FINANCIAL CORE":"KONTROL ADMIN · INTI KEUANGAN",
 "Economy Engine":"Mesin Ekonomi","Pending Check-in":"Check-in tertunda","Active Wallets":"Dompet aktif",
 "Prize · VreeoBank":"Hadiah · VreeoBank","Check-in reward · VreeoBank":"Hadiah check-in · VreeoBank"
};
const EXTRA_ID_TO_EN: Record<string,string> = Object.fromEntries(Object.entries(EXTRA_EN_TO_ID).map(([english,indonesian])=>[indonesian,english]));
const EN_TO_ID_COMPLETE: Record<string,string> = {...EN_TO_ID,...EXTRA_EN_TO_ID};
const ID_TO_EN_COMPLETE: Record<string,string> = {...ID_TO_EN,...EXTRA_ID_TO_EN};

function preserveCase(replacement: string, source: string) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source === source.toLowerCase()) return replacement.toLowerCase();
  if (source.length && source[0] === source[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

export function translateUiText(value: string, language: UiLanguage): string {
  if (!value || !value.trim()) return value;
  const dictionary = language === "id" ? EN_TO_ID_COMPLETE : ID_TO_EN_COMPLETE;
  let result = value;
  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [source, replacement] of entries) {
    if (!source.includes(" ")) {
      const trimmed = result.trim();
      if (trimmed.toLowerCase() !== source.toLowerCase()) continue;
      const start = result.indexOf(trimmed);
      result = result.slice(0, start) + preserveCase(replacement, trimmed) + result.slice(start + trimmed.length);
      continue;
    }
    const escaped = source.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("(^|[^A-Za-z0-9])(" + escaped + ")(?=$|[^A-Za-z0-9])", "gi");
    result = result.replace(pattern, (_match, prefix: string, matched: string) => prefix + preserveCase(replacement, matched));
  }
  return result;
}
