-- Perfil do motoboy: empresa + valor/km individual
alter table public.motoboys
  add column if not exists company text;

alter table public.motoboys
  add column if not exists price_per_km double precision;
