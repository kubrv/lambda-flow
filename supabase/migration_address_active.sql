-- Ativar/inativar endereços (inativos ficam fora da lista da rota)

alter table public.addresses
  add column if not exists active boolean not null default true;
