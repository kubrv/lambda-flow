-- Auth, empresas, códigos de convite e cobrança
create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan_price numeric not null default 40,
  plan_status text not null default 'pending'
    check (plan_status in ('active', 'pending', 'expired', 'trial')),
  plan_paid_until timestamptz,
  owner_user_id uuid unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('company', 'motoboy')),
  company_id uuid references public.companies (id) on delete cascade,
  motoboy_id uuid,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null unique,
  role text not null check (role in ('company', 'motoboy')),
  label text not null default '',
  max_uses int not null default 50,
  uses int not null default 0,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  amount numeric not null default 40,
  method text not null check (method in ('pix', 'card', 'boleto')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  provider text not null default 'mercadopago',
  provider_id text,
  checkout_url text,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists invite_codes_company_idx on public.invite_codes (company_id);
create index if not exists payments_company_idx on public.payments (company_id);
create index if not exists profiles_company_idx on public.profiles (company_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.payments enable row level security;

-- Leitura pública de código ativo (só para validar no cadastro)
drop policy if exists "invite_codes_select_active" on public.invite_codes;
create policy "invite_codes_select_active" on public.invite_codes
  for select using (active = true);

drop policy if exists "invite_codes_company_all" on public.invite_codes;
create policy "invite_codes_company_all" on public.invite_codes
  for all using (
    company_id in (
      select company_id from public.profiles
      where user_id = auth.uid() and role = 'company'
    )
  )
  with check (
    company_id in (
      select company_id from public.profiles
      where user_id = auth.uid() and role = 'company'
    )
  );

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for select using (user_id = auth.uid());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (user_id = auth.uid());

drop policy if exists "companies_member_select" on public.companies;
create policy "companies_member_select" on public.companies
  for select using (
    id in (select company_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "companies_owner_update" on public.companies;
create policy "companies_owner_update" on public.companies
  for update using (
    owner_user_id = auth.uid()
    or id in (
      select company_id from public.profiles
      where user_id = auth.uid() and role = 'company'
    )
  );

drop policy if exists "payments_company_select" on public.payments;
create policy "payments_company_select" on public.payments
  for select using (
    company_id in (
      select company_id from public.profiles
      where user_id = auth.uid() and role = 'company'
    )
  );

drop policy if exists "payments_company_insert" on public.payments;
create policy "payments_company_insert" on public.payments
  for insert with check (
    company_id in (
      select company_id from public.profiles
      where user_id = auth.uid() and role = 'company'
    )
  );

-- Seed empresa Lambda (sem usuário ainda — seed API liga o owner)
insert into public.companies (id, name, slug, plan_price, plan_status, plan_paid_until)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Lambda Dental Lab',
  'lambda-dental-lab',
  40,
  'active',
  now() + interval '10 years'
)
on conflict (id) do update set
  name = excluded.name,
  plan_status = 'active',
  plan_price = 40,
  plan_paid_until = greatest(public.companies.plan_paid_until, excluded.plan_paid_until);

-- Código inicial para cadastro de motoboys da Lambda
insert into public.invite_codes (company_id, code, role, label, max_uses)
values (
  'a0000000-0000-4000-8000-000000000001',
  'LAMBDA-MOTO-2026',
  'motoboy',
  'Motoboys Lambda',
  500
)
on conflict (code) do nothing;

insert into public.invite_codes (company_id, code, role, label, max_uses)
values (
  'a0000000-0000-4000-8000-000000000001',
  'LAMBDA-ADMIN-2026',
  'company',
  'Equipe admin Lambda',
  20
)
on conflict (code) do nothing;
