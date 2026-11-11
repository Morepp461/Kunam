# Caleris Masters

Platform **Motorsport Roleplay** yang sedang dibangun ulang agar anggota tidak hanya melihat informasi, tetapi nantinya juga dapat melakukan aktivitas di dalam platform.

## Status proyek

Saat ini repositori berisi fondasi **landing page** statis. Fitur interaktif anggota akan dikembangkan bertahap setelah fondasi dan kebutuhan teknisnya siap.

## Teknologi saat ini

- HTML untuk struktur halaman.
- CSS untuk tampilan responsif dan tema gelap/terang.
- JavaScript murni untuk interaksi tema.
- GitHub Actions untuk pemeriksaan otomatis.

Tidak ada framework atau dependensi runtime yang perlu dipasang untuk menjalankan landing page ini.

## Struktur folder

- `index.html`: halaman utama.
- `assets/`: tempat menyimpan logo dan aset visual proyek.
- `scripts/validate.py`: pemeriksaan struktur landing page.
- `.github/workflows/ci.yml`: konfigurasi pemeriksaan otomatis.

## Menambahkan logo

Unggah logo resmi Caleris Masters ke folder `assets/` dengan nama:

`caleris-logo.png`

Halaman utama sudah menyiapkan referensi ke `/assets/caleris-logo.png`. **File logo sengaja tidak disertakan** agar logo asli dapat diunggah langsung oleh pemilik proyek.

## Menjalankan secara lokal

Karena halaman ini masih statis, buka `index.html` melalui browser atau jalankan server statis lokal dari direktori proyek.

## Pemeriksaan

Jalankan perintah berikut dari direktori utama repositori:

```bash
python scripts/validate.py
```

GitHub Actions juga menjalankan pemeriksaan tersebut saat ada perubahan pada branch utama atau pull request menuju `main`.

## Integrasi yang belum diaktifkan

- Login Discord dan callback autentikasi.
- Tautan undangan komunitas resmi.
- Halaman aturan resmi.
- Integrasi backend dan database.

Integrasi tersebut tidak dianggap aktif sampai konfigurasi dan endpoint resminya tersedia.
