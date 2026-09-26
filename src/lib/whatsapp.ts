/** Normaliza celular BR para dígitos (com 55 se faltar). */
export function normalizeWhatsappDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

export function formatWhatsappDisplay(raw?: string | null): string {
  const d = raw ? normalizeWhatsappDigits(raw) : null;
  if (!d) return (raw || "").trim();
  const local = d.slice(2);
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return `+${d}`;
}

export type VisitOutcome =
  | "ok"
  | "destinatario_ausente"
  | "consultorio_fechado";

export type StopNotifyInput = {
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

function kindsLabel(kinds: Array<"entrega" | "retirada">): string {
  const hasE = kinds.includes("entrega");
  const hasR = kinds.includes("retirada");
  if (hasE && hasR) return "Entrega e Retirada";
  if (hasR) return "Retirada";
  return "Entrega";
}

function outcomeSuffix(outcome?: VisitOutcome): string {
  if (outcome === "destinatario_ausente") {
    return ", porém o destinatário estava ausente";
  }
  if (outcome === "consultorio_fechado") {
    return ", porém o consultório estava fechado";
  }
  return "";
}

export function buildStopNotifyText(
  input: Omit<StopNotifyInput, "phone">,
): string {
  const kind = kindsLabel(input.kinds?.length ? input.kinds : ["entrega"]);
  const suffix = outcomeSuffix(input.outcome);
  const lines = [
    `Passamos no seu endereço para ${kind}${suffix}.`,
  ];
  if (input.placeName?.trim()) {
    lines.push(`Local: ${input.placeName.trim()}`);
  }
  if (input.address?.trim()) {
    lines.push(input.address.trim());
  }
  if (input.kinds.includes("entrega") && input.boxes && input.boxes > 0) {
    lines.push(
      `Caixas: ${input.boxes} ${input.boxes === 1 ? "caixa" : "caixas"}`,
    );
  }
  const obsParts: string[] = [];
  if (input.notesEntrega?.trim()) {
    obsParts.push(
      input.kinds.includes("retirada") && !input.kinds.includes("entrega")
        ? input.notesEntrega.trim()
        : `Entrega: ${input.notesEntrega.trim()}`,
    );
  }
  if (input.notesRetirada?.trim()) {
    obsParts.push(`Retirada: ${input.notesRetirada.trim()}`);
  }
  // Se só entrega, simplifica label
  if (
    input.kinds.includes("entrega") &&
    !input.kinds.includes("retirada") &&
    input.notesEntrega?.trim()
  ) {
    obsParts.length = 0;
    obsParts.push(input.notesEntrega.trim());
  }
  if (
    input.kinds.includes("retirada") &&
    !input.kinds.includes("entrega") &&
    input.notesRetirada?.trim()
  ) {
    obsParts.length = 0;
    obsParts.push(input.notesRetirada.trim());
  }
  if (obsParts.length) {
    lines.push(`Obs.: ${obsParts.join(" · ")}`);
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

/** Link wa.me com texto pronto. */
export function whatsappDeliveryNotifyUrl(
  input: StopNotifyInput,
): string | null {
  const digits = normalizeWhatsappDigits(input.phone);
  if (!digits) return null;
  const text = buildStopNotifyText(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** @deprecated use buildStopNotifyText */
export function buildDeliveryNotifyText(
  input: Omit<StopNotifyInput, "phone" | "kinds" | "outcome"> & {
    kinds?: Array<"entrega" | "retirada">;
  },
): string {
  return buildStopNotifyText({
    ...input,
    kinds: input.kinds?.length ? input.kinds : ["entrega"],
  });
}
