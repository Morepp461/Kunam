import { describe, expect, it } from "vitest";
import { translateUiText } from "./ui-language";
describe("CALERIS UI language", () => {
  it("translates English interface labels to Indonesian", () => {
    expect(translateUiText("Transfer Market", "id")).toBe("Bursa Transfer");
    expect(translateUiText("Market Value · € 18.000.000", "id")).toBe("Nilai Pasar · € 18.000.000");
    expect(translateUiText("TEAM HQ", "id")).toBe("MARKAS TIM");
  });
  it("covers admin, season, and economy labels in both languages", () => {
    expect(translateUiText("ADMIN ONLY", "id")).toBe("KHUSUS ADMIN");
    expect(translateUiText("Daily Check-in Reward", "id")).toBe("Hadiah Check-in Harian");
    expect(translateUiText("Team Wallet", "id")).toBe("Dompet Tim");
    expect(translateUiText("Hadiah Check-in Harian", "en")).toBe("Daily Check-in Reward");
    expect(translateUiText("The race begins here", "id")).toBe("Balapan dimulai di sini");
    expect(translateUiText("Balapan dimulai di sini", "en")).toBe("The race begins here");
    expect(translateUiText("English", "id")).toBe("Bahasa Inggris");
  });
  it("covers Assets Marketplace labels and dynamic catalog categories in both directions", () => {
    const englishLabels = [
      ["Assets Marketplace", "Marketplace Aset"],
      ["Personal Wallet", "Dompet Pribadi"],
      ["Owned Asset Value", "Nilai Aset yang Dimiliki"],
      ["Collection Catalog", "Katalog Koleksi"],
      ["Browse Assets", "Jelajahi Aset"],
      ["Aircraft jets", "Pesawat Jet"],
      ["Initial market value · € 1.500.000", "Nilai pasar awal · € 1.500.000"],
      ["Buy Asset", "Beli Aset"],
      ["Owned Assets", "Aset yang Dimiliki"],
      ["Marketplace Listings", "Daftar Listing Marketplace"],
      ["Cancel Listing", "Batalkan Listing"],
    ];
    for (const [english, indonesian] of englishLabels) {
      expect(translateUiText(english, "id")).toBe(indonesian);
      expect(translateUiText(indonesian, "en")).toBe(english);
    }
    expect(translateUiText("TIER 1", "id")).toBe("TINGKAT 1");
    expect(translateUiText("40 tiers", "id")).toBe("40 tingkat");
  });
  it("covers admin configuration, economy, license, and registration modules in both languages", () => {
    const cases = [
      ["Economy Audit Center", "Pusat Audit Ekonomi"],
      ["Operations Suite", "Rangkaian Operasional"],
      ["Transaction ledger", "Buku Besar Transaksi"],
      ["Prizepool Configuration", "Konfigurasi Prizepool"],
      ["Penetapan lisensi Driver", "Driver license assignment"],
      ["Kelola ketentuan CALERIS dari website. Nilai dan nominal tidak ditanam di source code.", "Manage CALERIS rules from the website. Values and amounts are not hardcoded in source code."],
      ["Belum ada transaksi. Ledger akan bertambah setelah transaksi pertama berhasil diposting.", "No transactions yet. The ledger will grow after the first transaction is posted successfully."],
      ["Reward per quest selesai", "Reward per completed quest"],
      ["Belum ada pendaftaran", "No registrations yet"],
      ["Preferensi Tim", "Team Preferences"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers additional admin economy, pricing, season, and team lifecycle screens", () => {
    const cases = [
      ["Konfigurasi Quest Iklan", "Ad Quest Configuration"],
      ["Konfigurasi Rewarded Ads berhasil disimpan.", "Rewarded Ads configuration saved successfully."],
      ["Reschedule seluruh kalender", "Reschedule the entire calendar"],
      ["Struktur kompetisi", "Competition structure"],
      ["Tim dibekukan setelah satu season penuh tanpa quest selesai maupun upgrade Development.", "Teams are frozen after one full season without completed quests or Development upgrades."],
      ["Slot Pengganti", "Replacement slots"],
      ["Belum ada slot pengganti yang dibuka.", "No replacement slots have been opened yet."],
      ["Persona akun Admin", "Admin account persona"],
      ["Belum ada pendaftaran", "No registrations yet"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers member management and onboarding screens in both languages", () => {
    const cases = [
      ["Daftar akun: kelola role, tim, peringatan, dan sanksi member.", "Account directory: manage member roles, teams, warnings, and sanctions."],
      ["Preferensi role akun", "Account role preference"],
      ["Ban sementara berlaku 1 sampai 365 hari.", "Temporary bans last 1 to 365 days."],
      ["Akses administrator diperlukan", "Administrator access required"],
      ["Pendaftaran role dan profilmu sedang diperiksa Admin.", "Your role and profile registration is being reviewed by an Admin."],
      ["Memverifikasi sesi Discord...", "Verifying Discord session..."],
      ["USER MODERATION", "MODERASI PENGGUNA"],
      ["Community Invite", "Undangan Komunitas"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers Cale onboarding and team ecosystem modules in both languages", () => {
    const cases = [
      ["Panduan Akun bersama Cale", "Account Guide with Cale"],
      ["Lewati panduan", "Skip guide"],
      ["Selamat datang di Paddock Access", "Welcome to Paddock Access"],
      ["Pilih foto JPG, PNG, atau WebP. Kamu bisa mengatur posisi foto sebelum mengonfirmasi hasilnya.", "Choose a JPG, PNG, or WebP photo. You can adjust its position before confirming."],
      ["Akun ini belum terhubung ke tim. Command Center hanya tersedia untuk anggota tim.", "This account is not linked to a team. The Command Center is only available to team members."],
      ["Belum ada kontrak driver aktif pada season terbaru.", "There are no active driver contracts in the latest season."],
      ["Saldo dibaca langsung dari wallet tim. Halaman ini tidak menyimpan atau menghitung saldo terpisah.", "The balance is read directly from the team wallet. This page does not store or calculate a separate balance."],
      ["Belum ada sponsorship aktif.", "There are no active sponsorships yet."],
      ["Belum ada juara pembalap yang difinalisasi.", "There are no finalized driver champions yet."],
      ["HQ FACILITIES", "FASILITAS MARKAS"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers cash loan and circuit design workflows in both languages", () => {
    const cases = [
      ["Pinjaman Pribadi", "Personal Loan"],
      ["Ajukan pinjaman pribadi atau pinjaman tim berdasarkan income season aktif.", "Apply for a personal or team loan based on active season income."],
      ["Bunga tetap berdasarkan total tenor, bukan bunga berbunga.", "Interest is fixed based on the total term, not compounded."],
      ["Circuit Maker", "Pembuat Sirkuit"],
      ["Visual editor dan specification editor tersinkron dalam satu draft.", "The visual editor and specification editor are synchronized in a single draft."],
      ["Track limits", "Batas Lintasan"],
      ["Circuit Pool", "Kumpulan Sirkuit"],
      ["Belum ada circuit. Tambahkan melalui form di bawah.", "No circuits yet. Add one using the form below."],
      ["Penyimpanan draft browser tidak tersedia.", "Browser draft storage is unavailable."],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers dashboard, Developer API, and Development workflows in both languages", () => {
    const cases = [
      ["Ringkasan aktivitas, event, dan perjalananmu di Caleris Masters.", "A summary of your activity, events, and journey in Caleris Masters."],
      ["Buka Admin Workflow", "Open Admin Workflow"],
      ["Developer API hanya tersedia untuk pemilik CALERIS MASTERS.", "Developer API is only available to the CALERIS MASTERS owner."],
      ["Hak akses data", "Data access permissions"],
      ["Harga Berdasarkan Lisensi & Divisi", "Pricing by License & Division"],
      ["Pemetaan Lisensi Driver", "Driver License Mapping"],
      ["Snapshot dan baseline season berhasil dibuat.", "Season snapshot and baseline created successfully."],
      ["Divisi tim belum ditetapkan ke Caleris Premio atau Caleris Zwei. Upgrade cash belum tersedia.", "The team division has not been assigned to Caleris Premio or Caleris Zwei. Cash upgrades are not available."],
      ["Kecepatan Kualifikasi", "Qualifying Pace"],
      ["Efisiensi Pit Stop", "Pit Stop Efficiency"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("translates Indonesian interface labels to English", () => {
    expect(translateUiText("Pengaturan Akun", "en")).toBe("Account Settings");
    expect(translateUiText("Bahasa aplikasi", "en")).toBe("App language");
    expect(translateUiText("Pembalap Bebas", "en")).toBe("Free Agent");
  });
});
