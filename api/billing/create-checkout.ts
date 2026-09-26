import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function sbAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const companyId = String(body.companyId || "");
  const method = String(body.method || "pix") as "pix" | "card" | "boleto";
  const amount = Number(body.amount || 40);

  if (!companyId) {
    return res.status(400).json({ ok: false, error: "companyId obrigatório" });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const appUrl =
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    "https://lambda-flow.vercel.app";

  const sb = sbAdmin();

  // Sem token MP: registra cobrança manual e orienta
  if (!token) {
    if (sb) {
      await sb.from("payments").insert({
        company_id: companyId,
        amount,
        method,
        status: "pending",
        provider: "manual",
      });
    }
    return res.status(200).json({
      ok: true,
      manual: true,
      message:
        "Mercado Pago não configurado. Defina MERCADOPAGO_ACCESS_TOKEN para PIX/cartão/boleto automáticos.",
    });
  }

  const excludedTypes: { id: string }[] = [];
  if (method === "pix") {
    excludedTypes.push({ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" });
  } else if (method === "card") {
    excludedTypes.push({ id: "ticket" }, { id: "bank_transfer" });
  } else if (method === "boleto") {
    excludedTypes.push({ id: "credit_card" }, { id: "debit_card" }, { id: "bank_transfer" });
  }

  const preference = {
    items: [
      {
        title: "Rotaz — plano mensal",
        quantity: 1,
        currency_id: "BRL",
        unit_price: amount,
      },
    ],
    external_reference: companyId,
    metadata: { company_id: companyId, method },
    back_urls: {
      success: `${appUrl}/?billing=success`,
      failure: `${appUrl}/?billing=failure`,
      pending: `${appUrl}/?billing=pending`,
    },
    auto_return: "approved",
    notification_url: `${appUrl}/api/billing/webhook`,
    payment_methods: {
      excluded_payment_types: excludedTypes,
      installments: method === "card" ? 12 : 1,
    },
  };

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preference),
  });

  const mpData = (await mpRes.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
  };

  if (!mpRes.ok || !mpData.id) {
    return res.status(502).json({
      ok: false,
      error: mpData.message || "Falha ao criar preferência no Mercado Pago",
    });
  }

  const checkoutUrl = mpData.init_point || mpData.sandbox_init_point || "";

  if (sb) {
    await sb.from("payments").insert({
      company_id: companyId,
      amount,
      method,
      status: "pending",
      provider: "mercadopago",
      provider_id: mpData.id,
      checkout_url: checkoutUrl,
      raw: mpData,
    });
  }

  return res.status(200).json({
    ok: true,
    checkoutUrl,
    preferenceId: mpData.id,
  });
}
