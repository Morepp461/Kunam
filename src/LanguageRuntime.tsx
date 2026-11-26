import { useEffect, useRef } from "react";

export type CalerisLanguage = "id" | "en";

const translations: Array<[string, string]> = [
  ["Dashboard", "Dasbor"], ["Overview", "Ringkasan"], ["Community Hub", "Pusat Komunitas"],
  ["Transfer Market", "Bursa Transfer"], ["Team HQ", "Markas Tim"], ["Driver", "Pembalap"],
  ["Drivers", "Para Pembalap"], ["Free Agent", "Agen Bebas"], ["License", "Lisensi"],
  ["Nationality", "Kewarganegaraan"], ["Independent", "Independen"], ["Under Contract", "Terikat Kontrak"],
  ["Account Settings", "Pengaturan Akun"], ["English", "Bahasa Inggris"], ["My Profile", "Profil Saya"], ["Profile", "Profil"],
  ["Account", "Akun"], ["Settings", "Pengaturan"], ["Shop", "Toko"], ["Driver Recruitment", "Rekrutmen Pembalap"],
  ["Public member profile", "Profil member publik"], ["Public identity card and earned achievements.", "Kartu identitas publik dan pencapaian yang diraih."],
  ["Account Progression", "Perkembangan Akun"], ["Completed Career Milestones", "Pencapaian Karier Selesai"],
  ["Earned Achievements", "Pencapaian yang Diraih"], ["Member identity", "Identitas Member"],
  ["Account and Caleris Masters character information.", "Informasi akun dan identitas karakter Caleris Masters."],
  ["Account information", "Informasi akun"], ["Character information", "Informasi karakter"],
  ["Public information", "Informasi publik"], ["First name", "Nama depan"], ["Last name", "Nama belakang"],
  ["Web nickname", "Nickname web"], ["Driver nickname", "Nickname driver"], ["Character name", "Nama karakter"],
  ["Team", "Tim"], ["Team Owner", "Pemilik Tim"], ["Principal", "Kepala Tim"], ["Agent", "Agen"],
  ["Journalist", "Jurnalis"], ["Role", "Peran"], ["Member ID", "ID Member"], ["Profile photo", "Foto profil"],
  ["Edit account", "Edit akun"], ["Application language", "Bahasa aplikasi"], ["Indonesian", "Bahasa Indonesia"],
  ["Save changes", "Simpan perubahan"], ["Saving...", "Menyimpan..."], ["Display mode", "Mode tampilan"],
  ["This preference also applies to the landing page.", "Preferensi ini juga berlaku di landing page."],
  ["Light mode", "Mode terang"], ["Dark mode", "Mode gelap"], ["Choose photo", "Pilih foto"],
  ["Uploading...", "Mengunggah..."], ["Public profile", "Profil publik"], ["Member Profile", "Profil Member"],
  ["CALERIS MASTERS public identity.", "Identitas publik CALERIS MASTERS."], ["CALERIS MEMBER", "CALERIS MEMBER"],
  ["Public Profile", "Profil Publik"], ["CHARACTER", "KARAKTER"], ["ACCOUNT", "AKUN"],
  ["Market Value", "Nilai Pasar"], ["Recruit", "Rekrut"], ["Recruit Free Agent", "Rekrut Agen Bebas"],
  ["Approach", "Ajukan pendekatan"], ["Annual salary", "Gaji tahunan"], ["Annual salary (€)", "Gaji tahunan (€)"],
  ["Offer price", "Nilai penawaran"], ["Offer price (¢p)", "Nilai penawaran (¢p)"],
  ["Transfer Window", "Jendela Transfer"], ["OPEN", "DIBUKA"], ["CLOSED", "DITUTUP"],
  ["Transfer Market Directory", "Direktori Bursa Transfer"], ["GLOBAL DRIVER & PUBLIC DIRECTORY", "DIREKTORI PEMBALAP & MEMBER PUBLIK"],
  ["Transfer status", "Status transfer"], ["Contract remaining", "Sisa kontrak"], ["All licenses", "Semua lisensi"],
  ["All countries", "Semua negara"], ["All teams", "Semua tim"], ["No team", "Tanpa tim"],
  ["Driver attributes", "Atribut pembalap"], ["Minimum attribute", "Atribut minimum"], ["Select attribute", "Pilih atribut"],
  ["Free Agent contract negotiations", "Negosiasi kontrak Agen Bebas"], ["FREE AGENT CONTRACT DESK", "MEJA KONTRAK AGEN BEBAS"],
  ["Contract offer sent to the Free Agent.", "Penawaran kontrak dikirim kepada Agen Bebas."],
  ["Send contract offer", "Kirim penawaran kontrak"], ["Counter-offer", "Penawaran balasan"],
  ["Offer date", "Tanggal penawaran"], ["Latest annual salary", "Gaji tahunan terbaru"],
  ["Mark as read", "Tandai sudah dibaca"], ["Delete all notifications", "Hapus semua notifikasi"],
  ["Notifications", "Notifikasi"], ["Notification", "Notifikasi"], ["No notifications yet.", "Belum ada notifikasi."],
  ["Loading notifications...", "Memuat notifikasi..."], ["Open details", "Buka detail"],
  ["TEAM MANAGEMENT · HEADQUARTERS", "MANAJEMEN TIM · MARKAS BESAR"], ["FACILITY DIRECTORY", "DIREKTORI FASILITAS"],
  ["Facilities", "Fasilitas"], ["Facility Configuration", "Konfigurasi Fasilitas"],
  ["DIVISION MAX LEVEL", "LEVEL MAKSIMUM DIVISI"], ["ACTIVE PROJECT", "PROYEK AKTIF"],
  ["Upgrade facility project started. The cost has been transferred to VreeoBank.", "Proyek upgrade fasilitas berhasil dimulai. Biaya telah dipindahkan ke VreeoBank."],
  ["Back to CALERIS MASTERS", "Kembali ke CALERIS MASTERS"], ["Digital ID unavailable", "Digital ID tidak tersedia"],
  ["Verifying Digital ID...", "Memverifikasi Digital ID..."], ["Not available", "Belum tersedia"],
  ["Not assigned", "Belum ditetapkan"], ["Not calculated", "Belum dihitung"], ["No active contract", "Belum ada kontrak aktif"],
  ["Not specified", "Tidak ditentukan"], ["Home", "Beranda"], ["Cancel", "Batal"], ["Close", "Tutup"],
  ["Loading...", "Memuat..."], ["Processing...", "Memproses..."], ["Send", "Kirim"], ["Save", "Simpan"],
  ["Name", "Nama"], ["Search", "Cari"], ["Select", "Pilih"], ["Date", "Tanggal"], ["Status", "Status"],
  ["No published milestones yet.", "Belum ada milestone yang dipublikasikan."],
  ["Login session not found.", "Sesi login tidak ditemukan."], ["Supabase connection is unavailable.", "Koneksi Supabase belum tersedia."],
  ["Members", "Anggota"], ["Division", "Divisi"], ["Season", "Musim"], ["Race", "Balapan"],
  ["Round", "Putaran"], ["Schedule", "Jadwal"], ["Standings", "Klasemen"], ["Results", "Hasil"],
  ["Leaderboard", "Papan Peringkat"], ["Calendar", "Kalender"], ["Configuration", "Konfigurasi"],
  ["Manage", "Kelola"], ["Edit", "Ubah"], ["Delete", "Hapus"], ["Create", "Buat"],
  ["Active", "Aktif"], ["Inactive", "Tidak aktif"], ["Pending", "Menunggu"], ["Completed", "Selesai"],
  ["Approved", "Disetujui"], ["Rejected", "Ditolak"], ["Waiting", "Menunggu"], ["Refresh", "Muat ulang"],
  ["Export", "Ekspor"], ["Import", "Impor"], ["Download", "Unduh"], ["Upload", "Unggah"],
  ["History", "Riwayat"], ["Details", "Detail"], ["Back", "Kembali"], ["Next", "Berikutnya"],
  ["Previous", "Sebelumnya"], ["Continue", "Lanjutkan"], ["Confirm", "Konfirmasi"], ["Submit", "Kirim"],
  ["Start", "Mulai"], ["Finish", "Selesai"], ["Upgrade", "Tingkatkan"], ["Level", "Level"],
  ["Cost", "Biaya"], ["Balance", "Saldo"], ["Wallet", "Dompet"], ["Currency", "Mata uang"],
  ["Salary", "Gaji"], ["Contract", "Kontrak"], ["Negotiation", "Negosiasi"], ["Transfer", "Transfer"],
  ["Loan", "Pinjaman"], ["Sponsor", "Sponsor"], ["Sponsorship", "Sponsorship"], ["Quest", "Misi"],
  ["Daily Quest", "Misi Harian"], ["Period Quest", "Misi Periode"], ["Reward", "Hadiah"],
  ["Token", "Token"], ["Development", "Pengembangan"], ["Attribute", "Atribut"],
  ["Performance", "Performa"], ["Reputation", "Reputasi"], ["Fans", "Penggemar"],
  ["Merchandise", "Merchandise"], ["Statistics", "Statistik"], ["Analytics", "Analitik"],
  ["Reports", "Laporan"], ["Unread", "Belum dibaca"], ["Read", "Dibaca"],
  ["No data", "Tidak ada data"], ["No records", "Tidak ada catatan"], ["No results", "Tidak ada hasil"],
  ["All", "Semua"], ["Country", "Negara"], ["Public ID", "ID Publik"], ["ID Card", "Kartu Identitas"],
  ["Welcome", "Selamat datang"], ["Hello", "Halo"], ["Apply", "Terapkan"], ["Reset", "Atur ulang"],
  ["Filter", "Filter"], ["Clear", "Bersihkan"], ["Total", "Total"], ["Today", "Hari ini"],
  ["Yesterday", "Kemarin"], ["Tomorrow", "Besok"], ["Available", "Tersedia"], ["Unavailable", "Tidak tersedia"],
  ["Not found", "Tidak ditemukan"], ["Error", "Kesalahan"], ["Success", "Berhasil"], ["Warning", "Peringatan"],
  ["Information", "Informasi"], ["Contact", "Kontak"], ["Support", "Bantuan"], ["Help", "Bantuan"],
  ["Terms and Conditions", "Syarat dan Ketentuan"], ["Privacy Policy", "Kebijakan Privasi"],
  ["User Guide", "Panduan Pengguna"], ["How it works", "Cara kerja"], ["About", "Tentang"],
  ["Directory", "Direktori"], ["Market", "Pasar"], ["Driver of the Day", "Pembalap Terbaik"],
  ["FREE AGENT RECRUITMENT", "REKRUTMEN AGEN BEBAS"], ["Free Agent Recruitment", "Rekrutmen Agen Bebas"],
  ["Direct contract offer from the Team Owner. The Driver joins the team roster after the agreement and FIA registration are completed.", "Penawaran kontrak langsung dari Team Owner. Driver baru masuk roster setelah kesepakatan dan registrasi FIA selesai."],
  ["The contract offer has been sent to the Free Agent. The Driver will not join the team roster until the agreement and FIA registration are complete.", "Penawaran kontrak dikirim kepada Free Agent. Driver belum masuk roster tim sampai kesepakatan dan registrasi FIA selesai."],
  ["Salary must match the Driver's license range.", "Gaji harus sesuai rentang lisensi Driver."],
  ["The team roster has reached the two-Driver limit.", "Roster tim sudah mencapai batas dua Driver."],
  ["Only the Team Owner can recruit a Free Agent.", "Hanya Team Owner yang dapat merekrut Free Agent."],
  ["Delete notification", "Hapus notifikasi"], ["Account preferences", "Preferensi akun"],
  ["Main Event · Recruitment", "Acara Utama · Rekrutmen"], ["Main Event · Team Market", "Acara Utama · Bursa Tim"],
  ["Main Event · Driver Market", "Acara Utama · Bursa Pembalap"], ["Driver Center", "Pusat Pembalap"],
  ["Team Management", "Manajemen Tim"], ["FIA Control", "Kontrol FIA"], ["Administration", "Administrasi"],
  ["Quick Access", "Akses Cepat"], ["Navigation", "Navigasi"], ["Pages", "Halaman"],
  ["Race Calendar", "Kalender Balapan"], ["Race Results", "Hasil Balapan"], ["Race Schedule", "Jadwal Balapan"],
  ["Team Standings", "Klasemen Tim"], ["Driver Standings", "Klasemen Pembalap"],
  ["No data available", "Data belum tersedia"], ["No results found", "Tidak ada hasil ditemukan"],
  ["No members found", "Tidak ada anggota ditemukan"], ["No drivers found", "Tidak ada pembalap ditemukan"],
  ["No teams found", "Tidak ada tim ditemukan"], ["Something went wrong", "Terjadi kesalahan"],
  ["Please try again", "Silakan coba lagi"], ["Try again", "Coba lagi"], ["View all", "Lihat semua"],
  ["View details", "Lihat detail"], ["Show more", "Tampilkan lebih banyak"], ["Show less", "Tampilkan lebih sedikit"],
  ["Open menu", "Buka menu"], ["Close menu", "Tutup menu"], ["Sign in", "Masuk"],
  ["Sign out", "Keluar"], ["Log in", "Masuk"], ["Log out", "Keluar"], ["Create account", "Buat akun"],
  ["Forgot password?", "Lupa kata sandi?"], ["Reset password", "Atur ulang kata sandi"],
  ["Account status", "Status akun"], ["Public visibility", "Visibilitas publik"],
  ["Character profile", "Profil karakter"], ["Member profile", "Profil member"],
  ["Driver profile", "Profil pembalap"], ["Team profile", "Profil tim"],
  ["Total Drivers", "Total Pembalap"], ["Total Teams", "Total Tim"], ["Total Members", "Total Anggota"],
  ["Current Season", "Musim Saat Ini"], ["Current Round", "Putaran Saat Ini"],
  ["Active Season", "Musim Aktif"], ["Upcoming Race", "Balapan Berikutnya"],
  ["Latest Results", "Hasil Terbaru"], ["Recent Activity", "Aktivitas Terbaru"],
  ["System Status", "Status Sistem"], ["Last updated", "Terakhir diperbarui"],
  ["Last update", "Pembaruan terakhir"], ["Updated at", "Diperbarui pada"],
  ["No active season", "Tidak ada musim aktif"], ["No active round", "Tidak ada putaran aktif"],
  ["Season Progress", "Progres Musim"], ["Race Progress", "Progres Balapan"],
  ["Team Details", "Detail Tim"], ["Driver Details", "Detail Pembalap"],
  ["Account Details", "Detail Akun"], ["Personal Details", "Data Pribadi"],
  ["Public Member Directory", "Direktori Member Publik"], ["Driver Market", "Bursa Pembalap"],
  ["Team Market", "Bursa Tim"], ["Free Agent", "Agen Bebas"], ["Permanent Transfer", "Transfer Permanen"],
  ["Loan Request", "Permintaan Peminjaman"], ["Transfer Request", "Permintaan Transfer"],
  ["Contract Offer", "Penawaran Kontrak"], ["Contract Status", "Status Kontrak"],
  ["Current Contract", "Kontrak Saat Ini"], ["Contract End", "Akhir Kontrak"],
  ["Offer History", "Riwayat Penawaran"], ["Negotiation History", "Riwayat Negosiasi"],
  ["Team HQ Upgrade", "Upgrade Markas Tim"], ["Upgrade Project", "Proyek Upgrade"],
  ["Construction Cost", "Biaya Pembangunan"], ["Construction Duration", "Durasi Pembangunan"],
  ["Project Status", "Status Proyek"], ["Facility Level", "Level Fasilitas"],
  ["Current Balance", "Saldo Saat Ini"], ["Available Balance", "Saldo Tersedia"],
  ["Insufficient balance", "Saldo tidak mencukupi"], ["Transaction History", "Riwayat Transaksi"],
  ["Transaction Details", "Detail Transaksi"], ["Transaction Status", "Status Transaksi"],
  ["Date Created", "Tanggal Dibuat"], ["Created at", "Dibuat pada"],
  ["Updated at", "Diperbarui pada"], ["No notifications", "Tidak ada notifikasi"],
  ["Delete notification", "Hapus notifikasi"], ["Mark as read", "Tandai sudah dibaca"],
  ["Digital ID", "ID Digital"], ["Main Event", "Acara Utama"], ["Recruitment", "Rekrutmen"],
  ["Team Market", "Bursa Tim"], ["Official Notice", "Pengumuman Resmi"], ["Circuit Database", "Database Sirkuit"],
  ["Driver Ranking", "Peringkat Pembalap"], ["Rookie of the Season", "Rookie Terbaik Musim Ini"],
  ["Team Ranking", "Peringkat Tim"], ["Engine Ranking", "Peringkat Engine"],
  ["Comparison", "Perbandingan"], ["Driver List", "Daftar Pembalap"], ["Team List", "Daftar Tim"],
  ["Open Seat", "Kursi Tersedia"], ["Available From", "Tersedia Mulai"], ["Requirements", "Persyaratan"],
  ["Applications", "Lamaran"], ["Circuit Library", "Perpustakaan Sirkuit"], ["Race Pace", "Kecepatan Balap"],
  ["Qualifying Pace", "Kecepatan Kualifikasi"], ["Experience", "Pengalaman"], ["Aggression", "Agresivitas"],
  ["Defensive Strength", "Kemampuan Bertahan"], ["Overtake Skill", "Kemampuan Menyalip"],
  ["Mistake Rate", "Tingkat Kesalahan"], ["Tyre Management", "Manajemen Ban"], ["Engine Power", "Tenaga Mesin"],
  ["Low Speed Corners", "Tikungan Kecepatan Rendah"], ["High Speed Corners", "Tikungan Kecepatan Tinggi"],
  ["Mechanical Grip", "Cengkeraman Mekanis"], ["Strategy Quality", "Kualitas Strategi"], ["Team Morale", "Moral Tim"],
  ["Reliability", "Keandalan"], ["Car Tyre Wear", "Keausan Ban Mobil"], ["Pit Stop Efficiency", "Efisiensi Pit Stop"],
  ["DRS Efficiency", "Efisiensi DRS"], ["ERS Efficiency", "Efisiensi ERS"], ["Average Attributes", "Rata-rata Atribut"],
  ["Market value", "Nilai pasar"], ["Market Listing", "Daftar Bursa"], ["PRE-CONTRACT APPROACH", "PENDEKATAN PRAKONTRAK"],
  ["Salary band", "Rentang gaji"], ["Contract duration", "Durasi kontrak"], ["Accept salary", "Terima gaji"],
  ["Accept & Sign", "Terima & Tandatangani"], ["Reject", "Tolak"], ["Driver side", "Sisi pembalap"],
  ["Latest offer", "Penawaran terbaru"], ["Move type", "Jenis perpindahan"], ["Awaiting offer", "Menunggu penawaran"],
  ["Permanent Transfer", "Transfer Permanen"], ["Driver Loan", "Peminjaman Pembalap"],
  ["Season transition", "Peralihan musim"], ["All divisions", "Semua divisi"], ["ALL DIVISIONS", "SEMUA DIVISI"],
  ["MAIN EVENT · DRIVER MARKET", "ACARA UTAMA · BURSA PEMBALAP"], ["PRE-CONTRACT DESK", "MEJA PRAKONTRAK"],
  ["NEGOTIATION DESK", "MEJA NEGOSIASI"], ["Team Wallet", "Dompet Tim"], ["Driver Wallet", "Dompet Pembalap"],
  ["Owner", "Pemilik"], ["No active project", "Tidak ada proyek aktif"], ["Current Level", "Level Saat Ini"],
  ["Upgrade Facility", "Tingkatkan Fasilitas"], ["Facility", "Fasilitas"], ["Headquarters", "Markas Besar"],
  ["No active projects", "Tidak ada proyek aktif"], ["Project History", "Riwayat Proyek"],
  ["Total members", "Total anggota"], ["Active drivers", "Pembalap aktif"], ["Available drivers", "Pembalap tersedia"],
  ["Driver Profile", "Profil Pembalap"], ["Team Overview", "Ringkasan Tim"],
  ["STATISTIK DRIVER", "STATISTIK PEMBALAP"], ["Driver Statistics", "Statistik Pembalap"],
  ["Race start", "Balapan dimulai"], ["Official race result", "Hasil balapan resmi"],
  ["Quest completed", "Misi selesai"], ["QR code for public CALERIS member ID", "Kode QR untuk ID member publik CALERIS"],
  ["Race starts", "Balapan dimulai"], ["Drivers registered in the team", "Driver terdaftar di tim"],
  ["Total personal wallet balance", "Total saldo wallet pribadi"], ["Character wallet failed to load", "Wallet karakter gagal dimuat"],
  ["Team wallet failed to load", "Wallet tim gagal dimuat"], ["Market Value failed to load", "Market Value gagal dimuat"],
  ["Reward XP is invalid", "Reward XP tidak valid"], ["Reward XP updated", "Reward XP diperbarui"],
  ["Save badge", "Simpan badge"], ["Driver name / public", "Nama driver / public"],
  ["Public Member", "Member Publik"], ["PERMANENT TRANSFER", "TRANSFER PERMANEN"],
  ["DRIVER LOAN", "PEMINJAMAN PEMBALAP"], ["PRE-CONTRACT", "PRAKONTRAK"],
  ["TRANSFER LIST", "DAFTAR TRANSFER"], ["LOAN LIST", "DAFTAR PEMINJAMAN"],
  ["FREE AGENT", "AGEN BEBAS"], ["UNDER CONTRACT", "TERIKAT KONTRAK"],
  ["MAIN EVENT", "ACARA UTAMA"], ["DRIVER PANEL", "PANEL PEMBALAP"],
  ["TEAM PANEL", "PANEL TIM"], ["ADMIN CONTROL", "KONTROL ADMIN"],
  ["DRIVER CENTER", "PUSAT PEMBALAP"], ["TEAM MANAGEMENT", "MANAJEMEN TIM"],
  ["FIA CONTROL", "KONTROL FIA"], ["ADMINISTRATION", "ADMINISTRASI"],
  ["QUICK ACCESS", "AKSES CEPAT"], ["NAVIGATION", "NAVIGASI"],
  ["ROUND WINDOW", "JENDELA PUTARAN"], ["PROFILE SETTINGS", "PENGATURAN PROFIL"],
  ["Admin Panel", "Panel Admin"], ["FIA Panel", "Panel FIA"], ["Team Panel", "Panel Tim"],
  ["Driver Panel", "Panel Pembalap"], ["Member Directory", "Direktori Member"],
  ["Team Directory", "Direktori Tim"], ["Driver Directory", "Direktori Pembalap"],
  ["Race Control", "Kontrol Balapan"], ["Paddock Access", "Akses Paddock"],
  ["Job Search", "Bursa Lowongan"], ["Circuit Pool", "Kumpulan Sirkuit"],
  ["Circuit Pool Input", "Input Sirkuit"], ["Loan Market", "Bursa Peminjaman"],
  ["Sponsor Market", "Bursa Sponsor"], ["Team Engine Market", "Bursa Engine Tim"],
  ["Community", "Komunitas"]
];

const dictionaries: Record<CalerisLanguage, Map<string, string>> = {
  id: new Map(translations),
  en: new Map(translations.map(([english, indonesian]) => [indonesian, english]))
};

function escapeRegex(value: string) {
  return value.split("").map(character => "\\^$.*+?()[]{}|".includes(character) ? "\\" + character : character).join("");
}

function translate(source: string, language: CalerisLanguage, allowTokens = false) {
  const dictionary = dictionaries[language];
  const trimmed = source.trim();
  if (!trimmed) return source;
  const exact = dictionary.get(trimmed);
  if (exact !== undefined) return source.replace(trimmed, exact);
  let output = source;
  const phrases = [...dictionary.entries()].filter(([key]) => key.includes(" ")).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of phrases) output = output.split(from).join(to);
  if (allowTokens) {
    const words = [...dictionary.entries()].filter(([key]) => !key.includes(" ") && /^[A-Za-z]+$/.test(key)).sort((a, b) => b[0].length - a[0].length);
    for (const [from, to] of words) {
      const pattern = new RegExp("\\b" + escapeRegex(from) + "\\b", "gi");
      output = output.replace(pattern, match => match === match.toUpperCase() ? to.toUpperCase() : match[0] === match[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
    }
  }
  return output;
}

function ignoredElement(element: Element | null) {
  return Boolean(element?.closest("script,style,noscript,textarea,pre,code,svg,[data-language-ignore='true']"));
}

export default function LanguageRuntime({ language, pathname }: { language: CalerisLanguage; pathname: string }) {
  const originals = useRef(new WeakMap<Text, string>());
  const lastRendered = useRef(new WeakMap<Text, string>());
  const originalAttributes = useRef(new WeakMap<Element, Map<string, { source: string; last: string }>>());

  useEffect(() => {
    const aboutUs = pathname.replace(/\/$/, "") === "/about-us";
    document.documentElement.lang = language === "id" ? "id" : "en";
    try { localStorage.setItem("caleris-language", language); } catch {}

    const applyText = (node: Text) => {
      const current = node.nodeValue ?? "";
      let source = originals.current.get(node);
      const last = lastRendered.current.get(node);
      if (source === undefined) {
        source = current;
        originals.current.set(node, source);
      } else if (current !== last) {
        source = current;
        originals.current.set(node, source);
      }
      const tag = node.parentElement?.tagName ?? "";
      const allowTokens = ["BUTTON","LABEL","H1","H2","H3","H4","TH","OPTION","SMALL","STRONG","SPAN","A"].includes(tag) || Boolean(node.parentElement?.closest(".page-description,.panel-note,.section-description,.empty-state,.empty-panel,.settings-note,.workspace-note"));
      const next = aboutUs ? source : translate(source, language, allowTokens);
      lastRendered.current.set(node, next);
      if (current !== next) node.nodeValue = next;
    };

    const applyAttributes = (element: Element) => {
      if (ignoredElement(element)) return;
      const store = originalAttributes.current.get(element) ?? new Map<string, { source: string; last: string }>();
      for (const attribute of ["placeholder", "aria-label", "title"]) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute) ?? "";
        let entry = store.get(attribute);
        if (!entry) entry = { source: current, last: current };
        else if (current !== entry.last) entry.source = current;
        const next = aboutUs ? entry.source : translate(entry.source, language);
        entry.last = next;
        store.set(attribute, entry);
        if (current !== next) element.setAttribute(attribute, next);
      }
      originalAttributes.current.set(element, store);
    };

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!ignoredElement(node.parentElement)) applyText(node as Text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null;
      if (element && ignoredElement(element)) return;
      if (element) applyAttributes(element);
      node.childNodes.forEach(visit);
    };

    visit(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target.nodeType === Node.TEXT_NODE) {
          const target = record.target as Text;
          if (!ignoredElement(target.parentElement)) applyText(target);
        }
        if (record.type === "attributes" && record.target.nodeType === Node.ELEMENT_NODE) applyAttributes(record.target as Element);
        record.addedNodes.forEach(visit);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "aria-label", "title"] });
    return () => observer.disconnect();
  }, [language, pathname]);

  return null;
}
