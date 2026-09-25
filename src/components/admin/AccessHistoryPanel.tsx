import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";

export type AccessLogRow = {
  id: string;
  email: string;
  fullName: string;
  event: string;
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const sb = getSupabase();
        const { data, error: err } = await sb
          .from("company_access_log")
          .select("id,email,full_name,event,created_at,user_agent")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(80);
        if (err) throw err;
        if (cancelled) return;
        setRows(
          ((data || []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id),
            email: String(r.email || ""),
            fullName: String(r.full_name || ""),
            event: String(r.event || "login"),
            createdAt: String(r.created_at || ""),
            userAgent: r.user_agent ? String(r.user_agent) : undefined,
          })),
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

  return (
    <section className="panel" style={{ marginTop: "1rem" }}>
      <h2>Histórico de acessos</h2>
      <p className="lede">
        Somente para o administrador da empresa — registra entradas no painel.
      </p>
      {loading ? <p className="hint">Carregando…</p> : null}
      {error ? <div className="status err">{error}</div> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="empty">Nenhum acesso registrado ainda.</div>
      ) : null}
      {rows.length ? (
        <ul className="access-log-list">
          {rows.map((r) => (
            <li key={r.id} className="access-log-item">
              <div>
                <strong>{r.fullName || r.email || "Admin"}</strong>
                <span className="access-log-event">{r.event}</span>
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
}): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("company_access_log").insert({
      company_id: input.companyId,
      user_id: input.userId,
      email: input.email || null,
      full_name: input.fullName || null,
      event: input.event || "login",
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
    });
  } catch {
    // Silencioso — não bloqueia o app se a tabela ainda não existir
  }
}
