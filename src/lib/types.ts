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

export type Motoboy = {
  id: string;
  name: string;
  phone?: string;
};

/** Endereço cadastrado uma vez e reutilizável em qualquer dia. */
export type SavedAddress = {
  id: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

export type Stop = {
  id: string;
  addressId?: string | null;
  address: string;
  label?: string;
  lat: number | null;
  lng: number | null;
};

export type DayRoute = {
  day: Weekday;
  startAddress: string;
  startLat: number | null;
  startLng: number | null;
  motoboyId: string | null;
  stops: Stop[];
  totalKm: number;
  optimizedAt: string | null;
};

export type AppData = {
  motoboys: Motoboy[];
  addresses: SavedAddress[];
  routes: Record<Weekday, DayRoute>;
  /** Cache de coordenadas por endereço normalizado. */
  coordCache: Record<string, { lat: number; lng: number }>;
};

export function emptyRoute(day: Weekday): DayRoute {
  return {
    day,
    startAddress: "",
    startLat: null,
    startLng: null,
    motoboyId: null,
    stops: [],
    totalKm: 0,
    optimizedAt: null,
  };
}

export function createId(): string {
  return crypto.randomUUID();
}
