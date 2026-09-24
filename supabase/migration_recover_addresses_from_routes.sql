-- Recuperar endereços a partir das paradas das rotas (date_routes + day_routes)
-- Use depois de migration_addresses_catalog.sql se o catálogo estiver vazio/incompleto.

create extension if not exists "pgcrypto";

-- Índice único por texto atrapalha apelidos/variações e falha upserts em lote
drop index if exists public.addresses_address_unique;

with stop_rows as (
  select
    nullif(s->>'addressId', '') as address_id,
    coalesce(nullif(trim(s->>'label'), ''), split_part(s->>'address', ',', 1)) as label,
    trim(s->>'address') as address,
    nullif(trim(s->>'complement'), '') as complement,
    s->'hours' as hours,
    nullif(s->>'lat', '')::double precision as lat,
    nullif(s->>'lng', '')::double precision as lng
  from public.date_routes r
  cross join lateral jsonb_array_elements(coalesce(r.stops, '[]'::jsonb)) s
  where coalesce(trim(s->>'address'), '') <> ''

  union all

  select
    nullif(s->>'addressId', '') as address_id,
    coalesce(nullif(trim(s->>'label'), ''), split_part(s->>'address', ',', 1)) as label,
    trim(s->>'address') as address,
    nullif(trim(s->>'complement'), '') as complement,
    s->'hours' as hours,
    nullif(s->>'lat', '')::double precision as lat,
    nullif(s->>'lng', '')::double precision as lng
  from public.day_routes r
  cross join lateral jsonb_array_elements(coalesce(r.stops, '[]'::jsonb)) s
  where coalesce(trim(s->>'address'), '') <> ''
),
picked as (
  select distinct on (lower(address))
    coalesce(
      (select a.id from public.addresses a where lower(trim(a.address)) = lower(stop_rows.address) limit 1),
      case
        when address_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then address_id::uuid
        else gen_random_uuid()
      end
    ) as id,
    label,
    address,
    coalesce(complement, '') as complement,
    coalesce(
      hours,
      '[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}]'::jsonb
    ) as hours,
    lat,
    lng
  from stop_rows
  order by lower(address), lat nulls last
)
insert into public.addresses (id, label, address, complement, hours, lat, lng, active)
select id, label, address, complement, hours, lat, lng, true
from picked
on conflict (id) do update set
  label = excluded.label,
  address = excluded.address,
  complement = coalesce(nullif(excluded.complement, ''), public.addresses.complement),
  lat = coalesce(excluded.lat, public.addresses.lat),
  lng = coalesce(excluded.lng, public.addresses.lng),
  active = true;

notify pgrst, 'reload schema';
