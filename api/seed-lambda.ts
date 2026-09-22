import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const LAMBDA_COMPANY_ID = "a0000000-0000-4000-8000-000000000001";
const LAMBDA_EMAIL = "geral@lambdaddentallab.com";
const LAMBDA_PASSWORD = "Lambda@3552";
const LAMBDA_NAME = "Lambda Dental Lab";

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  const sb = adminClient();
  if (!sb) {
    return res.status(503).json({
      ok: false,
      error:
        "Configure SUPABASE_SERVICE_ROLE_KEY no Vercel para criar a empresa Lambda automaticamente.",
      hint: "Enquanto isso, cadastre-se com o código LAMBDA-ADMIN-2026 após rodar a migration.",
    });
  }

  try {
    // Garante empresa
    await sb.from("companies").upsert({
      id: LAMBDA_COMPANY_ID,
      name: LAMBDA_NAME,
      slug: "lambda-dental-lab",
      plan_price: 40,
      plan_status: "active",
      plan_paid_until: new Date(
        Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    await sb.from("invite_codes").upsert(
      [
        {
          company_id: LAMBDA_COMPANY_ID,
          code: "LAMBDA-MOTO-2026",
          role: "motoboy",
          label: "Motoboys Lambda",
          max_uses: 500,
          active: true,
        },
        {
          company_id: LAMBDA_COMPANY_ID,
          code: "LAMBDA-ADMIN-2026",
          role: "company",
          label: "Equipe admin Lambda",
          max_uses: 20,
          active: true,
        },
      ],
      { onConflict: "code" },
    );

    // Cria / atualiza usuário
    const { data: listed } = await sb.auth.admin.listUsers({ perPage: 200 });
    const existing = listed?.users?.find(
      (u) => u.email?.toLowerCase() === LAMBDA_EMAIL,
    );

    let userId = existing?.id;
    if (!userId) {
      const created = await sb.auth.admin.createUser({
        email: LAMBDA_EMAIL,
        password: LAMBDA_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: "Admin Lambda",
          role: "company",
          company_id: LAMBDA_COMPANY_ID,
        },
      });
      if (created.error) throw created.error;
      userId = created.data.user?.id;
    } else {
      await sb.auth.admin.updateUserById(userId, {
        password: LAMBDA_PASSWORD,
        email_confirm: true,
      });
    }

    if (!userId) throw new Error("Não foi possível obter o usuário Lambda.");

    await sb.from("profiles").upsert({
      user_id: userId,
      role: "company",
      company_id: LAMBDA_COMPANY_ID,
      full_name: "Admin Lambda",
      email: LAMBDA_EMAIL,
    });

    await sb
      .from("companies")
      .update({ owner_user_id: userId, plan_status: "active" })
      .eq("id", LAMBDA_COMPANY_ID);

    return res.status(200).json({
      ok: true,
      email: LAMBDA_EMAIL,
      companyId: LAMBDA_COMPANY_ID,
      message: "Empresa Lambda pronta. Login com a senha definida.",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha no seed",
    });
  }
}
