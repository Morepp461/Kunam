# CALERIS MASTERS — 11 Scope Improvement Plan

> Dokumen kerja dan checkpoint implementasi. Baseline repository: `main` pada commit `f31e9f169eccad93b5c0eb8bfd40ed38f1dd41c1`.
> Branch dokumen: `docs/caleris-11-scope-roadmap`.
> Status awal: **PLANNED — belum ada implementasi fitur dari daftar ini**.
> Aturan data: setiap perubahan schema/migration yang disetujui harus diterapkan ke Supabase Testing dan Production. Data dummy khusus Testing tidak boleh disalin ke Production. Tidak ada perubahan Vercel environment tanpa instruksi eksplisit.

## 0. Aturan pengerjaan dan checkpoint

1. Kerjakan hanya 11 scope di dokumen ini.
2. Sebelum tiap fitur: baca implementasi, route, migration, dependency, test, dan PRD terkait di branch terbaru. Catat risiko kompatibilitas.
3. Buat branch fitur baru dari `main`; jangan menumpuk perubahan fitur yang belum lolos QA.
4. Selesaikan satu fitur sampai QA dan CI lulus sebelum memulai fitur berikutnya.
5. Setelah fitur selesai, perbarui bagian **Checkpoint per scope** di file ini pada branch fitur yang sama sebelum berpindah scope. Dokumen ini harus ikut ter-merge bersama implementasinya.
6. Database: migration versioned, diuji di Testing terlebih dahulu, diverifikasi, lalu diterapkan ke Production. Periksa schema parity dan migration ledger; jangan menyamakan timestamp migration secara paksa atau menghapus histori.
7. Merge ke `main) hanya setelah review perubahan, QA, test, build, validation, CI, dan pemeriksaan migration lulus.
8. Jangan mengubah environment Vercel. Deployment hanya melalui alur repo yang sudah ada setelah merge yang disetujui.
9. Jangan mengganti dependency besar atau memaksa upgrade jika berisiko merusak struktur. Audit dependency dahulu; hentikan dan laporkan bukti jika tidak aman.
10. Jangan memakai data dummy untuk membuktikan perilaku Production. Catat identitas test persona dan fixture agar tidak bocor.
11. Setiap checkpoint wajib berisi: branch/commit, file dan migration, hasil QA/CI, status Testing, status Production, risiko tersisa, dan keputusan berikutnya.

### Format update checkpoint

- Status: PLANNED / IN PROGRESS / BLOCKED / QA PASSED / MERGED
- Branch + commit:
- Implementasi:
- Migration (jika ada):
- QA: unit / integration / security / browser-mobile / manual
- CI + build + validation:
- Supabase Testing:
- Supabase Production:
- Vercel: tidak diubah; deployment status dicatat setelah merge
- Risiko / follow-up:
- Keputusan untuk scope berikutnya:

## 1. Daftar scope dan hasil akhir

### Scope 01 — Dropdown ganda pada Community Hub (Video 1)

**Masalah dari video:** saat membuka pilihan, tampak pilihan dropdown native/default dan dropdown custom secara bersamaan.

**Pekerjaan:**
- Telusuri komponen Community Hub dan sumber field select yang dimaksud; pastikan apakah kontrol native dan custom sama-sama dirender atau fallback browser ikut aktif.
- Pertahankan satu kontrol dropdown custom sebagai satu-satunya UI yang terlihat.
- Pastikan opsi, nilai terpilih, keyboard/touch interaction, focus, dan aksesibilitas tetap berfungsi. Jangan mengubah daftar opsi atau aturan pemilihan role/kategori.
- Tambahkan regression test agar dropdown tidak dirender dua kali pada breakpoint mobile maupun desktop.

**Hasil akhir:** hanya satu dropdown custom yang terlihat dan berfungsi konsisten.

**QA:** Android Chrome, desktop browser, keyboard/focus, open/close, select option, responsive, console.

### Scope 02 — Teks loading global

**Masalah:** teks loading di berbagai tab menampilkan “Memuat data supabase”.

**Pekerjaan:**
- Cari seluruh string loading pada aplikasi, termasuk shared loader, route-level loader, komponen data, dan fallback error/loading.
- Ganti teks yang memang menjelaskan proses persiapan data menjadi **“Mempersiapkan Data”**.
- Jangan mengganti pesan error, status autentikasi, atau loading aksi spesifik yang mempunyai makna berbeda.
- Gunakan satu sumber copy konsisten bila arsitektur saat ini mendukungnya.

**Hasil akhir:** tidak ada teks teknis “Memuat data supabase” yang terlihat oleh pengguna; status loading tetap akurat.

**QA:** pencarian string, semua panel/role, initial load, refresh, navigasi, empty/error state.

### Scope 03 — Perbaikan search box Job Search

**Masalah dari screenshot 1:** tinggi/posisi search box membuat ikon kaca pembesar tidak berada di tengah secara vertikal.

**Pekerjaan:**
- Audit markup `market-search` dan aturan CSS pada `marketplace-directory.css`.
- Perbaiki alignment ikon dan input menggunakan layout yang stabil; hindari absolute positioning yang membuat ikon bergeser.
- Pertahankan tinggi kontrol, ukuran sentuh, placeholder, focus state, dan filter behavior.

**Hasil akhir:** ikon tepat di tengah secara vertikal dan horizontal terhadap area pencarian, baik mobile maupun desktop.

**QA:** viewport Android yang disertakan, viewport desktop, zoom browser, focus, mengetik dan filter.

### Scope 04 — Caleris Newsroom menjadi layout manga

**Masalah dari screenshot 2:** desain sekarang menyerupai koran dan kartu berita tampak menyatu. Popup/detail juga harus mengikuti konsep manga.

**Pekerjaan:**
- Temukan route, query, komponen list/detail, sumber artikel, media, dan modal Newsroom yang benar sebelum mengubah desain.
- Ubah daftar berita menjadi panel/panel komik editorial: tiap berita punya batas panel yang tegas, gutter, hierarki judul, metadata, ilustrasi/thumbnail, dan komposisi panel bervariasi. Jangan mengubah data artikel atau urutan editorial tanpa alasan produk.
- Detail/popup memakai bahasa visual manga yang konsisten: panel terpisah, fokus headline, gambar, isi, metadata, dan navigasi artikel.
- Gunakan gambar artikel yang sudah tersimpan/terverifikasi. Jangan membuat thumbnail abstrak pengganti untuk artikel yang memiliki media.
- Pastikan teks panjang tetap mudah dibaca dan tidak dipaksa menjadi balon dialog jika format berita tidak cocok.
- Jaga performa gambar dan responsive layout.

**Hasil akhir:** Newsroom dan detail artikel memiliki estetika manga yang jelas, bukan koran, tanpa kehilangan keterbacaan atau fungsi publikasi.

**QA:** list, artikel panjang/pendek, tanpa gambar, gambar gagal dimuat, popup close/back, mobile/desktop, aksesibilitas.

### Scope 05 — Role access Contract Renewal dan jalur pengajuan kontrak Driver

**Temuan awal dari repository:**
- Route `/team-panel/contract-renewals` dibatasi untuk Admin atau member dengan role Owner.
- Route `/driver-panel/contract-renewals` dibatasi untuk Admin atau Driver, dan menggunakan scope renewal yang sama.
- Komponen `TeamDriverContracts` adalah alur Team Owner menawarkan renewal; migration `20261120000000_driver_contract_renewal_duration.sql` mensyaratkan Team Owner mengirim penawaran dan Driver memutuskan menerima/menolak.
- Karena itu, renewal yang ada bukan formulir Driver untuk mengajukan kontrak baru ke tim. Job Search juga perlu diperiksa untuk memastikan jalur melamar lowongan tersedia.

**Pekerjaan:**
- Audit route, navigation visibility, role resolution, component scope, RLS, dan RPC. Uji akun Driver, Owner, Principal, Admin, serta akun tanpa role.
- Pastikan menu/route yang bersifat penawaran oleh Owner hanya bisa digunakan role yang memang diizinkan oleh aturan bisnis dan backend.
- Pisahkan dengan jelas dua workflow: (a) Owner menawarkan renewal/kontrak kepada Driver; (b) Driver mengajukan lamaran kontrak ke lowongan tim. Jangan menyamakan keduanya.
- Bangun jalur aplikasi Driver ke lowongan yang dipublikasikan, status lamaran, detail lowongan, dan keputusan Owner. Hubungkan dengan kontrak aktif hanya setelah Owner menyetujui dan Driver menerima ketentuan sesuai workflow yang berlaku.
- Cegah aplikasi ganda, lamaran ke iklan nonaktif, lintas tim tanpa izin, dan perubahan kontrak langsung dari client.
- Gunakan RPC/migration dan RLS untuk otorisasi server-side. Jangan mengandalkan hide menu sebagai security boundary.
- Validasi salary band, lisensi, status Driver, team vacancy, musim/season, dan kontrak yang sudah ada memakai aturan/data yang sudah ada.

**Hasil akhir:** Owner hanya mengelola penawaran dari sisi tim; Driver bisa melamar lowongan dan memantau/menerima keputusan; route dan backend konsisten dengan role.

**QA:** role matrix, RLS/RPC authorization, duplicate application, withdrawn/closed advert, accepted/rejected, salary/license validation, regression payroll dan kontrak.

**Catatan keputusan:** format negosiasi, apakah Driver boleh mengirim ekspektasi gaji, dan aturan pembatalan lamaran harus ditentukan dari fitur/data yang sudah ada. Jangan membuat kebijakan baru tanpa bukti atau persetujuan.

### Scope 06 — Admin Workflow

**Temuan awal:** `/admin-workflow` dirender untuk Admin melalui komponen `AdminWorkflow`. Screenshot memperlihatkan workspace placeholder “CRM Tools Belum Ditambahkan” dan “Awaiting CRM Specification”; belum tampak workflow operasional yang aktif.

**Pekerjaan:**
- Audit komponen, route, menu, dokumentasi, dan referensi silang untuk mengetahui apakah ada consumer atau rencana aktif.
- Dokumentasikan fungsi yang benar-benar sudah ada versus placeholder.
- Jangan mengarang fungsi CRM atau membuat fitur di luar 11 scope.
- Putuskan berdasarkan bukti: pertahankan sebagai workspace yang diberi deskripsi jelas, atau hapus dari navigasi/route bila memang tidak digunakan dan tidak ada dependency. Perubahan penghapusan memerlukan pemeriksaan incoming links dan test.

**Hasil akhir:** Admin Workflow tidak lagi membingungkan; fungsinya dijelaskan dengan benar atau entry placeholder ditangani aman tanpa memutus workflow lain.

**QA:** Admin/non-Admin access, route fallback, navigation, incoming links, no orphan route.

### Scope 07 — Dua menu License & Wallet Adjustments (Video 2)

**Temuan terverifikasi di `src/App.tsx`:**
- Menu `License & Wallet Adjustments · Ledger` menuju `/admin/adjustments`.
- Menu `License & Wallet Adjustments · Migration` menuju `/admin/data-adjustments`.
- Kedua route saat ini merender komponen yang sama: `AdminAdjustmentCenter`.

**Pekerjaan:**
- Audit `AdminAdjustmentCenter`, route history, migration, dan tujuan historis menu kedua.
- Karena keduanya menunjuk komponen yang sama, tentukan satu route canonical untuk penyesuaian lisensi/wallet melalui ledger.
- Hapus duplikasi menu/route yang tidak memiliki workflow berbeda, atau implementasikan halaman migrasi terpisah hanya jika ada proses migrasi nyata dan aman yang memang masih dibutuhkan.
- Jangan menghapus data, ledger, atau RPC. Pertahankan URL lama dengan redirect/alias jika ada link tersimpan atau penggunaan eksternal.

**Hasil akhir:** tidak ada dua halaman/menu berbeda yang sebenarnya membuka konten identik tanpa alasan. Pengguna tahu mana workflow resmi.

**QA:** menu, direct URL lama/baru, redirect, Admin authorization, ledger history, regression adjustment.

### Scope 08 — Custom Team Livery 3D

**Baseline repository:** `src/TeamLivery.tsx`, `src/lib/team-livery.ts`, `src/team-livery.css`, dan migration `20261122130000_team_uv_livery_editor.sql` sudah menyediakan editor UV atlas, warna, pattern, nomor mobil, wordmark, tiga sponsor label, upload logo, penyimpanan tim, dan preview Three.js prosedural. PRD fase 26 secara eksplisit menyatakan belum ada vehicle asset produksi original/berlisensi dengan UV map yang cocok; preview sekarang bukan GLB/GLTF final yang kompatibel dengan standar livery Monoposto.

**Target hasil:**
- Model mobil single-seater bergaya regulasi F1 2026 yang sangat realistis, dengan asset original atau berlisensi dan UV map yang terdokumentasi. Jangan mengklaim model sebagai mobil resmi atau memakai logo/team livery berhak cipta tanpa izin.
- Editor warna bebas (color picker/HEX/RGB yang divalidasi), layer, dan sedikitnya **50 pilihan decal** yang benar-benar dapat ditempatkan, dipindah, diubah ukuran/rotasi, diubah warna, dihapus, dan disimpan. Daftar decal harus berupa asset siap pakai yang konsisten, bukan 50 label teks.
- Sponsor diambil dari daftar sponsor tim yang aktif/terikat pada tim tersebut. Logo sponsor gunakan asset yang tersedia dan terverifikasi; jangan menampilkan sponsor yang tidak terdaftar.
- Aturan prioritas posisi: Title Sponsor besar pada sisi kiri dan kanan bagian tengah/sidepod; Major Partner pada bagian atas hidung mobil; nomor Driver di bawah Major Partner; sponsor lain pada front wing dan rear wing. Bila sponsor pada kategori/slot tertentu tidak ada, jangan mengarang sponsor pengganti.
- Kamera preview dapat diputar/digeser dengan drag dan zoom yang nyaman di touch/mobile serta mouse/desktop.
- Hasil livery final harus ditampilkan konsisten pada profil tim dan editor. Simpan revisi livery dan asset version agar hasil profil/replay tidak berubah diam-diam ketika livery diedit.
- Audit ukuran texture, draw calls, caching, mobile GPU/memory, fallback, dan reduced motion.

**Dependency/risk gate sebelum coding:** Three.js sudah ada (`three@0.187.0`) dan type package sudah tersedia. Jangan menambah engine 3D lain sebelum evaluasi. Risiko utama bukan dependency, melainkan belum adanya asset chassis/UV produksi yang cocok, sumber logo sponsor, lisensi asset, serta integrasi profil tim. Jika asset original/berlisensi dan UV map belum tersedia, implementasi final fidelity harus BLOCKED; jangan menggantinya dengan model prosedural yang hanya diberi label hyper-realistic.

**Hasil akhir:** konfigurator livery yang realistis, 50+ decal operasional, sponsor otomatis dari data tim dengan penempatan sesuai tier, kamera drag, dan tampilan yang sama pada profil tim.

**QA:** save/load revisions, sponsor roster sync, missing sponsor, decal manipulation, camera touch/mouse, profile consistency, UV seams, visual inspection, mobile performance, RLS.

### Scope 09 — Link nama Driver dan Team secara global

**Pekerjaan:**
- Audit komponen yang menampilkan nama Driver/Team: tabel, kartu, artikel, standings, race result, job search, dropdown, feed, detail, dan modal.
- Jadikan nama Driver/Team sebagai link bergaris bawah dengan target profil yang canonical.
- Gunakan ID stabil, bukan nama sebagai identifier. Nama yang sama tidak boleh membuka profil yang salah.
- Terapkan satu komponen link reusable dengan styling konsisten, focus state, hover, visited behavior yang tetap terbaca, dan aksesibilitas.
- Pertahankan aksi parent (row click, card click, modal) agar tidak ikut terpicu saat link diklik.
- Pastikan data privat tetap terlindungi oleh RLS dan halaman profil publik hanya menampilkan field yang memang diizinkan.

**Hasil akhir:** setiap nama Driver/Team yang ditampilkan sebagai identitas entitas dapat diklik dan membuka profil yang benar, dengan garis bawah yang konsisten.

**QA:** semua halaman/komponen, duplicate names, missing profile, private fields, keyboard navigation, nested click propagation.

### Scope 10 — Manage User

**Target fitur Admin-only:**
- Mengatur role user sesuai role system dan batas otorisasi yang sudah ada.
- Mengatur penempatan tim user melalui alur membership/roster resmi, bukan update bebas yang melewati kontrak/transfer.
- Mengirim peringatan pelanggaran dengan alasan, kategori, bukti/catatan, pelaku admin, waktu, status, dan riwayat.
- Template ban **temporary/active** (durasi dan tanggal akhir yang jelas) dan ban permanen.
- Menampilkan status, riwayat tindakan, alasan, pembuat keputusan, serta opsi pencabutan/akhir masa ban bila diizinkan kebijakan.
- Semua perubahan role, tim, warning, dan ban harus dicatat di audit log dan ditegakkan server-side.
- Ban harus memblokir akses sesuai kebijakan autentikasi yang berlaku tanpa menghapus akun, wallet, kontrak, riwayat, atau data finansial.
- Cegah Admin mengunci dirinya sendiri atau menghilangkan satu-satunya jalur pemulihan owner tanpa mekanisme yang aman.
- Jangan menyamakan FIA dengan Admin. FIA tidak memperoleh kewenangan Manage User.

**Hasil akhir:** satu pusat Manage User yang aman, punya audit trail, dan mengelola status user tanpa merusak identitas/riwayat game.

**QA:** Admin vs FIA vs user biasa, role change, team assignment, temporary ban expiry, permanent ban, unban/appeal policy, session invalidation, RLS/RPC, audit completeness, anti-self-lockout.

**Keputusan yang perlu dikunci dari kebijakan existing:** apakah ban memblokir login total atau hanya akses game; siapa yang boleh mencabut ban; apakah warning punya ambang otomatis. Implementasi mengikuti dokumen aturan yang ada, bukan asumsi baru.

### Scope 11 — Team inactivity detection dan freeze otomatis

**Aturan yang diminta:**
- Aktivitas tim diukur dari aktivitas **Quest** dan **Development**.
- Bila tidak ada aktivitas sama sekali selama satu season penuh, tim otomatis di-freeze dan tidak dapat berkompetisi pada season berikutnya.
- Status Driver pada tim tersebut otomatis mengakhiri kontrak; sisa nilai gaji kontrak dibayar penuh.
- Admin dapat membuka slot baru untuk menggantikan slot tim yang dibekukan.
- Tim dapat kembali aktif dan eligible mengikuti event setelah melakukan minimal **3 aktivitas baru** dari Quest dan/atau Development.

**Pekerjaan:**
- Audit tabel/event quest, development purchase/upgrade, team identity, roster, season lifecycle, payroll, contract terms, prize/competition eligibility, team slot, scheduler, dan audit log.
- Definisikan activity ledger yang authoritative dan idempotent. Hanya aktivitas sah yang committed yang dihitung; page view, login, refresh, failed quest, atau request gagal bukan aktivitas.
- Buat evaluasi pada batas season yang resmi, memakai seluruh rentang season dari kalender database. Tidak boleh menganggap tidak aktif berdasarkan sebagian season.
- Catat ringkasan aktivitas per team + season, keputusan freeze, alasan, timestamp, dan source event. Evaluasi dapat dijalankan ulang tanpa freeze/payout ganda.
- Freeze harus ditegakkan pada backend dan seluruh jalur pendaftaran/kompetisi, bukan sekadar menyembunyikan tombol UI.
- Tutup eligibility season berikutnya dan tandai slot sebagai tersedia. Admin dapat membuka slot pengganti melalui workflow yang tervalidasi; jangan menghapus team lama atau sejarahnya.
- Putuskan kontrak Driver yang terkait sesuai aturan, lalu bayar penuh sisa gaji kontrak. Hitung nilai dari kontrak aktif dan payroll schedule/term resmi yang tersimpan. Buat settlement ledger atomik, idempotent, dapat diaudit, dan tidak membayar dua kali.
- Jangan mengeksekusi freeze/payout jika saldo sumber, kontrak, payroll claim, atau status season tidak dapat direkonsiliasi. Masukkan ke exception queue untuk Admin.
- Aktivitas baru setelah freeze dihitung pada ledger reactivation. Setelah minimal 3 aktivitas baru yang sah dan memenuhi sumber Quest/Development, tim bisa kembali active; Admin tetap dapat mengontrol slot/eligibility sesuai aturan kompetisi yang ada.
- Pastikan reactivation tidak otomatis menghapus settlement kontrak lama atau memulihkan kontrak Driver yang sudah berakhir.

**Hasil akhir:** tim yang benar-benar tidak melakukan aktivitas Quest/Development selama satu season penuh dibekukan secara otomatis; kontrak dan kompensasi diselesaikan aman; slot dapat diganti; tim lama dapat reaktif setelah 3 aktivitas sah.

**Risiko kritis / release gate:** ini menyentuh kontrak, gaji, wallet/ledger, eligibility kompetisi, dan season automation. Wajib audit menyeluruh dan simulasi di Testing. Tidak boleh dirilis ke Production sebelum rekonsiliasi finansial dan skenario idempotency lulus.

**QA:** aktif 1/2/3 aktivitas, nol aktivitas satu season penuh, aktivitas hanya di luar season, quest gagal, development gagal, multi-season, rollover, freeze duplicate, kontrak multi-season, salary remainder, insufficient funds, payout retry, replacement slot, reactivation 2 vs 3 aktivitas, race eligibility, historical records.

## 2. Tahapan pengerjaan

Urutan pengerjaan dikunci untuk mengurangi risiko dan memudahkan checkpoint:

| Tahap | Scope | Prioritas | Catatan |
|---|---|---|---|
| 0 | Audit baseline + dokumen ini | Wajib | Tidak mengubah runtime |
| 1 | 01 Dropdown ganda | Tinggi | Perbaikan UI terisolasi |
| 2 | 02 Copy loading | Tinggi | Perubahan copy lintas aplikasi |
| 3 | 03 Job Search search box | Tinggi | CSS terisolasi |
| 4 | 06 Admin Workflow | Tinggi | Klarifikasi placeholder/route |
| 5 | 07 Duplicate License & Wallet menu | Tinggi | Dua route saat ini memakai komponen sama |
| 6 | 05 Contract Renewal + Driver application | Tinggi | Role, RLS, RPC, kontrak |
| 7 | 04 Newsroom manga | Sedang | UI list + popup |
| 8 | 09 Global Driver/Team profile links | Sedang | Dampak lintas halaman |
| 9 | 10 Manage User | Tinggi | Security dan audit |
| 10 | 08 Team Livery 3D | Tinggi | Bergantung asset/UV berlisensi |
| 11 | 11 Team inactivity freeze | Kritis | Payroll, kontrak, season, competition |

Urutan dapat berubah hanya bila audit dependency menemukan blocker nyata. Perubahan urutan harus dicatat di checkpoint dan tidak boleh menghilangkan scope.

## 3. Global Definition of Done

Satu scope dinyatakan selesai jika seluruh hal yang relevan terpenuhi:

- Requirement scope dipenuhi tanpa perubahan di luar scope.
- Existing behavior yang tidak diminta tetap berfungsi.
- Dependency dan kompatibilitas telah diperiksa.
- TypeScript check, test terkait, build, project validation, dan CI lulus.
- Security/RLS/RPC dites untuk fitur yang menyentuh data atau role.
- QA Android/mobile dan desktop selesai untuk UI.
- Migration diterapkan ke Testing dan Production bila ada perubahan schema; keduanya diverifikasi. Tidak ada dummy data Testing di Production.
- Dokumentasi dan checkpoint diperbarui.
- Branch fitur di-merge ke `main` hanya setelah seluruh gate lulus.
- Vercel environment tidak diubah.

## 4. Checkpoint per scope

| Scope | Status awal | Branch/commit | QA/CI | Testing DB | Production DB |
|---|---|---|---|---|---|
| 01 Dropdown ganda | PLANNED | — | — | N/A | N/A |
| 02 Loading copy | PLANNED | — | — | N/A | N/A |
| 03 Job Search search box | PLANNED | — | — | N/A | N/A |
| 04 Newsroom manga | PLANNED | — | — | N/A* | N/A* |
| 05 Contract renewal/application | PLANNED | — | — | — | — |
| 06 Admin Workflow | PLANNED | — | — | N/A | N/A |
| 07 Duplicate adjustment pages | PLANNED | — | — | N/A | N/A |
| 08 Team Livery 3D | PLANNED | — | — | — | — |
| 09 Global profile links | PLANNED | — | — | N/A | N/A |
| 10 Manage User | PLANNED | — | — | — | — |
| 11 Team inactivity freeze | PLANNED | — | — | — | — |

* Hanya bila audit menemukan kebutuhan schema/media yang benar-benar diperlukan.

## 5. Baseline teknis yang sudah diverifikasi

- Repository: `Morepp461/Kunam`, baseline `main` commit `f31e9f169eccad93b5c0eb8bfd40ed38f1dd41c1`.
- Stack dari README: React 19, TypeScript, Vite, React Router, Supabase, Vercel.
- Dependency relevan: `three@0.187.0`, `@types/three@0.187.0`, `react-router-dom@7.18.5`, `@supabase/supabase-js@2.57.4`.
- Livery existing: Team UV Livery Editor Phase 26; belum mempunyai vehicle asset produksi original/berlisensi dengan UV map yang cocok.
- Contract renewal: migration `20261120000000_driver_contract_renewal_duration.sql`; Owner mengirim offer, Driver menerima/menolak. Driver job application adalah workflow berbeda yang perlu diaudit/dibangun.
- License & Wallet Adjustments: `/admin/adjustments` dan `/admin/data-adjustments` sama-sama merender `AdminAdjustmentCenter`.
- Admin Workflow: route `/admin-workflow` Admin-only; screenshot menampilkan placeholder CRM tools, bukan workflow aktif yang terbukti.
- CI README: dependency install, production dependency audit, TypeScript/application checks, production build, validation script; test commands juga tersedia di package scripts.
- Supabase project yang digunakan: Production `caleris-masters-newgen`; Testing `caleris-masters-testing`.

## 6. Keputusan dan blocker yang tidak boleh diasumsikan

1. **Livery asset:** chassis/UV original atau berlisensi harus tersedia untuk fidelity target. Tanpa itu scope 08 tidak boleh dinyatakan selesai.
2. **Contract application:** aturan negosiasi, lamaran ganda, dan pembatalan harus mengikuti aturan existing atau dikonfirmasi sebelum dibuat.
3. **Manage User:** kebijakan ban login, pencabutan ban, dan warning threshold harus mengikuti policy resmi yang sudah ada.
4. **Inactive team payout:** sumber dana pembayaran penuh sisa gaji harus dibuktikan dari ledger dan aturan payroll; jangan mengambil dana dari wallet yang salah.
5. **Newsroom:** perubahan visual tidak boleh mengubah status publikasi, editorial order, atau isi artikel.
6. **Global profile links:** hanya tautkan entitas yang memiliki canonical ID dan halaman profil yang valid.

---

**Catatan awal:** file ini adalah rencana dan checkpoint, bukan klaim implementasi. Setiap scope tetap PLANNED sampai perubahan benar-benar selesai, lolos QA/CI, dan checkpoint diperbarui dengan bukti.


### Checkpoint Scope 01 — Digital ID theme dropdown (2026-11-23)
- Status: IMPLEMENTED, CI/QA pending.
- Branch: `fix/caleris-scope-01-digital-id-theme-dropdown`.
- Replaced the native HTML select with a single accessible custom menu in the Community Hub Digital ID theme editor. Selecting Classic/Premio/Zwei/Gold updates the existing theme state; the second native Android dropdown is no longer invoked.
- Files: `src/CommunityProgression.tsx`, `src/community-progression.css`.
- Database: no schema/data changes. Testing and Production unchanged.
- Vercel environment: unchanged.
- QA remaining: Android native menu absence, keyboard/ARIA interaction, desktop layout, CI/build.
