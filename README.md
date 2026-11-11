# Caleris Masters

**Caleris Masters** adalah platform Motorsport Roleplay yang sedang dibangun menjadi platform interaktif. Anggota nantinya dapat mengembangkan karier dan tim, mengajukan transaksi, serta menjalankan aktivitas sesuai peran masing-masing.

## Status saat ini

Landing page publik dirancang satu layar agar ringkas dan responsif pada komputer, tablet, serta ponsel.

## Teknologi

- HTML, CSS, dan JavaScript.
- Three.js untuk rendering mobil dan pembalap 3D.
- Google Fonts untuk tipografi.
- GitHub Actions untuk pemeriksaan otomatis.
- Vercel untuk hosting statis.

Belum ada integrasi Supabase pada tahap ini.

## Struktur proyek

- `index.html`: landing page dan pengaturan tema.
- `hero-scene.js`: scene Three.js, mobil, dua pembalap, livery, serta animasi.
- `assets/`: logo resmi Caleris Masters dan Vreeo.
- `scripts/validate.py`: pemeriksaan struktur dan kebutuhan utama halaman.
- `.github/workflows/ci.yml`: alur pemeriksaan otomatis.
- `vercel.json`: konfigurasi hosting statis.

## Identitas visual dan aset

- Logo Caleris Masters asli digunakan pada header. File logo tidak digambar ulang.
- Logo Vreeo digunakan sebagai sponsor pada livery mobil dan patch seragam pembalap.
- Livery menggunakan hitam, emas, dan perak, dengan nama sponsor fiktif tambahan.
- Nama sponsor fiktif pada livery dan seragam dibuat konsisten.
- Model mobil dibuat sebagai geometri 3D orisinal yang terinspirasi proporsi regulasi sasis Formula 1 2026 pada gambar referensi. Model ini bukan CAD resmi pabrikan atau replika tim nyata.
- Dua pembalap 3D fiktif ditampilkan dengan pose berdiri dan tangan terlipat. Keduanya memakai seragam dengan livery yang sama.
- Animasi mobil, pembalap, garis sirkuit, dan cahaya latar berjalan halus. Preferensi `prefers-reduced-motion` tetap dihormati.

## Deployment Vercel

Repositori menggunakan `vercel.json` dengan Framework Preset **Other**, tanpa framework build atau instalasi dependensi. Output deployment diambil langsung dari direktori utama.

## Menjalankan secara lokal

Buka `index.html` melalui server statis lokal. Scene 3D memerlukan koneksi internet untuk memuat modul Three.js dari CDN.

## Menjalankan pemeriksaan

Dari direktori utama repositori:

```bash
python3 scripts/validate.py
node --check hero-scene.js
```

Pemeriksaan memverifikasi struktur halaman, logo, scene 3D, tiga tombol utama, tema terang/gelap, dan dukungan pengurangan animasi.

## Tombol landing page

- **Rules** mengarah ke `/rules`.
- **Login with Discord** mengarah ke `/auth/discord`.
- **Join Our Community** masih menggunakan URL Discord umum dan perlu diganti dengan undangan komunitas resmi.

Autentikasi Discord dan halaman Rules memerlukan endpoint final sebelum dapat diaktifkan.
