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
   - Ini membuat **10 tabel relasional** (bukan lagi satu tabel blob JSON):
     `companies`, `contacts`, `deals`, `tasks`, `notes`, `activities`,
     `products`, `quotes`, `team`, dan `user_settings` (profil + pengaturan +
     letterhead) — satu baris per data, dengan kolom sendiri-sendiri.
   - Otomatis mengaktifkan **Row Level Security** (setiap akun hanya bisa
     lihat/ubah datanya sendiri) dan **Realtime** (perubahan data langsung
     tersiar ke semua tab/device milik user yang sama).
   - **Kalau sebelumnya Anda sudah pernah menjalankan `schema.sql` versi
     lama** (yang membuat tabel `crm_store`), aman menjalankan file ini di
     project yang sama — tabel lama dibiarkan apa adanya. Saat user lama
     login pertama kali di versi baru ini, aplikasi otomatis **memigrasikan**
     data dari `crm_store` ke tabel-tabel baru (lihat bagian "Migrasi
     otomatis" di bawah). Tabel `crm_store` boleh dihapus manual belakangan
     kalau sudah yakin migrasi berhasil: `drop table if exists public.crm_store;`
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
- Di header ada indikator kecil **"Realtime aktif"** (titik hijau) — itu
  menandakan koneksi live ke Supabase sedang tersambung. Kalau berubah merah
  ("Terputus"), klik indikator itu untuk menyambung ulang.

---

## Arsitektur data: relasional + realtime

Data CRM sekarang disimpan sebagai **tabel relasional biasa** di Postgres —
satu tabel per entity (`contacts`, `deals`, `quotes`, dst), satu baris per
data, dengan kolom bertipe jelas (lihat `supabase/schema.sql`) — bukan lagi
satu blob JSON per "bagian" seperti versi sebelumnya. Ini bikin data:

- **Rapi & terstruktur** — bisa langsung di-query/di-filter/di-JOIN lewat SQL
  biasa di Supabase (mis. Table Editor atau SQL Editor), gampang dipakai untuk
  reporting eksternal (BI tool, dsb) tanpa harus parse JSON dulu.
- **Aman per baris** — Row Level Security berjalan di level baris tabel, bukan
  di level blob, jadi lebih presisi dan standar industri.
- **Realtime** — setiap tabel didaftarkan ke Postgres Realtime publication.
  Begitu ada insert/update/delete (dari tab lain, device lain, atau anggota
  tim lain yang login dengan akun sama), semua sesi yang sedang terbuka
  langsung menerima perubahan itu lewat WebSocket dan me-render ulang
  tampilan — **tanpa perlu refresh halaman**.

**Cara kerja penulisan data (di `js/app.js`):** seluruh state tetap berupa
array JS biasa di memori (`state.contacts`, `state.deals`, dst) seperti
sebelumnya, supaya semua fungsi render/CRUD yang sudah ada tidak perlu ditulis
ulang. Yang berubah hanya fungsi `persist(part)`: setiap dipanggil, ia
membandingkan isi `state[part]` sekarang dengan salinan terakhir yang berhasil
disinkronkan (`lastSynced`), lalu mengirim **hanya baris yang benar-benar
berubah** sebagai insert/update/delete paralel ke tabel yang sesuai — bukan
menimpa seluruh tabel setiap kali menyimpan.

**Migrasi otomatis dari versi lama:** kalau akun Anda sebelumnya sudah
memakai versi `crm_store` (blob JSON), begitu login pertama kali di versi
relasional ini, aplikasi otomatis mendeteksi data lama, memindahkannya ke
tabel-tabel baru (termasuk mengganti id lama yang bukan UUID valid menjadi
UUID baru, dan menyesuaikan semua referensi silang seperti `companyId`,
`contactId`, `ownerId`), lalu menandainya lewat notifikasi toast. Proses ini
hanya berjalan sekali per akun (kalau tabel relasional sudah berisi data,
migrasi dilewati).

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

- **Upload lampiran** (kontrak, brosur produk): gunakan **Supabase Storage**.
- **Role & permission tim** (admin vs sales rep): tambahkan kolom `role` di
  tabel `team` / `user_settings`, lalu perluas RLS policy sesuai kebutuhan
  (mis. workspace bersama satu tim, bukan hanya per akun).
- **Custom domain**: tambahkan di Vercel → Project → Settings → Domains.
- **Presence** (lihat siapa saja yang sedang online di workspace yang sama):
  bisa memanfaatkan fitur `Presence` dari channel Realtime Supabase yang
  sudah dipakai di `setupRealtime()`.
