-- Conclusão de rota + relatórios (motoboy / admin)
alter table public.date_routes
  add column if not exists completion_status text not null default 'open';

alter table public.date_routes
  drop constraint if exists date_routes_completion_status_check;

alter table public.date_routes
  add constraint date_routes_completion_status_check
  check (completion_status in ('open', 'completed', 'verified'));

alter table public.date_routes
  add column if not exists motoboy_report text;

alter table public.date_routes
  add column if not exists motoboy_completed_at timestamptz;

alter table public.date_routes
  add column if not exists motoboy_completed_by text;

alter table public.date_routes
  add column if not exists admin_report text;

alter table public.date_routes
  add column if not exists admin_verified_at timestamptz;

alter table public.date_routes
  add column if not exists admin_verified_by text;
