-- WhatsApp do destino (dentista/consultório) para o motoboy avisar a entrega
alter table public.addresses
  add column if not exists whatsapp text;

notify pgrst, 'reload schema';
