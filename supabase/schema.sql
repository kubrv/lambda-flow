-- Lambda-Flow schema (Supabase)
create extension if not exists "pgcrypto";

create table if not exists public.motoboys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.day_routes (
  day text primary key
    check (day in ('seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom')),
  start_address text not null default '',
  start_lat double precision,
  start_lng double precision,
  motoboy_id uuid references public.motoboys (id) on delete set null,
  stops jsonb not null default '[]'::jsonb,
  total_km double precision not null default 0,
  optimized_at timestamptz
);

create table if not exists public.coord_cache (
  address_key text primary key,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.motoboys enable row level security;
alter table public.day_routes enable row level security;
alter table public.coord_cache enable row level security;

drop policy if exists "motoboys_all" on public.motoboys;
create policy "motoboys_all" on public.motoboys
  for all using (true) with check (true);

drop policy if exists "day_routes_all" on public.day_routes;
create policy "day_routes_all" on public.day_routes
  for all using (true) with check (true);

drop policy if exists "coord_cache_all" on public.coord_cache;
create policy "coord_cache_all" on public.coord_cache
  for all using (true) with check (true);

insert into public.day_routes (day)
values ('seg'), ('ter'), ('qua'), ('qui'), ('sex'), ('sab'), ('dom')
on conflict (day) do nothing;
