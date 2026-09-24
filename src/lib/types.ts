export type Weekday =
  | "seg"
  | "ter"
  | "qua"
  | "qui"
  | "sex"
  | "sab"
  | "dom";

export const WEEKDAYS: { id: Weekday; label: string; short: string }[] = [
  { id: "seg", label: "Segunda", short: "Seg" },
  { id: "ter", label: "Terça", short: "Ter" },
  { id: "qua", label: "Quarta", short: "Qua" },
  { id: "qui", label: "Quinta", short: "Qui" },
  { id: "sex", label: "Sexta", short: "Sex" },
  { id: "sab", label: "Sábado", short: "Sáb" },
  { id: "dom", label: "Domingo", short: "Dom" },
];

import type { PayDayPreference, PayMethod } from "./payPrefs";

export type Motoboy = {
  id: string;
  name: string;
  phone?: string;
  /** Empresa / frota do motoboy. */
  company?: string;
  /** Valor por km deste motoboy (não é global). */
  pricePerKm?: number;
  /** Conta de acesso (admin preenche; senha só no 1º acesso do boy). */
  email?: string;
  username?: string;
  userId?: string;
  passwordSet?: boolean;
  /** Preferência de quando receber (padrão: fim da rota). */
  payDayPreference?: PayDayPreference;
  /** Preferência de forma de pagamento. */
  payMethodPreference?: PayMethod;
  pixKey?: string;
};

export type { HoursPeriod } from "./hours";
import type { HoursPeriod } from "./hours";

export type SavedAddress = {
  id: string;
  label: string;
  address: string;
  /** Ex.: sala, andar, portão — ajuda o motoboy a achar. */
  complement?: string;
  /** Horários de funcionamento (padrão 9–12 e 13–17). */
  hours?: HoursPeriod[];
  lat: number | null;
  lng: number | null;
};

export type StopKind = "entrega" | "retirada";

export type StopKindFlags = {
  entrega: boolean;
  retirada: boolean;
};

export type Stop = {
  id: string;
  addressId?: string | null;
  address: string;
  label?: string;
  kind?: StopKind;
  kinds?: StopKind[];
  notes?: string;
  /** Quantidade de caixas neste endereço. */
  boxes?: number;
  complement?: string;
  hours?: HoursPeriod[];
  lat: number | null;
  lng: number | null;
};

export function resolveStopKinds(stop: {
  kind?: string | null;
  kinds?: StopKind[] | null;
}): StopKind[] {
  const fromArr = (stop.kinds || []).filter(
    (k): k is StopKind => k === "entrega" || k === "retirada",
  );
  if (fromArr.length) return [...new Set(fromArr)];
  const raw = (stop.kind || "").toLowerCase();
  if (raw.includes("entrega") && raw.includes("retirada")) {
    return ["entrega", "retirada"];
  }
  if (raw === "retirada") return ["retirada"];
  return ["entrega"];
}

export function stopKindsToFlags(kinds: StopKind[]): StopKindFlags {
  return {
    entrega: kinds.includes("entrega"),
    retirada: kinds.includes("retirada"),
  };
}

export function flagsToStopKinds(flags: StopKindFlags): StopKind[] {
  const out: StopKind[] = [];
  if (flags.entrega) out.push("entrega");
  if (flags.retirada) out.push("retirada");
  return out.length ? out : ["entrega"];
}

export function normalizeBoxes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function totalBoxes(stops: { boxes?: number | null }[]): number {
  return stops.reduce((sum, s) => sum + normalizeBoxes(s.boxes), 0);
}

/** Rota de um dia do calendário (chave YYYY-MM-DD). */
export type RouteCompletionStatus = "open" | "completed" | "verified";

export type DayRoute = {
  date: string;
  startAddress: string;
  startLat: number | null;
  startLng: number | null;
  motoboyId: string | null;
  stops: Stop[];
  totalKm: number;
  returnToStart: boolean;
  optimizedAt: string | null;
  /** open = em andamento; completed = boy concluiu (aguarda admin); verified = admin conferiu */
  completionStatus?: RouteCompletionStatus;
  motoboyReport?: string;
  motoboyCompletedAt?: string | null;
  motoboyCompletedBy?: string;
  adminReport?: string;
  adminVerifiedAt?: string | null;
  adminVerifiedBy?: string;
};

export type FinanceStatus = "open" | "paid";

/** Quanto se deve a um motoboy, ligado a datas de rota. */
export type FinanceEntry = {
  id: string;
  motoboyId: string;
  amount: number;
  routeDates: string[];
  description?: string;
  status: FinanceStatus;
  createdAt: string;
  /** Lançamento gerado automaticamente ao criar/atualizar rota. */
  source?: "auto-route" | "manual";
  /** Km usados no cálculo automático. */
  km?: number;
  /** Forma usada ao marcar como recebido/acertado. */
  paymentMethod?: PayMethod;
  paidAt?: string | null;
};

export type AppData = {
  motoboys: Motoboy[];
  addresses: SavedAddress[];
  /** Rotas por data YYYY-MM-DD (mês inteiro / histórico). */
  routesByDate: Record<string, DayRoute>;
  /**
   * Templates legados por dia da semana (migração / fallback de partida).
   * Mantidos só para leitura quando ainda existem no Supabase.
   */
  weekdayLegacy: Partial<Record<Weekday, DayRoute>>;
  /** Partida padrão (editável no painel). */
  presetStartAddress: string;
  presetStartLat: number | null;
  presetStartLng: number | null;
  pricePerKm: number;
  finance: FinanceEntry[];
  coordCache: Record<string, { lat: number; lng: number }>;
};

export function emptyRoute(date: string): DayRoute {
  return {
    date,
    startAddress: "",
    startLat: null,
    startLng: null,
    motoboyId: null,
    stops: [],
    totalKm: 0,
    returnToStart: false,
    optimizedAt: null,
    completionStatus: "open",
    motoboyReport: "",
    motoboyCompletedAt: null,
    motoboyCompletedBy: "",
    adminReport: "",
    adminVerifiedAt: null,
    adminVerifiedBy: "",
  };
}

export function getRoute(data: AppData, date: string): DayRoute {
  return data.routesByDate[date] ?? emptyRoute(date);
}

export function createId(): string {
  return crypto.randomUUID();
}

export const DEFAULT_PRICE_PER_KM = 2;

export const FALLBACK_START_ADDRESS =
  "Rua União, 510, Residencial São Pedro, Poá - SP";
