import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type VisitOutcome = "ok" | "destinatario_ausente" | "consultorio_fechado";

type NotifyBody = {
  phone?: string;
  placeName?: string;
  address?: string;
  kinds?: Array<"entrega" | "retirada">;
  boxes?: number;
  notesEntrega?: string;
  notesRetirada?: string;
  motoboyName?: string;
  dateLabel?: string;
  outcome?: VisitOutcome;
  forceText?: boolean;
};

function normalizeWhatsappDigits(raw: string): string | null {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

function kindsLabel(kinds: Array<"entrega" | "retirada">): string {
  const hasE = kinds.includes("entrega");
  const hasR = kinds.includes("retirada");
  if (hasE && hasR) return "Entrega e Retirada";
  if (hasR) return "Retirada";
  return "Entrega";
}

function buildStopNotifyText(input: {
  placeName: string;
  address: string;
  kinds: Array<"entrega" | "retirada">;
  boxes?: number;
  notesEntrega?: string;
  notesRetirada?: string;
  motoboyName?: string;
  dateLabel?: string;
  outcome?: VisitOutcome;
}): string {
  const kind = kindsLabel(input.kinds.length ? input.kinds : ["entrega"]);
  let suffix = "";
  if (input.outcome === "destinatario_ausente") {
    suffix = ", porém o destinatário estava ausente";
  } else if (input.outcome === "consultorio_fechado") {
    suffix = ", porém o consultório estava fechado";
  }
  const lines = [`Passamos no seu endereço para ${kind}${suffix}.`];
  if (input.placeName.trim()) lines.push(`Local: ${input.placeName.trim()}`);
  if (input.address.trim()) lines.push(input.address.trim());
  if (input.kinds.includes("entrega") && input.boxes && input.boxes > 0) {
    lines.push(
      `Caixas: ${input.boxes} ${input.boxes === 1 ? "caixa" : "caixas"}`,
    );
  }
  const hasE = input.kinds.includes("entrega");
  const hasR = input.kinds.includes("retirada");
  if (hasE && !hasR && input.notesEntrega?.trim()) {
    lines.push(`Obs.: ${input.notesEntrega.trim()}`);
  } else if (hasR && !hasE && input.notesRetirada?.trim()) {
    lines.push(`Obs.: ${input.notesRetirada.trim()}`);
  } else {
    const parts: string[] = [];
    if (input.notesEntrega?.trim()) {
      parts.push(`Entrega: ${input.notesEntrega.trim()}`);
    }
    if (input.notesRetirada?.trim()) {
      parts.push(`Retirada: ${input.notesRetirada.trim()}`);
    }
    if (parts.length) lines.push(`Obs.: ${parts.join(" · ")}`);
  }
  if (input.motoboyName?.trim()) {
    lines.push(`Motoboy responsável: ${input.motoboyName.trim()}`);
  }
  if (input.dateLabel?.trim()) {
    lines.push(`Data: ${input.dateLabel.trim()}`);
  }
  lines.push("— Rotaz");
  return lines.join("\n");
}

function bearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function requireLoggedInUser(accessToken: string) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { error: "Supabase não configurado no servidor.", status: 503 as const };
  }
  const sb = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) {
    return { error: "Faça login para enviar WhatsApp.", status: 401 as const };
  }
  return { user: data.user };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Sem autenticação." });
  }

  const auth = await requireLoggedInUser(token);
  if ("error" in auth && auth.error) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const waToken =
    process.env.WHATSAPP_TOKEN ||
    process.env.META_WHATSAPP_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion =
    process.env.WHATSAPP_GRAPH_VERSION ||
    process.env.META_GRAPH_VERSION ||
    "v21.0";
  const templateName = (
    process.env.WHATSAPP_TEMPLATE_NAME ||
    process.env.META_WHATSAPP_TEMPLATE_NAME ||
    ""
  ).trim();
  const templateLang = (
    process.env.WHATSAPP_TEMPLATE_LANG ||
    process.env.META_WHATSAPP_TEMPLATE_LANG ||
    "pt_BR"
  ).trim();

  if (!waToken || !phoneNumberId) {
    return res.status(503).json({
      ok: false,
      error: !waToken
        ? "WhatsApp Meta sem WHATSAPP_TOKEN na Vercel."
        : "Falta WHATSAPP_PHONE_NUMBER_ID na Vercel (não é o App ID). Veja API Setup → From → Phone number ID.",
    });
  }

  const body =
    (typeof req.body === "string"
      ? (JSON.parse(req.body || "{}") as NotifyBody)
      : (req.body as NotifyBody)) || {};

  const digits = normalizeWhatsappDigits(String(body.phone || ""));
  if (!digits) {
    return res.status(400).json({
      ok: false,
      error: "WhatsApp do destino inválido. Use DDD + número (ex.: 11987654321).",
    });
  }

  const kinds = (body.kinds || []).filter(
    (k): k is "entrega" | "retirada" => k === "entrega" || k === "retirada",
  );
  const placeName = String(body.placeName || "destino").trim() || "destino";
  const address = String(body.address || "").trim();
  const motoboyName = String(body.motoboyName || "").trim();
  const dateLabel = String(body.dateLabel || "").trim();
  const boxes = Number(body.boxes) || 0;
  const notesEntrega = String(body.notesEntrega || "").trim();
  const notesRetirada = String(body.notesRetirada || "").trim();
  const outcome = body.outcome;
  const text = buildStopNotifyText({
    placeName,
    address,
    kinds: kinds.length ? kinds : ["entrega"],
    boxes,
    notesEntrega,
    notesRetirada,
    motoboyName,
    dateLabel,
    outcome,
  });

  const useTemplate = Boolean(templateName) && !body.forceText;

  const payload: Record<string, unknown> = useTemplate
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digits,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: placeName.slice(0, 60) },
                { type: "text", text: (address || "—").slice(0, 100) },
                { type: "text", text: (motoboyName || "motoboy").slice(0, 60) },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digits,
        type: "text",
        text: { body: text.slice(0, 4096), preview_url: false },
      };

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  try {
    const metaRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const metaJson = (await metaRes.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: {
        message?: string;
        code?: number;
        error_data?: { details?: string };
      };
    };

    if (!metaRes.ok) {
      const detail =
        metaJson.error?.error_data?.details ||
        metaJson.error?.message ||
        `Meta HTTP ${metaRes.status}`;
      const needsTemplate = metaJson.error?.code === 131047;
      return res.status(502).json({
        ok: false,
        error: needsTemplate
          ? "Destino fora da janela de 24h. Crie/aprove um template na Meta e defina WHATSAPP_TEMPLATE_NAME."
          : detail,
        metaCode: metaJson.error?.code,
        mode: useTemplate ? "template" : "text",
      });
    }

    return res.status(200).json({
      ok: true,
      mode: useTemplate ? "template" : "text",
      messageId: metaJson.messages?.[0]?.id || null,
      to: digits,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error:
        err instanceof Error ? err.message : "Falha ao chamar Meta Cloud API.",
    });
  }
}
