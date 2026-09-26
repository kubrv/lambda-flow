import { BrandLogo } from "./BrandLogo";

type Props = {
  title?: string;
  subtitle?: string;
  companyName?: string | null;
  onSignOut?: () => void;
  onOpenAdmin?: () => void;
  onOpenPublic?: () => void;
  onOpenProfile?: () => void;
  showAdminLink?: boolean;
  showProfileLink?: boolean;
  showMasterLink?: boolean;
  onOpenMaster?: () => void;
  view?: "public" | "admin" | "profile" | "master";
};

export function Header({
  subtitle = "Rotas · Waze & Maps",
  companyName,
  onSignOut,
  onOpenAdmin,
  onOpenPublic,
  onOpenProfile,
  onOpenMaster,
  showAdminLink,
  showProfileLink,
  showMasterLink,
  view = "public",
}: Props) {
  return (
    <header className="site-header">
      <div className="logo-hit" aria-label="Rotaz">
        <BrandLogo
          height={40}
          companyName={companyName || undefined}
          tagline={subtitle || undefined}
        />
      </div>

      <div className="admin-pill">
        {showMasterLink ? (
          view === "master" ? (
            <button type="button" onClick={onOpenAdmin}>
              painel empresa
            </button>
          ) : (
            <button type="button" onClick={onOpenMaster}>
              painel master
            </button>
          )
        ) : null}
        {showProfileLink ? (
          view === "profile" ? (
            <button type="button" onClick={onOpenPublic}>
              Visualizar rotas como motoboy
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
              Visualizar rotas como motoboy
            </button>
          ) : view !== "master" ? (
            <button type="button" onClick={onOpenAdmin}>
              painel admin
            </button>
          ) : null
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
