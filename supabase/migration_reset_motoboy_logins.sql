-- Reinicia logins de motoboy: mantém só o nome (e-mail/usuário/senha zerados).
-- Auth users de motoboy precisam ser apagados via API reset-all-logins (service role).
-- Este SQL limpa colunas na tabela motoboys e desativa códigos de convite moto.

update public.motoboys
set
  email = null,
  username = null,
  user_id = null,
  password_set = false,
  access_code_hash = null,
  access_code_expires_at = null
where true;

update public.invite_codes
set active = false
where role = 'motoboy';

-- Perfis de motoboy (auth.users deve ser limpo pela API)
delete from public.profiles
where role = 'motoboy';
