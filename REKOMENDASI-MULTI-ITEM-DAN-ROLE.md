# Rekomendasi Pengembangan OmniSeller Dashboard
## 1) Dukungan Multi-Item per Pesanan · 2) Struktur Role Terbaik

## ✅ Status: SUDAH DIIMPLEMENTASIKAN
Seluruh rekomendasi di bawah ini sudah diterapkan ke `app.js`, `index.html`,
`style.css`, `supabase-config.js`, dan SQL pendukungnya. Lihat pesan chat
terbaru untuk ringkasan file yang perlu Anda jalankan/ganti. Isi di bawah
ini dipertahankan sebagai catatan desain/alasan keputusan.

---

## Bagian 1 — Pesanan dengan Beberapa Barang (Multi-Item)

### Kenapa perlu diubah?

Saat ini skema tabel `penjualan` menyamakan **1 baris = 1 pesanan = 1 produk**:

```sql
create table public.penjualan (
  no_pesanan text not null unique,
  produk text not null,
  varian text,
  qty int,
  total bigint,
  ...
);
```

Kalau 1 pesanan sebenarnya berisi 3 barang berbeda (mis. pembeli checkout
"Kaos Polos M" + "Celana Cargo L" + "Topi Baseball"), sistem sekarang **memaksa
Anda membuat 3 baris dengan No. Pesanan yang sama** → ini justru menabrak
constraint `UNIQUE(no_pesanan)` dan **persis** memicu bug kehilangan data yang
kemarin kita perbaiki. Jadi menambah dukungan multi-item bukan cuma soal fitur,
tapi juga menutup celah bug tersebut secara permanen.

### Desain yang direkomendasikan: pisahkan "Header" dan "Item"

Pola standar aplikasi kasir/e-commerce: **1 pesanan (header) → banyak item (detail)**.

```
pesanan (header)                    pesanan_item (detail)
─────────────────────               ─────────────────────────
id                                   id
no_pesanan  (UNIQUE)  ◄───────────┐  pesanan_id (FK → pesanan.id)
tanggal / tgl_iso                 └──produk
marketplace                          varian
status                               kategori
biaya_admin                          qty
biaya_tambahan                       harga_satuan
                                      subtotal
                                      hpp_saat_transaksi   ← snapshot HPP
```

Kenapa dipisah (bukan JSON array di 1 kolom)?
- Tetap bisa **di-query langsung pakai SQL** (sesuai filosofi database
  relasional yang sudah dipakai di project ini — lihat catatan di `README.md`).
- Laporan per-produk/per-kategori jadi lebih akurat (sekarang "Laba per
  Produk" dan "Stok" akan menghitung tiap item secara individual, bukan
  digabung per pesanan).
- Pengurangan stok tetap presisi per SKU per item, bukan per pesanan.

### SQL migrasi (aman, tidak menghapus data lama)

Saya siapkan skrip terpisah **`TAMBAH-MULTI-ITEM.sql`** yang:
1. Membuat 2 tabel baru (`pesanan` & `pesanan_item`) **tanpa menyentuh** tabel
   `penjualan` lama.
2. Memindahkan (migrasi) semua data lama dari `penjualan` → jadi 1 pesanan +
   1 item per baris lama (jadi tidak ada data yang hilang).
3. Tabel `penjualan` lama **dibiarkan ada** (bukan dihapus) sebagai arsip/
   cadangan sampai Anda yakin migrasi berhasil dan siap pindah sepenuhnya.
4. RLS mengikuti pola role yang sudah ada di `SETUP-ROLES.sql`.

### Dampak ke aplikasi (`app.js`) — perlu disesuaikan

Ini bagian yang perlu perubahan cukup banyak, saya rangkum dulu supaya Anda
bisa putuskan mau langsung semua atau bertahap:

| Bagian | Perubahan yang diperlukan |
|---|---|
| **Form Tambah/Edit Pesanan** | Ubah jadi: input No. Pesanan + Tanggal + Marketplace di atas (header), lalu daftar baris item yang bisa ditambah/hapus dinamis (tombol "+ Tambah Barang"), masing-masing dengan Produk/Varian/Kategori/Qty/Harga. Total pesanan dihitung otomatis dari jumlah subtotal semua item. |
| **Pengurangan Stok** | `terapkanEfekStok()` dijalankan **per item**, bukan per pesanan — supaya tiap SKU di gudang berkurang sesuai barang masing-masing. |
| **Laporan Laba & Dashboard** | Semua `DB.penjualan.filter(...)` yang menghitung omzet/laba per produk/kategori dihitung dari level item, bukan level pesanan (1 pesanan bisa menyumbang ke beberapa kategori sekaligus). |
| **Biaya Admin & Biaya Tambahan** | Tetap di level **header pesanan** (sesuai model bisnis marketplace — potongan admin dihitung dari total transaksi, bukan per barang), lalu dialokasikan proporsional ke tiap item saat menghitung laba per produk. |
| **Import/Export CSV** | Format CSV perlu 1 baris = 1 item, dengan kolom `no_pesanan` yang boleh berulang untuk item-item dalam pesanan yang sama (baris dikelompokkan berdasarkan `no_pesanan` saat import). |
| **Sinkronisasi Supabase** | Sync header (`pesanan`) pakai `safeReplace` seperti sekarang (unique key: `no_pesanan`), sync item (`pesanan_item`) dihapus-insert ulang **per pesanan_id** saat pesanan itu diedit (bukan seluruh tabel), supaya tetap aman & ringan. |

### Rekomendasi cara mengerjakan

Karena ini perubahan struktural yang menyentuh form, hitung stok, dan semua
laporan, saya sarankan **2 tahap**:

1. **Tahap 1 (sekarang, siap saya buatkan):** jalankan SQL migrasi di atas
   agar skema baru & data lama sudah aman tersedia di database — tanpa
   mengubah `app.js` dulu, aplikasi tetap jalan seperti biasa.
2. **Tahap 2:** saya update `app.js` untuk memakai skema baru (form multi-item,
   hitung stok per item, laporan per item). Ini pekerjaan besar (form modal,
   render tabel, hitung laba, import/export) — lebih aman dikerjakan sebagai
   task terpisah supaya saya bisa fokus dan testing tiap bagian, daripada
   digabung sekaligus dan berisiko ada bagian yang lolos dari pengujian.

**Beri tahu saya kalau Anda mau saya lanjutkan Tahap 2 sekarang** — saya akan
kerjakan form input multi-item dan sesuaikan seluruh logic terkait.

---

## Bagian 2 — Struktur Role (Hak Akses) Terbaik

Project ini sudah punya fondasi role yang bagus di `SETUP-ROLES.sql`
(`owner`, `staff`, `viewer`, `pending`). Berikut rekomendasi
penyempurnaannya berdasarkan kebutuhan tim toko/marketplace pada umumnya:

### Matrix hak akses yang direkomendasikan

| Aksi | Owner | Staff (Admin Toko) | Kasir *(baru, opsional)* | Viewer (mis. investor/akuntan) |
|---|:---:|:---:|:---:|:---:|
| Login & lihat dashboard | ✅ | ✅ | ✅ | ✅ |
| Tambah/edit **pesanan** | ✅ | ✅ | ✅ | ❌ |
| **Hapus** pesanan | ✅ | ✅ | ❌ | ❌ |
| Tambah/edit **stok gudang** | ✅ | ✅ | ❌ | ❌ |
| Kelola kategori & marketplace | ✅ | ✅ | ❌ | ❌ |
| Ubah **Biaya & HPP** (Laba & Biaya) | ✅ | ❌ | ❌ | ❌ |
| Ubah **Pengaturan Toko** (nama, logo, batas stok) | ✅ | ❌ | ❌ | ❌ |
| Import/Export data | ✅ | ✅ | ❌ | ❌ |
| Reset semua data | ✅ | ❌ | ❌ | ❌ |
| Lihat semua laporan (Laba, Keuangan) | ✅ | ✅ | ❌ *(hanya pesanan)* | ✅ *(read-only)* |
| Kelola user & approve role baru | ✅ | ❌ | ❌ | ❌ |

Ini **sama persis** dengan implementasi `role_select`/`role_write` yang sudah
ada di `SETUP-ROLES.sql` untuk `owner` & `staff`. Yang saya tambahkan sebagai
opsi baru: **role `kasir`** — cocok kalau Anda punya karyawan yang tugasnya
*hanya* input pesanan harian (misalnya admin CS marketplace), tapi tidak
boleh ubah stok, biaya, atau data sensitif lainnya.

### Kenapa struktur 4 role ini paling pas?

- **Prinsip least privilege** — tiap orang cuma punya akses sebatas yang
  dia butuhkan untuk kerjanya. Kasir input pesanan tidak perlu (dan
  sebaiknya tidak bisa) mengubah harga HPP atau menghapus riwayat.
- **Owner tetap satu-satunya** yang bisa: ubah biaya/HPP, reset data, dan
  approve admin baru — ini melindungi dari kesalahan/penyalahgunaan oleh
  staf yang lebih banyak jumlahnya.
- **Viewer** berguna kalau Anda ingin kasih akses ke pihak luar (investor,
  akuntan, partner bisnis) untuk lihat laporan tanpa risiko mereka
  mengubah data operasional.
- **Pending** (sudah ada) tetap dipakai sebagai gerbang keamanan: siapa pun
  yang daftar lewat link "Daftar Administrator Baru" tidak otomatis dapat
  akses sampai di-approve Owner.

### Tambahan yang saya sarankan: jejak audit (audit trail)

Saat ini semua perubahan tidak mencatat **siapa** yang melakukannya. Dengan
makin banyak role/orang yang bisa input data, saya sarankan tambah kolom
`created_by` dan `updated_by` (mengacu ke `admin_users.id`) di tabel
`pesanan`/`penjualan` dan `stok`. Manfaatnya:
- Kalau ada data aneh/salah, Owner bisa lacak itu diinput staf yang mana.
- Berguna juga untuk evaluasi kinerja staf (jumlah pesanan yang diinput).

Saya bisa siapkan SQL untuk kolom ini + otomatis terisi dari
`auth.uid()` kalau Anda mau.

### Cara menerapkan role `kasir`

Kalau setuju, saya siapkan skrip `TAMBAH-ROLE-KASIR.sql` yang:
1. Melonggarkan constraint `role` di `admin_users` agar menerima nilai `'kasir'`.
2. Menyesuaikan RLS: `kasir` boleh insert/update tabel `penjualan`/`pesanan`
   & `pesanan_item`, tapi **read-only** untuk `stok`, `biaya_pengaturan`,
   `pengaturan_toko`, `kategori`, `marketplace`.
3. Menambahkan UI sederhana di menu **Pengaturan → Manajemen User** agar
   Owner bisa memilih role `kasir` saat approve user baru (saat ini pilihan
   di `app.js` kemungkinan masih hardcode `owner/staff/viewer`, perlu saya
   cek & tambahkan opsinya).

---

## Ringkasan langkah selanjutnya

Beri tahu saya kombinasi mana yang ingin dikerjakan lebih dulu:

1. 🗄️ **Migrasi database ke skema multi-item** (SQL saja, aplikasi belum berubah)
2. 🛠️ **Update `app.js`** agar form/laporan mendukung multi-item penuh
3. 👤 **Tambah role `kasir`** (SQL + penyesuaian UI di menu Manajemen User)
4. 🕵️ **Audit trail** (`created_by`/`updated_by`)

Saya bisa kerjakan satu per satu atau sekaligus — tinggal konfirmasi.
