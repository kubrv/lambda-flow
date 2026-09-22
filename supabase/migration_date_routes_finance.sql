-- Lambda-Flow: rotas por data + financeiro + partida padrão
create table if not exists public.date_routes (
  route_date date primary key,
  start_address text not null default '',
  start_lat double precision,
  start_lng double precision,
  motoboy_id uuid references public.motoboys (id) on delete set null,
  stops jsonb not null default '[]'::jsonb,
  total_km double precision not null default 0,
  return_to_start boolean not null default false,
  optimized_at timestamptz
);

alter table public.date_routes enable row level security;
drop policy if exists "date_routes_all" on public.date_routes;
create policy "date_routes_all" on public.date_routes
  for all using (true) with check (true);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  motoboy_id uuid not null references public.motoboys (id) on delete cascade,
  amount double precision not null default 0,
  route_dates jsonb not null default '[]'::jsonb,
  description text,
  status text not null default 'open' check (status in ('open', 'paid')),
  created_at timestamptz not null default now()
);

alter table public.finance_entries enable row level security;
drop policy if exists "finance_entries_all" on public.finance_entries;
create policy "finance_entries_all" on public.finance_entries
  for all using (true) with check (true);

create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  price_per_km double precision not null default 2,
  updated_at timestamptz not null default now()
);

alter table public.app_settings
  add column if not exists preset_start_address text,
  add column if not exists preset_start_lat double precision,
  add column if not exists preset_start_lng double precision;

alter table public.app_settings enable row level security;
drop policy if exists "app_settings_all" on public.app_settings;
create policy "app_settings_all" on public.app_settings
  for all using (true) with check (true);

insert into public.app_settings (id, price_per_km)
values (1, 2)
on conflict (id) do nothing;

alter table public.day_routes
  add column if not exists return_to_start boolean not null default false;
