# Caleris Masters

**Caleris Masters** adalah platform Motorsport Roleplay yang sedang dibangun menjadi platform interaktif. Anggota nantinya dapat mengembangkan karier dan tim, mengajukan transaksi, serta menjalankan aktivitas sesuai peran masing-masing.

## Status saat ini

Landing page publik dirancang satu layar dan responsif pada komputer, tablet, serta ponsel. Hero menggunakan `assets/Background 2.png` dengan motion cinematic CSS dan Canvas 2D.

## Teknologi

- HTML, CSS, dan JavaScript tanpa framework tambahan.
- Canvas 2D untuk floating dust particles dalam loop 14 detik.
- CSS keyframes untuk slow zoom 2,5%, spotlight, dan refleksi cahaya.
- Vercel untuk hosting statis dan pemeriksaan build.

## Struktur proyek

- `index.html`: landing page, gambar latar, kontrol tema, dan navigasi utama.
- `cinematic-motion.js`: dust particles halus dengan pergerakan periodik 14 detik.
- `assets/Background 2.png`: gambar utama hero.
- `assets/`: logo Caleris Masters dan aset identitas visual.
- `scripts/validate.py`: pemeriksaan struktur halaman, aset, dan motion.
- `vercel.json`: konfigurasi hosting statis serta perintah validasi build.

## Motion dan aksesibilitas

- Slow zoom 2,5% dengan loop 14 detik.
- Floating dust particles halus dengan gerakan periodik.
- Spotlight bergerak perlahan dari kiri atas.
- Refleksi cahaya mobil dan lantai berubah secara subtle.
- Foto asli tetap utuh; tidak ada asap, neon, atau distorsi objek.
- Canvas menyesuaikan ukuran layar dan device pixel ratio hingga 2x.
- Animasi dust berhenti saat tab tidak aktif dan menghormati `prefers-reduced-motion`.

## Validasi dan deployment

Vercel menjalankan `node --check cinematic-motion.js` dan `python3 -B scripts/validate.py` sebagai build command sebelum deployment. Build dianggap valid hanya jika kedua pemeriksaan berhasil.

GitHub Actions saat ini tidak dipakai karena runner repository berakhir sebelum job memperoleh runner ID atau menjalankan langkah apa pun. Pemeriksaan build dan QA dipusatkan pada pipeline Vercel agar deployment tidak tertahan oleh runner GitHub yang tidak tersedia.

## Menjalankan pemeriksaan lokal

```bash
node --check cinematic-motion.js
python3 -B scripts/validate.py
```

## Tombol landing page

- Rules mengarah ke `/rules`.
- Login with Discord mengarah ke `/auth/discord`.
- Join Our Community masih menggunakan URL Discord umum dan perlu diganti dengan undangan komunitas resmi.

Autentikasi Discord dan halaman Rules memerlukan endpoint final sebelum dapat diaktifkan.
