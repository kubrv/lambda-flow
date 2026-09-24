import { BrandLogo } from "./BrandLogo";

type Props = {
  title?: string;
  subtitle?: string;
  onSignOut?: () => void;
  onOpenAdmin?: () => void;
  onOpenPublic?: () => void;
  onOpenProfile?: () => void;
  showAdminLink?: boolean;
  showProfileLink?: boolean;
  view?: "public" | "admin" | "profile";
};

export function Header({
  subtitle = "Rotas · Waze & Maps",
  onSignOut,
  onOpenAdmin,
  onOpenPublic,
  onOpenProfile,
  showAdminLink,
  showProfileLink,
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
        {showProfileLink ? (
          view === "profile" ? (
            <button type="button" onClick={onOpenPublic}>
              ver rotas
            </button>
          ) : (
            <button type="button" onClick={onOpenProfile}>
              perfil
            </button>
          )
        ) : null}
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
