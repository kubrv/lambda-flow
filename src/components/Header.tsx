import { useCallback, useRef, useState } from "react";

type Props = {
  isAdmin: boolean;
  onUnlock: () => void;
  onLock: () => void;
};

const CLICKS_NEEDED = 5;
const WINDOW_MS = 2500;

export function Header({ isAdmin, onUnlock, onLock }: Props) {
  const clicks = useRef(0);
  const timer = useRef<number | null>(null);
  const [pulse, setPulse] = useState(0);

  const onLogoClick = useCallback(() => {
    if (isAdmin) return;

    clicks.current += 1;
    setPulse(clicks.current);

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      clicks.current = 0;
      setPulse(0);
    }, WINDOW_MS);

    if (clicks.current >= CLICKS_NEEDED) {
      clicks.current = 0;
      setPulse(0);
      if (timer.current) window.clearTimeout(timer.current);
      onUnlock();
    }
  }, [isAdmin, onUnlock]);

  return (
    <header className="site-header">
      <button
        type="button"
        className="logo-hit"
        onClick={onLogoClick}
        aria-label="Lambda-Flow"
        title={isAdmin ? "Lambda-Flow" : undefined}
      >
        <img src="/badge.svg" alt="" width={52} height={52} />
        <span className="logo-copy">
          <strong>Lambda-Flow</strong>
          <span>
            {isAdmin
              ? "Modo administrador"
              : pulse > 0
                ? `Acesso… ${pulse}/${CLICKS_NEEDED}`
                : "Rotas do dia · Waze & Maps"}
          </span>
        </span>
      </button>

      {isAdmin ? (
        <div className="admin-pill">
          Admin ativo
          <button type="button" onClick={onLock} aria-label="Sair do admin">
            sair
          </button>
        </div>
      ) : null}
    </header>
  );
}
