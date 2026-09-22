import { BrandLogo } from "./BrandLogo";

type Props = {
  title?: string;
  subtitle?: string;
  onSignOut?: () => void;
  onOpenAdmin?: () => void;
  onOpenPublic?: () => void;
  showAdminLink?: boolean;
  view?: "public" | "admin";
};

export function Header({
  subtitle = "Rotas · Waze & Maps",
  onSignOut,
  onOpenAdmin,
  onOpenPublic,
  showAdminLink,
  view = "public",
}: Props) {
  return (
    <header className="site-header">
      <div className="logo-hit" aria-label="Lambda-Flow">
        <BrandLogo height={42} />
        {subtitle ? (
          <span className="logo-copy logo-copy-only">
            <span>{subtitle}</span>
          </span>
        ) : null}
      </div>

      <div className="admin-pill">
        {showAdminLink ? (
          view === "admin" ? (
            <button type="button" onClick={onOpenPublic}>
              ver rotas
            </button>
          ) : (
            <button type="button" onClick={onOpenAdmin}>
              painel
            </button>
          )
        ) : null}
        {onSignOut ? (
          <button type="button" onClick={onSignOut} aria-label="Sair">
            sair
          </button>
        ) : null}
      </div>
    </header>
  );
}
