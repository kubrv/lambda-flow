-- Catálogo de endereços reutilizáveis entre dias
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  address text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create unique index if not exists addresses_address_unique
  on public.addresses (lower(trim(address)));

alter table public.addresses enable row level security;

drop policy if exists "addresses_all" on public.addresses;
create policy "addresses_all" on public.addresses
  for all using (true) with check (true);
