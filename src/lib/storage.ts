import type { AppData, DayRoute, Motoboy, Weekday } from "./types";
import { WEEKDAYS, emptyRoute } from "./types";

const STORAGE_KEY = "lambda-flow:v1";

function defaultData(): AppData {
  const routes = Object.fromEntries(
    WEEKDAYS.map((d) => [d.id, emptyRoute(d.id)]),
  ) as Record<Weekday, DayRoute>;

  return {
    motoboys: [
      { id: crypto.randomUUID(), name: "Motoboy 1" },
      { id: crypto.randomUUID(), name: "Motoboy 2" },
    ],
    routes,
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw) as AppData;
    for (const d of WEEKDAYS) {
      if (!parsed.routes[d.id]) parsed.routes[d.id] = emptyRoute(d.id);
    }
    if (!Array.isArray(parsed.motoboys)) parsed.motoboys = [];
    return parsed;
  } catch {
    return defaultData();
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function upsertMotoboy(data: AppData, motoboy: Motoboy): AppData {
  const idx = data.motoboys.findIndex((m) => m.id === motoboy.id);
  const motoboys = [...data.motoboys];
  if (idx >= 0) motoboys[idx] = motoboy;
  else motoboys.push(motoboy);
  return { ...data, motoboys };
}

export function removeMotoboy(data: AppData, id: string): AppData {
  const motoboys = data.motoboys.filter((m) => m.id !== id);
  const routes = { ...data.routes };
  for (const day of WEEKDAYS) {
    if (routes[day.id].motoboyId === id) {
      routes[day.id] = { ...routes[day.id], motoboyId: null };
    }
  }
  return { ...data, motoboys, routes };
}
