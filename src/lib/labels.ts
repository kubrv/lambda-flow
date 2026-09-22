import { normalizeAddress } from "./parseAddress";

export const DEFAULT_START_ADDRESS =
  "Rua União, 510, Residencial São Pedro, Poá - SP";

export function isAutoStopLabel(label?: string | null): boolean {
  return !label?.trim() || /^parada\s*\d+$/i.test(label.trim());
}

/** Apelido limpo (nunca "Parada N"). */
export function cleanNickname(
  label?: string | null,
  address?: string,
): string {
  const t = (label || "").trim();
  if (!t || isAutoStopLabel(t)) {
    return address?.split(",")[0].trim() || "Endereço";
  }
  return t;
}

export function isDefaultStart(address: string): boolean {
  return normalizeAddress(address) === normalizeAddress(DEFAULT_START_ADDRESS);
}

/** Título na visão do motoboy: Parada 1 - Apelido */
export function motoboyStopTitle(index: number, label?: string | null, address?: string): string {
  return `Parada ${index + 1} - ${cleanNickname(label, address)}`;
}
