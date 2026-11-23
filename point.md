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


### Checkpoint Scope 03 — Job Search search field (2026-11-23)
- Status: IMPLEMENTED, CI/QA pending.
- Branch: `fix/caleris-scope-03-job-search-icon-alignment`.
- Changed: `src/marketplace-directory.css`; explicitly overrides inherited column flex direction on the search label, establishes consistent minimum height, and vertically centers the icon/input.
- Database: no migration required; Testing and Production unchanged.
- Vercel environment: unchanged.
- QA remaining: Android viewport, desktop viewport, search input usability, CI/build.


### Checkpoint Scope 09 — Global driver/team profile links (2026-11-23)
- Status: IMPLEMENTED IN BRANCH, CI/Edge Function QA pending.
- Branch: `feat/caleris-scope-09-entity-profile-links`.
- Added reusable `MemberProfileLink` and `TeamProfileLink` components with consistent underline, hover and keyboard-focus styling.
- Added public Team Profile route `/team/:teamId` and roster display. Driver names on team profiles link to public Driver profiles.
- Extended `member-directory` Edge Function: profile lookup accepts either public Member ID or internal member UUID; added rate-limited `team_profile` action returning only public team/roster data.
- Global Search team results now open the Team Profile. Public Driver Profile links current team to Team Profile.
- Added links in Job Search, Driver Transfer Market, Team Take Over, My Profile, Stage5 standings/directories/Team Summary, and Caleris Ecosystem team/driver sections.
- No DB migration required. Edge Function deployment required on Testing and Production after CI/QA. No Vercel environment changes.
- QA remaining: UUID/public Member ID route, team profile RLS-safe output, search team navigation, all wrapped pages, TypeScript/build, Edge Function deploy to Testing then Production.


## 7. Checkpoint pengerjaan terintegrasi — 23 November 2026

Branch integrasi aktif: `feat/caleris-11-scope-integration-20261123`. Perubahan pada bagian ini sedang digabungkan dari branch fitur yang telah dibuat terpisah. Belum ada migrasi baru yang diterapkan ke database dan belum ada deployment Vercel.

| Scope | Hasil saat ini | Status release |
|---|---|---|
| 01 Dropdown Digital ID | Dropdown custom tunggal dipindahkan ke branch integrasi; komponen dan CSS sudah digabungkan. | QA/CI integrasi pending |
| 02 Loading copy | Shared Stage5 panel memakai teks `Mempersiapkan Data...`. | QA/CI integrasi pending |
| 03 Job Search search box | Perbaikan alignment ikon dan tinggi search field sudah masuk melalui PR #293. | MERGED ke main; QA visual mobile/desktop masih perlu |
| 04 Newsroom manga | Panel berita dipisahkan seperti halaman manga; popup artikel memakai treatment manga. Data/editorial order tidak diubah. | QA/CI integrasi pending |
| 05 Driver contract request | Driver yang sudah terhubung ke tim dapat mengajukan kontrak pertama maupun renewal; Owner dapat menawarkan atau menolak. Salary band dan role checks dipertahankan. Alur first-contract sudah mendapat migration lanjutan dan berhasil diterapkan di Testing. Migration lanjutan 20261123140000 membuat current_contract_id nullable untuk mendukung first contract tanpa mengubah alur keputusan Driver. | QA/CI integrasi pending; migrasi belum diterapkan |
| 06 Admin Workflow | Tujuan halaman dijelaskan sebagai workspace CRM/operasional yang saat ini belum aktif; tidak membuat workflow fiktif. | QA/CI integrasi pending |
| 07 Duplicate adjustment route | `/admin/data-adjustments` diarahkan ke halaman canonical `/admin/adjustments`; item menu duplikat dihapus. | QA/CI integrasi pending |
| 08 Team Livery 3D | Branch eksperimen menyediakan 50 decal vektor, color picker RGB 24-bit, dan drag orbit. Belum memakai model Sketchfab sebenarnya, belum ada UV validation dan sponsor otomatis dari kontrak tim. | BLOCKED untuk release: file model GLB/GLTF yang dapat diproses belum tersedia di repository |
| 09 Global profile links | Komponen link Driver/Team, halaman profil tim, route canonical, dan endpoint publik sudah masuk melalui PR #303. | MERGED ke main; Edge Function deployment dan QA runtime pending |
| 10 Manage User | UI dan Edge Function Admin untuk role, team assignment, warning, temporary/permanent ban, unban, dan audit history telah dipindahkan ke branch integrasi. | QA/CI integrasi pending; migrasi dan Edge Function belum diterapkan |
| 11 Team inactivity freeze | Evaluasi aktivitas per season, settlement sisa kontrak, idempotency, pending compensation, replacement slot, dan reaktivasi 3 aktivitas sudah dipindahkan. | QA/CI integrasi pending; migrasi belum diterapkan; wajib simulasi Testing |

### Validasi penting yang masih wajib

- Scope 05: form request saat ini khusus renewal untuk Driver yang masih punya kontrak aktif. Driver tanpa kontrak aktif diarahkan ke Job Search; jangan menyebutnya sebagai pengajuan kontrak baru sampai alur kontrak baru benar-benar tersedia.
- Scope 08: asset Sketchfab `2025 F1 CAR` belum berada di repository. Model halaman Sketchfab tercatat memiliki sekitar 3,1 juta triangle; perlu file yang dapat diproses, pemeriksaan UV/material, optimasi mobile, serta bukti sponsor aktif sebelum integrasi final. Jangan mengganti asset dengan model prosedural lalu menyebutnya hyper-realistic.
- Scope 10: verifikasi login/session yang sudah terbuka saat ban, expiry, self-lockout, admin protection, dan role FIA vs Admin.
- Scope 11: simulasi 4-season contract yang dimulai pada season freeze menghasilkan 3 season tersisa. Dengan gaji €10.000.000/season, kompensasi yang diharapkan adalah €30.000.000 per Driver. Pastikan sumber dana Team Wallet tersedia; jika tidak, settlement tetap pending dan tidak boleh menandai tim Frozen sebelum seluruh pembayaran selesai.
- Database target: Testing `vxwvhyyvoipjwucbrvlu`; Production `asltczqrmoxnayusvjta`. Testing sudah mencatat ketiga migrasi dengan ledger version `202611230102632` (driver contract request), `202611230102638` (Manage User), dan `202611230102714` (team inactivity freeze). Production belum mencatat ketiganya; migrasi Production menunggu CI, QA Testing, dan merge. Migration lanjutan 20261123140000 sudah diterapkan ke Testing dengan ledger version `20261123105811`; kedua kolom `current_contract_id` terverifikasi nullable. Production masih pending.
- RLS aktif pada enam tabel request/moderation/inactivity; pemeriksaan Testing menemukan satu policy per tabel. RPC yang diuji memberi EXECUTE ke authenticated dan menolak anon.
- Vercel environment tidak diubah. Deployment hanya boleh dilakukan setelah merge, migrasi Production, dan verifikasi deployment.



---

# CURRENT RELEASE CHECKPOINT — 23 November 2026 (supersedes earlier pending notes)

## Release status

- **Integrated PR:** #304, merged to `main`.
- **Main commit:** `7ca671cd576d8f87445908d62fdf78f6226d52f0`.
- **CI:** both required `build` checks completed successfully. The integration workflow also completed TypeScript check, production build, unit/schema validation, Browser smoke tests, Edge Function JWT/profile privacy checks, Driver contract workflow checks, Admin Manage User security checks, Team inactivity/freeze/compensation checks, Member Directory rate-limit regression checks, and Supabase schema parity guard successfully.
- **Vercel Production:** deployment `dpl_32ZtTkedhGnAPsNvAVRkTQ4VdVcy` is `READY`, built from the exact main commit above. Production aliases include `calerismasters.com`, `www.calerismasters.com`, and `calerismastersnewgen-mu.vercel.app`. HTTP check of `https://calerismasters.com` returned 200 OK.
- **Vercel environment:** no environment variables or project environment settings were changed.
- **Supabase:** the four new migrations are present in both Testing and Production ledgers. The Testing ledger uses versions `20261123102632`, `20261123102638`, `20261123102714`, and `20261123105811`; Production uses `20261123110101`, `20261123110104`, `20261123110106`, and `20261123110109`. The first three Testing migration names were stored with their timestamp prefixes, but the applied schema is verified.
- **Schema/security parity:** all six new moderation/inactivity/request tables have RLS enabled and one policy each in both databases. The six checked RPCs grant EXECUTE to `authenticated` and deny it to `anon` in both databases. Both contract request tables have nullable `current_contract_id` in Testing and Production.
- **Edge Functions:** `admin-user-management` and `member-directory` are ACTIVE in both projects. Their deployed source hashes match across Testing and Production; `admin-user-management` has JWT verification enabled. `member-directory` retains its existing `verify_jwt=false` gateway design and performs its own request/auth checks.

## Per-scope release checkpoint

| Scope | Current result | Release status |
|---|---|---|
| 01 Dropdown ganda | Community Hub uses the single custom dropdown path; regression coverage is included in integration validation. | Integrated, CI passed |
| 02 Loading copy | Shared loading copy updated to “Mempersiapkan Data”; the integration build and smoke checks passed. | Integrated, CI passed |
| 03 Job Search search box | Search icon/input alignment correction retained from PR #293. | Merged and deployed |
| 04 Newsroom manga | Newsroom cards and article popup use separated manga-style panels while preserving article data. | Integrated, CI passed |
| 05 Driver contract request | Driver can request first contract or renewal while assigned to a team; Owner can issue or decline the offer. First-contract migration is applied to both databases. | Integrated, CI passed; runtime acceptance still needs real Driver/Owner account walkthrough |
| 06 Admin Workflow | Placeholder page is explicitly described as a CRM/operations workspace awaiting specification; no fictitious CRM actions added. | Integrated, CI passed |
| 07 Duplicate adjustment page | Duplicate migration route redirects to canonical `/admin/adjustments`; duplicate navigation entry removed. | Integrated, CI passed |
| 08 Team Livery 3D | Existing editor still renders a procedural Three.js placeholder with 3 basic colors/patterns and 3 sponsor labels. The supplied 2025 GLB is inspected and attribution documented, but the binary is not present in the Git tree and is not loaded by the production editor. The 50 interactive decals, free decal placement/transform, team sponsor sync, chassis material/UV integration, and drag camera are not complete. | **BLOCKED / NOT DONE** |
| 09 Global profile links | Reusable Driver/Team profile links and public Team Profile route are merged; `member-directory` deployed to both DB projects with matching source hash. | Integrated and deployed |
| 10 Manage User | Admin-only role/team management, warning, temporary/permanent ban, unban, and moderation history are integrated. Edge Function deployed to both DB projects with matching source hash. | Integrated, CI passed; production role-matrix walkthrough remains |
| 11 Team inactivity freeze | Season activity review, freeze workflow, replacement slots, 3-activity reactivation, and idempotent compensation settlement are integrated. The test asserts the specified example: 4-season contract with 1 season elapsed and €10m annual salary yields 3 seasons remaining and €30m compensation per Driver. RLS and RPC grants are verified in both databases. | Integrated, CI passed; no live financial settlement was run against real wallets |

## Scope 08 release gate (remaining work)

The user supplied the 2025 model file `2025_f1_car.glb` (89,383,844 bytes). Its metadata/UV inspection is documented in `docs/assets/2025-f1-car-attribution.md`. The asset has 143 mesh geometries, 271 nodes, approximately 3.1 million triangles, UVs on all geometries, 8 materials, and no embedded textures. Attribution is “2025 F1 CAR” by Abu Saif, CC BY 4.0.

The current editor source `src/TeamLivery.tsx` still explicitly labels the preview “PROCEDURAL CAR MODEL” and constructs the vehicle from primitive Three.js geometries. Do not call this hyper-realistic or claim the GLB is integrated. The binary must first be placed in an approved project asset location and committed/referenced by the production app; then the GLB loader, material/UV mapping, optimized runtime asset, sponsor logo sources, 50 decal assets, color customization, transform controls, camera drag, and Team Profile rendering must be implemented and visually verified. The supplied 2025 model must be described as a 2025 model, not an exact 2026-regulation chassis.

## Required live acceptance checks (not simulated)

1. Sign in with a real Driver account and submit a first-contract request; sign in as that team's Owner and issue an offer; return as Driver and accept/reject.
2. Verify Manage User with Admin, FIA, Owner, and regular-member accounts. FIA must not receive Admin-only moderation access.
3. In Testing only, run a controlled inactive-team scenario with a dedicated test team and wallet fixture. Verify a 4-season contract started in the freeze season pays exactly 3 × annual salary per Driver, does not double-pay on retry, and leaves the team in `awaiting_compensation` if Team Wallet funds are insufficient. Do not use production wallets for simulation.
4. Verify freeze blocks next-season competition entry, replacement slot assignment works, and reactivation requires 3 committed Quest/Development activities after freeze.
5. Scope 08 must not be released until the actual GLB is loaded in the editor and Team Profile and passes Android/mobile GPU, memory, UV, sponsor-placement, and decal interaction checks.

## Next action

Scope 08 is the only scope not implemented to its requested result. The other scopes are merged, CI passed, both databases have the required migrations, the relevant Edge Functions are deployed to both projects, and the main commit is live on Vercel. Continue with a dedicated feature branch for Scope 08; do not alter Vercel environment settings or run production financial simulations.
