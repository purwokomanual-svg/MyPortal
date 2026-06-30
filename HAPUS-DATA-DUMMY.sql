-- =========================================================
-- HAPUS DATA DUMMY (sample/contoh) — Penjualan & Stok Gudang
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- Data ASLI yang sudah Anda input manual TIDAK akan terhapus,
-- karena query ini hanya menyasar pola penamaan data dummy bawaan.
-- =========================================================

-- 1. Cek dulu (opsional) — lihat berapa banyak data dummy yang akan terhapus
select count(*) as jumlah_penjualan_dummy
from penjualan
where no_pesanan ~ '^[A-Z]{3}-1[0-9]{3}$';

select count(*) as jumlah_stok_dummy
from stok
where sku ~ '^SKU-[0-9]{4}$';

-- 2. Hapus PENJUALAN dummy
-- (pola: 3 huruf kode marketplace + angka 1000-1199, contoh: SHO-1042, TOK-1003)
delete from penjualan
where no_pesanan ~ '^[A-Z]{3}-1[0-9]{3}$';

-- 3. Hapus STOK dummy
-- (pola: SKU-0001 sampai SKU-0120)
delete from stok
where sku ~ '^SKU-[0-9]{4}$';

-- Selesai. Data asli yang Anda input manual (nomor pesanan / SKU dengan
-- format berbeda) akan tetap ada.
