import { APP_VERSION, LEGAL_NOTICE } from "../lib/version";

type Props = {
  className?: string;
  compact?: boolean;
};

export function SiteFooter({ className = "", compact = false }: Props) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <p className="site-footer-legal">{LEGAL_NOTICE}</p>
      <p className="site-footer-meta" title="Versão gerada no build a partir do commit">
        {compact ? null : <span>Lambda-Flow</span>}
        <span className="site-footer-version">versão {APP_VERSION}</span>
      </p>
    </footer>
  );
}
