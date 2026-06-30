-- =========================================================
-- OMNISELLER — SISTEM ROLE / HAK AKSES ADMIN
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- Jalankan SETELAH SETUP-DATABASE.sql
-- =========================================================

-- 1. Tabel profil admin (terhubung ke akun login di auth.users)
create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nama text default '',
  role text not null default 'pending' check (role in ('owner','staff','viewer','pending')),
  created_at timestamptz default now()
);
alter table public.admin_users enable row level security;

-- 2. Fungsi bantu: ambil role user yang sedang login
create or replace function public.my_role()
returns text language sql stable security definer as $$
  select role from public.admin_users where id = auth.uid();
$$;

-- 3. Trigger otomatis: setiap kali ada akun baru daftar (sign up),
--    otomatis dibuatkan profil di admin_users.
--    User PERTAMA yang pernah daftar otomatis jadi 'owner'.
--    User berikutnya berstatus 'pending' (menunggu disetujui Owner).
create or replace function public.handle_new_admin_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.admin_users (id, email, nama, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nama', new.email),
    case when (select count(*) from public.admin_users) = 0 then 'owner' else 'pending' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_admin_user();

-- 4. RLS untuk tabel admin_users
drop policy if exists "lihat semua profil" on public.admin_users;
create policy "lihat semua profil" on public.admin_users
  for select using (auth.role() = 'authenticated');

drop policy if exists "owner kelola role" on public.admin_users;
create policy "owner kelola role" on public.admin_users
  for update using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

drop policy if exists "owner hapus akses" on public.admin_users;
create policy "owner hapus akses" on public.admin_users
  for delete using (public.my_role() = 'owner');

-- =========================================================
-- 5. PERBARUI RLS tabel-tabel data agar sesuai role:
--    - select  : owner, staff, viewer (asal bukan 'pending')
--    - insert/update/delete (data transaksi): owner & staff
--    - insert/update/delete (pengaturan/biaya): owner saja
-- =========================================================

-- Tabel transaksi/operasional: owner & staff boleh ubah, viewer hanya lihat
do $$
declare t text;
begin
  for t in select unnest(array['kategori','marketplace','stok','penjualan','hpp_per_produk'])
  loop
    execute format('drop policy if exists "admin_full_access" on public.%I', t);
    execute format('drop policy if exists "role_select" on public.%I', t);
    execute format('drop policy if exists "role_write" on public.%I', t);
    execute format('create policy "role_select" on public.%I for select using (public.my_role() in (''owner'',''staff'',''viewer''))', t);
    execute format('create policy "role_write" on public.%I for all using (public.my_role() in (''owner'',''staff'')) with check (public.my_role() in (''owner'',''staff''))', t);
  end loop;
end $$;

-- Tabel pengaturan sensitif: hanya owner yang boleh ubah, staff/viewer hanya lihat
do $$
declare t text;
begin
  for t in select unnest(array['biaya_pengaturan','pengaturan_toko'])
  loop
    execute format('drop policy if exists "admin_full_access" on public.%I', t);
    execute format('drop policy if exists "role_select" on public.%I', t);
    execute format('drop policy if exists "role_write" on public.%I', t);
    execute format('create policy "role_select" on public.%I for select using (public.my_role() in (''owner'',''staff'',''viewer''))', t);
    execute format('create policy "role_write" on public.%I for all using (public.my_role() = ''owner'') with check (public.my_role() = ''owner'')', t);
  end loop;
end $$;

-- =========================================================
-- SELESAI.
-- Cara kerja:
-- 1. Orang pertama yang Sign Up di aplikasi otomatis jadi OWNER.
-- 2. Admin/staff berikutnya yang Sign Up akan berstatus PENDING
--    (tidak bisa masuk ke aplikasi) sampai di-approve oleh Owner
--    lewat menu Pengaturan > Manajemen User.
-- 3. Owner bisa mengubah role siapa pun (staff/viewer/owner) atau
--    mencabut akses (hapus).
-- =========================================================
