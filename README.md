# CRM AI Enterprise — Professional Edition

CRM ringan berbasis HTML/CSS/JavaScript murni (tanpa framework/build step),
dengan backend **Supabase** (Auth + Database) dan siap di-deploy ke **Vercel**
lewat **GitHub**.

## Struktur folder

```
.
├── index.html            # Struktur halaman (semua view/menu)
├── css/
│   └── style.css         # Semua styling custom (di luar utility Tailwind)
├── js/
│   ├── tailwind-config.js  # Konfigurasi tema Tailwind (warna, font)
│   ├── config.js           # Kredensial Supabase (URL + anon key) — WAJIB DIISI
│   └── app.js              # Seluruh logika aplikasi (state, render, CRUD, chart, dsb)
└── supabase/
    └── schema.sql         # Skrip SQL untuk membuat tabel + Row Level Security
```

Tailwind CSS dan Chart.js tetap dimuat lewat CDN di `index.html` (tidak perlu
proses build/npm), jadi seluruh project ini bisa langsung di-hosting sebagai
static site.

---

## 1. Setup Supabase

1. Buka [supabase.com](https://supabase.com) → **New project**.
2. Setelah project aktif, buka **SQL Editor** → **New query**, tempel seluruh
   isi file `supabase/schema.sql`, lalu klik **Run**.
   - Ini membuat tabel `crm_store` (penyimpanan data CRM per user) beserta
     **Row Level Security** supaya setiap akun hanya bisa melihat & mengubah
     datanya sendiri.
3. (Opsional, untuk testing cepat) Buka **Authentication → Providers → Email**
   dan matikan **Confirm email** supaya akun baru bisa langsung login tanpa
   verifikasi email dulu. Untuk produksi, sebaiknya biarkan aktif.
4. Buka **Project Settings → API**, salin:
   - **Project URL** → tempel ke `SUPABASE_URL`
   - **anon public key** → tempel ke `SUPABASE_ANON_KEY`

   Edit file `js/config.js`:
   ```js
   const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

   > `anon key` aman ditaruh di kode frontend/publik — keamanan data dijamin
   > oleh RLS di database, bukan oleh kerahasiaan key ini. **Jangan pernah**
   > menaruh `service_role` key di kode frontend.

---

## 2. Push ke GitHub

```bash
git init
git add .
git commit -m "CRM AI Enterprise - initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

---

## 3. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Import repository GitHub yang baru saja Anda push.
3. Framework Preset: pilih **Other** (tidak perlu build command, tidak perlu
   output directory — ini static site murni). Biarkan **Build Command** dan
   **Output Directory** kosong/default, karena `index.html` berada di root.
4. Klik **Deploy**. Selesai — Vercel akan memberi Anda URL publik
   (`nama-project.vercel.app`).

Setiap kali Anda `git push` ke branch `main`, Vercel otomatis re-deploy.

---

## 4. Pakai aplikasinya

- Buka URL Vercel Anda → akan muncul layar **Daftar/Masuk**.
- Klik **Daftar di sini**, isi email + password → akun tersimpan di Supabase Auth.
- Setelah masuk, workspace pertama Anda otomatis diisi **data demo** (kontak,
  deal, produk contoh) agar mudah dieksplorasi — silakan hapus lewat menu
  **Settings → Hapus Semua Data** kapan pun.
- Setiap user yang mendaftar mendapat **workspace terpisah** (diisolasi oleh RLS),
  cocok dipakai oleh beberapa anggota tim sekaligus dengan datanya masing-masing.

---

## Cara kerja penyimpanan data

Semua data (contacts, companies, deals, tasks, notes, products, quotes, team,
settings, profile) disimpan sebagai baris JSON di tabel `crm_store`, satu baris
per "bagian" data per user — pola yang sama seperti prototipe awal, hanya saja
sekarang berjalan di atas Postgres (Supabase) dengan Row Level Security,
bukan penyimpanan sementara di browser.

Jika ke depannya Anda ingin skema relasional penuh (tabel `contacts`, `deals`,
`quotes`, dst masing-masing dengan kolom sendiri) untuk kebutuhan reporting SQL
yang lebih dalam, struktur `js/app.js` sudah memisahkan seluruh akses data lewat
fungsi `storageGet` / `storageSet` sehingga migrasinya cukup terlokalisasi di
dua fungsi tersebut.

## Modul Quotation (format dokumen resmi)

Menu **Quotations** sekarang mendukung format penawaran multi-section persis
seperti dokumen quotation resmi (kop surat 2 kantor, tabel bersection A/B/dst,
sub total + diskon per section, kotak Grand Total, Term & Conditions, dan
blok tanda tangan):

- **Settings → Profil Perusahaan** — isi kop surat (kantor pusat/cabang,
  kontak, rekening pembayaran, nama & kontak penandatangan). Data ini otomatis
  muncul di setiap dokumen yang dicetak.
- **Products (Price Book)** — setiap produk/layanan punya `Model/Kode` dan
  `Kategori` (mis. "EQUIPMENT FIRE ALARM", "JASA & ACCESSORIES") — kategori ini
  dipakai untuk mengelompokkan item saat ditambahkan ke quotation.
- **Quotations → + Buat Quotation** — buat beberapa **Section** (A, B, dst),
  masing-masing punya daftar item (bisa diambil dari Price Book atau ditulis
  manual) dan **diskon per section**. Total tiap section (TOTAL 1, TOTAL 2, …)
  otomatis dihitung, lalu dijumlah jadi **Grand Total**.
- Tombol **Cetak / PDF** pada quotation membuka tab baru berisi dokumen siap
  cetak (gunakan "Save as PDF" pada dialog print browser) dengan layout yang
  meniru dokumen quotation profesional: kop surat, blok Re/To, tabel item
  bersection, kotak subtotal & Grand Total, Term & Conditions, serta blok
  tanda tangan "Approved by" / "Faithfully yours".
- Workspace baru akan berisi **1 contoh quotation demo** (Fire Alarm System)
  yang formatnya sudah meniru dokumen quotation asli — bisa dijadikan referensi
  atau dihapus lewat Settings → Hapus Semua Data.

## Pengembangan lanjutan yang disarankan

- **Realtime sync** antar device: manfaatkan `supabase.channel()` / Realtime
  subscription pada tabel `crm_store`.
- **Upload lampiran** (kontrak, brosur produk): gunakan **Supabase Storage**.
- **Role & permission tim** (admin vs sales rep): tambahkan tabel `profiles`
  dengan kolom `role`, lalu perluas RLS policy sesuai kebutuhan.
- **Custom domain**: tambahkan di Vercel → Project → Settings → Domains.
