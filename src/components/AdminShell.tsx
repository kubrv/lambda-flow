import { MonthCalendar } from "./MonthCalendar";
import { AccessHistoryPanel } from "./admin/AccessHistoryPanel";
import { AddressesAdmin } from "./admin/AddressesAdmin";
import { FinanceAdmin } from "./admin/FinanceAdmin";
import { MotoboysAdmin } from "./admin/MotoboysAdmin";
import { RouteEditor } from "./admin/RouteEditor";
import { ValuesAdmin } from "./admin/ValuesAdmin";
import { BillingScreen } from "./billing/BillingScreen";
import type { Company } from "../lib/auth";
import type { AppData } from "../lib/types";

export type AdminTab =
  | "rotas"
  | "enderecos"
  | "motoboys"
  | "valores"
  | "financeiro"
  | "plano"
  | "acessos";

type Props = {
  data: AppData;
  date: string;
  year: number;
  monthIndex: number;
  tab: AdminTab;
  company: Company | null;
  onTabChange: (tab: AdminTab) => void;
  onChange: (next: AppData) => void;
  onSelectDate: (date: string) => void;
  onMonthChange: (year: number, monthIndex: number) => void;
  onBackToRoutes: () => void;
  onRefreshCompany: () => void;
};

const TABS: { id: AdminTab; label: string }[] = [
  { id: "rotas", label: "Rotas do mês" },
  { id: "enderecos", label: "Endereços" },
  { id: "motoboys", label: "Motoboys" },
  { id: "valores", label: "Partida" },
  { id: "financeiro", label: "Financeiro" },
  { id: "plano", label: "Meu plano" },
  { id: "acessos", label: "Histórico de acessos" },
];

export function AdminShell({
  data,
  date,
  year,
  monthIndex,
  tab,
  company,
  onTabChange,
  onChange,
  onSelectDate,
  onMonthChange,
  onBackToRoutes,
  onRefreshCompany,
}: Props) {
  return (
    <div className="admin-shell">
      <div className="admin-mode-banner" role="status">
        <span className="admin-mode-badge">Modo administrador</span>
        <span className="admin-mode-company">
          Empresa: <strong>{company?.name || "—"}</strong>
        </span>
      </div>
      <div className="admin-shell-head">
        <div>
          <h1>Painel da empresa · {company?.name || "Empresa"}</h1>
          <p className="lede" style={{ margin: 0 }}>
            Você está no painel administrador — cadastre endereços, rotas,
            motoboys e financeiro desta empresa.
          </p>
        </div>
        <button type="button" className="btn" onClick={onBackToRoutes}>
          Visualizar rotas como motoboy
        </button>
      </div>

      <nav className="admin-tabs" aria-label="Seções do admin">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`admin-tab${tab === t.id ? " active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "rotas" ? (
        <div className="admin-rotas-layout">
          <MonthCalendar
            year={year}
            monthIndex={monthIndex}
            selectedDate={date}
            data={data}
            onMonthChange={onMonthChange}
            onSelectDate={onSelectDate}
          />
          <RouteEditor
            data={data}
            date={date}
            year={year}
            monthIndex={monthIndex}
            onChange={onChange}
            actorName={company?.name || "Admin"}
          />
        </div>
      ) : null}

      {tab === "enderecos" ? (
        <AddressesAdmin data={data} onChange={onChange} />
      ) : null}
      {tab === "motoboys" ? (
        <MotoboysAdmin data={data} onChange={onChange} />
      ) : null}
      {tab === "valores" ? (
        <ValuesAdmin data={data} onChange={onChange} />
      ) : null}
      {tab === "financeiro" ? (
        <FinanceAdmin data={data} onChange={onChange} />
      ) : null}
      {tab === "plano" && company ? (
        <BillingScreen company={company} onRefresh={onRefreshCompany} />
      ) : null}
      {tab === "acessos" && company ? (
        <AccessHistoryPanel companyId={company.id} />
      ) : null}
    </div>
  );
}
