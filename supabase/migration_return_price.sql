-- Lambda-Flow: retorno ao início + valor por km
alter table public.day_routes
  add column if not exists return_to_start boolean not null default false;

create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  price_per_km double precision not null default 2,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, price_per_km)
values (1, 2)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_all" on public.app_settings;
create policy "app_settings_all" on public.app_settings
  for all using (true) with check (true);
