-- Histórico de acessos do administrador da empresa
create table if not exists public.company_access_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  email text,
  full_name text,
  event text not null default 'login',
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists company_access_log_company_created
  on public.company_access_log (company_id, created_at desc);

alter table public.company_access_log enable row level security;

drop policy if exists "company_access_log_all" on public.company_access_log;
create policy "company_access_log_all" on public.company_access_log
  for all using (true) with check (true);
