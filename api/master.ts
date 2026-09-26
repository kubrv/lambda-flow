import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const LAMBDA_COMPANY_ID = "a0000000-0000-4000-8000-000000000001";

function sbAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sbAnon() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function bearer(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function requireLambdaAdmin(accessToken: string) {
  const anon = sbAnon();
  const admin = sbAdmin();
  if (!anon || !admin) {
    return { error: "Servidor sem Supabase.", status: 503 as const };
  }
  const { data: userData, error } = await anon.auth.getUser(accessToken);
  if (error || !userData.user) {
    return { error: "Faça login.", status: 401 as const };
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("role,company_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (
    !profile ||
    profile.role !== "company" ||
    profile.company_id !== LAMBDA_COMPANY_ID
  ) {
    return { error: "Apenas o Painel Master Lambda.", status: 403 as const };
  }
  return { userId: userData.user.id, admin };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action =
    (typeof req.query.action === "string" && req.query.action) ||
    (typeof req.body === "object" && req.body && (req.body as { action?: string }).action) ||
    "settings";

  // Público: status de manutenção (landing / gate)
  if (req.method === "GET" && action === "public-settings") {
    const sb = sbAdmin() || sbAnon();
    if (!sb) return res.status(503).json({ ok: false, error: "Sem Supabase." });
    const { data } = await sb
      .from("site_settings")
      .select("maintenance,maintenance_message,contact_whatsapp")
      .eq("id", "global")
      .maybeSingle();
    return res.status(200).json({
      ok: true,
      maintenance: Boolean(data?.maintenance),
      message:
        data?.maintenance_message ||
        "Rotaz em manutenção. Já voltamos em breve.",
      whatsapp: data?.contact_whatsapp || "5511947200616",
    });
  }

  // Público: validar cupom no cadastro
  if (req.method === "POST" && action === "validate-coupon") {
    const sb = sbAdmin();
    if (!sb) return res.status(503).json({ ok: false, error: "Sem Supabase." });
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const code = String(body.code || "")
      .trim()
      .toUpperCase();
    if (!code) {
      return res.status(400).json({ ok: false, error: "Informe o cupom." });
    }
    const { data: coupon } = await sb
      .from("plan_coupons")
      .select("*")
      .ilike("code", code)
      .maybeSingle();
    if (!coupon || !coupon.active) {
      return res.status(404).json({ ok: false, error: "Cupom inválido." });
    }
    if (coupon.uses >= coupon.max_uses) {
      return res.status(400).json({ ok: false, error: "Cupom esgotado." });
    }
    if (coupon.for_first_n) {
      const { count } = await sb
        .from("companies")
        .select("id", { count: "exact", head: true })
        .neq("id", LAMBDA_COMPANY_ID);
      if ((count || 0) >= coupon.for_first_n && coupon.uses === 0) {
        // ainda permite se uses < max — first_n is soft limit via max_uses
      }
    }
    return res.status(200).json({
      ok: true,
      code: coupon.code,
      percentOff: Number(coupon.percent_off),
      label: coupon.label,
      remaining: Math.max(0, coupon.max_uses - coupon.uses),
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método inválido." });
  }

  const token = bearer(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Sem autenticação." });
  }
  const auth = await requireLambdaAdmin(token);
  if ("error" in auth && auth.error) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  const sb = auth.admin!;

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const act = String(body.action || action || "");

  if (act === "list-companies" || (req.method === "GET" && act === "list-companies")) {
    const { data: companies, error } = await sb
      .from("companies")
      .select(
        "id,name,slug,plan_price,plan_status,plan_paid_until,phone,address,plan_method,created_at,last_seen_at,owner_user_id",
      )
      .order("created_at", { ascending: false });
    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
    const ids = (companies || []).map((c) => c.id);
    const { data: profiles } = await sb
      .from("profiles")
      .select("company_id,email,full_name")
      .eq("role", "company")
      .in("company_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const { data: payments } = await sb
      .from("payments")
      .select("company_id,method,status,paid_at,created_at")
      .order("created_at", { ascending: false });

    const now = Date.now();
    const day30 = 30 * 24 * 60 * 60 * 1000;
    const rows = (companies || []).map((c) => {
      const owner = (profiles || []).find((p) => p.company_id === c.id);
      const lastPay = (payments || []).find(
        (p) => p.company_id === c.id && p.status === "paid",
      );
      const paidUntil = c.plan_paid_until
        ? new Date(c.plan_paid_until).getTime()
        : 0;
      const active =
        c.plan_status === "active" && (!paidUntil || paidUntil > now);
      const lastSeen = c.last_seen_at
        ? new Date(c.last_seen_at).getTime()
        : c.created_at
          ? new Date(c.created_at).getTime()
          : 0;
      const inactive30 = !active || (lastSeen > 0 && now - lastSeen > day30);
      const daysLeft =
        paidUntil > now
          ? Math.ceil((paidUntil - now) / (24 * 60 * 60 * 1000))
          : 0;
      const clientDays = c.created_at
        ? Math.max(
            0,
            Math.floor(
              (now - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000),
            ),
          )
        : 0;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        email: owner?.email || "",
        ownerName: owner?.full_name || "",
        phone: c.phone || "",
        address: c.address || "",
        planStatus: c.plan_status,
        planPrice: Number(c.plan_price || 40),
        planPaidUntil: c.plan_paid_until,
        daysLeft,
        planMethod: c.plan_method || lastPay?.method || "",
        active,
        inactive30,
        clientDays,
        createdAt: c.created_at,
        isLambda: c.id === LAMBDA_COMPANY_ID,
      };
    });
    return res.status(200).json({ ok: true, companies: rows });
  }

  if (act === "list-coupons") {
    const { data, error } = await sb
      .from("plan_coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, coupons: data || [] });
  }

  if (act === "upsert-coupon") {
    const code = String(body.code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!code) {
      return res.status(400).json({ ok: false, error: "Código obrigatório." });
    }
    const row = {
      code,
      label: String(body.label || "").trim() || code,
      percent_off: Number(body.percentOff ?? 100),
      max_uses: Math.max(1, Number(body.maxUses || 10)),
      active: body.active !== false,
      for_first_n: body.forFirstN ? Number(body.forFirstN) : null,
      notes: String(body.notes || "").trim() || null,
    };
    const { data, error } = await sb
      .from("plan_coupons")
      .upsert(row, { onConflict: "code" })
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, coupon: data });
  }

  if (act === "toggle-coupon") {
    const id = String(body.id || "");
    const { data: cur } = await sb
      .from("plan_coupons")
      .select("active")
      .eq("id", id)
      .maybeSingle();
    if (!cur) return res.status(404).json({ ok: false, error: "Cupom não encontrado." });
    const { error } = await sb
      .from("plan_coupons")
      .update({ active: !cur.active })
      .eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, active: !cur.active });
  }

  if (act === "get-settings") {
    const { data } = await sb
      .from("site_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    return res.status(200).json({
      ok: true,
      settings: data || {
        maintenance: false,
        maintenance_message:
          "Rotaz em manutenção rápida. Já voltamos — fale conosco no WhatsApp.",
        contact_whatsapp: "5511947200616",
      },
    });
  }

  if (act === "set-maintenance") {
    const maintenance = Boolean(body.maintenance);
    const message = String(body.message || "").trim();
    const whatsapp = String(body.whatsapp || "").replace(/\D/g, "") || "5511947200616";
    const { error } = await sb.from("site_settings").upsert({
      id: "global",
      maintenance,
      maintenance_message:
        message ||
        "Rotaz em manutenção rápida. Já voltamos — fale conosco no WhatsApp se precisar.",
      contact_whatsapp: whatsapp,
      updated_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, maintenance });
  }

  return res.status(400).json({ ok: false, error: `Ação desconhecida: ${act}` });
}
