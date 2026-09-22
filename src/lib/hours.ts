export type HoursPeriod = {
  open: string;
  close: string;
};

/** Padrão: 9h–12h e 13h–17h */
export const DEFAULT_HOURS_PERIODS: HoursPeriod[] = [
  { open: "09:00", close: "12:00" },
  { open: "13:00", close: "17:00" },
];

export function cloneDefaultHours(): HoursPeriod[] {
  return DEFAULT_HOURS_PERIODS.map((p) => ({ ...p }));
}

export function normalizeHoursPeriods(raw: unknown): HoursPeriod[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return cloneDefaultHours();
  }
  const out: HoursPeriod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const open = String((item as HoursPeriod).open || "").trim();
    const close = String((item as HoursPeriod).close || "").trim();
    if (!/^\d{1,2}:\d{2}$/.test(open) || !/^\d{1,2}:\d{2}$/.test(close)) {
      continue;
    }
    out.push({
      open: open.padStart(5, "0"),
      close: close.padStart(5, "0"),
    });
  }
  return out.length ? out : cloneDefaultHours();
}

/** "09:00" → "9h" | "09:30" → "9h30" */
function formatClock(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = String(Number(hRaw));
  const m = mRaw || "00";
  if (m === "00") return `${h}h`;
  return `${h}h${m}`;
}

export function formatHoursLabel(
  periods: HoursPeriod[] | null | undefined,
): string {
  if (!periods?.length) return "";
  return periods
    .map((p) => `${formatClock(p.open)}–${formatClock(p.close)}`)
    .join(" · ");
}

export function hoursEqualDefault(periods: HoursPeriod[]): boolean {
  if (periods.length !== DEFAULT_HOURS_PERIODS.length) return false;
  return periods.every(
    (p, i) =>
      p.open === DEFAULT_HOURS_PERIODS[i].open &&
      p.close === DEFAULT_HOURS_PERIODS[i].close,
  );
}
