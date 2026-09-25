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
  created_at   timestamptz not null default now()
);
create index if not exists products_user_id_idx on public.products (user_id);
create index if not exists products_category_idx on public.products (category);

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
  company             jsonb not null default '{}',
  profile             jsonb not null default '{}',
  updated_at          timestamptz not null default now()
);

-- Catatan desain: kolom seperti company_id / contact_id / deal_id / owner_id
-- SENGAJA tidak dipasangi FOREIGN KEY antar tabel. Aplikasi menulis lewat
-- sinkronisasi diff otomatis (insert/update/delete paralel per tabel), jadi
-- FK antar tabel berisiko gagal karena race condition urutan insert.
-- Keterhubungan data tetap dijaga di level aplikasi (JS), dan setiap query
-- tetap aman & terisolasi per user lewat Row Level Security di bawah ini.


-- =========================================================
-- ROW LEVEL SECURITY — setiap user hanya boleh akses baris miliknya sendiri
-- =========================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'companies','contacts','deals','tasks','notes','activities',
    'products','quotes','team','user_settings'
  ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%1$s_select_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (auth.uid() = user_id);', t
    );

    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (auth.uid() = user_id);', t
    );

    execute format('drop policy if exists "%1$s_update_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t
    );

    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (auth.uid() = user_id);', t
    );
  end loop;
end $$;


-- =========================================================
-- REALTIME — aktifkan replikasi perubahan (insert/update/delete) untuk
-- setiap tabel, supaya perubahan di satu tab/device langsung sinkron ke
-- tab/device lain milik user yang sama tanpa perlu reload.
-- =========================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'companies','contacts','deals','tasks','notes','activities',
    'products','quotes','team','user_settings'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      -- tabel sudah terdaftar di publication, lewati
      null;
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
