# OmniSeller Dashboard — Supabase + Login Admin + Multi-Marketplace + Logo Custom

## ⚠️ Update besar: Database kini relasional (7 tabel)
Sebelumnya semua data disimpan sebagai 1 baris JSON (`omniseller_data`).
Sekarang database menggunakan **7 tabel terpisah** (kategori, marketplace,
stok, penjualan, biaya_pengaturan, hpp_per_produk, pengaturan_toko) yang
lebih rapi dan mudah di-query langsung lewat SQL. **Baca `PANDUAN-SQL.md`**
untuk skema lengkap, cara migrasi data lama, dan contoh query siap pakai.

Jika ini instalasi baru (belum pernah pakai tabel lama), cukup jalankan
`SETUP-DATABASE.sql` — tidak perlu migrasi apa pun.

## Isi folder
- `index.html` — markup halaman (sidebar, login screen, tabel, modal, dll)
- `style.css` — seluruh tampilan/desain
- `app.js` — seluruh logic aplikasi
- `supabase-config.js` — kredensial koneksi Supabase
- `SETUP-DATABASE.sql` — script SQL membuat tabel + keamanan (RLS)
- `README.md` — panduan ini

## Fitur baru
1. **Login Administrator** — dashboard sekarang dilindungi login (email & password) memakai Supabase Auth. Tidak ada yang bisa lihat/ubah data tanpa login.
2. **Tambah Marketplace** — selain Shopee/Tokopedia/TikTok Shop/Lazada, Anda bisa menambah marketplace baru sendiri (mis. Blibli, Bukalapak, JD.ID) lewat menu **Produk & Kategori → Manajemen Marketplace**. Warna, biaya admin, dan laporan otomatis ikut menyesuaikan.
3. **Logo Aplikasi Custom** — unggah logo toko Anda sendiri di menu **Pengaturan → Logo Aplikasi**. Logo akan tampil di sidebar dan halaman login.

## Langkah Setup (WAJIB, urutkan dari atas)

### 1. Buat tabel & keamanan di Supabase
1. Buka https://supabase.com/dashboard → pilih project `lbwmmppaunqikpollvhg`
2. Menu **SQL Editor** → **New query**
3. Copy-paste seluruh isi `SETUP-DATABASE.sql`, klik **Run**

### 2. Buat akun Administrator
1. Menu **Authentication → Users** → klik **Add user → Create new user**
2. Isi **Email** & **Password** admin Anda
3. **Centang "Auto Confirm User"** (penting, agar bisa langsung login)
4. Klik **Create user**
5. Pastikan provider **Email** aktif di **Authentication → Providers**

### 3. Jalankan aplikasi lewat server lokal
File `index.html` tidak bisa dibuka dengan cara double-click (file://) karena
memanggil API Supabase — harus lewat server lokal:

```bash
cd omniseller
python3 -m http.server 8000
```
Lalu buka: `http://localhost:8000`

### 4. Login
Masuk dengan email & password admin yang dibuat di langkah 2. Setelah login,
dashboard akan terbuka dan otomatis mengambil data terbaru dari Supabase.

## Cara menambah Marketplace baru
1. Buka menu **Produk & Kategori**
2. Di kartu **Manajemen Marketplace**, klik **+ Marketplace Baru**
3. Isi nama (mis. "Blibli") dan pilih warna
4. Klik **Simpan** — marketplace baru otomatis muncul di:
   - Dropdown saat tambah/edit pesanan
   - Filter laporan penjualan & laba
   - Pengaturan biaya admin per marketplace
   - Semua grafik & ringkasan dashboard

## Cara mengganti Logo Aplikasi
1. Buka menu **Pengaturan**
2. Di kartu **Logo Aplikasi**, klik **📷 Unggah Logo** (maks 1.5MB, format gambar)
3. Logo otomatis tampil di sidebar & halaman login
4. Klik **🗑 Hapus Logo** untuk kembali ke logo bawaan OmniSeller

## Cara mengelola akun admin
- **Ganti password**: menu Pengaturan → kartu Akun Administrator → 🔑 Ganti Password
- **Logout**: menu Pengaturan → 🚪 Keluar, atau tombol logout akan membawa Anda kembali ke halaman login
- **Tambah admin lain**: ulangi langkah "Buat akun Administrator" di atas dengan email berbeda di Supabase Dashboard

## Fitur baru: Sign Up Administrator
Di halaman login sekarang ada link **"Daftar Administrator Baru"**. Admin baru
bisa membuat akun sendiri lewat halaman tersebut (tidak perlu lagi dibuatkan
manual lewat Supabase Dashboard setiap kali ada admin baru).

**Penting — cek setting ini di Supabase Dashboard:**
- **Authentication → Providers → Email** harus aktif
- **Authentication → Settings → "Confirm email"**:
  - Jika **dimatikan (off)** → setelah daftar, admin baru langsung bisa login otomatis
  - Jika **diaktifkan (on)** → admin baru akan menerima email konfirmasi dan harus klik link di email itu dulu sebelum bisa login
- Karena sign up ini terbuka untuk siapa saja yang punya link aplikasi Anda, pertimbangkan untuk:
  - Membatasi domain email yang diizinkan (Authentication → Settings → Allowed email domains), atau
  - Menghapus/menyembunyikan link "Daftar Administrator Baru" dari index.html jika tidak diperlukan lagi setelah semua admin terdaftar

## Troubleshooting: "supabaseClient is not defined"
Jika muncul error ini, artinya library Supabase (dimuat dari CDN jsdelivr) gagal
diakses oleh browser. Penyebab umum & solusi:
1. **Koneksi/firewall blokir CDN** → coba refresh paksa (Ctrl+Shift+R), atau coba network lain
2. **Cache lama di Vercel/browser** → buka halaman dalam mode incognito untuk tes ulang
3. Cek di Console browser: ketik `typeof supabase` — harus `"object"`. Jika `"undefined"`, berarti script CDN gagal dimuat, bukan masalah di kode aplikasi
4. Aplikasi sekarang sudah diberi pengaman: jika ini terjadi, akan muncul pesan jelas di halaman login (bukan error membingungkan) yang meminta Anda refresh halaman


- Semua perubahan otomatis disimpan ke localStorage (instan, tetap jalan
  offline) **dan** dikirim ke Supabase (tabel `omniseller_data`) di background.
- Saat login, aplikasi mengambil data terbaru dari Supabase agar data sama
  di semua device.
- Indikator status sinkronisasi (☁️ Tersinkron / ⚠️ Offline) ada di topbar.

## Catatan keamanan
Dengan SQL terbaru, tabel `omniseller_data` **hanya** bisa diakses oleh user
yang sudah login (authenticated) — bukan publik lagi. Jika Anda sebelumnya
sempat menjalankan versi awal script SQL (policy publik), script baru ini
otomatis menghapus policy lama tersebut dan menggantinya dengan yang aman.
