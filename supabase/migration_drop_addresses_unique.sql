-- Remove índice único por texto (causa falha de upsert e “sumiço” aparente)
drop index if exists public.addresses_address_unique;
notify pgrst, 'reload schema';
