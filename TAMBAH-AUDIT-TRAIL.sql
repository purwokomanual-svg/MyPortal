-- =========================================================
-- OMNISELLER — JEJAK AUDIT (audit trail)
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- Jalankan SETELAH SETUP-ROLES.sql
--
-- Menambahkan kolom created_by/updated_by di tabel-tabel utama, terisi
-- OTOMATIS dari akun yang sedang login (auth.uid()) lewat trigger —
-- tidak perlu ubah apa pun di app.js untuk pengisian dasarnya.
-- Berguna untuk melacak "data ini diinput/diubah oleh siapa" kalau
-- beberapa staf/kasir input data bersamaan.
-- =========================================================

create or replace function public.set_audit_fields()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  elsif TG_OP = 'UPDATE' then
    new.updated_by := auth.uid();
    new.created_by := old.created_by; -- jangan pernah berubah setelah dibuat
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['penjualan','pesanan','stok'])
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id)', t);
      execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id)', t);
      execute format('drop trigger if exists trg_audit_fields on public.%I', t);
      execute format('create trigger trg_audit_fields before insert or update on public.%I for each row execute function public.set_audit_fields()', t);
    end if;
  end loop;
end $$;

-- =========================================================
-- Contoh query: lihat 20 pesanan terakhir beserta siapa yang menginputnya
-- =========================================================
-- select p.no_pesanan, p.tanggal, p.total, au.email as diinput_oleh, p.created_at
-- from public.pesanan p
-- left join public.admin_users au on au.id = p.created_by
-- order by p.created_at desc limit 20;

-- Selesai. Kolom ini terisi otomatis untuk data BARU/DIUBAH setelah script
-- ini dijalankan. Data lama yang sudah ada sebelumnya akan punya created_by
-- kosong (NULL) — ini normal, karena sistem tidak tahu siapa penginput
-- aslinya sebelum audit trail ini aktif.
