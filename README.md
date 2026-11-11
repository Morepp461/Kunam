# Caleris Masters

**Caleris Masters** adalah platform Motorsport Roleplay yang sedang dibangun menjadi platform interaktif. Anggota nantinya dapat mengembangkan karier dan tim, mengajukan transaksi, serta menjalankan aktivitas sesuai peran masing-masing.

## Status saat ini

Landing page publik dirancang satu layar agar ringkas dan responsif pada komputer, tablet, serta ponsel. Hero menggunakan assets/Background.png sebagai visual utama, dengan lapisan asap procedural berbasis Canvas 2D. Tidak ada model 3D atau dependensi rendering 3D pada landing page.

## Teknologi

- HTML, CSS, dan JavaScript.
- Canvas 2D untuk motion asap ringan.
- Google Fonts untuk tipografi.
- GitHub Actions untuk pemeriksaan otomatis.
- Vercel untuk hosting statis.

Belum ada integrasi Supabase pada tahap landing page ini.

## Struktur proyek

- index.html: landing page, gambar latar, kontrol tema, dan navigasi utama.
- smoke-motion.js: partikel atmosferik Canvas 2D; lapisan asap asli foto dianimasikan terpisah melalui SVG turbulence dan displacement pada index.html.
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
- Foto dasar tetap utuh; hanya area asap terpilih pada lapisan duplikat yang dianimasikan.

## Deployment Vercel

Repositori menggunakan vercel.json dengan Framework Preset Other, tanpa framework build atau instalasi dependensi. Output deployment diambil langsung dari direktori utama.

## Menjalankan pemeriksaan

```bash
python3 scripts/validate.py
node --check smoke-motion.js
```

## Tombol landing page

- Rules mengarah ke /rules.
- Login with Discord mengarah ke /auth/discord.
- Join Our Community masih menggunakan URL Discord umum dan perlu diganti dengan undangan komunitas resmi.

Autentikasi Discord dan halaman Rules memerlukan endpoint final sebelum dapat diaktifkan.