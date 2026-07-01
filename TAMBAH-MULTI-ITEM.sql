-- =========================================================
-- OMNISELLER — DUKUNGAN MULTI-ITEM PER PESANAN
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- Jalankan SETELAH SETUP-DATABASE.sql (dan SETUP-ROLES.sql jika dipakai)
--
-- AMAN: script ini TIDAK menghapus atau mengubah tabel `penjualan` yang
-- lama. Ia hanya MENAMBAH 2 tabel baru (`pesanan` & `pesanan_item`) dan
-- MENYALIN (bukan memindahkan) data lama ke struktur baru. Tabel lama
-- tetap ada sebagai arsip sampai Anda yakin siap pindah sepenuhnya.
--
-- Catatan: aplikasi (app.js) BELUM otomatis memakai tabel baru ini
-- setelah script ini dijalankan — perlu update kode terpisah agar form
-- pesanan, hitung stok, dan laporan memakai struktur baru.
-- =========================================================

-- =========================================================
-- 1. TABEL PESANAN (header)
-- =========================================================
create table if not exists public.pesanan (
  id bigint generated always as identity primary key,
  no_pesanan text not null unique,
  tanggal text not null,
  tgl_iso timestamptz not null,
  marketplace text not null,
  status text not null default 'Selesai',
  biaya_admin numeric,
  biaya_tambahan numeric,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- 2. TABEL PESANAN_ITEM (detail barang per pesanan)
-- =========================================================
create table if not exists public.pesanan_item (
  id bigint generated always as identity primary key,
  pesanan_id bigint not null references public.pesanan(id) on delete cascade,
  produk text not null,
  varian text default '',
  kategori text default 'Lainnya',
  qty int not null default 1,
  harga_satuan numeric not null default 0,
  subtotal numeric not null default 0,
  hpp_saat_transaksi numeric default 0, -- snapshot HPP saat transaksi dibuat,
                                         -- supaya laporan laba historis tidak
                                         -- berubah kalau HPP produk diubah nanti
  created_at timestamptz default now()
);
create index if not exists idx_pesanan_item_pesanan on public.pesanan_item(pesanan_id);
create index if not exists idx_pesanan_item_produk on public.pesanan_item(produk);

-- =========================================================
-- 3. ROW LEVEL SECURITY
-- =========================================================
alter table public.pesanan enable row level security;
alter table public.pesanan_item enable row level security;

-- Jika SETUP-ROLES.sql SUDAH dijalankan (ada fungsi public.my_role()),
-- pakai kebijakan berbasis role yang sama seperti tabel `penjualan`.
-- Jika BELUM, fallback ke "siapa pun yang login boleh akses" (sama
-- seperti kebijakan default di SETUP-DATABASE.sql).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'my_role') then
    execute 'drop policy if exists "role_select" on public.pesanan';
    execute 'drop policy if exists "role_write" on public.pesanan';
    execute $p$create policy "role_select" on public.pesanan for select using (public.my_role() in ('owner','staff','viewer'))$p$;
    execute $p$create policy "role_write" on public.pesanan for all using (public.my_role() in ('owner','staff')) with check (public.my_role() in ('owner','staff'))$p$;

    execute 'drop policy if exists "role_select" on public.pesanan_item';
    execute 'drop policy if exists "role_write" on public.pesanan_item';
    execute $p$create policy "role_select" on public.pesanan_item for select using (public.my_role() in ('owner','staff','viewer'))$p$;
    execute $p$create policy "role_write" on public.pesanan_item for all using (public.my_role() in ('owner','staff')) with check (public.my_role() in ('owner','staff'))$p$;
  else
    execute 'drop policy if exists "admin_full_access" on public.pesanan';
    execute $p$create policy "admin_full_access" on public.pesanan for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')$p$;

    execute 'drop policy if exists "admin_full_access" on public.pesanan_item';
    execute $p$create policy "admin_full_access" on public.pesanan_item for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')$p$;
  end if;
end $$;

-- =========================================================
-- 4. MIGRASI DATA LAMA (dari tabel `penjualan` 1-item lama)
--    Setiap baris lama menjadi: 1 pesanan (header) + 1 item.
--    Aman dijalankan berkali-kali (pakai ON CONFLICT DO NOTHING).
-- =========================================================
insert into public.pesanan (no_pesanan, tanggal, tgl_iso, marketplace, status, biaya_admin, biaya_tambahan)
select no_pesanan, tanggal, tgl_iso, marketplace, status, biaya_admin, biaya_tambahan
from public.penjualan
on conflict (no_pesanan) do nothing;

insert into public.pesanan_item (pesanan_id, produk, varian, kategori, qty, harga_satuan, subtotal)
select p.id, pj.produk, pj.varian, pj.kategori, pj.qty,
       case when pj.qty > 0 then round(pj.total::numeric / pj.qty) else pj.total end,
       pj.total
from public.penjualan pj
join public.pesanan p on p.no_pesanan = pj.no_pesanan
where not exists (
  select 1 from public.pesanan_item pi where pi.pesanan_id = p.id
);

-- =========================================================
-- 5. VERIFIKASI HASIL MIGRASI (jalankan manual untuk cek)
-- =========================================================
-- Jumlah harus SAMA antara tabel lama & tabel pesanan baru:
-- select count(*) from public.penjualan;
-- select count(*) from public.pesanan;
--
-- Total omzet harus SAMA (selisih Rp0 / mendekati 0 karena pembulatan):
-- select sum(total) from public.penjualan;
-- select sum(subtotal) from public.pesanan_item;

-- Selesai. Tabel `penjualan` lama TIDAK dihapus oleh script ini.
-- Setelah app.js diupdate untuk memakai `pesanan` + `pesanan_item` dan
-- Anda sudah yakin semua berjalan baik, tabel `penjualan` lama boleh
-- dijadikan arsip (tidak perlu dihapus, tidak akan mengganggu apa pun
-- selama tidak ada lagi kode yang menulis ke sana).
