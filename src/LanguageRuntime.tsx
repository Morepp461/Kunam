import { useEffect, useRef } from "react";

export type CalerisLanguage = "id" | "en";

const translations: Array<[string, string]> = [
  ["Dashboard", "Dasbor"], ["Community Hub", "Pusat Komunitas"], ["Transfer Market", "Bursa Transfer"],
  ["Team HQ", "Markas Tim"], ["Driver", "Pembalap"], ["Free Agent", "Agen Bebas"],
  ["License", "Lisensi"], ["Nationality", "Kewarganegaraan"], ["Independent", "Independen"],
  ["Under Contract", "Terikat Kontrak"], ["Account Settings", "Pengaturan Akun"], ["My Profile", "Profil Saya"],
  ["Profile", "Profil"], ["Account", "Akun"], ["Settings", "Pengaturan"], ["Shop", "Toko"],
  ["Driver Recruitment", "Rekrutmen Pembalap"], ["Public member profile", "Profil member publik"],
  ["Public identity card and earned achievements.", "Kartu identitas publik dan pencapaian yang diraih."],
  ["Account Progression", "Perkembangan Akun"], ["Completed Career Milestones", "Pencapaian Karier Selesai"],
  ["Earned Achievements", "Pencapaian yang Diraih"], ["Member identity", "Identitas member"],
  ["Informasi akun dan identitas karakter Caleris Masters.", "Account and Caleris Masters character information."],
  ["Informasi akun", "Account information"], ["Informasi karakter", "Character information"],
  ["Informasi publik", "Public information"], ["Nama depan", "First name"], ["Nama belakang", "Last name"],
  ["Nickname web", "Web nickname"], ["Nickname driver", "Driver nickname"], ["Nama karakter", "Character name"],
  ["Tim", "Team"], ["Role", "Role"], ["Member ID", "Member ID"], ["Foto profil", "Profile photo"],
  ["Edit akun", "Edit account"], ["Pengaturan Akun", "Account Settings"], ["Bahasa aplikasi", "Application language"],
  ["Bahasa Indonesia", "Indonesian"], ["Simpan perubahan", "Save changes"], ["Menyimpan...", "Saving..."],
  ["Mode tampilan", "Display mode"], ["Preferensi ini juga berlaku di landing page.", "This preference also applies to the landing page."],
  ["Mode terang", "Light mode"], ["Mode gelap", "Dark mode"], ["Pilih foto", "Choose photo"],
  ["Mengunggah...", "Uploading..."], ["Profil publik", "Public profile"], ["Profil Member", "Member Profile"],
  ["Identitas publik CALERIS MASTERS.", "CALERIS MASTERS public identity."], ["CALERIS MEMBER", "CALERIS MEMBER"],
  ["Public Profile", "Profil Publik"], ["CHARACTER", "KARAKTER"], ["ACCOUNT", "AKUN"],
  ["Market Value", "Nilai Pasar"], ["Nilai Pasar", "Market Value"], ["Recruit", "Rekrut"],
  ["Rekrut Free Agent", "Recruit Free Agent"], ["Approach", "Ajukan pendekatan"], ["Annual salary", "Gaji tahunan"],
  ["Annual salary (€)", "Gaji tahunan (€)"], ["Offer price", "Nilai penawaran"], ["Offer price (¢p)", "Nilai penawaran (¢p)"],
  ["Transfer Window", "Jendela Transfer"], ["OPEN", "DIBUKA"], ["CLOSED", "DITUTUP"],
  ["Transfer Market Directory", "Direktori Bursa Transfer"], ["GLOBAL DRIVER & PUBLIC DIRECTORY", "DIREKTORI PEMBALAP & MEMBER PUBLIK"],
  ["Status transfer", "Transfer status"], ["Sisa kontrak", "Contract remaining"], ["Semua lisensi", "All licenses"],
  ["Semua negara", "All countries"], ["Semua tim", "All teams"], ["Tanpa tim", "No team"],
  ["Atribut driver", "Driver attributes"], ["Minimal atribut", "Minimum attribute"], ["Pilih atribut", "Select attribute"],
  ["Negosiasi kontrak Free Agent", "Free Agent contract negotiations"], ["FREE AGENT CONTRACT DESK", "MEJA KONTRAK AGEN BEBAS"],
  ["Penawaran kontrak dikirim kepada Free Agent.", "Contract offer sent to the Free Agent."],
  ["Kirim penawaran kontrak", "Send contract offer"], ["Counter-offer", "Penawaran balasan"],
  ["Offer date", "Tanggal penawaran"], ["Latest annual salary", "Gaji tahunan terbaru"],
  ["Tandai sudah dibaca", "Mark as read"], ["Hapus semua notifikasi", "Delete all notifications"],
  ["Notifikasi", "Notifications"], ["Belum ada notifikasi.", "No notifications yet."],
  ["Memuat notifikasi...", "Loading notifications..."], ["Buka detail", "Open details"],
  ["TEAM MANAGEMENT · HEADQUARTERS", "MANAJEMEN TIM · MARKAS BESAR"], ["FACILITY DIRECTORY", "DIREKTORI FASILITAS"],
  ["Facilities", "Fasilitas"], ["Facility Configuration", "Konfigurasi Fasilitas"],
  ["DIVISION MAX LEVEL", "LEVEL MAKSIMUM DIVISI"], ["ACTIVE PROJECT", "PROYEK AKTIF"],
  ["Proyek upgrade berhasil dimulai. Biaya telah dipindahkan ke VreeoBank.", "Upgrade facility project started. The cost has been transferred to VreeoBank."],
  ["Kembali ke CALERIS MASTERS", "Back to CALERIS MASTERS"], ["Digital ID tidak tersedia", "Digital ID unavailable"],
  ["Memverifikasi Digital ID...", "Verifying Digital ID..."], ["Belum tersedia", "Not available"],
  ["Belum ditetapkan", "Not assigned"], ["Belum dihitung", "Not calculated"], ["Belum ada kontrak aktif", "No active contract"],
  ["Tidak ditentukan", "Not specified"], ["Beranda", "Home"], ["Batal", "Cancel"], ["Tutup", "Close"],
  ["Memuat...", "Loading..."], ["Memproses...", "Processing..."], ["Kirim", "Send"], ["Simpan", "Save"],
  ["Nama", "Name"], ["Tim", "Team"], ["Lisensi", "License"], ["Pencarian", "Search"],
  ["Cari", "Search"], ["Pilih", "Select"], ["Tanggal", "Date"], ["Status", "Status"],
  ["Belum ada milestone yang dipublikasikan.", "No published milestones yet."],
  ["Sesi login tidak ditemukan.", "Login session not found."], ["Koneksi Supabase belum tersedia.", "Supabase connection is unavailable."]
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
