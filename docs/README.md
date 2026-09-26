# Docs - Rotaz (lambda-flow)

Pasta sincronizada com o vault Obsidian (Specs/lambda-flow).

## Persistência (deploy)

- Deploy **não** apaga dados: endereços/rotas/motoboys/financeiro vivem no Supabase.
- `saveData` só faz **upsert** (não “espelha e apaga” o que falta no browser).
- Remover endereço/motoboy/lançamento ou limpar rota chama **delete explícito**.
- Catálogo de endereços preserva todos os IDs (não colapsa por texto igual).

## Setup Supabase — endereços

Se o app mostrar `Could not find the table 'public.addresses'`, rode no **SQL Editor**:

`supabase/migration_addresses_catalog.sql`

(Isso cria a tabela com complemento, horário e `active`.)

## Endereços (admin)

- Lista com ordenação: **ordem de adição** ou **alfabética**.
- Endereços podem ser **inativados** (somem da rota; aparecem na busca / filtro Inativos; reativáveis).
- Cadastro: formulário fechado por padrão; abrir com **Cadastrar endereço**.
- SQL: `supabase/migration_address_active.sql` (coluna `active`).

## Rotas / UX admin

- Detalhes do endereço na rota: botão maior **Abrir detalhes**.
- Calendário: dias anteriores ao dia atual mais escuros.
- Banner **Modo administrador** + rótulo **Visualizar rotas como motoboy**.

## WhatsApp — avisar dentista

Guia completo Meta (Phone ID + token): `docs/whatsapp-meta-setup.md`

### Click-to-send (wa.me)
1. Rode `supabase/migration_address_whatsapp.sql`
2. Cadastre o WhatsApp em **Endereços**
3. Na rota: **Abrir WhatsApp** → o boy confirma o envio no app

### Meta Cloud API (botão Enviar aviso)
1. Crie app em [developers.facebook.com](https://developers.facebook.com) → produto **WhatsApp**
2. Copie **Phone number ID** e um **token permanente** (System User)
3. Na Vercel (Environment Variables), adicione:

| Variável | Exemplo |
|----------|---------|
| `WHATSAPP_TOKEN` | token EAA… |
| `WHATSAPP_PHONE_NUMBER_ID` | 106540352242922 |
| `WHATSAPP_TEMPLATE_NAME` | `aviso_entrega` (recomendado) |
| `WHATSAPP_TEMPLATE_LANG` | `pt_BR` |

4. Crie e aprove um template **Utility** com 3 variáveis no corpo, ex.:

```
Olá! Entrega concluída em {{1}}.
{{2}}.
Motoboy: {{3}}. — Lambda-Flow
```

5. Redeploy. Na rota, **Enviar aviso (Meta)** manda direto pelo número Business (sem abrir o app do boy).

Sem template, a API só envia texto livre dentro da janela de 24h (depois que o dentista falou com o número Business).