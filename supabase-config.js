// ===== KONFIGURASI SUPABASE =====
// Project URL & Anon Key OmniSeller
const SUPABASE_URL = 'https://lbwmmppaunqikpollvhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxid21tcHBhdW5xaWtwb2xsdmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NTk3NzAsImV4cCI6MjA5ODAzNTc3MH0.O-tEKALTaAwAgVRnC3CKfDxAFuqq8-f43Mlmr7X6F3s';

// Inisialisasi client Supabase (tersedia secara global sebagai `supabaseClient`)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Nama-nama tabel relasional (lihat SETUP-DATABASE.sql)
const TBL_KATEGORI='kategori';
const TBL_MARKETPLACE='marketplace';
const TBL_STOK='stok';
const TBL_PENJUALAN='penjualan'; // tabel LAMA (1 pesanan = 1 barang) — dipertahankan sebagai arsip, TIDAK dipakai lagi untuk sinkron
const TBL_BIAYA='biaya_pengaturan';
const TBL_HPP_PRODUK='hpp_per_produk';
const TBL_PENGATURAN='pengaturan_toko';
// Tabel BARU untuk pesanan multi-item (lihat TAMBAH-MULTI-ITEM.sql):
// 1 pesanan (header, di `pesanan`) bisa punya banyak barang (detail, di `pesanan_item`).
const TBL_PESANAN='pesanan';
const TBL_PESANAN_ITEM='pesanan_item';
// Tabel Inventory (lihat TAMBAH-INVENTORY.sql): pembelian barang dari
// supplier & penggajian karyawan — dipakai untuk mengurangi Laba Bersih.
const TBL_PEMBELIAN='pembelian';
const TBL_PENGGAJIAN='penggajian';
// Tabel History Aktivitas (lihat SETUP-LENGKAP-OMNISELLER.sql Bagian 7):
// mencatat semua aktivitas tambah/edit/hapus/login/dst di seluruh aplikasi.
const TBL_LOG_AKTIVITAS='log_aktivitas';
