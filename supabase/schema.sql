-- =========================================================
-- CRM AI Enterprise — Supabase schema
-- Jalankan seluruh isi file ini di: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =========================================================

-- Tabel penyimpanan key/value per user. Setiap "bagian" data CRM
-- (contacts, deals, tasks, dst) disimpan sebagai satu baris JSON
-- per user, persis meniru cara kerja window.storage yang dipakai
-- versi prototipe, tetapi sekarang berjalan di Postgres + RLS.
create table if not exists public.crm_store (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists crm_store_user_id_idx on public.crm_store (user_id);

-- Aktifkan Row Level Security agar setiap user HANYA bisa
-- membaca/menulis barisnya sendiri.
alter table public.crm_store enable row level security;

drop policy if exists "crm_store_select_own" on public.crm_store;
create policy "crm_store_select_own"
  on public.crm_store for select
  using (auth.uid() = user_id);

drop policy if exists "crm_store_insert_own" on public.crm_store;
create policy "crm_store_insert_own"
  on public.crm_store for insert
  with check (auth.uid() = user_id);

drop policy if exists "crm_store_update_own" on public.crm_store;
create policy "crm_store_update_own"
  on public.crm_store for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "crm_store_delete_own" on public.crm_store;
create policy "crm_store_delete_own"
  on public.crm_store for delete
  using (auth.uid() = user_id);

-- Otomatis update kolom updated_at setiap kali baris di-upsert/update.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_crm_store_updated_at on public.crm_store;
create trigger trg_crm_store_updated_at
  before update on public.crm_store
  for each row execute function public.set_updated_at();
