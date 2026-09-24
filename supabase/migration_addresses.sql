-- Catálogo de endereços reutilizáveis entre dias
-- Preferível: rode migration_addresses_catalog.sql (já inclui complemento/horário/active).

create extension if not exists "pgcrypto";

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  address text not null,
  complement text not null default '',
  hours jsonb not null default
    '[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}]'::jsonb,
  lat double precision,
  lng double precision,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

drop index if exists public.addresses_address_unique;

alter table public.addresses enable row level security;

drop policy if exists "addresses_all" on public.addresses;
create policy "addresses_all" on public.addresses
  for all using (true) with check (true);

notify pgrst, 'reload schema';

