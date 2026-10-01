# CRM AI Enterprise — Professional Edition

CRM ringan berbasis HTML/CSS/JavaScript murni (tanpa framework/build step),
dengan backend **Supabase** (Auth + Database) dan siap di-deploy ke **Vercel**
lewat **GitHub**.

> **Update: modul Invoice & Stok Gudang.** Ada tabel baru `invoices`, `warehouses` (multi-gudang) dan
> `stock_movements`, plus kolom baru `min_stock` di tabel `products`. Kalau
> project Supabase Anda sudah pernah menjalankan `schema.sql` sebelumnya,
> tinggal jalankan lagi seluruh isi file itu di **SQL Editor** — aman, tabel
> yang sudah ada tidak akan diubah/dihapus, hanya bagian baru yang ditambahkan.

## Keamanan login (hardening)

- **Layar login bertema "chip"**: panel bercahaya dengan bingkai ungu→cyan, jalur sirkuit berdenyut di empat sudut (latar polos, tanpa kisi/kotak, kurung, maupun bingkai tipis), mengikuti palet aplikasi. Mengikuti tema aplikasi (gelap/terang, disimpan di `crm-theme`) dan punya tombol matahari/bulan di pojok kanan atas untuk menggantinya langsung dari layar login; semua warna lewat variabel `--cy-*` di `css/style.css`. Layar "Menunggu persetujuan" memakai gaya yang sama. Pada layar kecil jalur sirkuit disembunyikan; animasi dimatikan bila perangkat meminta *reduced motion*. Gaya ada di `css/style.css` (bagian LAYAR LOGIN), dekorasi dibuat oleh `cyScene()` di `js/app.js`. Fitur: masuk/daftar/lupa password/password baru, tombol lihat password, peringatan Caps Lock, indikator kekuatan password.
- **Kebijakan password**: minimal 10 karakter, huruf + angka, bukan password umum, tidak memuat nama email. Berlaku di daftar, ganti password, password awal user, dan reset oleh Administrator (juga dicek di SQL).
- **Pesan error netral**: "Email atau password salah" dan respons daftar/lupa password tidak membocorkan apakah sebuah email terdaftar.
- **Pembatas percobaan**: jeda eksponensial setelah 5 gagal berturut-turut (sisi klien, hanya pelengkap). Aktifkan juga **Authentication → Rate Limits** dan **Attack Protection (CAPTCHA)** di Supabase.
- **Ganti password** meminta password saat ini, lalu mengeluarkan perangkat lain. **Reset oleh Administrator** mencabut semua sesi user tersebut.
- **Timeout idle 30 menit** dengan peringatan 1 menit sebelumnya.
- **Persetujuan akun baru (alur Administrator utama)**: akun pertama otomatis menjadi **Administrator utama (pemilik)**. Setelah itu, siapa pun yang mendaftar tanpa undangan masuk ke antrean **Permintaan Akses** dan *belum punya workspace/data sama sekali* sampai pemilik menyetujui. Pemilik meninjau di **Team → Manajemen User** (ada lencana jumlah di ikon Team), memilih role (default Marketing; Administrator memunculkan peringatan + konfirmasi), atau menolak dengan catatan. Hanya pemilik yang bisa memutuskan. Akun yang dibuat lewat menu Team (undangan) tidak perlu antrean.
- **Mode pendaftaran di server** (`public.app_config.signup_mode`): `approval` (default, alur di atas), `closed` (tanpa undangan = ditolak), `open` (perilaku lama: tiap pendaftar jadi Administrator workspace-nya sendiri, untuk SaaS multi-tenant). Ubah dengan `update public.app_config set signup_mode = 'closed';`. `ALLOW_PUBLIC_SIGNUP` di `config.js` kini hanya menyembunyikan tautan daftar.
- **Header keamanan** ada di `vercel.json`. CSP dikirim sebagai *Report-Only*; cek console browser tanpa pelanggaran, lalu ganti kuncinya menjadi `Content-Security-Policy` agar ditegakkan.
- **Logo & nama aplikasi bisa diganti**: Settings → *Logo & Nama Aplikasi* (khusus Administrator workspace utama). Unggah PNG/JPEG/WebP (otomatis dijadikan persegi 256×256, maks. ±250 KB; SVG ditolak demi keamanan). Berlaku untuk layar login, sidebar, dan favicon semua pengguna; tersimpan di `app_config` dan dibaca layar login lewat `auth_public_config()`. Tombol *Kembalikan ke bawaan* memulihkan logo awal. Logo kop Quotation tetap pengaturan terpisah.
- **Skrip CDN dikunci** ke versi tertentu dengan SRI (supabase-js 2.117.2, chart.js 4.5.1). Tailwind CDN tidak bisa memakai SRI.

Setelah memperbarui file, jalankan ulang `supabase/schema.sql` (aman diulang). Di Supabase, set juga **Minimum password length ≥ 10**, aktifkan **Confirm email**, dan tambahkan URL Vercel Anda ke **Authentication → URL Configuration → Redirect URLs** agar tautan reset password berfungsi.

---

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
- Setiap pendaftar mandiri mendapat **workspace terpisah** (diisolasi oleh RLS);
  untuk satu tim, buat user tambahan dari menu Team (lihat bagian "Team, Role & Hak Akses").
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

## Pencarian Produk Price Book (Product Picker)

Semua input item dari Price Book — **Tambah/Edit Deal**, **Quotation**, dan **Invoice** — memakai satu komponen pencarian yang sama
(`productPickerHTML()` di `js/app.js`), bukan dropdown biasa.

- Ketik untuk mencari: nama, model, SKU, kategori, deskripsi. Multi-kata (semua kata harus cocok), tidak peka huruf besar/kecil, aksen, dan tanda baca (`fa100` = `FA-100`).
- Hasil diurutkan berdasarkan relevansi, kata yang cocok di-*highlight*, lengkap dengan harga, satuan, dan status stok.
- Chip kategori (dengan jumlah hasil) untuk menyaring; daftar **Terakhir dipakai** saat kolom kosong; muat bertahap saat digulir (aman untuk ribuan produk).
- Keyboard: `↑` `↓` `PgUp` `PgDn` pilih · `Enter` pilih/tambah · `Esc` tutup daftar (Esc kedua menutup modal).
- Deal, Quotation, dan Invoice memakai **tabel item yang sama persis** (`lineItemsTableHTML` + `lineItemsAddBarHTML`): kolom Model · Deskripsi · Qty · Satuan · Harga · Subtotal,
  lalu baris pencarian Price Book dan tombol **+ Item Manual**. Klik/Enter pada hasil pencarian langsung menambah baris; fokus tetap di kolom cari untuk item berikutnya.
  Qty, satuan, dan harga bisa diubah langsung di tabel. Di Deal, kolom Nilai (Rp) otomatis mengikuti total item.
  Item Deal lama (`name/price/qty`) tetap terbaca (name → Model).
- Deal juga punya **+ Tambah Section** (nama section, diskon %, Sub Total/Diskon/Total per section, Grand Total) lewat komponen `lineSectionsHTML`
  yang sama dengan Quotation & Invoice. **Buat Quotation** dari Deal membawa section, diskon, dan item apa adanya, sehingga templatenya identik.
  Tanpa perubahan skema: section disimpan di kolom `deals.items` (jsonb) sebagai field `section`, `sectionIdx`, `sectionDiscount` pada tiap item
  (section tanpa item tidak ikut tersimpan).
- Halaman Price Book dan pencarian global memakai mesin pencarian yang sama (`productMatchesQuery`).

## Team, Role & Hak Akses (multi-user)

Workspace sekarang **dipakai bersama satu tim**. Akun pertama (atau akun lama Anda) otomatis menjadi
**Administrator + pemilik workspace**; semua user yang dibuat dari menu **Team** ikut membaca/menulis data
workspace yang sama, dengan batasan sesuai role dan izinnya.

**Wajib setelah update ini:** jalankan ulang seluruh `supabase/schema.sql` di Supabase → SQL Editor (aman diulang;
data lama tidak berubah, akun lama otomatis dijadikan pemilik workspace-nya).

### Role bawaan (preset izin, bisa diubah per user)
| Role | Fokus |
|---|---|
| Administrator | Akses penuh, kelola user & hak akses, pengaturan perusahaan, Pusat Data |
| Marketing | Kontak, perusahaan, deal, tugas, membuat quotation; produk/stok/invoice hanya lihat. **Default hanya melihat data miliknya sendiri** |
| Accounting | Invoice penuh; quotation, deal, laporan hanya lihat |
| Purchasing | Price book & stok/gudang penuh; perusahaan/pemasok; quotation hanya lihat |

Setiap modul punya izin **Lihat / Buat / Ubah / Hapus** (Dashboard, Reports, Team: Lihat; Pengaturan & Pusat Data: Kelola).
Izin ditegakkan di **database (RLS)**, bukan hanya disembunyikan di layar, jadi tetap aman walau API dipanggil langsung.

### Cakupan data: siapa boleh melihat data siapa
Selain izin per modul, tiap user punya **Cakupan Data**:
- **Semua data tim**: melihat seluruh data sesuai izin modulnya (default Administrator, Accounting, Purchasing).
- **Hanya data milik sendiri**: default **Marketing**. User hanya melihat kontak & deal yang ia pegang, plus turunannya
  (perusahaan, tugas, quotation, invoice, catatan, dan feed aktivitas miliknya). Marketing lain tidak terlihat sama sekali,
  baik di layar maupun lewat API. Data yang dibuat otomatis menjadi miliknya; owner tidak bisa dialihkan sendiri.
- Administrator tidak pernah dibatasi. Cakupan bisa diubah per user di **Edit & Hak Akses**.
- **Alihkan Data** (tombol di tiap user): memindahkan seluruh data satu user ke user lain, mis. saat sales pindah tugas.
  Saat user dihapus, datanya otomatis dialihkan ke Administrator yang menghapus.
- Nomor Quotation/Invoice dihitung di database atas seluruh workspace, jadi dua marketing tidak mendapat nomor kembar
  walau tidak saling melihat dokumen.
- Catatan: user "milik sendiri" melihat Dashboard/Reports berisi angka miliknya saja, dan target penjualan tetap target tim.
  Data lama yang dulu dimiliki Administrator tidak terlihat oleh Marketing sampai Administrator mengalihkannya.

### Menu Team → Manajemen User (khusus Administrator)
- **+ Buat User Baru**: isi nama, email, password awal (ada tombol "Buat acak"), pilih role, lalu sesuaikan matriks izin.
  Kredensial ditampilkan sekali untuk disalin dan diberikan ke user.
- **Edit & Hak Akses**: ubah role/izin; berlaku **seketika** walau user sedang login.
- **Reset Password**, **Nonaktifkan/Aktifkan**, **Hapus** user.
- Pengaman: pemilik workspace tidak bisa diturunkan/dinonaktifkan/dihapus, dan selalu ada minimal satu Administrator aktif.
- User bisa mengganti password sendiri di **Settings → Keamanan Akun**.

### Catatan konfigurasi
- Biarkan **Allow new users to sign up** aktif di Supabase (pembuatan user memakainya). Setelah Administrator pertama
  jadi, set `ALLOW_PUBLIC_SIGNUP = false` di `js/config.js` agar tautan daftar mandiri hilang dari layar login.
- Jika **Confirm email** aktif, user baru harus klik tautan konfirmasi dulu (undangan tetap tersimpan). Matikan opsi itu
  jika ingin user bisa langsung login.
- Owner deal/kontak kini merujuk ke user. Data lama ("Anda"/anggota tim lama) tetap dikenali; anggota lama tanpa akun
  login masih bisa dikelola di Team → Performa Tim.

## Pengembangan lanjutan yang disarankan

- **Upload lampiran** (kontrak, brosur produk): gunakan **Supabase Storage**.
- **Batasan data per pemilik** (mis. Marketing hanya melihat deal miliknya): bisa ditambahkan di kebijakan RLS `deals`/`contacts`.
- **Custom domain**: tambahkan di Vercel → Project → Settings → Domains.
- **Presence** (lihat siapa saja yang sedang online di workspace yang sama):
  bisa memanfaatkan fitur `Presence` dari channel Realtime Supabase yang
  sudah dipakai di `setupRealtime()`.
