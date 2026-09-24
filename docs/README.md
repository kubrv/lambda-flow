# Docs - lambda-flow

Pasta sincronizada com o vault Obsidian (Specs/lambda-flow).

## Persistência (deploy)

- Deploy **não** apaga dados: endereços/rotas/motoboys/financeiro vivem no Supabase.
- `saveData` só faz **upsert** (não “espelha e apaga” o que falta no browser).
- Remover endereço/motoboy/lançamento ou limpar rota chama **delete explícito**.
- Catálogo de endereços preserva todos os IDs (não colapsa por texto igual).

## Endereços (admin)

- Lista com ordenação: **ordem de adição** ou **alfabética**.
- Endereços podem ser **inativados** (somem da rota; aparecem na busca / filtro Inativos; reativáveis).
- Cadastro: formulário fechado por padrão; abrir com **Cadastrar endereço**.
- SQL: `supabase/migration_address_active.sql` (coluna `active`).

## Rotas / UX admin

- Detalhes do endereço na rota: botão maior **Abrir detalhes**.
- Calendário: dias anteriores ao dia atual mais escuros.
- Banner **Modo administrador** + rótulo **Visualizar rotas como motoboy**.
