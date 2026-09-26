import { APP_BUILD_TIME, APP_VERSION, LEGAL_NOTICE } from "../lib/version";
import { BrandLogo } from "./BrandLogo";

type Props = {
  className?: string;
  compact?: boolean;
  /** Se true, renderiza como <div> (para aninhar dentro de outro footer). */
  asDiv?: boolean;
  /** Esconde o logo (útil quando a página já tem marca no topo). */
  hideLogo?: boolean;
};

function formatBuildTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SiteFooter({
  className = "",
  compact = false,
  asDiv = false,
  hideLogo = false,
}: Props) {
  const Tag = asDiv ? "div" : "footer";
  return (
    <Tag className={`site-footer ${compact ? "compact" : ""} ${className}`.trim()}>
      {!hideLogo ? (
        <div className="site-footer-brand">
          <BrandLogo height={compact ? 28 : 34} tagline="Rotas · Maps · Waze" />
        </div>
      ) : null}
      <p className="site-footer-legal">{LEGAL_NOTICE}</p>
      <p
        className="site-footer-meta"
        title="Atualizada automaticamente a cada commit e deploy"
      >
        <span className="site-footer-version">v{APP_VERSION}</span>
        <span className="site-footer-sep" aria-hidden>
          ·
        </span>
        <span className="site-footer-build">
          build {formatBuildTime(APP_BUILD_TIME)}
        </span>
      </p>
    </Tag>
  );
}
