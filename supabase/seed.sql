-- Seed: rota de terça (Maps) + motoboys
insert into public.motoboys (id, name)
values
  ('cb2926e1-2be2-48d5-b5be-051591bea272', 'Motoboy 1'),
  ('2468e1e9-c54c-41d8-b26d-56130e24b0a2', 'Motoboy 2')
on conflict (id) do update set name = excluded.name;

insert into public.day_routes (
  day, start_address, start_lat, start_lng, motoboy_id, stops, total_km, optimized_at
) values (
  'ter',
  'R. União, 510 - Jardim America, Poá - SP, 08555-600, Brasil',
  -23.5104581,
  -46.350281,
  'cb2926e1-2be2-48d5-b5be-051591bea272',
  '[
    {"id":"0379e605-d132-44e4-aa4d-8870d351344b","label":"Parada 1","address":"GdOdontologia, Av. Francisco Marengo, 2039 - Jardim Dona Benta, Suzano - SP, 08694-520","lat":-23.5016045,"lng":-46.2989536},
    {"id":"bc2bdcad-9605-467d-9de3-7d1d062e00af","label":"Parada 2","address":"Palanca Odontologia, R. Basílio Batalha, 478 - Vila Vitoria, Mogi das Cruzes - SP, 08730-090","lat":-23.5301491,"lng":-46.2022079},
    {"id":"75f88d2d-6db2-4c23-8002-0b8f8a7105ab","label":"Parada 3","address":"Consultório odontológico Dra Andréia Hayasaka, R. Braz Cubas, 544 - Centro, Mogi das Cruzes - SP, 08710-410","lat":-23.5263027,"lng":-46.1953728},
    {"id":"df6140fd-54e5-4a9f-b82f-a0f25eed6d85","label":"Parada 4","address":"Gonçalves Odontocare, R. Sen. Dantas, 165 - Centro, Mogi das Cruzes - SP, 08710-690","lat":-23.5240513,"lng":-46.1934726}
  ]'::jsonb,
  0,
  now()
)
on conflict (day) do update set
  start_address = excluded.start_address,
  start_lat = excluded.start_lat,
  start_lng = excluded.start_lng,
  motoboy_id = excluded.motoboy_id,
  stops = excluded.stops,
  optimized_at = excluded.optimized_at;
