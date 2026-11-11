# Caleris Masters

**Caleris Masters** adalah platform Motorsport Roleplay yang sedang dibangun menjadi platform interaktif. Anggota nantinya dapat mengembangkan karier dan tim, mengajukan transaksi, serta menjalankan aktivitas sesuai peran masing-masing.

## Status saat ini

Landing page publik dirancang satu layar agar ringkas dan responsif pada komputer, tablet, serta ponsel. Hero menggunakan assets/Background 2.png sebagai visual utama, dengan motion cinematic berbasis CSS dan Canvas 2D. Tidak ada model 3D atau dependensi rendering 3D pada landing page.

## Teknologi

- HTML, CSS, dan JavaScript.
- Canvas 2D untuk floating dust particles yang loop 14 detik.
- Google Fonts untuk tipografi.
- GitHub Actions untuk pemeriksaan otomatis.
- Vercel untuk hosting statis.

Belum ada integrasi Supabase pada tahap landing page ini.

## Struktur proyek

- index.html: landing page, gambar latar, kontrol tema, dan navigasi utama.
- cinematic-motion.js: dust particles halus dengan pergerakan periodik 14 detik.
- assets/Background.png: gambar utama hero.
- assets/: logo Caleris Masters dan aset identitas visual.
- scripts/validate.py: pemeriksaan struktur dan kebutuhan utama halaman.
- .github/workflows/ci.yml: alur pemeriksaan otomatis.
- vercel.json: konfigurasi hosting statis.

## Motion dan aksesibilitas

- Asap bergerak perlahan naik dan menyebar di area bawah gambar.
- Tekstur asap dibuat dari beberapa radial gradient yang lembut, bukan bentuk lingkaran keras.
- Canvas menyesuaikan ukuran layar dan device pixel ratio hingga 2x.
- Animasi berhenti saat tab tidak aktif dan menghormati prefers-reduced-motion.
- Foto asli tetap menjadi layer utama dan tidak diubah kontennya; motion hanya berupa transformasi kamera serta overlay cahaya.

## Deployment Vercel

Repositori menggunakan vercel.json dengan Framework Preset Other, tanpa framework build atau instalasi dependensi. Output deployment diambil langsung dari direktori utama.

## Menjalankan pemeriksaan

```bash
python3 scripts/validate.py
node --check cinematic-motion.js
```

## Tombol landing page

- Rules mengarah ke /rules.
- Login with Discord mengarah ke /auth/discord.
- Join Our Community masih menggunakan URL Discord umum dan perlu diganti dengan undangan komunitas resmi.

Autentikasi Discord dan halaman Rules memerlukan endpoint final sebelum dapat diaktifkan.