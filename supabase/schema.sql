-- =========================================================
-- CRM AI Enterprise — Supabase schema v2
-- Skema relasional (bukan lagi satu blob JSON per user) + Realtime.
-- Jalankan seluruh isi file ini di: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- Jika sebelumnya Anda sudah pernah menjalankan schema.sql versi lama
-- (yang membuat tabel crm_store), aman untuk menjalankan file ini di
-- project yang sama — tabel crm_store dibiarkan apa adanya (tidak dipakai
-- lagi oleh aplikasi versi baru, boleh dihapus manual kalau mau beres-beres:
-- `drop table if exists public.crm_store;`)
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- CATATAN MULTI-USER (Team & Hak Akses)
-- Kolom `user_id` di SEMUA tabel data berarti "ID WORKSPACE" = uid akun pemilik
-- workspace (Administrator pertama). Semua anggota tim membaca/menulis baris
-- dengan user_id yang sama; siapa boleh apa ditentukan oleh tabel
-- `workspace_members` (role + permissions) lewat RLS di bawah.
-- Akun lama otomatis menjadi pemilik workspace-nya sendiri (lihat migrasi).
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- 1) COMPANIES
-- ---------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  industry    text default '',
  website     text default '',
  size        text default '',
  address     text default '',
  created_at  timestamptz not null default now()
);
create index if not exists companies_user_id_idx on public.companies (user_id);

-- ---------------------------------------------------------
-- 2) CONTACTS
-- ---------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  company_id  uuid,                 -- tidak pakai FK keras, lihat catatan di bawah
  email       text default '',
  phone       text default '',
  status      text default 'lead',  -- 'lead' | 'customer'
  tags        jsonb not null default '[]',
  owner_id    text,                 -- 'me' atau id anggota tim
  created_at  timestamptz not null default now()
);
create index if not exists contacts_user_id_idx on public.contacts (user_id);
create index if not exists contacts_company_id_idx on public.contacts (company_id);

-- ---------------------------------------------------------
-- 3) DEALS
-- ---------------------------------------------------------
create table if not exists public.deals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  contact_id   uuid,
  value        numeric not null default 0,
  stage        text not null default 'New', -- New | Qualified | Proposal | Won | Lost
  probability  int not null default 0,
  owner_id     text,
  loss_reason  text,
  items        jsonb not null default '[]', -- line items produk dari Price Book
  created_at   timestamptz not null default now()
);
create index if not exists deals_user_id_idx on public.deals (user_id);
create index if not exists deals_stage_idx on public.deals (stage);
create index if not exists deals_contact_id_idx on public.deals (contact_id);

-- ---------------------------------------------------------
-- 4) TASKS
-- ---------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  due         timestamptz,
  priority    text default 'medium', -- low | medium | high
  done        boolean not null default false,
  contact_id  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_due_idx on public.tasks (due);

-- ---------------------------------------------------------
-- 5) NOTES (catatan bebas di kontak/deal)
-- ---------------------------------------------------------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity_type  text not null,  -- 'contact' | 'deal'
  entity_id    uuid not null,
  text         text not null,
  at           timestamptz not null default now()
);
create index if not exists notes_user_id_idx on public.notes (user_id);
create index if not exists notes_entity_idx on public.notes (entity_type, entity_id);

-- ---------------------------------------------------------
-- 6) ACTIVITIES (feed aktivitas / activity log)
-- ---------------------------------------------------------
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null,
  deal_id     uuid,
  contact_id  uuid,
  at          timestamptz not null default now()
);
create index if not exists activities_user_id_idx on public.activities (user_id);
-- Multi-user: catat siapa pelaku aktivitas (aman dijalankan berulang).
alter table public.activities add column if not exists actor_id uuid;
alter table public.activities add column if not exists actor_name text default '';
create index if not exists activities_at_idx on public.activities (at desc);

-- ---------------------------------------------------------
-- 7) PRODUCTS (price book)
-- ---------------------------------------------------------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  model        text default '',
  sku          text default '',
  category     text default '',
  unit         text default 'Unit',
  price        numeric not null default 0,
  description  text default '',
  min_stock    numeric not null default 0,   -- ambang batas stok minimum (reorder point) untuk peringatan stok rendah
  created_at   timestamptz not null default now()
);
create index if not exists products_user_id_idx on public.products (user_id);
create index if not exists products_category_idx on public.products (category);
-- Migrasi additive untuk project yang sudah pernah membuat tabel ini sebelum kolom min_stock ada.
alter table public.products add column if not exists min_stock numeric not null default 0;

-- ---------------------------------------------------------
-- 7b) STOCK_MOVEMENTS (kartu stok / ledger keluar-masuk barang gudang)
-- Stok saat ini SENGAJA tidak disimpan sebagai kolom di products — selalu
-- dihitung dari SUM(movement) per produk, supaya angka stok selalu akurat
-- dan tidak pernah "melenceng" (drift) dari riwayat transaksinya.
-- ---------------------------------------------------------
create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  code        text default '',
  address     text default '',
  is_default  boolean not null default false,  -- gudang default: menampung transaksi lama yang belum punya gudang
  created_at  timestamptz not null default now()
);
create index if not exists warehouses_user_id_idx on public.warehouses (user_id);

create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  product_id    uuid not null,
  warehouse_id  uuid,              -- gudang tempat barang masuk/keluar (NULL = gudang default, untuk data lama)
  transfer_id   uuid,              -- diisi bila transaksi ini bagian dari transfer antar gudang (2 baris: keluar + masuk)
  type          text not null default 'in', -- 'in' (barang masuk) | 'out' (barang keluar) | 'adjustment' (stok opname, qty boleh +/-)
  qty           numeric not null default 0,
  note          text default '',
  ref           text default '',   -- referensi bebas: no. PO, no. deal, nama supplier, dll
  date          date,
  created_at    timestamptz not null default now()
);
create index if not exists stock_movements_user_id_idx on public.stock_movements (user_id);
create index if not exists stock_movements_product_id_idx on public.stock_movements (product_id);
-- Migrasi additive untuk project yang sudah punya tabel stock_movements versi sebelumnya (tanpa multi-gudang).
alter table public.stock_movements add column if not exists warehouse_id uuid;
alter table public.stock_movements add column if not exists transfer_id uuid;
create index if not exists stock_movements_warehouse_id_idx on public.stock_movements (warehouse_id);

-- ---------------------------------------------------------
-- 8) QUOTES (quotation multi-section)
-- ---------------------------------------------------------
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  number        text not null,
  date          date,
  subject       text default '',
  project_name  text default '',
  your_ref      text default '',
  pages         text default '1 Lembar',
  deal_id       uuid,
  contact_id    uuid,
  to_name       text default '',
  to_address    text default '',
  attn_name     text default '',
  attn_phone    text default '',
  attn_fax      text default '',
  attn_email    text default '',
  sections      jsonb not null default '[]',  -- [{name, discountPct, items:[{model,description,qty,unit,price}]}]
  notes_list    jsonb not null default '[]',
  terms         jsonb not null default '[]',
  status        text not null default 'Draft', -- Draft | Sent | Accepted | Declined
  created_at    timestamptz not null default now()
);
create index if not exists quotes_user_id_idx on public.quotes (user_id);
create index if not exists quotes_status_idx on public.quotes (status);
create index if not exists quotes_deal_id_idx on public.quotes (deal_id);

-- ---------------------------------------------------------
-- 8b) INVOICES (faktur — bisa dibuat manual atau dari Quotation yang Accepted)
-- ---------------------------------------------------------
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  number        text not null,
  date          date,
  due_date      date,
  quote_id      uuid,
  deal_id       uuid,
  contact_id    uuid,
  to_name       text default '',
  to_address    text default '',
  attn_name     text default '',
  attn_phone    text default '',
  attn_email    text default '',
  sections      jsonb not null default '[]',  -- struktur sama seperti quotes.sections
  notes_list    jsonb not null default '[]',
  terms         jsonb not null default '[]',
  amount_paid   numeric not null default 0,
  status        text not null default 'Draft', -- Draft | Sent | Paid (status tampilan turunan dihitung di aplikasi)
  created_at    timestamptz not null default now()
);

-- Penandatangan per dokumen (id penandatangan dari user_settings.company.signers; text karena bisa 'legacy').
-- Aman dijalankan berulang. Jalankan di Supabase SQL Editor jika database sudah berjalan.
alter table public.quotes   add column if not exists signer_id text;
alter table public.invoices add column if not exists signer_id text;
create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_quote_id_idx on public.invoices (quote_id);

-- ---------------------------------------------------------
-- 9) TEAM (anggota tim sales)
-- ---------------------------------------------------------
create table if not exists public.team (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  role        text default '',
  email       text default '',
  avatar      text default '',
  created_at  timestamptz not null default now()
);
create index if not exists team_user_id_idx on public.team (user_id);

-- ---------------------------------------------------------
-- 10) USER_SETTINGS (satu baris per user: profil + pengaturan + letterhead)
-- ---------------------------------------------------------
create table if not exists public.user_settings (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  monthly_target      numeric not null default 300000000,
  auto_task_proposal  boolean not null default true,
  auto_loss_reason    boolean not null default true,
  auto_quote_log      boolean not null default true,
  auto_quote_followup   boolean not null default true,
  auto_invoice_reminder boolean not null default true,
  company             jsonb not null default '{}',
  profile             jsonb not null default '{}',
  updated_at          timestamptz not null default now()
);
-- Migrasi additive untuk project yang sudah pernah membuat tabel ini sebelum
-- kolom auto_quote_followup / auto_invoice_reminder ada (aman dijalankan berkali-kali).
alter table public.user_settings add column if not exists auto_quote_followup boolean not null default true;
alter table public.user_settings add column if not exists auto_invoice_reminder boolean not null default true;

-- Catatan desain: kolom seperti company_id / contact_id / deal_id / owner_id
-- SENGAJA tidak dipasangi FOREIGN KEY antar tabel. Aplikasi menulis lewat
-- sinkronisasi diff otomatis (insert/update/delete paralel per tabel), jadi
-- FK antar tabel berisiko gagal karena race condition urutan insert.
-- Keterhubungan data tetap dijaga di level aplikasi (JS), dan setiap query
-- tetap aman & terisolasi per user lewat Row Level Security di bawah ini.


-- =========================================================
-- MULTI-USER: ANGGOTA WORKSPACE, UNDANGAN, & HAK AKSES
-- =========================================================
create table if not exists public.workspace_members (
  user_id       uuid primary key references auth.users(id) on delete cascade,  -- akun login
  workspace_id  uuid not null references auth.users(id) on delete cascade,     -- uid pemilik workspace
  email         text not null default '',
  full_name     text not null default '',
  job_title     text not null default '',
  avatar        text not null default '',
  role          text not null default 'marketing'
                check (role in ('administrator','marketing','accounting','purchasing')),
  permissions   jsonb not null default '{}',
  is_active     boolean not null default true,
  is_owner      boolean not null default false,
  data_scope    text not null default 'all' check (data_scope in ('all','own')),  -- 'own' = hanya melihat data miliknya sendiri
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists workspace_members_ws_idx on public.workspace_members (workspace_id);

create table if not exists public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  job_title     text not null default '',
  role          text not null default 'marketing'
                check (role in ('administrator','marketing','accounting','purchasing')),
  permissions   jsonb not null default '{}',
  data_scope    text not null default 'all' check (data_scope in ('all','own')),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days')
);
create unique index if not exists workspace_invites_ws_email_idx on public.workspace_invites (workspace_id, lower(email));
create index if not exists workspace_invites_email_idx on public.workspace_invites (lower(email));

-- ---------------------------------------------------------
-- MIGRASI data_scope (project yang sudah menjalankan versi sebelumnya).
-- Sekali jalan: user Marketing yang sudah ada otomatis diset 'own'; setelah itu pilihan Administrator tidak ditimpa.
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='workspace_members' and column_name='data_scope') then
    alter table public.workspace_members add column data_scope text not null default 'all' check (data_scope in ('all','own'));
    update public.workspace_members set data_scope = 'own' where role = 'marketing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='workspace_invites' and column_name='data_scope') then
    alter table public.workspace_invites add column data_scope text not null default 'all' check (data_scope in ('all','own'));
    update public.workspace_invites set data_scope = 'own' where role = 'marketing';
  end if;
end $$;

-- ---------------------------------------------------------
-- KEPEMILIKAN BARIS: created_by terisi otomatis oleh trigger (tidak bisa dipalsukan dari klien).
-- Dipakai untuk pembatasan data user ber-cakupan 'own'.
-- ---------------------------------------------------------
alter table public.companies add column if not exists created_by uuid;
alter table public.contacts  add column if not exists created_by uuid;
alter table public.deals     add column if not exists created_by uuid;
alter table public.tasks     add column if not exists created_by uuid;
alter table public.quotes    add column if not exists created_by uuid;
alter table public.invoices  add column if not exists created_by uuid;
update public.companies set created_by = user_id where created_by is null;
update public.contacts  set created_by = user_id where created_by is null;
update public.deals     set created_by = user_id where created_by is null;
update public.tasks     set created_by = user_id where created_by is null;
update public.quotes    set created_by = user_id where created_by is null;
update public.invoices  set created_by = user_id where created_by is null;

create or replace function public.trg_row_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    elsif coalesce(current_setting('app.transfer', true), '') <> '1' then
      new.created_by := old.created_by;      -- pembuat asli tidak boleh diganti (kecuali lewat team_transfer_data)
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','contacts','deals','tasks','quotes','invoices'] loop
    execute format('drop trigger if exists trg_row_guard on public.%I;', t);
    execute format('create trigger trg_row_guard before insert or update on public.%I for each row execute function public.trg_row_guard();', t);
  end loop;
end $$;

create or replace function public.trg_activity_actor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.actor_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_activity_actor on public.activities;
create trigger trg_activity_actor before insert on public.activities for each row execute function public.trg_activity_actor();

-- ---------------------------------------------------------
-- Katalog izin yang sah (modul -> aksi). Nilai lain dibuang oleh clean_permissions().
-- Harus sama dengan PERM_CATALOG di js/app.js.
-- ---------------------------------------------------------
create or replace function public.clean_permissions(p jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_object_agg(m.module, (
           select jsonb_object_agg(a.action, coalesce((p -> m.module ->> a.action) = 'true', false))
           from unnest(m.actions) as a(action)
         )), '{}'::jsonb)
  from (values
    ('dashboard', array['view']),
    ('companies', array['view','create','edit','delete']),
    ('contacts',  array['view','create','edit','delete']),
    ('deals',     array['view','create','edit','delete']),
    ('tasks',     array['view','create','edit','delete']),
    ('reports',   array['view']),
    ('products',  array['view','create','edit','delete']),
    ('stock',     array['view','create','edit','delete']),
    ('quotes',    array['view','create','edit','delete']),
    ('invoices',  array['view','create','edit','delete']),
    ('team',      array['view']),
    ('settings',  array['manage']),
    ('data',      array['manage'])
  ) as m(module, actions)
$$;

-- ---------------------------------------------------------
-- Helper untuk RLS. SECURITY DEFINER agar tidak rekursif terhadap RLS
-- workspace_members. Selalu membaca keanggotaan TERBARU dari database, sehingga
-- perubahan hak akses / penonaktifan berlaku seketika (tanpa menunggu token habis).
-- ---------------------------------------------------------
create or replace function public.my_workspace_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.workspace_id from public.workspace_members m
  where m.user_id = auth.uid() and m.is_active
$$;

create or replace function public.is_workspace_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select m.role = 'administrator' from public.workspace_members m
                   where m.user_id = auth.uid() and m.is_active), false)
$$;

create or replace function public.has_perm(_module text, _action text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case when m.role = 'administrator' then true
                else coalesce((m.permissions -> _module ->> _action)::boolean, false) end
    from public.workspace_members m
    where m.user_id = auth.uid() and m.is_active
  ), false)
$$;

-- true = user ini hanya boleh mengakses data MILIKNYA (Administrator tidak pernah dibatasi)
create or replace function public.scope_own()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select m.role <> 'administrator' and m.data_scope = 'own'
                   from public.workspace_members m where m.user_id = auth.uid() and m.is_active), true)
$$;

-- Owner kontak/deal user ber-cakupan 'own' selalu dirinya sendiri (tidak bisa "melempar" atau mengambil data orang lain)
create or replace function public.trg_owner_scope()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and public.scope_own() then new.owner_id := auth.uid()::text; end if;
  return new;
end $$;
drop trigger if exists trg_owner_scope on public.contacts;
create trigger trg_owner_scope before insert or update on public.contacts for each row execute function public.trg_owner_scope();
drop trigger if exists trg_owner_scope on public.deals;
create trigger trg_owner_scope before insert or update on public.deals for each row execute function public.trg_owner_scope();

-- ---------------------------------------------------------
-- Trigger pengaman workspace_members: pemilik tidak bisa diturunkan/dinonaktifkan,
-- workspace selalu punya minimal 1 Administrator aktif, izin selalu dibersihkan.
-- ---------------------------------------------------------
create or replace function public.guard_member_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id or new.workspace_id <> old.workspace_id or new.is_owner <> old.is_owner then
    raise exception 'Identitas anggota tidak boleh diubah';
  end if;
  if old.is_owner and (new.role <> 'administrator' or not new.is_active) then
    raise exception 'Akun pemilik workspace harus tetap Administrator dan aktif';
  end if;
  if old.role = 'administrator' and old.is_active and (new.role <> 'administrator' or not new.is_active) then
    if not exists (select 1 from public.workspace_members x
                   where x.workspace_id = old.workspace_id and x.role = 'administrator'
                     and x.is_active and x.user_id <> old.user_id) then
      raise exception 'Workspace harus memiliki minimal satu Administrator aktif';
    end if;
  end if;
  new.permissions := public.clean_permissions(new.permissions);
  if new.role = 'administrator' then new.data_scope := 'all'; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_guard_member_update on public.workspace_members;
create trigger trg_guard_member_update before update on public.workspace_members
  for each row execute function public.guard_member_update();

-- ---------------------------------------------------------
-- KONFIGURASI PENDAFTARAN (dikontrol di server, bukan di config.js)
--   signup_mode = 'approval' (default): akun pertama = Administrator utama (pemilik). Setelah itu, setiap akun baru
--                 TANPA undangan masuk antrean "permintaan akses" dan baru bisa mengakses data setelah DISETUJUI
--                 oleh Administrator utama (pemilik). Selama menunggu, akun itu tidak punya workspace sama sekali.
--                 'closed'  : akun tanpa undangan ditolak.
--                 'open'    : perilaku lama — setiap pendaftar otomatis jadi Administrator workspace barunya sendiri (multi-tenant).
--   Ubah mode:  update public.app_config set signup_mode = 'closed';
-- ---------------------------------------------------------
create table if not exists public.app_config (
  id                 boolean primary key default true check (id),   -- satu baris saja
  signup_mode        text not null default 'approval' check (signup_mode in ('approval','open','closed')),
  owner_workspace_id uuid references auth.users(id) on delete set null
);
alter table public.app_config add column if not exists signup_mode text not null default 'approval' check (signup_mode in ('approval','open','closed'));
alter table public.app_config add column if not exists owner_workspace_id uuid references auth.users(id) on delete set null;
do $$
begin  -- migrasi dari versi sebelumnya yang memakai kolom boolean public_signup
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_config' and column_name='public_signup') then
    execute $q$update public.app_config set signup_mode = case when public_signup then 'approval' else 'closed' end where id = true$q$;
    alter table public.app_config drop column public_signup;
  end if;
end $$;
-- Branding aplikasi (logo + nama). Dibaca layar login (anon) lewat auth_public_config(); diubah lewat set_brand().
alter table public.app_config add column if not exists brand_logo text not null default '' check (char_length(brand_logo) <= 300000);
alter table public.app_config add column if not exists brand_name text not null default '' check (char_length(brand_name) <= 60);
insert into public.app_config (id) values (true) on conflict (id) do nothing;
alter table public.app_config enable row level security;       -- tanpa policy: hanya fungsi SECURITY DEFINER yang bisa membaca
revoke all on public.app_config from anon, authenticated;

-- Antrean permintaan akses. Tidak bisa ditulis langsung dari klien: dibuat oleh ensure_membership(), diputuskan oleh
-- team_review_access_request() (hanya pemilik workspace).
create table if not exists public.access_requests (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references auth.users(id) on delete cascade,   -- workspace tujuan (milik Administrator utama)
  email        text not null,
  full_name    text not null default '',
  message      text not null default '' check (char_length(message) <= 300),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note  text not null default '' check (char_length(review_note) <= 300),
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists access_requests_ws_status_idx on public.access_requests (workspace_id, status);

-- Workspace utama = milik Administrator pertama (pemilik). Dicatat saat akun pertama dibuat; fallback ke pemilik tertua.
create or replace function public.primary_workspace_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select owner_workspace_id from public.app_config limit 1),
                  (select workspace_id from public.workspace_members where is_owner order by created_at limit 1))
$$;
create or replace function public.is_workspace_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where user_id = auth.uid() and is_owner and is_active)
$$;
-- Dibaca layar login (anon) agar teks pendaftaran sesuai mode. Hanya mengembalikan dua nilai non-sensitif.
create or replace function public.auth_public_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signup_mode', coalesce((select signup_mode from public.app_config limit 1), 'approval'),
    'bootstrapped', public.primary_workspace_id() is not null,
    'brand_logo', coalesce((select brand_logo from public.app_config limit 1), ''),
    'brand_name', coalesce((select brand_name from public.app_config limit 1), ''))
$$;

-- RPC: Administrator workspace utama mengganti logo & nama aplikasi (tampil di login, sidebar, favicon).
-- Logo hanya data-URI raster (png/jpeg/webp) <= 300 KB; SVG sengaja ditolak. Kosong = kembali ke bawaan.
create or replace function public.set_brand(_logo text, _name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare lg text := coalesce(_logo, ''); nm text := left(trim(coalesce(_name, '')), 60);
begin
  if not public.is_workspace_admin() then
    raise exception 'Hanya Administrator yang boleh mengubah logo aplikasi';
  end if;
  if public.my_workspace_id() is distinct from public.primary_workspace_id() then
    raise exception 'Logo aplikasi hanya bisa diubah oleh Administrator workspace utama (milik Administrator pertama)';
  end if;
  if lg <> '' and (char_length(lg) > 300000 or lg !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then
    raise exception 'Logo harus berupa gambar PNG, JPEG, atau WebP maksimal 300 KB';
  end if;
  -- upsert (bukan UPDATE tanpa WHERE: Supabase menolaknya dengan "UPDATE requires a WHERE clause")
  insert into public.app_config (id, brand_logo, brand_name) values (true, lg, nm)
  on conflict (id) do update set brand_logo = excluded.brand_logo, brand_name = excluded.brand_name;
  return public.auth_public_config();
end;
$$;

-- ---------------------------------------------------------
-- RPC: dipanggil aplikasi setiap login. Mengembalikan keanggotaan user; bila belum ada:
--   (a) ada undangan untuk emailnya -> bergabung ke workspace pengundang, atau
--   (b) tidak ada -> jadi Administrator + pemilik workspace barunya sendiri (perilaku lama).
-- ---------------------------------------------------------
create or replace function public.ensure_membership()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  mail  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  meta  text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '');
  note  text := left(coalesce(auth.jwt() -> 'user_metadata' ->> 'request_note', ''), 300);
  m     public.workspace_members;
  inv   public.workspace_invites;
  req   public.access_requests;
  prof  jsonb;
  mode  text;
  pw    uuid;
begin
  if uid is null then raise exception 'Belum login'; end if;

  select * into m from public.workspace_members where user_id = uid;
  if found then return to_jsonb(m); end if;

  -- anggota baru wajib sudah mengonfirmasi emailnya (mencegah klaim undangan memakai email orang lain)
  if not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null) then
    raise exception 'Email belum dikonfirmasi';
  end if;

  select * into inv from public.workspace_invites
   where lower(email) = mail and expires_at > now()
   order by created_at desc limit 1;

  if found then
    -- (a) diundang Administrator: langsung bergabung, tanpa antrean
    insert into public.workspace_members (user_id, workspace_id, email, full_name, job_title, role, permissions, data_scope, created_by)
    values (uid, inv.workspace_id, mail,
            coalesce(nullif(inv.full_name,''), nullif(meta,''), split_part(mail,'@',1)),
            inv.job_title, inv.role, public.clean_permissions(inv.permissions),
            case when inv.role = 'administrator' then 'all' else inv.data_scope end, inv.created_by)
    on conflict (user_id) do nothing;
    delete from public.workspace_invites where id = inv.id;
    delete from public.access_requests where user_id = uid;
  else
    -- (b) tanpa undangan. Kunci advisory: dua pendaftar pertama yang bersamaan tidak boleh sama-sama jadi pemilik.
    perform pg_advisory_xact_lock(hashtext('crm-owner-bootstrap'));
    mode := coalesce((select signup_mode from public.app_config limit 1), 'approval');
    pw   := public.primary_workspace_id();

    if pw is not null and mode = 'closed' then
      raise exception 'Akun ini belum diundang ke workspace mana pun. Minta Administrator membuatkan akun Anda.';
    end if;

    if pw is not null and mode = 'approval' then
      -- sudah ada Administrator utama -> ajukan permintaan akses, JANGAN beri workspace
      select * into req from public.access_requests where user_id = uid;
      if found and req.status = 'approved' then
        delete from public.access_requests where user_id = uid;   -- sisa permintaan lama (anggotanya sudah dihapus): ajukan ulang
        req := null;
      end if;
      if req.user_id is null then
        if (select count(*) from public.access_requests where workspace_id = pw and status = 'pending') >= 50 then
          raise exception 'Antrean permintaan akses sedang penuh. Hubungi Administrator.';
        end if;
        insert into public.access_requests (user_id, workspace_id, email, full_name, message)
        values (uid, pw, mail, coalesce(nullif(meta,''), split_part(mail,'@',1)), note)
        returning * into req;
      end if;
      return jsonb_build_object('access_status', req.status, 'email', req.email,
                                'requested_at', req.created_at, 'review_note', req.review_note);
    end if;

    -- akun pertama (belum ada pemilik) atau mode 'open': jadi Administrator + pemilik workspace sendiri
    select profile into prof from public.user_settings where user_id = uid;
    insert into public.workspace_members (user_id, workspace_id, email, full_name, job_title, avatar, role, permissions, is_owner)
    values (uid, uid, mail,
            coalesce(nullif(prof ->> 'name',''), nullif(meta,''), split_part(mail,'@',1)),
            coalesce(prof ->> 'role',''), coalesce(prof ->> 'avatar',''),
            'administrator', public.clean_permissions('{}'::jsonb), true)
    on conflict (user_id) do nothing;
    if pw is null then update public.app_config set owner_workspace_id = uid where id = true; end if;
  end if;

  select * into m from public.workspace_members where user_id = uid;
  return to_jsonb(m);
end;
$$;

-- RPC: Administrator membuat undangan (sebelum akun dibuat lewat signUp)
drop function if exists public.team_create_invite(text,text,text,text,jsonb);
create or replace function public.team_create_invite(
  _email text, _full_name text, _job_title text, _role text, _permissions jsonb, _data_scope text default 'all')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ws   uuid := public.my_workspace_id();
  mail text := lower(trim(coalesce(_email,'')));
  inv  public.workspace_invites;
begin
  if ws is null or not public.is_workspace_admin() then
    raise exception 'Hanya Administrator yang boleh membuat user';
  end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Format email tidak valid'; end if;
  if _role not in ('administrator','marketing','accounting','purchasing') then raise exception 'Role tidak dikenal'; end if;
  if coalesce(_data_scope,'all') not in ('all','own') then raise exception 'Cakupan data tidak dikenal'; end if;
  if exists (select 1 from public.workspace_members where lower(email) = mail) then
    raise exception 'Email % sudah terdaftar sebagai anggota', mail;
  end if;
  if exists (select 1 from public.workspace_invites
              where lower(email) = mail and workspace_id <> ws and expires_at > now()) then
    raise exception 'Email % sedang diundang ke workspace lain', mail;
  end if;

  delete from public.workspace_invites where workspace_id = ws and lower(email) = mail;
  insert into public.workspace_invites (workspace_id, email, full_name, job_title, role, permissions, data_scope, created_by)
  values (ws, mail, trim(coalesce(_full_name,'')), trim(coalesce(_job_title,'')), _role,
          public.clean_permissions(_permissions), case when _role = 'administrator' then 'all' else coalesce(_data_scope,'all') end, auth.uid())
  returning * into inv;
  return to_jsonb(inv);
end;
$$;

-- RPC: pengguna memperbarui profilnya sendiri (nama, jabatan, foto) — tanpa bisa menyentuh role/izin
create or replace function public.update_my_profile(_full_name text, _job_title text, _avatar text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m public.workspace_members;
begin
  update public.workspace_members
     set full_name = coalesce(nullif(trim(_full_name),''), full_name),
         job_title = coalesce(trim(_job_title), job_title),
         avatar    = coalesce(_avatar, avatar)
   where user_id = auth.uid()
   returning * into m;
  if not found then raise exception 'Keanggotaan tidak ditemukan'; end if;
  return to_jsonb(m);
end;
$$;

-- RPC: Administrator mereset password anggota (pemilik workspace hanya bisa direset oleh dirinya sendiri)
create or replace function public.team_reset_password(_target uuid, _new_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare t public.workspace_members;
begin
  if not public.is_workspace_admin() then raise exception 'Hanya Administrator yang boleh mereset password'; end if;
  if length(coalesce(_new_password,'')) < 10 or _new_password !~ '[A-Za-z]' or _new_password !~ '[0-9]' then
    raise exception 'Password minimal 10 karakter dan mengandung huruf serta angka';
  end if;
  select * into t from public.workspace_members where user_id = _target and workspace_id = public.my_workspace_id();
  if not found then raise exception 'Anggota tidak ditemukan'; end if;
  if t.is_owner and _target <> auth.uid() then raise exception 'Password pemilik workspace tidak dapat direset oleh orang lain'; end if;
  update auth.users
     set encrypted_password = crypt(_new_password, gen_salt('bf', 10)), updated_at = now()
   where id = _target;
  delete from auth.sessions where user_id = _target;   -- paksa keluar semua perangkat user tsb (refresh token ikut terhapus)
end;
$$;

-- RPC: Administrator menghapus anggota (akses dicabut seketika; akun login ikut dihapus bila diizinkan)
create or replace function public.team_delete_member(_target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare t public.workspace_members;
begin
  if not public.is_workspace_admin() then raise exception 'Hanya Administrator yang boleh menghapus user'; end if;
  select * into t from public.workspace_members where user_id = _target and workspace_id = public.my_workspace_id();
  if not found then raise exception 'Anggota tidak ditemukan'; end if;
  if t.is_owner then raise exception 'Pemilik workspace tidak dapat dihapus'; end if;
  if _target = auth.uid() then raise exception 'Anda tidak dapat menghapus akun Anda sendiri'; end if;
  if t.role = 'administrator' and not exists (
       select 1 from public.workspace_members x
        where x.workspace_id = t.workspace_id and x.role = 'administrator' and x.is_active and x.user_id <> _target) then
    raise exception 'Workspace harus memiliki minimal satu Administrator aktif';
  end if;
  delete from public.workspace_members where user_id = _target;
  delete from public.access_requests where user_id = _target;
  begin
    delete from auth.users where id = _target;
  exception when others then
    null; -- akses sudah dicabut; akun login yatim boleh dihapus manual di Authentication > Users
  end;
end;
$$;

-- RPC: Administrator mengalihkan SEMUA data milik satu user ke user lain (mis. saat sales resign / pindah tugas)
create or replace function public.team_transfer_data(_from uuid, _to uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare ws uuid := public.my_workspace_id(); n_c int; n_d int; n_o int;
begin
  if not public.is_workspace_admin() then raise exception 'Hanya Administrator yang boleh mengalihkan data'; end if;
  if _from = _to then raise exception 'User asal dan tujuan sama'; end if;
  if not exists (select 1 from public.workspace_members where user_id = _from and workspace_id = ws)
     or not exists (select 1 from public.workspace_members where user_id = _to and workspace_id = ws and is_active) then
    raise exception 'User asal/tujuan tidak valid';
  end if;
  perform set_config('app.transfer', '1', true);
  update public.contacts set owner_id = _to::text, created_by = _to where user_id = ws and (owner_id = _from::text or (owner_id is null and created_by = _from));
  get diagnostics n_c = row_count;
  update public.deals set owner_id = _to::text, created_by = _to where user_id = ws and (owner_id = _from::text or (owner_id is null and created_by = _from));
  get diagnostics n_d = row_count;
  update public.companies set created_by = _to where user_id = ws and created_by = _from;
  update public.tasks     set created_by = _to where user_id = ws and created_by = _from;
  update public.quotes    set created_by = _to where user_id = ws and created_by = _from;
  update public.invoices  set created_by = _to where user_id = ws and created_by = _from;
  n_o := 0;
  return jsonb_build_object('contacts', n_c, 'deals', n_d);
end;
$$;

-- RPC: nomor dokumen berikutnya di SELURUH workspace (bukan hanya data yang terlihat oleh user ber-cakupan 'own'),
-- supaya dua marketing tidak pernah mendapat nomor QT/INV yang sama.
create or replace function public.next_doc_number(_kind text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare ws uuid := public.my_workspace_id(); yr text := to_char(now(), 'YYYY'); mx int; pre text; tbl text;
begin
  if ws is null then raise exception 'Belum bergabung ke workspace'; end if;
  if _kind = 'quote' then pre := 'QT'; else pre := 'INV'; end if;
  if _kind = 'quote' then
    select coalesce(max(((regexp_match(number, '^QT/(\d+)/'))[1])::int), 0) into mx from public.quotes
     where user_id = ws and number ~ ('^QT/\d+/' || yr || '$');
  else
    select coalesce(max(((regexp_match(number, '^INV/(\d+)/'))[1])::int), 0) into mx from public.invoices
     where user_id = ws and number ~ ('^INV/\d+/' || yr || '$');
  end if;
  return format('%s/%s/%s', pre, lpad((mx + 1)::text, 3, '0'), yr);
end;
$$;

create or replace function public.doc_number_exists(_kind text, _number text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare ws uuid := public.my_workspace_id();
begin
  if ws is null then return false; end if;
  if _kind = 'quote' then return exists (select 1 from public.quotes where user_id = ws and number = _number); end if;
  return exists (select 1 from public.invoices where user_id = ws and number = _number);
end;
$$;

-- RPC: HANYA pemilik workspace (Administrator pertama) yang boleh menyetujui/menolak permintaan akses.
-- Peran akhir dipilih pemilik saat menyetujui (bukan oleh pemohon), sehingga tidak ada yang bisa menjadi
-- Administrator tanpa keputusan sadar dari pemilik.
create or replace function public.team_review_access_request(
  _user uuid, _approve boolean, _role text default 'marketing', _permissions jsonb default '{}'::jsonb,
  _data_scope text default 'all', _note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ws  uuid := public.my_workspace_id();
  req public.access_requests;
  m   public.workspace_members;
begin
  if ws is null or not public.is_workspace_owner() then
    raise exception 'Hanya pemilik workspace (Administrator utama) yang boleh memutuskan permintaan akses';
  end if;
  select * into req from public.access_requests
   where user_id = _user and workspace_id = ws and status in ('pending','rejected') for update;
  if not found then raise exception 'Permintaan akses tidak ditemukan atau sudah diproses'; end if;

  if not coalesce(_approve, false) then
    update public.access_requests
       set status = 'rejected', review_note = left(coalesce(_note,''), 300), reviewed_by = auth.uid(), reviewed_at = now()
     where user_id = _user;
    return jsonb_build_object('status','rejected');
  end if;

  if _role not in ('administrator','marketing','accounting','purchasing') then raise exception 'Role tidak dikenal'; end if;
  if coalesce(_data_scope,'all') not in ('all','own') then raise exception 'Cakupan data tidak dikenal'; end if;
  if not exists (select 1 from auth.users where id = _user and email_confirmed_at is not null) then
    raise exception 'Email pemohon belum dikonfirmasi';
  end if;
  if exists (select 1 from public.workspace_members where user_id = _user) then
    raise exception 'Pengguna ini sudah menjadi anggota workspace';
  end if;

  insert into public.workspace_members (user_id, workspace_id, email, full_name, role, permissions, data_scope, created_by)
  values (_user, ws, req.email, req.full_name, _role, public.clean_permissions(_permissions),
          case when _role = 'administrator' then 'all' else coalesce(_data_scope,'all') end, auth.uid())
  returning * into m;
  update public.access_requests
     set status = 'approved', review_note = left(coalesce(_note,''), 300), reviewed_by = auth.uid(), reviewed_at = now()
   where user_id = _user;
  return jsonb_build_object('status','approved','role', m.role);
end;
$$;

-- RLS access_requests: pemohon melihat barisnya sendiri; pemilik melihat semua antrean workspace-nya. Tanpa policy tulis.
alter table public.access_requests enable row level security;
drop policy if exists "ar_select" on public.access_requests;
create policy "ar_select" on public.access_requests for select
  using (user_id = auth.uid() or (workspace_id = (select public.my_workspace_id()) and (select public.is_workspace_owner())));
revoke all on public.access_requests from anon, authenticated;
grant select on public.access_requests to authenticated;

revoke all on function public.ensure_membership() from public, anon;
revoke all on function public.team_create_invite(text,text,text,text,jsonb,text) from public, anon;
revoke all on function public.team_transfer_data(uuid,uuid) from public, anon;
revoke all on function public.next_doc_number(text) from public, anon;
revoke all on function public.doc_number_exists(text,text) from public, anon;
revoke all on function public.update_my_profile(text,text,text) from public, anon;
revoke all on function public.team_reset_password(uuid,text) from public, anon;
revoke all on function public.team_delete_member(uuid) from public, anon;
revoke all on function public.team_review_access_request(uuid,boolean,text,jsonb,text,text) from public, anon;
revoke all on function public.primary_workspace_id() from public, anon;
revoke all on function public.is_workspace_owner() from public, anon;
revoke all on function public.set_brand(text,text) from public, anon;
grant execute on function public.ensure_membership() to authenticated;
grant execute on function public.team_create_invite(text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.team_transfer_data(uuid,uuid) to authenticated;
grant execute on function public.next_doc_number(text) to authenticated;
grant execute on function public.doc_number_exists(text,text) to authenticated;
grant execute on function public.scope_own() to authenticated;
grant execute on function public.update_my_profile(text,text,text) to authenticated;
grant execute on function public.team_reset_password(uuid,text) to authenticated;
grant execute on function public.team_delete_member(uuid) to authenticated;
grant execute on function public.team_review_access_request(uuid,boolean,text,jsonb,text,text) to authenticated;
grant execute on function public.primary_workspace_id() to authenticated;
grant execute on function public.is_workspace_owner() to authenticated;
grant execute on function public.set_brand(text,text) to authenticated;
grant execute on function public.auth_public_config() to anon, authenticated;
grant execute on function public.my_workspace_id() to authenticated;
grant execute on function public.is_workspace_admin() to authenticated;
grant execute on function public.has_perm(text,text) to authenticated;

-- ---------------------------------------------------------
-- MIGRASI: setiap akun lama = pemilik & Administrator workspace-nya sendiri.
-- Aman dijalankan berulang.
-- ---------------------------------------------------------
insert into public.workspace_members (user_id, workspace_id, email, full_name, job_title, avatar, role, permissions, is_owner)
select u.id, u.id, lower(coalesce(u.email,'')),
       coalesce(nullif(s.profile ->> 'name',''), nullif(u.raw_user_meta_data ->> 'full_name',''), split_part(coalesce(u.email,''),'@',1)),
       coalesce(s.profile ->> 'role',''), coalesce(s.profile ->> 'avatar',''),
       'administrator', public.clean_permissions('{}'::jsonb), true
from auth.users u
left join public.user_settings s on s.user_id = u.id
where not exists (select 1 from public.workspace_members m where m.user_id = u.id);


-- =========================================================
-- ROW LEVEL SECURITY — akses per WORKSPACE + per HAK AKSES (modul.aksi)
-- =========================================================
-- Tabel data biasa: modul izin + (opsional) predikat kepemilikan untuk user ber-cakupan 'own'.
-- Kepemilikan: kontak/deal = owner_id; lainnya = pembuat (created_by) ATAU terhubung ke kontak/deal/quotation yang terlihat.
do $$
declare
  r record;
  sc text;
begin
  for r in select * from (values
    ('companies','companies', $p$(created_by = auth.uid() or exists (select 1 from public.contacts c where c.company_id = companies.id))$p$),
    ('contacts','contacts',   $p$(owner_id = auth.uid()::text or (owner_id is null and created_by = auth.uid()))$p$),
    ('deals','deals',         $p$(owner_id = auth.uid()::text or (owner_id is null and created_by = auth.uid()))$p$),
    ('tasks','tasks',         $p$(created_by = auth.uid() or (contact_id is not null and exists (select 1 from public.contacts c where c.id = tasks.contact_id)))$p$),
    ('products','products',   null),
    ('warehouses','stock',    null),
    ('stock_movements','stock', null),
    ('quotes','quotes',       $p$(created_by = auth.uid()
                                 or (deal_id is not null and exists (select 1 from public.deals d where d.id = quotes.deal_id))
                                 or (contact_id is not null and exists (select 1 from public.contacts c where c.id = quotes.contact_id)))$p$),
    ('invoices','invoices',   $p$(created_by = auth.uid()
                                 or (quote_id is not null and exists (select 1 from public.quotes q where q.id = invoices.quote_id))
                                 or (deal_id is not null and exists (select 1 from public.deals d where d.id = invoices.deal_id))
                                 or (contact_id is not null and exists (select 1 from public.contacts c where c.id = invoices.contact_id)))$p$)
  ) as x(tbl, modul, pred)
  loop
    execute format('alter table public.%I enable row level security;', r.tbl);
    -- bersihkan kebijakan lama (per-akun) dan versi baru sebelum dibuat ulang
    execute format('drop policy if exists "%1$s_select_own" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_ws_select" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_ws_insert" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_ws_update" on public.%1$s;', r.tbl);
    execute format('drop policy if exists "%1$s_ws_delete" on public.%1$s;', r.tbl);

    sc := case when r.pred is null then '' else format(' and (not (select public.scope_own()) or %s)', r.pred) end;

    execute format($f$create policy "%1$s_ws_select" on public.%1$s for select
      using (user_id = (select public.my_workspace_id()) and (select public.has_perm(%2$L,'view'))%3$s);$f$, r.tbl, r.modul, sc);
    execute format($f$create policy "%1$s_ws_insert" on public.%1$s for insert
      with check (user_id = (select public.my_workspace_id()) and (select public.has_perm(%2$L,'create'))%3$s);$f$, r.tbl, r.modul, sc);
    execute format($f$create policy "%1$s_ws_update" on public.%1$s for update
      using (user_id = (select public.my_workspace_id()) and (select public.has_perm(%2$L,'edit'))%3$s)
      with check (user_id = (select public.my_workspace_id()) and (select public.has_perm(%2$L,'edit'))%3$s);$f$, r.tbl, r.modul, sc);
    execute format($f$create policy "%1$s_ws_delete" on public.%1$s for delete
      using (user_id = (select public.my_workspace_id()) and (select public.has_perm(%2$L,'delete'))%3$s);$f$, r.tbl, r.modul, sc);
  end loop;
end $$;

-- notes: mengikuti izin entitas induknya (kontak / deal)
alter table public.notes enable row level security;
do $$ declare s text; begin
  foreach s in array array['select_own','insert_own','update_own','delete_own','ws_select','ws_insert','ws_update','ws_delete'] loop
    execute format('drop policy if exists "notes_%s" on public.notes;', s);
  end loop;
end $$;
-- Catatan ikut visibilitas induknya: subquery ke contacts/deals sudah tersaring RLS masing-masing (termasuk cakupan 'own').
create policy "notes_ws_select" on public.notes for select using (
  user_id = (select public.my_workspace_id()) and (
    (entity_type = 'contact' and (select public.has_perm('contacts','view')) and exists (select 1 from public.contacts c where c.id = notes.entity_id)) or
    (entity_type = 'deal'    and (select public.has_perm('deals','view'))    and exists (select 1 from public.deals d where d.id = notes.entity_id)) ));
create policy "notes_ws_insert" on public.notes for insert with check (
  user_id = (select public.my_workspace_id()) and (
    (entity_type = 'contact' and (select public.has_perm('contacts','edit')) and exists (select 1 from public.contacts c where c.id = notes.entity_id)) or
    (entity_type = 'deal'    and (select public.has_perm('deals','edit'))    and exists (select 1 from public.deals d where d.id = notes.entity_id)) ));
create policy "notes_ws_update" on public.notes for update
  using (user_id = (select public.my_workspace_id()) and (
    (entity_type = 'contact' and (select public.has_perm('contacts','edit')) and exists (select 1 from public.contacts c where c.id = notes.entity_id)) or
    (entity_type = 'deal'    and (select public.has_perm('deals','edit'))    and exists (select 1 from public.deals d where d.id = notes.entity_id)) ))
  with check (user_id = (select public.my_workspace_id()));
create policy "notes_ws_delete" on public.notes for delete using (
  user_id = (select public.my_workspace_id()) and (
    (entity_type = 'contact' and ((select public.has_perm('contacts','edit')) or (select public.has_perm('contacts','delete'))) and exists (select 1 from public.contacts c where c.id = notes.entity_id)) or
    (entity_type = 'deal'    and ((select public.has_perm('deals','edit'))    or (select public.has_perm('deals','delete')))    and exists (select 1 from public.deals d where d.id = notes.entity_id)) ));

-- activities (feed aktivitas): dilihat pemegang izin dashboard; siapa pun anggota aktif boleh mencatat
alter table public.activities enable row level security;
do $$ declare s text; begin
  foreach s in array array['select_own','insert_own','update_own','delete_own','ws_select','ws_insert','ws_update','ws_delete'] loop
    execute format('drop policy if exists "activities_%s" on public.activities;', s);
  end loop;
end $$;
create policy "activities_ws_select" on public.activities for select
  using (user_id = (select public.my_workspace_id()) and (select public.has_perm('dashboard','view'))
         and (not (select public.scope_own()) or actor_id = auth.uid()));
create policy "activities_ws_insert" on public.activities for insert
  with check (user_id = (select public.my_workspace_id()));
create policy "activities_ws_update" on public.activities for update
  using (user_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()))
  with check (user_id = (select public.my_workspace_id()));
-- delete: semua anggota (aplikasi hanya menyimpan 60 aktivitas terbaru; pemangkasan ini rutin & tidak sensitif)
create policy "activities_ws_delete" on public.activities for delete
  using (user_id = (select public.my_workspace_id()));

-- team (anggota tanpa akun login / data lama): semua anggota boleh membaca (untuk nama owner); tulis = Administrator
alter table public.team enable row level security;
do $$ declare s text; begin
  foreach s in array array['select_own','insert_own','update_own','delete_own','ws_select','ws_insert','ws_update','ws_delete'] loop
    execute format('drop policy if exists "team_%s" on public.team;', s);
  end loop;
end $$;
create policy "team_ws_select" on public.team for select using (user_id = (select public.my_workspace_id()));
create policy "team_ws_insert" on public.team for insert
  with check (user_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));
create policy "team_ws_update" on public.team for update
  using (user_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()))
  with check (user_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));
create policy "team_ws_delete" on public.team for delete
  using (user_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));

-- user_settings (1 baris per workspace: letterhead, target, automasi): dibaca semua anggota, diubah pemegang settings.manage
alter table public.user_settings enable row level security;
do $$ declare s text; begin
  foreach s in array array['select_own','insert_own','update_own','delete_own','ws_select','ws_insert','ws_update','ws_delete'] loop
    execute format('drop policy if exists "user_settings_%s" on public.user_settings;', s);
  end loop;
end $$;
create policy "user_settings_ws_select" on public.user_settings for select
  using (user_id = (select public.my_workspace_id()));
create policy "user_settings_ws_insert" on public.user_settings for insert
  with check (user_id = (select public.my_workspace_id()) and (select public.has_perm('settings','manage')));
create policy "user_settings_ws_update" on public.user_settings for update
  using (user_id = (select public.my_workspace_id()) and (select public.has_perm('settings','manage')))
  with check (user_id = (select public.my_workspace_id()) and (select public.has_perm('settings','manage')));
create policy "user_settings_ws_delete" on public.user_settings for delete
  using (user_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));

-- workspace_members: anggota melihat rekan se-workspace (nama/role); ubah/hapus hanya Administrator
-- (insert & hapus lewat RPC). Pengguna nonaktif tetap bisa membaca barisnya sendiri untuk menampilkan pemberitahuan.
alter table public.workspace_members enable row level security;
drop policy if exists "wm_select" on public.workspace_members;
drop policy if exists "wm_update" on public.workspace_members;
create policy "wm_select" on public.workspace_members for select
  using (user_id = auth.uid()
         or (workspace_id = (select public.my_workspace_id())
             and (not (select public.scope_own()) or role = 'administrator')));
create policy "wm_update" on public.workspace_members for update
  using (workspace_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()))
  with check (workspace_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));

-- workspace_invites: hanya Administrator (dibuat lewat RPC team_create_invite)
alter table public.workspace_invites enable row level security;
drop policy if exists "wi_select" on public.workspace_invites;
drop policy if exists "wi_delete" on public.workspace_invites;
create policy "wi_select" on public.workspace_invites for select
  using (workspace_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));
create policy "wi_delete" on public.workspace_invites for delete
  using (workspace_id = (select public.my_workspace_id()) and (select public.is_workspace_admin()));


-- =========================================================
-- REALTIME — aktifkan replikasi perubahan (insert/update/delete) untuk
-- setiap tabel, supaya perubahan langsung sinkron ke semua anggota tim
-- (termasuk perubahan hak akses/status user) tanpa reload.
-- =========================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'companies','contacts','deals','tasks','notes','activities',
    'products','quotes','invoices','warehouses','stock_movements','team','user_settings',
    'workspace_members','workspace_invites'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      null; -- sudah terdaftar
    end;
  end loop;
end $$;


-- =========================================================
-- Auto-update kolom updated_at pada user_settings
-- =========================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Muat ulang cache skema PostgREST agar fungsi baru (mis. set_brand) langsung bisa dipanggil dari aplikasi.
notify pgrst, 'reload schema';
