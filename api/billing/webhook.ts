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

async function fetchPayment(paymentId: string) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    id: number;
    status: string;
    external_reference?: string;
    metadata?: { company_id?: string };
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Mercado Pago envia GET com topic/id ou POST com body
  const topic =
    (req.query.topic as string) ||
    (req.query.type as string) ||
    (typeof req.body === "object" && req.body?.type) ||
    "";
  const id =
    (req.query.id as string) ||
    (req.query["data.id"] as string) ||
    (typeof req.body === "object" && req.body?.data?.id) ||
    "";

  if (!id || (topic && !/payment/i.test(String(topic)) && topic !== "payment")) {
    // ACK genérico para outros eventos
    return res.status(200).json({ ok: true });
  }

  const payment = await fetchPayment(String(id));
  if (!payment) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const companyId =
    payment.external_reference || payment.metadata?.company_id || "";
  if (!companyId) {
    return res.status(200).json({ ok: true, noCompany: true });
  }

  const sb = sbAdmin();
  if (!sb) {
    return res.status(200).json({ ok: true, noAdmin: true });
  }

  const paid = payment.status === "approved";
  await sb
    .from("payments")
    .update({
      status: paid ? "paid" : payment.status === "rejected" ? "failed" : "pending",
      paid_at: paid ? new Date().toISOString() : null,
      provider_id: String(payment.id),
      raw: payment,
    })
    .eq("company_id", companyId)
    .eq("provider", "mercadopago");

  if (paid) {
    const until = new Date();
    until.setMonth(until.getMonth() + 1);
    await sb
      .from("companies")
      .update({
        plan_status: "active",
        plan_paid_until: until.toISOString(),
      })
      .eq("id", companyId);
  }

  return res.status(200).json({ ok: true, paid });
}
