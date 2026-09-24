/** Preferência de dia de pagamento do motoboy. */
export type PayDayPreference =
  | "end_of_route"
  | "weekly_fri"
  | "weekly_mon"
  | "biweekly"
  | "monthly_5"
  | "monthly_15"
  | "monthly_30";

/** Forma de pagamento (preferência ou lançamento acertado). */
export type PayMethod = "pix" | "cash" | "transfer" | "other";

export const PAY_DAY_OPTIONS: { id: PayDayPreference; label: string }[] = [
  { id: "end_of_route", label: "No fim da rota (padrão)" },
  { id: "weekly_fri", label: "Toda sexta-feira" },
  { id: "weekly_mon", label: "Toda segunda-feira" },
  { id: "biweekly", label: "Quinzenal" },
  { id: "monthly_5", label: "Todo dia 5" },
  { id: "monthly_15", label: "Todo dia 15" },
  { id: "monthly_30", label: "Todo dia 30" },
];

export const PAY_METHOD_OPTIONS: { id: PayMethod; label: string }[] = [
  { id: "pix", label: "PIX" },
  { id: "cash", label: "Dinheiro" },
  { id: "transfer", label: "Transferência" },
  { id: "other", label: "Outro" },
];

export function payDayLabel(id?: string | null): string {
  return PAY_DAY_OPTIONS.find((o) => o.id === id)?.label || "No fim da rota";
}

export function payMethodLabel(id?: string | null): string {
  return PAY_METHOD_OPTIONS.find((o) => o.id === id)?.label || "—";
}
