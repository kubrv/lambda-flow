# Rotaz

Rotas diárias para motoboys — **Vercel** + **Supabase**, com km calculados pelas ruas.

## Stack

- Frontend: Vite + React (hospedado na Vercel)
- Banco: Supabase (`motoboys`, `day_routes`, `coord_cache`)
- Km / ordem: OSRM (rotas de carro) + OpenStreetMap/Nominatim (geocoding)
- Sem API key do Google

## Setup Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. SQL Editor → rode `supabase/schema.sql`
3. Depois rode `supabase/seed.sql` (rota de terça de exemplo)
4. Em **Project Settings → API**, copie:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public → `VITE_SUPABASE_ANON_KEY`

## Deploy Vercel

```bash
npm install
npx vercel
```

No painel da Vercel, adicione:

| Variável | Onde |
|----------|------|
| `VITE_SUPABASE_URL` | Production / Preview |
| `VITE_SUPABASE_ANON_KEY` | Production / Preview |
| `WHATSAPP_TOKEN` | Production (Meta Cloud API) |
| `WHATSAPP_PHONE_NUMBER_ID` | Production |
| `WHATSAPP_TEMPLATE_NAME` | Production (ex.: `aviso_entrega`) |
| `WHATSAPP_TEMPLATE_LANG` | Production (`pt_BR`) |

Redeploy depois de salvar as envs.

## Admin

Clique **5 vezes** no logo para abrir o painel.

## Dev local (com Supabase na nuvem)

```bash
cp .env.example .env
# preencha as chaves
npm install
npm run dev
```

A API `/api/optimize-route` no `vite dev` precisa do `vercel dev` se for testar o cálculo de km localmente:

```bash
npx vercel dev
```
