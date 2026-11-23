# CHECKPOINT: COMMUNITY PROGRESSION SUITE
> **Dokumen checkpoint pengembangan CALERIS MASTERS**  
> Status acuan: 23 November 2026  
> Repository: `Morepp461/Kunam`  
> Branch dokumentasi: `docs/community-progression-checkpoint`  
> Route utama: `/community`  
> Dokumen ini menjadi titik awal sesi pengembangan berikutnya. Jangan menganggap daftar kekurangan di bawah sudah selesai hanya karena sudah tercatat di sini.

---

## 1. Tujuan Dokumen

Dokumen ini merangkum rancangan, kondisi implementasi, kekurangan, sumber data, integrasi, urutan pengerjaan, dan kriteria hasil akhir untuk delapan area fitur Community Progression CALERIS MASTERS.

Tujuan checkpoint:
- Menjaga konteks agar sesi pengembangan berikutnya bisa langsung melanjutkan pekerjaan.
- Memisahkan fitur yang sudah memiliki fondasi dari fitur yang baru sebagian siap.
- Menjadi acuan scope, QA, integrasi database, dan dokumentasi.
- Mencegah implementasi duplikat, data palsu, atau penghitungan yang tidak bersumber dari data resmi.
- Menjadi daftar acceptance criteria sebelum fitur dinyatakan selesai.

**Batasan penting:** isi dokumen ini tidak mengklaim semua fitur sudah production-ready. Status harus diperiksa lagi terhadap kode dan database saat pekerjaan dilanjutkan.

## 2. Ruang Lingkup: Delapan Area Fitur

PRD repository mengelompokkan sistem ini menjadi tujuh sistem utama, dengan Milestones memiliki dua bagian terpisah. Untuk kebutuhan checkpoint dan pelacakan pekerjaan, keduanya dipisah menjadi delapan area:

1. Driver Career Milestones.
2. Team Milestones.
3. Member Activity Feed.
4. Community Voting.
5. Championship Predictor.
6. Custom Digital ID Card.
7. Season Yearbook Generator.
8. Achievement Badges & Account Leveling.

Semua area berada dalam Community Hub di `/community` dan saling berbagi data sesuai batas kewenangan masing-masing.

## 3. Tujuan Produk dan Hasil Akhir yang Diinginkan

Community Progression harus membuat aktivitas kompetisi dan komunitas terasa memiliki riwayat serta perkembangan jangka panjang.

Hasil akhir yang ditargetkan:
- Member memiliki XP kumulatif dan level akun yang konsisten.
- Driver dapat melihat pencapaian karier yang berasal dari catatan kompetisi resmi.
- Team dapat melihat pencapaian historis yang berasal dari hasil balapan dan roster resmi.
- Aktivitas penting member tercatat dalam feed dengan identitas, waktu, konteks, dan visibilitas yang benar.
- Voting komunitas memiliki alur pembuatan, nominasi, pemungutan suara, penutupan, rekap, dan publikasi hasil yang utuh.
- Predictor menggunakan data musim dan aturan skor resmi, serta menampilkan probabilitas sebagai estimasi, bukan hasil resmi.
- Digital ID menjadi kartu identitas digital yang informatif, bisa dibagikan, dan tetap menjaga privasi.
- Yearbook menghasilkan arsip musim yang mudah dibaca dan dibagikan, bukan hanya dump data mentah.
- Badge memiliki katalog, aturan perolehan, tingkat kelangkaan bila ditetapkan, dan riwayat award yang dapat diaudit.
- Seluruh data historis tetap konsisten, tidak terduplikasi, dan tidak berubah akibat refresh halaman atau pemanggilan berulang.
- Semua perubahan database tercatat dalam migration, diuji di Supabase testing, dan sinkron dengan branch `main` setelah proses review yang benar.

## 4. Status Implementasi Saat Checkpoint

### 4.1 Driver Career Milestones
**Tujuan:** menampilkan progres dan tonggak perkembangan akun/karier Driver.

**Yang sudah ada:**
- Definisi milestone bersifat data-driven.
- Progress Driver disimpan terpisah dari definisi milestone.
- Milestone XP mengikuti ambang progres kumulatif.
- Fondasi sinkronisasi milestone dengan XP dan pemberian badge milestone sudah tersedia.

**Kekurangan / belum tuntas:**
- Milestone yang berbasis XP belum cukup untuk menggambarkan karier balap secara utuh.
- Statistik karier seperti race starts, wins, podiums, poles, gelar juara, dan catatan musim perlu dipastikan berasal dari sumber hasil resmi dan dihitung konsisten.
- Perlu validasi bahwa koreksi/pembatalan hasil resmi memperbarui agregat dengan benar tanpa menggandakan reward.
- Perlu tampilan riwayat milestone yang menjelaskan syarat, progres, tanggal tercapai, dan reward.

**Yang perlu ditambahkan:**
- Katalog milestone karier berbasis statistik kompetisi resmi.
- Perhitungan ulang/rekonsiliasi yang aman jika hasil balapan dikoreksi.
- Riwayat pencapaian dan indikator milestone yang belum tercapai.
- Test untuk batas ambang, pencapaian simultan, dan event duplikat.

**Sumber data:**
- XP ledger dan milestone progress untuk milestone berbasis XP.
- Official race result/classification dan season standings untuk statistik balap.
- Season/round/driver roster snapshots untuk konteks historis.
- Jangan menghitung karier dari data input manual atau hasil simulasi Predictor.

**Hasil akhir:** halaman Career menampilkan progres XP dan statistik karier resmi secara terpisah, dengan detail pencapaian yang dapat ditelusuri.

### 4.2 Team Milestones
**Tujuan:** memberi penghargaan atas sejarah dan performa tim.

**Yang sudah ada:**
- Definisi dan progress milestone memiliki lingkup Team.
- Katalog awal mencakup race starts, wins, podiums, dan jumlah Driver aktif.
- Progress di-refresh dari race-result entries dan jumlah roster Driver saat ini.
- Integrasi hasil race dan roster sudah memiliki fondasi.

**Kekurangan / belum tuntas:**
- Pembaruan progress belum boleh bergantung hanya pada event insert hasil race.
- Perubahan roster, koreksi hasil, penghapusan/void hasil, pergantian atribusi tim, dan perubahan status kontrak harus ditangani atau direkonsiliasi.
- Perlu memastikan metrik historis memakai team snapshot pada hasil resmi, bukan hanya roster saat ini.
- Perlu riwayat pencapaian, syarat, serta reward yang konsisten.

**Yang perlu ditambahkan:**
- Satu sumber perhitungan authoritative untuk seluruh metrik Team.
- Reconciliation job/RPC yang idempotent untuk menghitung ulang progress dari data resmi.
- Pemicu pembaruan untuk perubahan roster dan koreksi hasil yang relevan.
- Tes transfer Driver, kontrak berakhir, roster berubah, hasil direvisi, dan event berulang.

**Sumber data:**
- Official race-result entries beserta team snapshot.
- Team/Driver contract dan roster aktif untuk metrik line-up saat ini.
- Season dan round resmi.
- Jangan mengubah statistik historis tim berdasarkan roster terbaru.

**Hasil akhir:** Team Milestones tetap benar meskipun roster berubah atau hasil lama dikoreksi.

### 4.3 Member Activity Feed
**Tujuan:** menyediakan timeline aktivitas penting member di CALERIS MASTERS.

**Yang sudah ada:**
- Struktur activity menyimpan actor, team, event type, title, body, metadata, visibility, dan timestamp.
- Feed memiliki aturan visibilitas untuk event komunitas, team, dan private.
- Event yang telah terhubung mencakup race result, check-in, quest completion, development purchase, XP, dan voting.
- Logging aktivitas race/check-in/quest/shop tidak bergantung pada apakah reward XP disetel lebih dari nol.

**Kekurangan / belum tuntas:**
- Cakupan event bisnis belum lengkap.
- Aktivitas seperti transfer dan kontrak, perubahan tim/role, sponsorship, payroll, merchandise, milestone, badge, voting outcome, dan aktivitas ekonomi lain perlu dipetakan berdasarkan kebutuhan privasi.
- Harus dipastikan feed tidak membocorkan saldo, detail kontrak privat, atau metadata sensitif.
- Perlu pengujian urutan waktu, pagination, visibilitas, dan deduplikasi.
- Fungsi logging berhak istimewa perlu audit grant/authorization sebelum dianggap aman.

**Yang perlu ditambahkan:**
- Event catalog resmi: nama event, pemicu, actor, target, visibility, metadata yang diizinkan.
- Integrasi event yang memang termasuk scope dan tidak mengekspos data privat.
- Pagination/cursor dan filter yang konsisten.
- Pengujian RLS, anon/authenticated access, dan pemalsuan actor.
- Audit khusus fungsi `caleris_log_activity`: periksa SECURITY DEFINER, owner, search_path, EXECUTE grants, validasi identitas actor, serta jalur pemanggilan. Ini adalah **security review prioritas tinggi**, bukan klaim bahwa celah sudah terbukti.

**Sumber data:**
- Event resmi dari database transaction/RPC/trigger.
- XP ledger, race result, check-in, quest, shop, voting, kontrak, dan ekonomi sesuai event yang disetujui.
- Actor identity harus berasal dari sesi/otoritas server, bukan dipercaya dari payload client.

**Hasil akhir:** feed menjadi timeline yang akurat, aman, dapat dipaginasi, dan tidak mencampurkan aktivitas privat ke ruang publik.

### 4.4 Community Voting
**Tujuan:** memberi ruang partisipasi komunitas untuk penghargaan Driver/Team of the Period/Season dan nominasi FIA.

**Yang sudah ada:**
- Admin dapat membuat poll melalui RPC khusus.
- Jenis poll dibatasi pada Driver of the Period, Team of the Period, Driver of the Season, Team of the Season, dan FIA nomination.
- Kandidat minimal dua.
- Satu member hanya dapat memberikan satu suara per poll.
- Vote record hanya dapat dibaca oleh pemilik suara; agregat dapat disediakan terpisah.
- Voting memberikan badge Community Voice.
- Nominasi FIA tidak otomatis memberikan role atau permission FIA.

**Kekurangan / belum tuntas:**
- Alur lifecycle voting perlu diselesaikan dari pembuatan sampai publikasi.
- Perlu dashboard rekap hasil untuk Admin dan tampilan hasil publik setelah poll ditutup.
- Belum ada integrasi final yang lengkap antara pemenang voting dan penghargaan/rekam musim.
- Perlu kebijakan tie, pembatalan poll, perubahan kandidat, jadwal buka/tutup, dan audit trail.
- Harus dicegah perubahan kandidat atau suara setelah penutupan.

**Yang perlu ditambahkan:**
- Status poll: draft, scheduled, open, closed, finalized, cancelled.
- Aturan waktu buka/tutup yang divalidasi server.
- Rekap agregat yang tidak membocorkan pilihan individu.
- Finalisasi pemenang dengan audit trail dan idempotency.
- Publikasi hasil ke Activity Feed, Yearbook, dan badge bila memang menjadi aturan penghargaan.
- Workflow nominasi FIA tetap terpisah dari proses pemberian role oleh Admin.

**Sumber data:**
- Poll dan candidate records.
- Vote records yang hanya dihitung server-side.
- Member/team identity dan status eligibility.
- Jadwal/period/season resmi untuk konteks penghargaan.

**Hasil akhir:** voting transparan, tidak dapat dimanipulasi lewat client, memiliki hasil final yang dapat diaudit, dan tidak mengubah role keamanan secara otomatis.

### 4.5 Championship Predictor
**Tujuan:** memberi simulasi peluang klasemen berdasarkan standings, sisa jadwal, dan aturan skor aktif.

**Yang sudah ada:**
- Predictor dapat memuat Driver standings, scheduled rounds, dan active FIA scoring rules.
- Manual inputs tetap tersedia untuk skenario what-if.
- Simulasi Monte Carlo menjalankan 15.000 trials.
- Nilai Sprint dan pole bonus dibaca dari scoring-rule aktif.
- Sistem memiliki batas matematis untuk peluang 100%/0% dengan syarat strict mathematical lead.
- Bila tiebreak chain resmi belum tersedia, kondisi seri tidak dinyatakan locked.
- Live standings dari sumber round standings diprioritaskan; final standings menjadi fallback.
- Hasil diposisikan sebagai estimasi, bukan klasemen resmi.

**Kekurangan / belum tuntas:**
- Model simulasi masih sederhana dan belum sepenuhnya mempertimbangkan kekuatan Driver, performa mobil, konsistensi, karakteristik circuit, reliability, atau performa aktual dari Race Engine.
- Perlu audit pemetaan Sprint, pole bonus, dan aturan scoring agar semua variasi format kompetisi benar.
- Official tiebreak chain belum sepenuhnya dimodelkan.
- Perlu validasi terhadap season yang jadwalnya berubah, round yang ditunda, hasil yang belum final, DNF/DSQ, dan jumlah peserta berbeda.
- Hasil probabilitas perlu diberi label, asumsi, dan waktu snapshot.

**Yang perlu ditambahkan:**
- Model performa berbasis data historis resmi jika data tersebut tersedia dan kualitasnya memadai.
- Parameter circuit/vehicle/driver hanya jika memiliki sumber resmi; jangan mengarang telemetry atau atribut.
- Validasi scoring vector untuk race, sprint, pole, dan bonus lain.
- Tiebreak rules resmi dari konfigurasi FIA.
- Regression tests dengan skenario season nyata dan kasus batas.
- Label “simulasi/estimasi”, jumlah trial, sumber standings, dan timestamp data.

**Sumber data:**
- Live Driver standings dari round standings resmi.
- Final standings sebagai fallback yang eksplisit.
- Scheduled rounds dari season calendar.
- Active FIA scoring-rule rows.
- Riwayat official race results jika model performa dikembangkan.
- Data Race Engine hanya jika benar-benar tersedia dan memiliki kontrak data yang tervalidasi.

**Hasil akhir:** Predictor menghasilkan estimasi yang dapat dijelaskan, reproducible, memakai aturan aktif, dan tidak pernah menulis atau menggantikan hasil resmi.

### 4.6 Custom Digital ID Card
**Tujuan:** menyediakan kartu identitas digital member yang merepresentasikan profil dan pencapaian CALERIS.

**Yang sudah ada:**
- Tema Classic, Premio, Zwei, dan Gold.
- Accent color dan tagline divalidasi.
- Preferensi public visibility disimpan per member.
- Penyimpanan memakai RPC dengan scope member.

**Kekurangan / belum tuntas:**
- Public member ID/profile route khusus untuk kartu belum tersedia secara lengkap.
- Shareable canonical link belum tersedia/terverifikasi.
- QR code dan mekanisme verifikasi ke halaman resmi belum tersedia.
- Sinkronisasi otomatis seluruh data profil, level, badge, dan milestone ke kartu perlu diselesaikan.
- Perlu fallback jika kartu diset private atau member tidak lagi aktif.

**Yang perlu ditambahkan:**
- Halaman publik read-only dengan identifier yang aman dan tidak mengekspos data privat.
- Share link stabil.
- QR code yang mengarah ke halaman verifikasi CALERIS, bukan sekadar menyimpan teks profil.
- Pengaturan public/private dan preview sebelum publish.
- Data card berasal dari sumber server yang tervalidasi.
- Opsi export/share yang responsif di perangkat mobile.

**Sumber data:**
- Member profile dan public member ID.
- Team/division affiliation yang boleh ditampilkan.
- XP level dan earned badges.
- Driver/team milestones yang boleh dipublikasikan.
- Preferensi Digital ID dan visibility.
- Jangan tampilkan wallet, data privat, atau informasi kontrak yang tidak diizinkan.

**Hasil akhir:** Digital ID dapat dibagikan dan diverifikasi, tampil baik di Android/mobile, serta menghormati pilihan privasi member.

### 4.7 Season Yearbook Generator
**Tujuan:** membuat arsip per musim untuk merangkum kompetisi dan perjalanan member.

**Yang sudah ada:**
- Yearbook terikat pada member dan season.
- Snapshot memuat metadata season, profil, level, XP, earned badges, recent activity, final Driver/Team standings, divisions, scheduled rounds, race result entries, dan active FIA scoring rules.
- Data season diambil melalui server-side season-data RPC.
- Export saat ini berupa JSON client-side.
- Snapshot tidak mengarang data historis yang tidak tersedia.

**Kekurangan / belum tuntas:**
- Output JSON belum menjadi yearbook visual yang siap dibaca/dibagikan.
- Belum ada layout editorial lengkap, cover, daftar isi, statistik visual, highlight, foto, dan narasi.
- Perlu penanganan data yang tidak lengkap atau member yang berganti tim/divisi.
- Perlu verifikasi bahwa snapshot konsisten dan tidak berubah diam-diam setelah dibuat.
- Belum ada export PDF/print-ready yang matang.

**Yang perlu ditambahkan:**
- Template yearbook responsif dengan cover dan bagian per musim.
- Ringkasan statistik pribadi dan tim berdasarkan data resmi.
- Race-by-race timeline, hasil, standings, dan milestone.
- Highlight komunitas/voting hanya jika datanya final dan publik.
- Export PDF atau format share yang layak cetak.
- Snapshot versioning, generated_at, data provenance, dan regeneration policy.
- Fallback untuk gambar yang tidak tersedia tanpa mengganti fakta dengan data rekaan.

**Sumber data:**
- Snapshot server-side yearbook.
- Official season metadata, divisions, scheduled rounds, race result entries, standings, dan scoring rules.
- Member profile, XP, level, badge, dan activity yang boleh ditampilkan.
- Media hanya dari asset CALERIS yang sah/tersedia.

**Hasil akhir:** yearbook menjadi arsip visual yang akurat, dapat disimpan/dibagikan, dan tetap merepresentasikan data historis saat season berakhir.

### 4.8 Achievement Badges & Account Leveling
**Tujuan:** memberi penghargaan konsisten atas kontribusi, partisipasi, dan pencapaian member.

**Yang sudah ada:**
- XP menggunakan ledger kumulatif dan tidak direset saat level-up.
- Level threshold dimulai LV0 di bawah 50 XP; LV1 50, LV2 100, LV3 200, LV4 400, LV5 800, LV6 1.600, LV7 3.200, LV8 6.400; ambang berikutnya berlipat dua sampai LV100.
- Sumber XP yang dirancang: race result, check-in, quest, milestone, shop purchase, dan admin adjustment.
- XP idempotent berdasarkan member/source type/source ID.
- Reward XP adalah konfigurasi, bukan angka hardcoded; instalasi baru default nol sampai Admin mengatur.
- Award dan milestone RPC dibatasi service role atau registered site admin.
- Fondasi badge milestone dan Community Voice tersedia.

**Kekurangan / belum tuntas:**
- Katalog badge belum mencakup seluruh kategori dan kondisi award yang dibutuhkan.
- Perlu aturan rarity/tier bila memang dipakai dalam desain produk.
- Reward XP default nol berarti Admin wajib mengonfigurasi reward sebelum member memperoleh XP dari event tersebut.
- Perlu audit anti-duplikasi dan koreksi ledger ketika sumber event dibatalkan atau dikoreksi.
- Perlu UI katalog, locked/unlocked state, detail syarat, tanggal diperoleh, dan riwayat award.
- Perlu memastikan badge yang tampil di Digital ID dan Yearbook hanya badge yang benar-benar earned.

**Yang perlu ditambahkan:**
- Katalog badge lengkap beserta code, kategori, deskripsi, syarat, icon/asset, rarity (jika ditetapkan), dan status aktif.
- Award rules server-side yang idempotent.
- Admin configuration untuk reward XP dan aktivasi katalog.
- UI level progress dan badge collection.
- Audit ledger, duplicate source, rollback/correction policy, dan admin adjustment trail.
- Tes seluruh threshold LV0–LV100, termasuk angka besar dan batas integer/database.

**Sumber data:**
- XP ledger sebagai sumber tunggal saldo XP.
- XP reward configuration.
- Official race result, check-in, quest claim/completion, shop purchase, milestone, voting, dan admin adjustment yang diizinkan.
- Badge definitions dan member badge awards.
- Jangan menghitung XP dari jumlah baris feed; feed bukan ledger reward.

**Hasil akhir:** level dan badge konsisten, dapat diaudit, tidak bisa di-farm melalui request berulang, dan tersinkron dengan Digital ID serta Yearbook.

## 5. Aturan XP dan Level yang Harus Dipertahankan

- XP bersifat kumulatif dan tidak direset saat level naik.
- Ambang awal:
  - LV0: kurang dari 50 XP.
  - LV1: 50 XP.
  - LV2: 100 XP.
  - LV3: 200 XP.
  - LV4: 400 XP.
  - LV5: 800 XP.
  - LV6: 1.600 XP.
  - LV7: 3.200 XP.
  - LV8: 6.400 XP.
- Setiap level berikutnya menggandakan ambang sampai LV100.
- Nilai reward per event harus berasal dari konfigurasi Admin dan default instalasi baru adalah 0.
- Satu sumber event hanya boleh menghasilkan satu award per member/source identity.
- Feed event dan XP award adalah dua concern terpisah. Aktivitas tetap dapat tercatat meski reward XP bernilai nol.
- Jangan pernah menjadikan client sebagai otoritas pemberi XP atau badge.

## 6. Koneksi Antar Fitur

### 6.1 Alur data utama

```text
Official Competition Data
  ├─ Race results / classifications
  ├─ Check-in
  ├─ Season, division, rounds, schedule
  ├─ Driver & Team standings
  ├─ Active FIA scoring rules
  └─ Driver contracts / current roster
          |
          +------------------------------+
          |                              |
          v                              v
  Member Activity Feed             Career / Team Milestones
          |                              |
          |                              v
          |                       Achievement Badges
          |                              |
          +----------+-------------------+
                     |
                     v
             XP Ledger & Leveling
                     |
          +----------+-----------+
          |                      |
          v                      v
     Custom Digital ID      Season Yearbook
          |
          +-- public share / verification

Season + standings + schedule + scoring rules
          |
          v
  Championship Predictor
  (read-only estimate; never official result)

Community Voting
  ├─ Polls / candidates / votes
  ├─ Community Voice badge
  └─ Finalized award results
       ├─ Activity Feed
       ├─ Yearbook
       └─ Achievement collection (only if award rule defines it)
```

### 6.2 Integrasi yang sudah memiliki fondasi
- Race result → XP ledger (jika reward dikonfigurasi).
- Race result → Activity Feed.
- Race result → Team milestone progress.
- Check-in → XP ledger dan Activity Feed.
- Quest completion/claim flow → XP/activity integration sesuai event yang tersedia.
- Development shop purchase → XP ledger dan Activity Feed.
- XP ledger → cumulative account level.
- Driver milestone → milestone badge.
- Voting → Community Voice badge.
- Season data RPC → Predictor dan Yearbook.
- Digital ID menyimpan preferensi tema, accent, tagline, dan visibility.

### 6.3 Integrasi yang harus diselesaikan/divalidasi
- Koreksi hasil resmi harus memperbarui statistik karier dan Team Milestones tanpa menggandakan XP.
- Roster/contract changes harus memperbarui metrik line-up Team Milestones.
- Voting finalization harus menerbitkan hasil yang dapat dikonsumsi Activity Feed, Yearbook, dan award/badge rules.
- Digital ID harus mengonsumsi level, badge, milestone, dan identitas publik dari sumber authoritative.
- Yearbook harus menyusun data season dan pencapaian menjadi output visual.
- Predictor perlu memperkaya model hanya dari data resmi yang benar-benar tersedia.
- Semua activity logging harus aman terhadap actor spoofing dan akses yang tidak sah.

## 7. Sumber Data dan Prinsip Kebenaran

| Area | Sumber utama | Prinsip |
|---|---|---|
| Driver Career | Official race results, standings, XP ledger | Statistik karier bukan input manual |
| Team Milestones | Race-result team snapshot, roster/contract | Historis memakai snapshot saat event |
| Activity Feed | Server-side events dari RPC/trigger | Actor dan visibility divalidasi server |
| Voting | Poll, candidates, vote records | Vote dihitung server-side; suara individu privat |
| Predictor | Live standings, rounds, scoring rules | Estimasi read-only, bukan hasil resmi |
| Digital ID | Member profile, public ID, XP, badges | Hanya data yang boleh dipublikasikan |
| Yearbook | Server-side season snapshot | Jangan mengarang data yang tidak tersedia |
| Badges/Level | XP ledger, badge definitions/awards | Ledger idempotent sebagai sumber tunggal |

Prinsip wajib:
1. Data kompetisi resmi tetap menjadi otoritas hasil.
2. Snapshot historis tidak boleh ditimpa oleh kondisi roster terbaru.
3. XP tidak dihitung dari Activity Feed.
4. Predictor tidak boleh menulis klasemen atau race result.
5. Digital ID dan Yearbook harus mengikuti aturan privasi.
6. Semua reward/award harus idempotent.
7. Tidak ada angka, telemetry, foto, statistik, atau narasi faktual yang dibuat-buat.
8. Semua query/RPC baru harus mengikuti RLS dan authorization boundary yang sudah ada.

## 8. Prioritas Pengerjaan

### P0 — Security & data integrity
- Audit `caleris_log_activity` dan seluruh SECURITY DEFINER yang dipakai Community Progression.
- Verifikasi owner, search_path, EXECUTE grants, auth identity, service-role/site-admin checks, RLS.
- Uji actor spoofing, member lain, anonymous, dan authenticated non-admin.
- Audit idempotency XP/badge/feed.
- Audit koreksi/void official race result terhadap XP, milestone, dan activity.
- Pastikan tidak ada public access yang bocor ke vote records atau data Digital ID private.

### P1 — Tutup integrasi data inti
- Selesaikan sumber metrik Driver Career dari hasil resmi.
- Buat rekonsiliasi Team Milestones yang mencakup hasil dan roster.
- Lengkapi event catalog Activity Feed dengan visibility rules.
- Selesaikan voting lifecycle sampai finalisasi hasil.
- Validasi scoring vectors dan tie rules Predictor.

### P2 — Selesaikan pengalaman member
- Lengkapi Badge Catalog dan UI collection.
- Sinkronisasi data Digital ID, public profile, share link, dan QR verification.
- Bangun Yearbook visual dan export yang layak dibagikan.
- Tampilkan provenance/timestamp pada data Predictor dan Yearbook.

### P3 — Hardening dan QA
- Regression test untuk semua fitur dan lintas integrasi.
- Uji Android/mobile, responsive layout, loading/error/empty states.
- Uji RLS dan permission matrix.
- Uji data season lama dan season aktif.
- Uji duplicate trigger, retry, race result correction, roster changes, dan poll close/finalize.
- Periksa query performance, pagination, dan index.
- Update README dan PRD setelah implementasi.

## 9. Acceptance Criteria: Kapan Dianggap Selesai

Fitur tidak boleh dinyatakan selesai hanya karena halaman tampil.

### Driver Career
- Statistik berasal dari hasil resmi.
- Koreksi hasil memperbarui statistik tanpa duplikasi.
- Detail milestone dan riwayat dapat dibuka.

### Team Milestones
- Progress benar untuk race starts/wins/podiums/roster.
- Perubahan roster dan hasil revisi tercermin dengan benar.
- Data historis tidak berubah mengikuti roster baru.

### Activity Feed
- Semua event dalam event catalog tercatat sekali.
- Visibility per event diuji.
- Tidak dapat memalsukan actor atau membaca data privat.
- Pagination dan urutan waktu stabil.

### Community Voting
- Admin dapat membuat dan menjadwalkan poll.
- Satu suara per member per poll.
- Vote tidak dapat diubah setelah aturan penutupan berlaku.
- Rekap tidak membocorkan pilihan individu.
- Finalisasi dan publikasi hasil idempotent.
- Nominasi FIA tidak memberi role.

### Championship Predictor
- Menggunakan standings, rounds, dan scoring rules aktif.
- Validasi race/sprint/bonus/tiebreak sesuai konfigurasi resmi.
- Hasil selalu diberi label estimasi dan tidak mengubah data resmi.
- Uji skenario matematis dan kasus tepi lolos.

### Digital ID
- Tema dan personalisasi tersimpan.
- Public/private visibility benar.
- Share URL dan QR mengarah ke halaman verifikasi resmi.
- Tidak ada data privat yang terekspos.
- Layout dan share flow berfungsi di Android.

### Yearbook
- Snapshot lengkap sesuai data yang tersedia.
- Output visual terbaca dan bisa dibagikan/di-export.
- Data tidak direkayasa dan snapshot memiliki timestamp/version.
- Riwayat musim tetap konsisten.

### Badges & Level
- XP cumulative, threshold LV0–LV100 benar.
- Semua event reward idempotent.
- Badge hanya diberikan saat syarat server-side terpenuhi.
- Admin bisa mengatur reward sesuai kewenangan.
- Riwayat award dan XP dapat diaudit.

### Cross-feature
- Tidak ada duplikasi event/reward ketika trigger atau RPC dipanggil ulang.
- Semua integrasi memiliki test.
- Tidak ada regression pada Race Engine, Economy Engine, member identity, atau season lifecycle.
- CI lulus dan migration ledger/schema testing sinkron.

## 10. Database, Repository, dan Prosedur Pengembangan

Repository menggunakan React 19, TypeScript, Vite, React Router, Supabase Auth/PostgreSQL/Storage/Edge Functions, dan Vercel. Database schema dikelola melalui file versioned di `supabase/migrations/`.

Prosedur wajib untuk sesi implementasi berikutnya:
1. Periksa branch `main`, README, PRD ini, file implementasi Community Progression, migration terkait, dan status CI terbaru.
2. Periksa dependency dan dampak perubahan sebelum coding. Jangan upgrade dependency tanpa alasan teknis yang jelas.
3. Buat branch baru dari `main`; jangan bekerja langsung di `main`.
4. Implementasikan scope yang disepakati, termasuk migration jika schema/RPC/trigger/policy berubah.
5. Terapkan migration ke **Supabase testing project** terlebih dahulu. Jangan mengubah production DB tanpa instruksi dan proses yang sesuai.
6. Jalankan check, build, validation script, test, security review, dan CI.
7. Perbaiki kegagalan QA/CI sebelum merge.
8. Merge hanya setelah review dan CI lolos.
9. Verifikasi migration ledger dan schema parity terhadap branch `main`.
10. Verifikasi Vercel deployment setelah merge. Jangan mengubah environment variables Vercel tanpa izin eksplisit.
11. Update README dan PRD/checkpoint agar dokumentasi mencerminkan implementasi sebenarnya.

**Jangan melakukan merge sebelum QA/CI lolos. Jangan menyatakan deploy berhasil sebelum status deployment benar-benar diverifikasi.**

## 11. Referensi Repository yang Sudah Diperiksa

- `README.md`: ringkasan stack, route Community Hub, fitur, integrasi, dan catatan implementasi.
- `docs/COMMUNITY_PROGRESSION_PRD.md`: scope, XP/level rules, milestone, feed, voting, Predictor, Digital ID, Yearbook, badges, security, dan route.
- Route yang tercatat: `/community`.
- Implementasi utama disebut di README sebagai Community Hub dan entry point Quick Access member sidebar.

PRD menyebut tujuh sistem utama karena Driver Milestones dan Team Milestones dikelompokkan sebagai satu butir. Checkpoint ini memecahnya menjadi delapan area agar status dan QA masing-masing bisa dilacak.

## 12. Catatan untuk Sesi Berikutnya

Mulai sesi baru dengan membaca file `point.md` ini terlebih dahulu, lalu verifikasi ulang kondisi aktual repository dan database. Gunakan dokumen ini sebagai baseline rencana, bukan bukti bahwa setiap item masih persis sama di kode saat sesi baru dimulai.

**Urutan awal yang disarankan:** mulai dari P0 security/data integrity, lanjut P1 integrasi data inti, kemudian P2 pengalaman member, dan tutup dengan P3 QA. Jangan memperluas scope ke fitur lain di luar Community Progression Suite sebelum checkpoint ini dituntaskan atau user mengubah prioritas.
