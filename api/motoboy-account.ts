import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

function sbAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function hashCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function makeAccessCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

function makeTempPassword() {
  return `Tmp!${randomBytes(12).toString("base64url")}`;
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
  const action = String(body.action || "provision");

  try {
    if (action === "resolve-login") {
      const login = String(body.login || "").trim();
      if (!login) {
        return res.status(400).json({ ok: false, error: "Informe usuário ou e-mail." });
      }
      if (login.includes("@")) {
        return res.status(200).json({ ok: true, email: login.toLowerCase() });
      }
      const { data } = await sb
        .from("profiles")
        .select("email, username")
        .ilike("username", login)
        .maybeSingle();
      if (!data?.email) {
        const moto = await sb
          .from("motoboys")
          .select("email, username")
          .ilike("username", login)
          .maybeSingle();
        if (!moto.data?.email) {
          return res.status(404).json({
            ok: false,
            error: "Usuário não encontrado.",
          });
        }
        return res.status(200).json({
          ok: true,
          email: String(moto.data.email).toLowerCase(),
        });
      }
      return res.status(200).json({
        ok: true,
        email: String(data.email).toLowerCase(),
      });
    }

    if (action === "first-access") {
      const login = String(body.login || "").trim();
      const accessCode = String(body.accessCode || "").trim().toUpperCase();
      const password = String(body.password || "");
      if (!login || !accessCode || password.length < 6) {
        return res.status(400).json({
          ok: false,
          error: "Informe usuário/e-mail, código de 1º acesso e senha (mín. 6).",
        });
      }

      let motoboyQuery = sb.from("motoboys").select("*");
      if (login.includes("@")) {
        motoboyQuery = motoboyQuery.ilike("email", login);
      } else {
        motoboyQuery = motoboyQuery.ilike("username", login);
      }
      const { data: moto, error: motoErr } = await motoboyQuery.maybeSingle();
      if (motoErr || !moto) {
        return res.status(404).json({ ok: false, error: "Motoboy não encontrado." });
      }
      if (moto.password_set) {
        return res.status(400).json({
          ok: false,
          error: "Senha já definida. Faça login normalmente.",
        });
      }
      const hash = hashCode(accessCode);
      if (!moto.access_code_hash || moto.access_code_hash !== hash) {
        return res.status(403).json({ ok: false, error: "Código de 1º acesso inválido." });
      }
      if (
        moto.access_code_expires_at &&
        new Date(moto.access_code_expires_at).getTime() < Date.now()
      ) {
        return res.status(403).json({ ok: false, error: "Código expirado. Peça um novo ao admin." });
      }

      const email = String(moto.email || "").toLowerCase();
      if (!email) {
        return res.status(400).json({ ok: false, error: "Motoboy sem e-mail cadastrado." });
      }

      let userId = moto.user_id as string | null;
      if (!userId) {
        const created = await sb.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: moto.name,
            role: "motoboy",
            motoboy_id: moto.id,
            username: moto.username,
          },
        });
        if (created.error) throw created.error;
        userId = created.data.user?.id || null;
      } else {
        const upd = await sb.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
        });
        if (upd.error) throw upd.error;
      }
      if (!userId) throw new Error("Falha ao criar usuário.");

      await sb.from("profiles").upsert({
        user_id: userId,
        role: "motoboy",
        motoboy_id: moto.id,
        full_name: moto.name || "",
        email,
        username: moto.username || null,
        must_set_password: false,
      });

      await sb
        .from("motoboys")
        .update({
          user_id: userId,
          password_set: true,
          access_code_hash: null,
          access_code_expires_at: null,
        })
        .eq("id", moto.id);

      return res.status(200).json({
        ok: true,
        email,
        message: "Senha criada. Entre com usuário/e-mail e a senha.",
      });
    }

    if (action === "admin-set-password") {
      const motoboyId = String(body.motoboyId || "");
      const newPassword = String(body.newPassword || "");
      if (!motoboyId || newPassword.length < 6) {
        return res.status(400).json({
          ok: false,
          error: "Informe o motoboy e a nova senha (mín. 6).",
        });
      }
      const { data: moto } = await sb
        .from("motoboys")
        .select("*")
        .eq("id", motoboyId)
        .maybeSingle();
      if (!moto?.user_id) {
        return res.status(400).json({
          ok: false,
          error: "Motoboy ainda sem acesso. Gere o 1º acesso primeiro.",
        });
      }
      const upd = await sb.auth.admin.updateUserById(String(moto.user_id), {
        password: newPassword,
      });
      if (upd.error) throw upd.error;
      await sb
        .from("motoboys")
        .update({ password_set: true, access_code_hash: null })
        .eq("id", motoboyId);
      await sb
        .from("profiles")
        .update({ must_set_password: false })
        .eq("user_id", moto.user_id);
      return res.status(200).json({
        ok: true,
        message: "Senha alterada. Ela não fica visível depois de salva.",
      });
    }

    if (action === "reset-all-logins") {
      const { data: motos, error: listErr } = await sb
        .from("motoboys")
        .select("id, user_id, email, username, name");
      if (listErr) throw listErr;

      const deletedUsers: string[] = [];
      for (const m of motos || []) {
        const uid = m.user_id as string | null;
        if (uid) {
          const del = await sb.auth.admin.deleteUser(uid);
          if (!del.error) deletedUsers.push(uid);
        }
      }

      // Perfis de motoboy (mesmo sem user_id na tabela motoboys)
      const { data: motoProfiles } = await sb
        .from("profiles")
        .select("user_id")
        .eq("role", "motoboy");
      for (const p of motoProfiles || []) {
        const uid = String(p.user_id);
        if (!deletedUsers.includes(uid)) {
          await sb.auth.admin.deleteUser(uid);
          deletedUsers.push(uid);
        }
      }
      await sb.from("profiles").delete().eq("role", "motoboy");

      const clear = await sb
        .from("motoboys")
        .update({
          email: null,
          username: null,
          user_id: null,
          password_set: false,
          access_code_hash: null,
          access_code_expires_at: null,
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (clear.error && /column|email|username/i.test(clear.error.message)) {
        return res.status(500).json({
          ok: false,
          error:
            "Rode supabase/migration_motoboy_accounts.sql antes de zerar acessos.",
          detail: clear.error.message,
        });
      }
      if (clear.error) throw clear.error;

      await sb
        .from("invite_codes")
        .update({ active: false })
        .eq("role", "motoboy");

      return res.status(200).json({
        ok: true,
        cleared: (motos || []).length,
        deletedAuthUsers: deletedUsers.length,
        message:
          "Acessos de motoboy zerados. Ficaram só os nomes — cadastre e-mail/usuário e gere o 1º acesso.",
      });
    }

    // provision / regenerate access code
    const motoboyId = String(body.motoboyId || "");
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");
    const phone = String(body.phone || "").trim();

    if (!motoboyId || !name || !email || !username) {
      return res.status(400).json({
        ok: false,
        error: "Informe motoboyId, nome, e-mail e usuário.",
      });
    }

    const accessCode = makeAccessCode();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: existing } = await sb
      .from("motoboys")
      .select("user_id,password_set")
      .eq("id", motoboyId)
      .maybeSingle();

    let userId = (existing?.user_id as string) || null;
    if (!userId) {
      const created = await sb.auth.admin.createUser({
        email,
        password: makeTempPassword(),
        email_confirm: true,
        user_metadata: {
          full_name: name,
          role: "motoboy",
          motoboy_id: motoboyId,
          username,
          must_set_password: true,
        },
      });
      if (created.error) {
        // e-mail já existe: tenta achar
        if (/already|registered|exists/i.test(created.error.message)) {
          const listed = await sb.auth.admin.listUsers({ perPage: 200 });
          const found = listed.data?.users?.find(
            (u) => u.email?.toLowerCase() === email,
          );
          userId = found?.id || null;
          if (!userId) throw created.error;
        } else {
          throw created.error;
        }
      } else {
        userId = created.data.user?.id || null;
      }
    }

    if (!userId) throw new Error("Não foi possível criar o usuário.");

    await sb.from("profiles").upsert({
      user_id: userId,
      role: "motoboy",
      motoboy_id: motoboyId,
      full_name: name,
      email,
      username,
      must_set_password: true,
    });

    const patch: Record<string, unknown> = {
      name,
      email,
      username,
      phone: phone || null,
      user_id: userId,
      password_set: false,
      access_code_hash: hashCode(accessCode),
      access_code_expires_at: expires,
    };
    // keep pay prefs if columns exist
    const up = await sb.from("motoboys").update(patch).eq("id", motoboyId);
    if (up.error && /column|email|username|access_code/i.test(up.error.message)) {
      return res.status(500).json({
        ok: false,
        error:
          "Rode supabase/migration_motoboy_accounts.sql no Supabase e tente de novo.",
        detail: up.error.message,
      });
    }
    if (up.error) throw up.error;

    return res.status(200).json({
      ok: true,
      accessCode,
      expiresAt: expires,
      email,
      username,
      message:
        "Acesso criado. Entregue o código de 1º acesso ao motoboy — só ele cria a senha.",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha na operação",
    });
  }
}
