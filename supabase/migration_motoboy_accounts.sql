-- Contas de motoboy (username/e-mail) + preferências de pagamento + método no financeiro

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists must_set_password boolean not null default false;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

alter table public.motoboys
  add column if not exists email text;

alter table public.motoboys
  add column if not exists username text;

alter table public.motoboys
  add column if not exists user_id uuid;

alter table public.motoboys
  add column if not exists password_set boolean not null default false;

alter table public.motoboys
  add column if not exists access_code_hash text;

alter table public.motoboys
  add column if not exists access_code_expires_at timestamptz;

alter table public.motoboys
  add column if not exists pay_day_preference text not null default 'end_of_route';

alter table public.motoboys
  add column if not exists pay_method_preference text not null default 'pix';

alter table public.motoboys
  add column if not exists pix_key text;

alter table public.finance_entries
  add column if not exists payment_method text;

alter table public.finance_entries
  add column if not exists paid_at timestamptz;
