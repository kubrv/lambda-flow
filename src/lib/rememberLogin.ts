import type { AuthRole } from "./auth";

const STORAGE_KEY = "lambda-flow.remember-login.v1";

export type RememberedLogin = {
  role: AuthRole;
  /** Usuário ou e-mail (motoboy) / e-mail (empresa). */
  login: string;
  password: string;
};

export function loadRememberedLogin(): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLogin>;
    if (
      (parsed.role !== "motoboy" && parsed.role !== "company") ||
      typeof parsed.login !== "string" ||
      typeof parsed.password !== "string"
    ) {
      return null;
    }
    if (!parsed.login.trim() || !parsed.password) return null;
    return {
      role: parsed.role,
      login: parsed.login,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

export function saveRememberedLogin(data: RememberedLogin): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      role: data.role,
      login: data.login.trim(),
      password: data.password,
    }),
  );
}

export function clearRememberedLogin(): void {
  localStorage.removeItem(STORAGE_KEY);
}
