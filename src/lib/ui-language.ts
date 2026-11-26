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
 "Server date":"Tanggal server","Independent":"Tanpa Tim","Under Contract":"Terikat Kontrak","Transfer List":"Daftar Transfer","Loan List":"Daftar Peminjaman"
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
 "Pilih kebangsaan terlebih dahulu":"Select a nationality first","Memuat kota...":"Loading cities..."
};

function preserveCase(replacement: string, source: string) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source === source.toLowerCase()) return replacement.toLowerCase();
  if (source.length && source[0] === source[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

export function translateUiText(value: string, language: UiLanguage): string {
  if (!value || !value.trim()) return value;
  const dictionary = language === "id" ? EN_TO_ID : ID_TO_EN;
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
