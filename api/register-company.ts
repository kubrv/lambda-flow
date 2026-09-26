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

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  const sb = sbAdmin();
  if (!sb) {
    return res.status(503).json({
      ok: false,
      error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const companyName = String(body.companyName || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const method = String(body.method || "pix") as "pix" | "card" | "boleto";
  const couponCode = String(body.coupon || body.couponCode || "")
    .trim()
    .toUpperCase();
  let amount = 40;
  let appliedCoupon: { code: string; percent: number; id: string } | null =
    null;

  if (!companyName || !ownerName || !email || !phone || password.length < 6) {
    return res.status(400).json({
      ok: false,
      error: "Preencha empresa, nome, e-mail, telefone e senha (mín. 6).",
    });
  }

  try {
    if (couponCode) {
      const { data: coupon } = await sb
        .from("plan_coupons")
        .select("*")
        .ilike("code", couponCode)
        .maybeSingle();
      if (!coupon || !coupon.active) {
        return res.status(400).json({ ok: false, error: "Cupom inválido." });
      }
      if (coupon.uses >= coupon.max_uses) {
        return res.status(400).json({ ok: false, error: "Cupom esgotado." });
      }
      const pct = Number(coupon.percent_off) || 0;
      amount = Math.round(amount * (1 - pct / 100) * 100) / 100;
      appliedCoupon = { code: coupon.code, percent: pct, id: coupon.id };
    }

    const baseSlug = slugify(companyName) || "empresa";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

    const planStatus =
      appliedCoupon && amount <= 0 ? "active" : "pending";
    const planPaidUntil =
      planStatus === "active"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .insert({
        name: companyName,
        slug,
        plan_price: 40,
        plan_status: planStatus,
        plan_paid_until: planPaidUntil,
        plan_method: method,
        phone,
      })
      .select("id")
      .single();

    // phone / plan_method columns may not exist yet — retry stripped
    let companyId = company?.id as string | undefined;
    if (companyErr) {
      if (/phone|plan_method|plan_paid|column/i.test(companyErr.message)) {
        const retry = await sb
          .from("companies")
          .insert({
            name: companyName,
            slug,
            plan_price: 40,
            plan_status: planStatus,
            plan_paid_until: planPaidUntil,
          })
          .select("id")
          .single();
        if (retry.error) {
          const retry2 = await sb
            .from("companies")
            .insert({
              name: companyName,
              slug,
              plan_price: 40,
              plan_status: planStatus === "active" ? "pending" : planStatus,
            })
            .select("id")
            .single();
          if (retry2.error) throw retry2.error;
          companyId = retry2.data.id;
        } else {
          companyId = retry.data.id;
        }
      } else {
        throw companyErr;
      }
    }

    if (!companyId) throw new Error("Empresa não criada.");

    const created = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: ownerName,
        role: "company",
        company_id: companyId,
        phone,
      },
      phone: phone.replace(/\D/g, "") || undefined,
    });
    if (created.error) {
      await sb.from("companies").delete().eq("id", companyId);
      throw created.error;
    }
    const userId = created.data.user?.id;
    if (!userId) throw new Error("Usuário não criado.");

    await sb.from("profiles").upsert({
      user_id: userId,
      role: "company",
      company_id: companyId,
      full_name: ownerName,
      email,
    });

    await sb
      .from("companies")
      .update({ owner_user_id: userId })
      .eq("id", companyId);

    // Motoboys usam 1º acesso no painel Motoboys — sem códigos de convite.
    // Código opcional só para equipe admin da empresa.
    const codeSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    await sb.from("invite_codes").insert([
      {
        company_id: companyId,
        code: `ADM-${codeSuffix}`,
        role: "company",
        label: "Equipe",
        max_uses: 20,
        active: true,
      },
    ]);

    async function bumpCouponUse(couponId: string) {
      const { data: cur } = await sb
        .from("plan_coupons")
        .select("uses")
        .eq("id", couponId)
        .maybeSingle();
      await sb
        .from("plan_coupons")
        .update({ uses: Number(cur?.uses || 0) + 1 })
        .eq("id", couponId);
    }

    if (appliedCoupon && amount <= 0) {
      await sb.from("payments").insert({
        company_id: companyId,
        amount: 0,
        method,
        status: "paid",
        provider: "coupon",
        paid_at: new Date().toISOString(),
        raw: { coupon: appliedCoupon.code },
      });
      await bumpCouponUse(appliedCoupon.id);
      return res.status(200).json({
        ok: true,
        companyId,
        couponApplied: appliedCoupon.code,
        free: true,
        message: `Cupom ${appliedCoupon.code} aplicado — plano ativo por 30 dias.`,
      });
    }

    if (appliedCoupon) {
      await bumpCouponUse(appliedCoupon.id);
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const appUrl =
      process.env.APP_URL ||
      process.env.VITE_APP_URL ||
      "https://lambda-flow.vercel.app";

    if (!token) {
      await sb.from("payments").insert({
        company_id: companyId,
        amount,
        method,
        status: "pending",
        provider: "manual",
      });
      return res.status(200).json({
        ok: true,
        companyId,
        manual: true,
        message:
          "Empresa criada. Configure MERCADOPAGO_ACCESS_TOKEN na Vercel para checkout automático, ou ative o plano manualmente.",
      });
    }

    const excludedTypes: { id: string }[] = [];
    if (method === "pix") {
      excludedTypes.push(
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" },
      );
    } else if (method === "card") {
      excludedTypes.push({ id: "ticket" }, { id: "bank_transfer" });
    } else {
      excludedTypes.push(
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "bank_transfer" },
      );
    }

    const preference = {
      items: [
        {
          title: `Rotaz — ${companyName}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: amount,
        },
      ],
      payer: { email, name: ownerName },
      external_reference: companyId,
      metadata: { company_id: companyId, method, phone },
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

    const mpRes = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preference),
      },
    );
    const mpData = (await mpRes.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
    };

    if (!mpRes.ok || !mpData.id) {
      return res.status(200).json({
        ok: true,
        companyId,
        manual: true,
        message:
          mpData.message ||
          "Empresa criada, mas o checkout falhou. Entre e pague pelo painel.",
      });
    }

    const checkoutUrl = mpData.init_point || mpData.sandbox_init_point || "";
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

    return res.status(200).json({
      ok: true,
      companyId,
      checkoutUrl,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao registrar empresa",
    });
  }
}
