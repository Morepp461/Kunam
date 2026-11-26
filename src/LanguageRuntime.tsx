import { useEffect, useRef } from "react";

export type CalerisLanguage = "id" | "en";

const translations: Array<[string, string]> = [
  ["Dashboard", "Dasbor"], ["Overview", "Ringkasan"], ["Community Hub", "Pusat Komunitas"],
  ["Transfer Market", "Bursa Transfer"], ["Team HQ", "Markas Tim"], ["Driver", "Pembalap"],
  ["Drivers", "Para Pembalap"], ["Free Agent", "Agen Bebas"], ["License", "Lisensi"],
  ["Nationality", "Kewarganegaraan"], ["Independent", "Independen"], ["Under Contract", "Terikat Kontrak"],
  ["Account Settings", "Pengaturan Akun"], ["My Profile", "Profil Saya"], ["Profile", "Profil"],
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
  ["Digital ID", "ID Digital"], ["Main Event", "Acara Utama"], ["Recruitment", "Rekrutmen"],
  ["Team Market", "Bursa Tim"], ["Official Notice", "Pengumuman Resmi"], ["Circuit Database", "Database Sirkuit"],
  ["Driver Ranking", "Peringkat Pembalap"], ["Rookie of the Season", "Rookie Terbaik Musim Ini"],
  ["Team Ranking", "Peringkat Tim"], ["Engine Ranking", "Peringkat Engine"], ["Statistic", "Statistik"],
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
  ["Total members", "Total anggota"], ["Active drivers", "Pembalap aktif"], ["Available drivers", "Pembalap tersedia"]
];

const dictionaries: Record<CalerisLanguage, Map<string, string>> = {
  id: new Map(translations),
  en: new Map(translations.map(([english, indonesian]) => [indonesian, english]))
};

function translate(source: string, language: CalerisLanguage) {
  const dictionary = dictionaries[language];
  const trimmed = source.trim();
  if (!trimmed) return source;
  const exact = dictionary.get(trimmed);
  if (exact !== undefined) return source.replace(trimmed, exact);
  let output = source;
  const phrases = [...dictionary.entries()].filter(([key]) => key.includes(" ")).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of phrases) output = output.split(from).join(to);
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
      const next = aboutUs ? source : translate(source, language);
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
