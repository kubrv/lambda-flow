-- Campos extras para cadastro self-serve de empresas
alter table public.companies
  add column if not exists phone text;
