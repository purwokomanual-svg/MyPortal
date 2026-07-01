-- =========================================================
-- OMNISELLER — TAMBAH ROLE "KASIR"
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- Jalankan SETELAH SETUP-ROLES.sql (dan TAMBAH-MULTI-ITEM.sql jika sudah pakai multi-item)
--
-- Role KASIR: boleh tambah/edit/hapus PESANAN saja (tabel `pesanan` &
-- `pesanan_item`, atau `penjualan` kalau belum migrasi multi-item).
-- TIDAK boleh mengubah stok gudang, kategori, marketplace, biaya, atau
-- pengaturan toko — cocok untuk staf CS/admin marketplace yang tugasnya
-- hanya input pesanan harian.
-- =========================================================

-- 1. Longgarkan constraint role di admin_users agar menerima 'kasir'
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check
  check (role in ('owner','staff','kasir','viewer','pending'));

-- 2. Update fungsi trigger orang pertama sign up (tidak berubah secara logika,
--    hanya dijalankan ulang agar konsisten dengan constraint baru di atas)
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

-- =========================================================
-- 3. RLS: tabel PESANAN (baik skema lama `penjualan` maupun skema baru
--    `pesanan` + `pesanan_item`) -> kasir boleh select & write.
--    Tabel STOK, KATEGORI, MARKETPLACE, BIAYA, PENGATURAN -> kasir HANYA select.
-- =========================================================

-- Tabel transaksi pesanan: owner, staff, DAN kasir boleh tulis
do $$
declare t text;
begin
  for t in select unnest(array['penjualan','pesanan','pesanan_item'])
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists "role_select" on public.%I', t);
      execute format('drop policy if exists "role_write" on public.%I', t);
      execute format('create policy "role_select" on public.%I for select using (public.my_role() in (''owner'',''staff'',''kasir'',''viewer''))', t);
      execute format('create policy "role_write" on public.%I for all using (public.my_role() in (''owner'',''staff'',''kasir'')) with check (public.my_role() in (''owner'',''staff'',''kasir''))', t);
    end if;
  end loop;
end $$;

-- Tabel operasional lain (stok, kategori, marketplace, hpp_per_produk):
-- kasir HANYA boleh lihat, tidak boleh ubah
do $$
declare t text;
begin
  for t in select unnest(array['kategori','marketplace','stok','hpp_per_produk'])
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists "role_select" on public.%I', t);
      execute format('drop policy if exists "role_write" on public.%I', t);
      execute format('create policy "role_select" on public.%I for select using (public.my_role() in (''owner'',''staff'',''kasir'',''viewer''))', t);
      execute format('create policy "role_write" on public.%I for all using (public.my_role() in (''owner'',''staff'')) with check (public.my_role() in (''owner'',''staff''))', t);
    end if;
  end loop;
end $$;

-- Tabel pengaturan sensitif (biaya, pengaturan toko): tetap hanya owner yang boleh ubah
do $$
declare t text;
begin
  for t in select unnest(array['biaya_pengaturan','pengaturan_toko'])
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists "role_select" on public.%I', t);
      execute format('drop policy if exists "role_write" on public.%I', t);
      execute format('create policy "role_select" on public.%I for select using (public.my_role() in (''owner'',''staff'',''kasir'',''viewer''))', t);
      execute format('create policy "role_write" on public.%I for all using (public.my_role() = ''owner'') with check (public.my_role() = ''owner'')', t);
    end if;
  end loop;
end $$;

-- =========================================================
-- SELESAI.
-- Setelah ini, di menu Pengaturan > Manajemen User, Owner bisa memilih
-- role "Kasir" untuk admin yang tugasnya hanya input pesanan harian.
-- =========================================================
