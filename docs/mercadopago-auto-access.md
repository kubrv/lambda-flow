# Mercado Pago — acesso automático ao pagar

O Rotaz já libera o plano quando o pagamento é **aprovado** via webhook.

## Fluxo atual (já no código)

1. Cadastro em `/api/register-company` cria empresa `pending` + preferência MP
2. `external_reference` = `company_id`
3. `notification_url` = `https://SEU-DOMINIO/api/billing/webhook`
4. `back_urls.success` = `/?billing=success` + `auto_return: approved`
5. Webhook busca o pagamento na API MP; se `status === approved`, atualiza:
   - `companies.plan_status = active`
   - `companies.plan_paid_until = +1 mês`

## Checklist na conta Mercado Pago

1. **Credenciais de produção** (Access Token) → Vercel env `MERCADOPAGO_ACCESS_TOKEN`
2. **Webhooks** no painel MP → URL: `https://lambda-flow.vercel.app/api/billing/webhook`  
   Eventos: **Pagamentos**
3. Confirme que o domínio do `APP_URL` / `VITE_APP_URL` é o mesmo da Vercel
4. Teste com cartão de teste (modo sandbox) antes de produção

## Otimizações recomendadas

| Item | Por quê |
|------|---------|
| Webhook + `auto_return` | Usuário volta ao app já logado; webhook ativa o plano mesmo se fechar a aba |
| Preferência com `external_reference` | Liga pagamento ↔ empresa sem ambiguidade |
| Tela `/?billing=success` | Após voltar, `refreshAuth()` recarrega `plan_status` (já no fluxo pós-login) |
| Cupom `ROTAZ10` | 100% off → ativa 30 dias sem passar pelo checkout |
| Assinatura MP (opcional) | Renovação mensal automática — exige Preference/Subscription API; hoje o plano é mensal via webhook avulso |

## Teste rápido

1. Cadastre empresa sem cupom → pague no MP (sandbox)
2. Confira no Supabase: `companies.plan_status = active`
3. Se ficou `pending`, veja logs do webhook na Vercel e se o token MP é de **produção** vs **teste** alinhado ao checkout

## Env Vercel

```
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
APP_URL=https://lambda-flow.vercel.app
```
