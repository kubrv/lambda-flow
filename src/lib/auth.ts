import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

export type AuthRole = "company" | "motoboy";

export type Company = {
  id: string;
  name: string;
  slug: string | null;
  planPrice: number;
  planStatus: "active" | "pending" | "expired" | "trial";
  planPaidUntil: string | null;
  ownerUserId: string | null;
};

export type Profile = {
  userId: string;
  role: AuthRole;
  companyId: string | null;
  motoboyId: string | null;
  fullName: string;
  email: string;
  username?: string | null;
};

export type InviteCode = {
  id: string;
  companyId: string;
  code: string;
  role: AuthRole;
  label: string;
  maxUses: number;
  uses: number;
  active: boolean;
};

export const LAMBDA_COMPANY_ID = "a0000000-0000-4000-8000-000000000001";
export const LAMBDA_EMAIL = "geral@lambdaddentallab.com";
export const PLAN_PRICE_BRL = 40;

export function mapCompany(row: Record<string, unknown>): Company {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    slug: (row.slug as string) || null,
    planPrice: Number(row.plan_price ?? PLAN_PRICE_BRL),
    planStatus: (row.plan_status as Company["planStatus"]) || "pending",
    planPaidUntil: (row.plan_paid_until as string) || null,
    ownerUserId: (row.owner_user_id as string) || null,
  };
}

export function mapProfile(row: Record<string, unknown>): Profile {
  return {
    userId: String(row.user_id),
    role: row.role as AuthRole,
    companyId: (row.company_id as string) || null,
    motoboyId: (row.motoboy_id as string) || null,
    fullName: String(row.full_name || ""),
    email: String(row.email || ""),
    username: (row.username as string) || null,
  };
}

async function callMotoboyAccount(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/motoboy-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    throw new Error(String(json.error || "Falha na operação de conta."));
  }
  return json;
}

/** Resolve usuário ou e-mail para o e-mail real do Auth. */
export async function resolveLoginEmail(login: string): Promise<string> {
  const trimmed = login.trim();
  if (!trimmed) throw new Error("Informe usuário ou e-mail.");
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const json = await callMotoboyAccount({
    action: "resolve-login",
    login: trimmed,
  });
  return String(json.email || "").toLowerCase();
}

export async function signInWithLogin(login: string, password: string) {
  const email = await resolveLoginEmail(login);
  return signIn(email, password);
}

export async function completeMotoboyFirstAccess(input: {
  login: string;
  accessCode: string;
  password: string;
}) {
  return callMotoboyAccount({
    action: "first-access",
    login: input.login,
    accessCode: input.accessCode,
    password: input.password,
  });
}

export async function provisionMotoboyAccount(input: {
  motoboyId: string;
  name: string;
  username?: string;
  phone: string;
  email: string;
}) {
  return callMotoboyAccount({
    action: "provision",
    ...input,
  });
}

export async function adminSetMotoboyPassword(
  motoboyId: string,
  newPassword: string,
) {
  return callMotoboyAccount({
    action: "admin-set-password",
    motoboyId,
    newPassword,
  });
}

/** Motoboy logado altera a própria senha (confirma a atual). */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < 6) {
    throw new Error("Nova senha com no mínimo 6 caracteres.");
  }
  const sb = getSupabase();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user?.email) {
    throw new Error("Faça login novamente para alterar a senha.");
  }
  const email = userData.user.email;
  const { error: checkErr } = await sb.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (checkErr) throw new Error("Senha atual incorreta.");
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Zera o acesso de um motoboy (mantém cadastro). */
export async function resetOneMotoboyLogin(motoboyId: string) {
  return callMotoboyAccount({
    action: "reset-one-login",
    motoboyId,
  });
}

/** @deprecated use resetOneMotoboyLogin */
export async function resetAllMotoboyLogins() {
  return callMotoboyAccount({
    action: "reset-all-logins",
  });
}

export function companyHasActivePlan(company: Company | null): boolean {
  if (!company) return false;
  if (company.planStatus === "active" || company.planStatus === "trial") {
    if (!company.planPaidUntil) return true;
    return new Date(company.planPaidUntil).getTime() > Date.now();
  }
  return false;
}

export async function fetchSession(): Promise<Session | null> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as Record<string, unknown>);
}

export async function fetchCompany(
  companyId: string,
): Promise<Company | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return mapCompany(data as Record<string, unknown>);
}

export async function signIn(email: string, password: string) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = getSupabase();
  await sb.auth.signOut();
}

export async function lookupInviteCode(code: string): Promise<InviteCode | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("invite_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    code: String(row.code),
    role: row.role as AuthRole,
    label: String(row.label || ""),
    maxUses: Number(row.max_uses || 0),
    uses: Number(row.uses || 0),
    active: Boolean(row.active),
  };
}

export async function registerWithCode(input: {
  role: AuthRole;
  fullName: string;
  email: string;
  password: string;
  inviteCode: string;
}): Promise<{ user: User }> {
  if (input.role === "motoboy") {
    throw new Error(
      "Motoboys não usam código de convite. Peça o 1º acesso à empresa.",
    );
  }
  const invite = await lookupInviteCode(input.inviteCode);
  if (!invite) throw new Error("Código inválido ou inativo.");
  if (invite.role !== input.role) {
    throw new Error(
      input.role === "company"
        ? "Este código não é para empresa."
        : "Este código não é para motoboy.",
    );
  }
  if (invite.uses >= invite.maxUses) {
    throw new Error("Este código já atingiu o limite de usos.");
  }

  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        role: input.role,
        invite_code: invite.code,
        company_id: invite.companyId,
      },
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("Falha ao criar usuário.");

  const { error: profileErr } = await sb.from("profiles").upsert({
    user_id: data.user.id,
    role: input.role,
    company_id: invite.companyId,
    full_name: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
  });
  if (profileErr) throw profileErr;

  await sb
    .from("invite_codes")
    .update({ uses: invite.uses + 1 })
    .eq("id", invite.id);

  if (input.role === "company") {
    await sb
      .from("companies")
      .update({ owner_user_id: data.user.id })
      .eq("id", invite.companyId)
      .is("owner_user_id", null);
  }

  return { user: data.user };
}

export async function listInviteCodes(companyId: string): Promise<InviteCode[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("invite_codes")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      code: String(r.code),
      role: r.role as AuthRole,
      label: String(r.label || ""),
      maxUses: Number(r.max_uses || 0),
      uses: Number(r.uses || 0),
      active: Boolean(r.active),
    };
  });
}

export async function createInviteCode(input: {
  companyId: string;
  role: AuthRole;
  label: string;
  maxUses?: number;
}): Promise<InviteCode> {
  const sb = getSupabase();
  const code = `${input.role === "company" ? "EMP" : "MOTO"}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const { data, error } = await sb
    .from("invite_codes")
    .insert({
      company_id: input.companyId,
      code,
      role: input.role,
      label: input.label.trim() || (input.role === "company" ? "Equipe" : "Motoboy"),
      max_uses: input.maxUses ?? 50,
    })
    .select("*")
    .single();
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    code: String(r.code),
    role: r.role as AuthRole,
    label: String(r.label || ""),
    maxUses: Number(r.max_uses || 0),
    uses: Number(r.uses || 0),
    active: Boolean(r.active),
  };
}

export function generateRandomCode(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now()
    .toString(36)
    .toUpperCase()
    .slice(-4)}`;
}
