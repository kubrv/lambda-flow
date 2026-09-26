-- Cupons de plano + manutenção do site + campos extras da empresa
alter table public.companies
  add column if not exists address text,
  add column if not exists plan_method text,
  add column if not exists last_seen_at timestamptz;

create table if not exists public.plan_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null default '',
  percent_off numeric not null default 100
    check (percent_off >= 0 and percent_off <= 100),
  max_uses int not null default 10,
  uses int not null default 0,
  active boolean not null default true,
  for_first_n int,
  created_at timestamptz not null default now(),
  notes text
);

create table if not exists public.site_settings (
  id text primary key default 'global',
  maintenance boolean not null default false,
  maintenance_message text not null default 'Estamos em manutenção rápida. Voltamos em breve.',
  contact_whatsapp text not null default '5511947200616',
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, maintenance, maintenance_message, contact_whatsapp)
values (
  'global',
  false,
  'Rotaz em manutenção rápida. Já voltamos — fale conosco no WhatsApp se precisar.',
  '5511947200616'
)
on conflict (id) do nothing;

-- Cupom de lançamento: 10 primeiros cadastros de empresa
insert into public.plan_coupons (code, label, percent_off, max_uses, for_first_n, notes)
values (
  'ROTAZ10',
  '10 primeiros cadastros',
  100,
  10,
  10,
  'Isenção do 1º mês para as 10 primeiras empresas'
)
on conflict (code) do nothing;

alter table public.plan_coupons enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "plan_coupons_read" on public.plan_coupons;
create policy "plan_coupons_read" on public.plan_coupons
  for select using (true);

drop policy if exists "plan_coupons_all" on public.plan_coupons;
create policy "plan_coupons_all" on public.plan_coupons
  for all using (true) with check (true);

drop policy if exists "site_settings_read" on public.site_settings;
create policy "site_settings_read" on public.site_settings
  for select using (true);

drop policy if exists "site_settings_all" on public.site_settings;
create policy "site_settings_all" on public.site_settings
  for all using (true) with check (true);

notify pgrst, 'reload schema';
