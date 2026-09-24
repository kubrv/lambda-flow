import { APP_BUILD_TIME, APP_VERSION, LEGAL_NOTICE } from "../lib/version";

type Props = {
  className?: string;
  compact?: boolean;
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

export function SiteFooter({ className = "", compact = false }: Props) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <p className="site-footer-legal">{LEGAL_NOTICE}</p>
      <p
        className="site-footer-meta"
        title="Atualizada automaticamente a cada commit e deploy"
      >
        {compact ? null : <span>Lambda-Flow</span>}
        <span className="site-footer-version">versão {APP_VERSION}</span>
        <span className="site-footer-build">
          build {formatBuildTime(APP_BUILD_TIME)}
        </span>
      </p>
    </footer>
  );
}
