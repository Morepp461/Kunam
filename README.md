# Caleris Masters

**Caleris Masters** adalah platform Motorsport Roleplay yang sedang dibangun ulang dari situs informasi menjadi platform interaktif. Anggota nantinya dapat mengembangkan karier dan tim, mengajukan transaksi, serta menjalankan aktivitas lain sesuai peran masing-masing.

## Status saat ini

Repositori ini sedang mengerjakan fondasi landing page publik. Halaman utama dirancang satu layar agar ringkas, responsif, dan dapat digunakan melalui komputer, tablet, maupun ponsel.

## Teknologi

- HTML, CSS, dan JavaScript murni.
- Google Fonts untuk tipografi.
- Komponen `model-viewer` untuk menampilkan model mobil formula 3D.
- GitHub Actions untuk pemeriksaan otomatis.

Belum ada integrasi Supabase maupun konfigurasi deployment Vercel pada tahap ini.

## Struktur proyek

- `index.html`: landing page.
- `assets/`: logo resmi dan aset visual.
- `scripts/validate.py`: pemeriksaan struktur dan kebutuhan utama halaman.
- `.github/workflows/ci.yml`: alur pemeriksaan otomatis.

## Aset logo

Logo resmi Caleris Masters berada di:

`assets/Add a heading_20260907_003952_0000.png`

Logo tersebut digunakan langsung pada header. Jangan menggambar ulang atau mengganti bentuk logo. Aset logo Vreeo juga disimpan di folder `assets/` sebagai aset pendukung dan belum digunakan pada landing page.

## Model mobil 3D

Landing page menggunakan model mobil formula generik dari 3DAssets.dev:

- Model: Current ground-effect racer.
- Format: GLB.
- Lisensi: CC0 1.0 Universal.
- Sumber: https://3dassets.dev/assets/grand-prix-circuit-and-open-wheel-ground-effect-racer-02c3b491
- Berkas model: https://cdn.3dassets.dev/assets/15179/v1/model.glb

Model dimuat melalui komponen `model-viewer` dan diputar perlahan. Gerakan otomatis dinonaktifkan bila perangkat pengguna mengaktifkan preferensi pengurangan animasi.

## Menjalankan secara lokal

Landing page merupakan situs statis. Buka `index.html` melalui server statis lokal atau gunakan ekstensi server lokal pada editor.

## Menjalankan pemeriksaan

Dari direktori utama repositori:

```bash
python3 scripts/validate.py
```

Pemeriksaan ini memastikan struktur halaman, logo, model 3D, tiga tombol utama, tema terang/gelap, dan dukungan pengurangan animasi tersedia.

## Batas integrasi saat ini

Tiga tombol utama sudah disiapkan pada landing page:

- **Rules** mengarah ke `/rules`.
- **Login with Discord** mengarah ke `/auth/discord`.
- **Join Our Community** saat ini mengarah ke halaman Discord umum.

Autentikasi Discord, tautan undangan komunitas resmi, dan halaman Rules masih memerlukan endpoint/URL final. Jangan menganggap integrasi tersebut sudah aktif sebelum konfigurasi resminya tersedia.
