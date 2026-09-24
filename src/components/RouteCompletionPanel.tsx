import { useState } from "react";
import type { DayRoute, RouteCompletionStatus } from "../lib/types";

type Role = "company" | "motoboy";

type Props = {
  route: DayRoute;
  role: Role;
  actorName: string;
  /** Nome do motoboy atribuído à rota (para sinalizar quem concluiu). */
  assignedMotoboyName?: string;
  /** Só permite concluir se a rota tiver conteúdo. */
  canComplete: boolean;
  onUpdate: (next: DayRoute) => void;
};

function statusOf(route: DayRoute): RouteCompletionStatus {
  return route.completionStatus || "open";
}

export function RouteCompletionPanel({
  route,
  role,
  actorName,
  assignedMotoboyName = "",
  canComplete,
  onUpdate,
}: Props) {
  const status = statusOf(route);
  const [boyDraft, setBoyDraft] = useState(route.motoboyReport || "");
  const [adminDraft, setAdminDraft] = useState(route.adminReport || "");
  const [msg, setMsg] = useState("");

  const isAdmin = role === "company";
  const completedByName =
    route.motoboyCompletedBy ||
    assignedMotoboyName ||
    (role === "motoboy" ? actorName : "") ||
    "";

  function markCompletedByBoy() {
    if (!canComplete) {
      setMsg("Monte a rota antes de marcar como concluída.");
      return;
    }
    const who =
      (role === "motoboy" ? actorName : assignedMotoboyName || actorName) ||
      "Motoboy";
    onUpdate({
      ...route,
      completionStatus: "completed",
      motoboyReport: boyDraft.trim(),
      motoboyCompletedAt: new Date().toISOString(),
      motoboyCompletedBy: who,
    });
    setMsg(`Rota concluída por ${who}. Aguardando verificação do administrador.`);
  }

  function markVerifiedByAdmin(opts?: {
    adminReport?: string;
    boyReport?: string;
  }) {
    if (!canComplete && status === "open") {
      setMsg("Não há rota para verificar.");
      return;
    }
    const nextAdmin = (opts?.adminReport ?? adminDraft).trim();
    const nextBoy = (
      route.motoboyReport ||
      opts?.boyReport ||
      boyDraft
    ).trim();
    onUpdate({
      ...route,
      completionStatus: "verified",
      adminReport: nextAdmin,
      adminVerifiedAt: new Date().toISOString(),
      adminVerifiedBy: actorName || "Admin",
      motoboyReport: nextBoy,
      motoboyCompletedAt:
        route.motoboyCompletedAt || new Date().toISOString(),
      motoboyCompletedBy:
        route.motoboyCompletedBy ||
        assignedMotoboyName ||
        (status === "open" ? actorName || "Admin" : route.motoboyCompletedBy),
    });
    setMsg("Rota verificada e concluída pelo administrador.");
  }

  function reopen() {
    onUpdate({
      ...route,
      completionStatus: "open",
      motoboyReport: "",
      motoboyCompletedAt: null,
      motoboyCompletedBy: "",
      adminReport: "",
      adminVerifiedAt: null,
      adminVerifiedBy: "",
    });
    setBoyDraft("");
    setAdminDraft("");
    setMsg("Conclusão reaberta — edição da rota liberada.");
  }

  const badge =
    status === "verified" ? (
      <span className="route-status-badge verified">
        Concluída · verificada
        {completedByName ? ` · ${completedByName}` : ""}
      </span>
    ) : status === "completed" ? (
      <span className="route-status-badge pending">
        Concluída por {completedByName || "motoboy"} · aguarda verificação
      </span>
    ) : (
      <span className="route-status-badge open">Em andamento</span>
    );

  return (
    <div className="route-completion panel-inner">
      <div className="route-completion-head">
        <h3>Conclusão da rota</h3>
        {badge}
      </div>

      {status !== "open" && completedByName ? (
        <div className="status ok" style={{ marginTop: "0.5rem" }}>
          Marcada como concluída por <strong>{completedByName}</strong>
          {route.motoboyCompletedAt
            ? ` · ${new Date(route.motoboyCompletedAt).toLocaleString("pt-BR")}`
            : ""}
        </div>
      ) : null}

      {status !== "open" && route.motoboyReport ? (
        <div className="report-box boy">
          <strong>
            Relatório do motoboy
            {route.motoboyCompletedBy ? ` · ${route.motoboyCompletedBy}` : ""}
          </strong>
          {route.motoboyCompletedAt ? (
            <span className="hint">
              {new Date(route.motoboyCompletedAt).toLocaleString("pt-BR")}
            </span>
          ) : null}
          <p>{route.motoboyReport}</p>
        </div>
      ) : null}

      {status === "verified" && route.adminReport ? (
        <div className="report-box admin">
          <strong>
            Relatório do administrador
            {route.adminVerifiedBy ? ` · ${route.adminVerifiedBy}` : ""}
          </strong>
          {route.adminVerifiedAt ? (
            <span className="hint">
              {new Date(route.adminVerifiedAt).toLocaleString("pt-BR")}
            </span>
          ) : null}
          <p>{route.adminReport}</p>
        </div>
      ) : null}

      {status === "open" && (role === "motoboy" || isAdmin) ? (
        <div className="form-grid" style={{ marginTop: "0.5rem" }}>
          <div className="field">
            <label htmlFor="boy-report">
              Relatório {role === "motoboy" ? "(opcional)" : "do dia (opcional)"}
            </label>
            <textarea
              id="boy-report"
              rows={3}
              value={boyDraft}
              onChange={(e) => setBoyDraft(e.target.value)}
              placeholder="Como foi a rota, imprevistos, cliente ausente…"
            />
          </div>
          {role === "motoboy" ? (
            <button
              type="button"
              className="btn primary"
              disabled={!canComplete}
              onClick={markCompletedByBoy}
            >
              Marcar rota como concluída
            </button>
          ) : (
            <div className="row-actions">
              <button
                type="button"
                className="btn"
                disabled={!canComplete}
                onClick={markCompletedByBoy}
              >
                Registrar conclusão (sem verificar)
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!canComplete}
                onClick={() =>
                  markVerifiedByAdmin({
                    adminReport: adminDraft || boyDraft,
                    boyReport: boyDraft,
                  })
                }
              >
                Concluir e verificar
              </button>
            </div>
          )}
        </div>
      ) : null}

      {status === "completed" && isAdmin ? (
        <div className="form-grid" style={{ marginTop: "0.75rem" }}>
          <p className="hint">
            Concluída por <strong>{completedByName || "motoboy"}</strong>. Leia o
            relatório acima, acrescente o seu (opcional) e marque como
            verificada.
          </p>
          <div className="field">
            <label htmlFor="admin-report">Relatório do administrador (opcional)</label>
            <textarea
              id="admin-report"
              rows={3}
              value={adminDraft}
              onChange={(e) => setAdminDraft(e.target.value)}
              placeholder="Conferência, observações internas…"
            />
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => markVerifiedByAdmin()}
            >
              Marcar como verificada
            </button>
            <button type="button" className="btn ghost" onClick={reopen}>
              Reabrir
            </button>
          </div>
        </div>
      ) : null}

      {status === "completed" && role === "motoboy" ? (
        <p className="hint" style={{ marginTop: "0.65rem" }}>
          Concluída por você
          {completedByName ? ` (${completedByName})` : ""}. O administrador ainda
          precisa verificar.
        </p>
      ) : null}

      {status === "verified" && isAdmin ? (
        <div className="row-actions" style={{ marginTop: "0.65rem" }}>
          <button type="button" className="btn ghost" onClick={reopen}>
            Reabrir conclusão
          </button>
        </div>
      ) : null}

      {msg ? <p className="hint" style={{ marginTop: "0.5rem" }}>{msg}</p> : null}
    </div>
  );
}

export function completionDotClass(route: DayRoute): string {
  const s = statusOf(route);
  if (s === "verified") return "dot verified";
  if (s === "completed") return "dot pending";
  return "dot";
}
