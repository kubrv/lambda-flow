import { getSupabase } from "./supabase";
import type { VisitOutcome } from "./whatsapp";

export type WhatsappNotifyInput = {
  phone: string;
  placeName: string;
  address: string;
  kinds: Array<"entrega" | "retirada">;
  boxes?: number;
  notesEntrega?: string;
  notesRetirada?: string;
  motoboyName?: string;
  dateLabel?: string;
  outcome?: VisitOutcome;
};

export type WhatsappNotifyResult = {
  ok: true;
  mode: "template" | "text";
  messageId: string | null;
  to: string;
};

export async function sendWhatsappDeliveryNotify(
  input: WhatsappNotifyInput,
): Promise<WhatsappNotifyResult> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Faça login para enviar o aviso pelo Meta.");
  }

  const res = await fetch("/api/whatsapp-notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    mode?: "template" | "text";
    messageId?: string | null;
    to?: string;
  };

  if (!res.ok || !json.ok) {
    throw new Error(String(json.error || "Falha ao enviar WhatsApp via Meta."));
  }

  return {
    ok: true,
    mode: json.mode === "template" ? "template" : "text",
    messageId: json.messageId ?? null,
    to: String(json.to || ""),
  };
}
