-- =========================================================
-- OMNISELLER DASHBOARD — SKEMA DATABASE RELASIONAL
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- Skema ini menggantikan tabel lama "omniseller_data" (1 baris JSON)
-- menjadi tabel-tabel terpisah sesuai struktur data aplikasi.
-- =========================================================

-- =========================================================
-- 1. TABEL KATEGORI
-- (sesuai DB.kategori = [{nama, color}])
-- =========================================================
create table if not exists public.kategori (
  id bigint generated always as identity primary key,
  nama text not null unique,
  color text not null default '#888888',
  created_at timestamptz default now()
);

-- =========================================================
-- 2. TABEL MARKETPLACE
-- (sesuai DB.marketplace = [{nama, color}], fee_persen = DB.biaya.mp_fee[nama])
-- =========================================================
create table if not exists public.marketplace (
  id bigint generated always as identity primary key,
  nama text not null unique,
  color text not null default '#888888',
  fee_persen numeric not null default 3,
  created_at timestamptz default now()
);

-- =========================================================
-- 3. TABEL STOK
-- (sesuai DB.stok = [{sku, prod, varian, kat, stok, terjual}])
-- =========================================================
create table if not exists public.stok (
  id bigint generated always as identity primary key,
  sku text not null unique,
  produk text not null,
  varian text default '',
  kategori text default 'Lainnya',
  stok int not null default 0,
  terjual int not null default 0,
  hpp numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- 4. TABEL PENJUALAN
-- (sesuai DB.penjualan = [{no, tanggal, _date, mp, prod, varian, kat, qty, total, status}])
-- =========================================================
create table if not exists public.penjualan (
  id bigint generated always as identity primary key,
  no_pesanan text not null unique,
  tanggal text not null,          -- tampilan dd/mm/yyyy (sesuai format app)
  tgl_iso timestamptz not null,   -- nilai asli untuk sorting/filter tanggal
  marketplace text not null,
  produk text not null,
  varian text default '',
  kategori text default 'Lainnya',
  qty int not null default 1,
  total bigint not null default 0,
  status text not null default 'Selesai',
  created_at timestamptz default now()
);

-- =========================================================
-- 5. TABEL BIAYA & PENGATURAN (1 baris singleton, id selalu = 1)
-- (sesuai DB.biaya.extra & DB.biaya.hpp_mode/hpp_pct)
-- =========================================================
create table if not exists public.biaya_pengaturan (
  id int primary key default 1,
  ongkir numeric default 3000,
  packaging numeric default 1500,
  lain numeric default 500,
  hpp_mode text default 'pct',     -- 'pct' atau 'manual'
  hpp_pct numeric default 45,
  updated_at timestamptz default now(),
  constraint singleton_row check (id = 1)
);

-- =========================================================
-- 6. TABEL HPP PER PRODUK
-- (sesuai DB.biaya.hpp_per_produk = {produk: nilai})
-- =========================================================
create table if not exists public.hpp_per_produk (
  produk text primary key,
  hpp numeric not null default 0,
  updated_at timestamptz default now()
);

-- =========================================================
-- 7. TABEL PENGATURAN TOKO (1 baris singleton, id selalu = 1)
-- (sesuai DB.pengaturan = {nama, pemilik, hp, batasStok, logo})
-- =========================================================
create table if not exists public.pengaturan_toko (
  id int primary key default 1,
  nama_toko text default 'Toko Saya',
  pemilik text default '',
  hp text default '',
  batas_stok int default 10,
  logo text default '',           -- base64 data:image/...;base64,xxxx
  updated_at timestamptz default now(),
  constraint singleton_row check (id = 1)
);

-- =========================================================
-- ROW LEVEL SECURITY — hanya admin yang sudah login bisa akses
-- =========================================================
alter table public.kategori enable row level security;
alter table public.marketplace enable row level security;
alter table public.stok enable row level security;
alter table public.penjualan enable row level security;
alter table public.biaya_pengaturan enable row level security;
alter table public.hpp_per_produk enable row level security;
alter table public.pengaturan_toko enable row level security;

-- Policy generik: full akses (select/insert/update/delete) untuk user yang sudah login
do $$
declare t text;
begin
  for t in select unnest(array['kategori','marketplace','stok','penjualan','biaya_pengaturan','hpp_per_produk','pengaturan_toko'])
  loop
    execute format('drop policy if exists "admin_full_access" on public.%I', t);
    execute format('create policy "admin_full_access" on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- =========================================================
-- DATA AWAL (default kategori, marketplace, baris singleton)
-- =========================================================
insert into public.kategori (nama,color) values
  ('Atasan','#4f3de8'),('Bawahan','#ee4d2d'),('Outer','#00aa5b'),('Aksesoris','#f59e0b'),('Lainnya','#888888')
on conflict (nama) do nothing;

insert into public.marketplace (nama,color,fee_persen) values
  ('Shopee','#ee4d2d',3.5),('Tokopedia','#00aa5b',2.5),('TikTok Shop','#444444',1.8),('Lazada','#1a0dab',4.0)
on conflict (nama) do nothing;

insert into public.biaya_pengaturan (id) values (1) on conflict (id) do nothing;
insert into public.pengaturan_toko (id) values (1) on conflict (id) do nothing;

-- =========================================================
-- INDEX tambahan untuk performa filter/laporan
-- =========================================================
create index if not exists idx_penjualan_tgl on public.penjualan(tgl_iso);
create index if not exists idx_penjualan_mp on public.penjualan(marketplace);
create index if not exists idx_penjualan_kat on public.penjualan(kategori);
create index if not exists idx_stok_kat on public.stok(kategori);

-- Selesai. Lihat PANDUAN-SQL.md untuk cara migrasi data lama & contoh query.
