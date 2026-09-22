-- Complemento e horário de funcionamento dos endereços
alter table public.addresses
  add column if not exists complement text not null default '';

alter table public.addresses
  add column if not exists hours jsonb not null default
    '[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}]'::jsonb;
