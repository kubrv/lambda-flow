import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";

export type AccessLogRole = "company" | "motoboy" | "all";

export type AccessLogRow = {
  id: string;
  email: string;
  fullName: string;
  event: string;
  role: "company" | "motoboy" | "";
  createdAt: string;
  userAgent?: string;
};

type Props = {
  companyId: string;
};

export function AccessHistoryPanel({ companyId }: Props) {
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AccessLogRole>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const sb = getSupabase();
        const { data, error: err } = await sb
          .from("company_access_log")
          .select("id,email,full_name,event,created_at,user_agent,role")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(120);
        if (err) throw err;
        if (cancelled) return;
        setRows(
          ((data || []) as Record<string, unknown>[]).map((r) => {
            const roleRaw = String(r.role || "").toLowerCase();
            const role =
              roleRaw === "motoboy"
                ? "motoboy"
                : roleRaw === "company"
                  ? "company"
                  : "";
            return {
              id: String(r.id),
              email: String(r.email || ""),
              fullName: String(r.full_name || ""),
              event: String(r.event || "login"),
              role,
              createdAt: String(r.created_at || ""),
              userAgent: r.user_agent ? String(r.user_agent) : undefined,
            };
          }),
        );
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message.includes("company_access_log") ||
                /schema cache|does not exist/i.test(e.message)
                ? "Rode supabase/migration_company_access_log.sql no Supabase."
                : e.message
              : "Falha ao carregar histórico.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => {
      if (filter === "motoboy") return r.role === "motoboy";
      // Empresa: company explícito OU legado (sem role = admin antigo)
      return r.role === "company" || r.role === "";
    });
  }, [rows, filter]);

  return (
    <section className="panel" style={{ marginTop: "1rem" }}>
      <h2>Histórico de acessos</h2>
      <p className="lede">
        Entradas no sistema — filtre por empresas ou motoboys.
      </p>

      <div className="access-log-filters" role="tablist" aria-label="Filtro">
        {(
          [
            ["all", "Todos"],
            ["motoboy", "Motoboys"],
            ["company", "Empresas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`btn ${filter === id ? "primary" : "ghost"}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="hint">Carregando…</p> : null}
      {error ? <div className="status err">{error}</div> : null}
      {!loading && !error && filtered.length === 0 ? (
        <div className="empty">Nenhum acesso neste filtro.</div>
      ) : null}
      {filtered.length ? (
        <ul className="access-log-list">
          {filtered.map((r) => (
            <li key={r.id} className="access-log-item">
              <div>
                <strong>{r.fullName || r.email || "Usuário"}</strong>
                <span className="access-log-event">{r.event}</span>
                <span
                  className={`access-log-role ${r.role === "motoboy" ? "moto" : "empresa"}`}
                >
                  {r.role === "motoboy"
                    ? "Motoboy"
                    : r.role === "company"
                      ? "Empresa"
                      : "Empresa"}
                </span>
              </div>
              <small>
                {r.createdAt
                  ? new Date(r.createdAt).toLocaleString("pt-BR")
                  : "—"}
                {r.email ? ` · ${r.email}` : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export async function logCompanyAccess(input: {
  companyId: string;
  userId: string;
  email?: string;
  fullName?: string;
  event?: string;
  role?: "company" | "motoboy";
  motoboyId?: string | null;
}): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("company_access_log").insert({
      company_id: input.companyId,
      user_id: input.userId,
      email: input.email || null,
      full_name: input.fullName || null,
      event: input.event || "login",
      role: input.role || "company",
      motoboy_id: input.motoboyId || null,
      user_agent:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 240)
          : null,
    });
  } catch {
    // Silencioso — não bloqueia o app se a tabela ainda não existir
  }
}
