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
  it("covers Discord broadcast, Driver Exhibition, and Training Centre", () => {
    const cases = [
      ["Kirim pengumuman resmi CALERIS ke channel Discord yang terhubung.", "Send official CALERIS announcements to the connected Discord channel."],
      ["Notifikasi berhasil dikirim ke Discord.", "Notification sent to Discord successfully."],
      ["Statistik belum tersedia pada hasil pertandingan yang dipublikasikan.", "Statistics are not yet available in the published match results."],
      ["Belum ada driver yang terdaftar di divisi ini.", "No drivers are registered in this division yet."],
      ["WebGL tidak tersedia pada perangkat ini.", "WebGL is not available on this device."],
      ["Training hanya tersedia untuk role Driver.", "Training is only available for the Driver role."],
      ["Latihan berhasil. Atribut mendapatkan peningkatan.", "Training successful. Attributes have increased."],
      ["Training Centre", "Pusat Pelatihan"],
      ["REGISTERED DRIVERS", "PEMBALAP TERDAFTAR"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers economy guide, FIA operations, data export, and job search", () => {
    const cases = [
      ["Gaji tahunan dibayar bertahap pada akhir setiap Race Period.", "Annual salaries are paid in installments at the end of each Race Period."],
      ["Belum ada tier Wealth Tax aktif untuk Team.", "There are no active Wealth Tax tiers for Teams."],
      ["Input klasifikasi, fastest lap, pole, dan hasil resmi race.", "Enter classification, fastest lap, pole, and official race results."],
      ["Driver Loan disetujui. Aktivasi menunggu tanggal mulai dan saldo tim peminjam.", "Driver Loan approved. Activation awaits the start date and the borrowing team's balance."],
      ["Akses export hanya untuk Admin dan FIA.", "Export access is limited to Admin and FIA."],
      ["Tidak ada lowongan yang sesuai filter.", "No job listings match the filters."],
      ["OFFICIAL DATA SNAPSHOT", "SNAPSHOT DATA RESMI"],
      ["DRIVER VALUATION ENGINE", "MESIN VALUASI PEMBALAP"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers main navigation, check-in, and panel directory labels", () => {
    const cases = [
      ["Ringkasan aktivitas dan perjalananmu.", "A summary of your activity and journey."],
      ["Kirim bug report dan pantau tiket bantuan.", "Submit bug reports and track support tickets."],
      ["Cari halaman...", "Search pages..."],
      ["Memeriksa jadwal race...", "Checking race schedule..."],
      ["Check-in berhasil. Reward:", "Check-in successful. Reward:"],
      ["Hapus semua notifikasi? Tindakan ini tidak dapat dibatalkan.", "Delete all notifications? This action cannot be undone."],
      ["Database sirkuit Caleris Masters.", "Caleris Masters circuit database."],
      ["DRIVER PANEL", "PANEL PEMBALAP"],
      ["Community Hub", "Pusat Komunitas"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers public Digital ID, quests, and race operations", () => {
    const cases = [
      ["Memverifikasi Digital ID...", "Verifying Digital ID..."],
      ["Member ini tidak mengaktifkan halaman verifikasi publik atau kode member tidak ditemukan.", "This member has not enabled the public verification page, or the member code could not be found."],
      ["Belum ada Daily Quest yang memenuhi kondisi aktivitas hari ini.", "There are no Daily Quests that meet today's activity conditions."],
      ["Reward berhasil diklaim dan masuk ke wallet pribadi.", "Reward successfully claimed and added to the personal wallet."],
      ["Race time wajib memakai format h:mm:ss.mmm atau m:ss.mmm.", "Race time must use the h:mm:ss.mmm or m:ss.mmm format."],
      ["Grid position 1 menentukan Pole Position.", "Grid position 1 determines Pole Position."],
      ["Race resmi disahkan.", "Official race result confirmed."],
      ["Durasi selesai. Menunggu konfirmasi hasil resmi FIA.", "Duration ended. Waiting for official FIA result confirmation."],
      ["IN PROGRESS", "BERLANGSUNG"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers rewarded ads, Shop, Support, and affiliate workflows", () => {
    const cases = [
      ["Slot bonus terpisah dari tiga Daily Quest reguler. Maksimal lima iklan valid per hari.", "The bonus slot is separate from the three regular Daily Quests. Up to five valid ads are allowed per day."],
      ["Integrasi iklan siap. Reward hanya dihitung dari callback server Google yang valid.", "Ad integration is ready. Rewards are counted only from valid Google server callbacks."],
      ["Additional HQ Project Slot", "Slot Proyek HQ Tambahan"],
      ["Kirim feedback", "Send feedback"],
      ["Feature Suggestion", "Saran Fitur"],
      ["Satu tim hanya dapat memiliki satu affiliate dan hubungan hanya dapat dibentuk antar-tier berbeda.", "Each team can have only one affiliate, and relationships can only be formed between different tiers."],
      ["Permintaan affiliate dikirim ke Team Owner tujuan.", "Affiliate request sent to the target Team Owner."],
      ["Belum ada permintaan atau perjanjian affiliate.", "There are no affiliate requests or agreements yet."],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers Team HQ, engine market, roster, and contract screens", () => {
    const cases = [
      ["Belum ada kontrak Driver untuk season ini.", "There are no Driver contracts for this season."],
      ["Data kontrak hanya tersedia untuk Team Owner.", "Contract data is only available to Team Owners."],
      ["Belum ada Engine yang digunakan untuk season aktif.", "No Engine is being used for the active season."],
      ["Memuat Team HQ...", "Loading Team HQ..."],
      ["Proyek upgrade berhasil dimulai. Biaya telah dipindahkan ke VreeoBank.", "Upgrade project started successfully. The cost has been transferred to VreeoBank."],
      ["Fasilitas berhasil dibongkar. Tidak ada pengembalian biaya.", "Facility dismantled successfully. No refund is issued."],
      ["UNDER CONSTRUCTION", "SEDANG DIBANGUN"],
      ["Fan growth", "Pertumbuhan Fans"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers Team Summary, Merchandise, and Take Over screens", () => {
    const cases = [
      ["Ringkasan identitas, line-up, sponsor resmi, dan konfigurasi Engine tim.", "Summary of team identity, line-up, official sponsors, and Engine configuration."],
      ["Belum ada kontrak sponsor aktif untuk tim ini.", "There are no active sponsor contracts for this team."],
      ["Production quantity", "Jumlah Produksi"],
      ["Gross revenue", "Pendapatan Kotor"],
      ["Penawaran mengikuti rentang valuasi dan batas negosiasi yang dikonfigurasi Admin.", "Offers follow the valuation range and negotiation limits configured by Admin."],
      ["Belum ada tim yang membuka listing dengan valuation snapshot.", "No teams have opened listings with a valuation snapshot."],
      ["Take Over selesai. Pembayaran tercatat di ledger dan status pembeli sudah menjadi Owner.", "Take Over completed. Payment was recorded in the ledger and the buyer is now an Owner."],
      ["Valuasi tim belum dibuat oleh Admin. Penawaran belum dapat diajukan.", "Team valuation has not been created by Admin. Offers cannot be submitted yet."],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers team livery editor labels and feedback", () => {
    const cases = [
      ["Body pattern", "Pola Bodi"],
      ["Team Sponsor Placement", "Penempatan Sponsor Tim"],
      ["Data livery tidak valid. Periksa warna, decal, nomor, sponsor, dan logo.", "Livery data is invalid. Check colors, decals, numbers, sponsors, and logos."],
      ["Decal ditambahkan. Klik atau drag ke panel UV untuk menentukan posisinya.", "Decal added. Click or drag it onto the UV panel to set its position."],
      ["Livery tim berhasil disimpan.", "Team livery saved successfully."],
      ["Ganti logo tim", "Replace team logo"],
      ["Simpan livery", "Save livery"],
      ["TITLE SPONSOR", "SPONSOR UTAMA"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers Brand Ecosystem sponsor configuration and negotiation", () => {
    const cases = [
      ["Memuat Brand Ecosystem...", "Loading Brand Ecosystem..."],
      ["Logo saat ini tersedia. Pilih file baru bila ingin menggantinya.", "The current logo is available. Choose a new file if you want to replace it."],
      ["Pembayaran sponsorship didanai VreeoBank dan dicatat melalui Economy Ledger.", "Sponsorship payments are funded by VreeoBank and recorded through the Economy Ledger."],
      ["Belum ada sponsor offer untuk tim ini.", "There are no sponsor offers for this team."],
      ["Sponsor sedang memproses counter secara otomatis.", "The sponsor is processing the counter-offer automatically."],
      ["Sponsor dan logo berhasil disimpan.", "Sponsor and logo saved successfully."],
      ["SPONSOR DATABASE", "DATABASE SPONSOR"],
      ["AI SPONSOR MATCHING", "PENCOCOKAN SPONSOR AI"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers Brand Ecosystem admin and Community Hub screens", () => {
    const cases = [
      ["Memuat status Brand Ecosystem...", "Loading Brand Ecosystem status..."],
      ["Counter dari Team Owner langsung diproses sponsor engine. Tidak perlu Admin menekan tombol AI Sponsor Respond.", "Counters from Team Owners are processed directly by the sponsor engine. Admin does not need to press the AI Sponsor Respond button."],
      ["Belum ada penawaran sponsor.", "There are no sponsor offers yet."],
      ["Menyiapkan CALERIS MASTERS Yearbook...", "Preparing the CALERIS MASTERS Yearbook..."],
      ["Profil member belum terhubung. Hubungi Admin jika kondisi ini terus terjadi.", "Member profile is not linked. Contact Admin if this continues."],
      ["Suaramu sudah tercatat. Terima kasih sudah berpartisipasi.", "Your vote has been recorded. Thank you for participating."],
      ["Batalkan voting ini? Suara yang sudah masuk tetap tersimpan sebagai arsip.", "Cancel this vote? Votes already submitted will remain stored in the archive."],
      ["Mathematical champion", "Juara Matematis"],
      ["CALERIS MASTERS Digital ID", "ID Digital CALERIS MASTERS"],
      ["Quest completed", "Quest Selesai"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers cookie notice, custom select, and Driver Transfer Market", () => {
    const cases = [
      ["Informasi Cookie", "Cookie Information"],
      ["Baca Kebijakan Privasi", "Read Privacy Policy"],
      ["Pilih opsi", "Select an option"],
      ["Rekrutmen Driver melalui penawaran, negosiasi dua pihak, dan persetujuan akhir FIA.", "Driver recruitment through offers, two-party negotiation, and final FIA approval."],
      ["Kontrak disepakati. Driver menunggu Team Owner mendaftarkan roster ke FIA melalui Driver Registration.", "Contract agreed. The Driver is waiting for the Team Owner to register the roster with FIA through Driver Registration."],
      ["Permanent Transfer dan Driver Loan dapat dinegosiasikan.", "Permanent Transfers and Driver Loans can be negotiated."],
      ["Penawaran terkirim ke Team Owner saat ini. Negosiasi menunggu respons.", "Offer sent to the current Team Owner. Negotiation is awaiting a response."],
      ["Disetujui FIA. Eksekusi menunggu Transfer Window dan saldo tim yang mencukupi.", "Approved by FIA. Execution is awaiting the Transfer Window and sufficient team balance."],
      ["FREE AGENT RECRUITMENT", "REKRUTMEN FREE AGENT"],
      ["DRIVER SIDE", "SISI PEMBALAP"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers license check-in and Live Race testing UI", () => {
    const cases = [
      ["Check-in tersedia setelah Admin mendaftarkan driver ke divisi season aktif.", "Check-in becomes available after Admin registers the Driver in the active season division."],
      ["Tombol absen hanya muncul pada tanggal race yang dijadwalkan. Hari tanpa race tidak dihitung sebagai absen.", "The check-in button only appears on scheduled race dates. Days without races do not count as absences."],
      ["Jalankan simulasi deterministik, simpan checkpoint, dan uji pemulihan sesi dari web.", "Run a deterministic simulation, save checkpoints, and test session recovery from the web."],
      ["Sesi simulasi berhasil dibuat di database testing. Belum ada data produksi yang disentuh.", "Simulation session successfully created in the testing database. No production data was touched."],
      ["Simulasi selesai. Klasifikasi final dan event sudah tersimpan di Supabase testing.", "Simulation completed. Final classification and events have been saved to Supabase Testing."],
      ["TRACK WETNESS", "KONDISI BASAH LINTASAN"],
      ["Server-authorized control command", "Perintah Kontrol yang Diotorisasi Server"],
      ["PENDING ADMIN RATIFICATION", "MENUNGGU PENGESAHAN ADMIN"],
      ["SCORE LEDGER", "BUKU BESAR POIN"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers PWA install, privacy, OCR, replay, and role panels", () => {
    const cases = [
      ["Akses lebih cepat dari layar utama HP.", "Faster access from your phone's home screen."],
      ["Penjelasan mengenai data yang diproses ketika kamu mengakses dan menggunakan CALERIS MASTERS.", "An explanation of the data processed when you access and use CALERIS MASTERS."],
      ["Kami tidak menjual data pribadi pengguna sebagai produk data.", "We do not sell users' personal data as a data product."],
      ["Pilih gambar PNG, JPG, atau WEBP.", "Choose a PNG, JPG, or WEBP image."],
      ["OCR gagal membaca gambar. Coba screenshot dengan resolusi lebih tinggi.", "OCR could not read the image. Try a higher-resolution screenshot."],
      ["WebGL tidak tersedia atau dinonaktifkan pada browser ini.", "WebGL is unavailable or disabled in this browser."],
      ["Akun ini belum terhubung ke data Driver.", "This account is not linked to Driver data."],
      ["Banding terkirim ke FIA Appeal Room.", "Appeal sent to FIA Appeal Room."],
      ["OFFICIAL DRIVER PROFILE", "PROFIL RESMI PEMBALAP"],
      ["TOTAL WALLET BALANCE", "TOTAL SALDO DOMPET"],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers long-form Privacy Policy and Terms content", () => {
    const cases = [
      ["Privasi dan keamanan informasi merupakan bagian penting dari pengelolaan platform. Kebijakan ini menjelaskan kategori data yang digunakan, tujuan pemrosesan, layanan pihak ketiga, serta cara mengajukan permintaan terkait data pribadi.", "Information privacy and security are important parts of platform management. This policy explains the categories of data used, the purposes of processing, third-party services, and how to submit requests concerning personal data."],
      ["Saat kamu masuk menggunakan Discord, Supabase Auth memproses informasi autentikasi yang diperlukan, seperti identitas akun Discord, alamat email yang diberikan oleh penyedia login, serta informasi sesi. Kami tidak menerima kata sandi Discord kamu.", "When you sign in using Discord, Supabase Auth processes the required authentication information, such as your Discord account identity, the email address provided by the login provider, and session information. We do not receive your Discord password."],
      ["Kami tidak menjual data pribadi pengguna sebagai produk data.", "We do not sell users' personal data as a data product."],
      ["Aset virtual dalam platform bukan rekening, simpanan, alat pembayaran resmi, investasi, atau janji nilai tukar ke mata uang nyata. Jangan menganggap saldo atau token sebagai uang sungguhan.", "Virtual assets on the platform are not bank accounts, deposits, official payment instruments, investments, or promises of exchange value into real currencies. Do not treat balances or tokens as real money."],
      ["CALERIS MASTERS disediakan sebagai platform roleplay dan komunitas. Sejauh diizinkan oleh hukum yang berlaku, layanan disediakan sebagaimana tersedia dan pengelola tidak menjamin bahwa setiap fitur akan selalu memenuhi seluruh kebutuhan atau bebas dari kesalahan.", "CALERIS MASTERS is provided as a roleplay and community platform. To the extent permitted by applicable law, the service is provided as available, and administrators do not guarantee that every feature will always meet all needs or be error-free."],
    ];
    for (const [indonesian, english] of cases) {
      expect(translateUiText(indonesian, "en")).toBe(english);
      expect(translateUiText(english, "id")).toBe(indonesian);
    }
  });
  it("covers team job adverts and country/city selectors", () => {
    const cases = [
      ["Memuat identitas tim...", "Loading team identity..."],
      ["Halaman ini hanya tersedia untuk Team Owner yang terhubung dengan tim.", "This page is only available to Team Owners linked to a team."],
      ["Rentang gaji harus sesuai lisensi minimum dan batas maksimum Super License.", "The salary range must match the minimum license and the Super License maximum."],
      ["Informasi tambahan (opsional)", "Additional information (optional)"],
      ["Daftar negara gagal dimuat. Periksa koneksi lalu muat ulang halaman.", "Failed to load the country list. Check your connection and reload the page."],
      ["Pilih nationality terlebih dahulu", "Select nationality first"],
      ["Place Job Advert", "Pasang Iklan Lowongan"],
      ["RECRUITMENT FORM", "FORMULIR REKRUTMEN"],
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
