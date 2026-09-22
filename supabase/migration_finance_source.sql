-- Opcional: metadados de lançamento automático
alter table public.finance_entries
  add column if not exists source text default 'manual',
  add column if not exists km double precision;
