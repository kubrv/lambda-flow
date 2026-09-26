# Configurar WhatsApp Meta (passo a passo)

Você precisa de **2 valores** para o Lambda-Flow:

1. `WHATSAPP_PHONE_NUMBER_ID` — ID do número (não é o telefone em si)
2. `WHATSAPP_TOKEN` — token permanente (System User)

Links diretos:
- [Meus apps](https://developers.facebook.com/apps/)
- [Business Settings → System users](https://business.facebook.com/settings/system-users)

---

## Parte A — Criar o app (5 min)

1. Abra https://developers.facebook.com/apps/ e faça login com Facebook.
2. Se pedir, complete o cadastro de **desenvolvedor**.
3. Clique **Create App** / **Criar app**.
4. Nome: `Lambda Flow WhatsApp` (qualquer nome).
5. Use case: escolha **Connect with customers through WhatsApp** / **WhatsApp**.
6. Selecione (ou crie) um **Business Portfolio** / portfólio da empresa.
7. Clique **Create app**.

## Parte B — Phone number ID (na tela API Setup)

1. No app, menu lateral → **WhatsApp** → **API Setup** (ou **Quickstart** → Start using the API).
2. Conecte / selecione uma **Messaging account** (conta WhatsApp Business).
3. Em **From** / número de envio:
   - No começo a Meta dá um **número de teste** — serve para validar.
   - Ao lado do número aparece um ID longo tipo `106540352242922` → isso é o **Phone number ID**.
4. Copie esse ID → será `WHATSAPP_PHONE_NUMBER_ID`.

**Não confunda:**
| O que é | Exemplo | Serve? |
|---------|---------|--------|
| Número do WhatsApp | +55 11 98765-4321 | Não — não vai na env |
| **Phone number ID** | `106540352242922` | Sim → `WHATSAPP_PHONE_NUMBER_ID` |
| Token temporário (API Setup) | EAA… que expira em horas | Só para teste rápido |
| Token permanente (System User) | EAA… sem expirar | Sim → `WHATSAPP_TOKEN` |

### Se só aparece número de teste
Ok por agora. Adicione um destinatário de teste (seu celular) na lista **To** e mande o `hello_world`. Depois, quando quiser número real da clínica, em **API Setup** → Add phone number.

### Se o ID do número de produção não aparece no dropdown
1. Vá em https://business.facebook.com/settings/whatsapp-business-accounts  
2. Clique na conta WhatsApp → copie o **WABA ID** (ID da conta).
3. Com o token permanente (Parte C), rode no PowerShell:

```powershell
curl "https://graph.facebook.com/v21.0/COLE_WABA_ID_AQUI/phone_numbers" -H "Authorization: Bearer COLE_TOKEN_AQUI"
```

No JSON, o campo `"id"` de cada número é o Phone number ID.

## Parte C — Token permanente (System User)

1. Abra https://business.facebook.com/settings/system-users  
   (Business Settings → **Users** → **System users**).
2. **Add** → nome `lambda-flow` → role **Admin**.
3. Selecione o usuário → **Assign assets** / Atribuir ativos:
   - Seu **App** → Full control / Gerenciar app
   - Sua conta **WhatsApp** → Full control / Gerenciar contas WhatsApp
4. **Generate token** / Gerar token:
   - Selecione o **mesmo app**
   - Permissões (marque as 3):
     - `business_management`
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
5. Copie o token **agora** (a Meta mostra uma vez) → `WHATSAPP_TOKEN`.

## Parte D — Colar na Vercel

Vercel → projeto **lambda-flow** → Settings → Environment Variables → Production:

```
WHATSAPP_TOKEN=EAA...
WHATSAPP_PHONE_NUMBER_ID=1065...
WHATSAPP_TEMPLATE_NAME=aviso_entrega
WHATSAPP_TEMPLATE_LANG=pt_BR
```

Depois: Redeploy (ou avise no chat que eu publico).

## Parte E — Template (para avisar dentista “frio”)

Sem template, só funciona se o dentista falou com o número Business nas últimas 24h.

1. WhatsApp Manager → Message templates → Create
2. Nome: `aviso_entrega` · categoria **Utility** · idioma **Portuguese (BR)**
3. Corpo:

```
Olá! Entrega concluída em {{1}}.
{{2}}.
Motoboy: {{3}}. — Lambda-Flow
```

4. Envie para aprovação. Quando estiver **Active**, o botão Meta no app funciona.

---

## Travou? Me diga em qual tela

Responda com o número:

1. Não consigo criar app / não aparece use case WhatsApp  
2. Criei o app mas não acho **API Setup**  
3. Achei API Setup mas não vejo Phone number ID  
4. Não acho **System users** / Generate token  
5. Token gerado, Phone ID copiado — só falta colocar na Vercel  

Ou mande um print da tela onde parou.
