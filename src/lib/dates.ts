import type { Weekday } from "./types";
import { WEEKDAYS } from "./types";

const WEEKDAY_BY_JS: Weekday[] = [
  "dom",
  "seg",
  "ter",
  "qua",
  "qui",
  "sex",
  "sab",
];

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function weekdayFromDateKey(key: string): Weekday {
  return WEEKDAY_BY_JS[parseDateKey(key).getDay()];
}

export function formatDateLabel(key: string): string {
  const d = parseDateKey(key);
  const wd = WEEKDAYS.find((w) => w.id === weekdayFromDateKey(key))?.label ?? "";
  return `${wd}, ${d.toLocaleDateString("pt-BR")}`;
}

export function formatDateShort(key: string): string {
  return parseDateKey(key).toLocaleDateString("pt-BR");
}

/** Todas as datas YYYY-MM-DD entre from e to (inclusive). */
export function dateKeysInRange(from: string, to: string): string[] {
  if (!from || !to) return [];
  const startKey = from <= to ? from : to;
  const endKey = from <= to ? to : from;
  const out: string[] = [];
  let cur = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  while (cur.getTime() <= end.getTime()) {
    out.push(localDateKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

export function monthLabel(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1);
  const raw = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function dateKeysInMonth(year: number, monthIndex: number): string[] {
  const total = daysInMonth(year, monthIndex);
  const keys: string[] = [];
  for (let day = 1; day <= total; day++) {
    keys.push(
      `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return keys;
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}
