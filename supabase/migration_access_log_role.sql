-- Histórico de acessos: filtro empresa vs motoboy
alter table public.company_access_log
  add column if not exists role text;

alter table public.company_access_log
  add column if not exists motoboy_id text;

notify pgrst, 'reload schema';
