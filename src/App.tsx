import { useEffect, useRef, useState } from "react";
import { AdminPanel } from "./components/AdminPanel";
import { DayTabs } from "./components/DayTabs";
import { Header } from "./components/Header";
import { RouteView } from "./components/RouteView";
import { isSupabaseConfigured } from "./lib/supabase";
import { loadData, saveData } from "./lib/storage";
import type { AppData, Weekday } from "./lib/types";

const ADMIN_KEY = "lambda-flow:admin";

function todayWeekday(): Weekday {
  const map: Weekday[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return map[new Date().getDay()];
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [day, setDay] = useState<Weekday>(() => todayWeekday());
  const [isAdmin, setIsAdmin] = useState(
    () => sessionStorage.getItem(ADMIN_KEY) === "1",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipFirstSave = useRef(true);

  useEffect(() => {
    void (async () => {
      try {
        if (!isSupabaseConfigured()) {
          setLoadError(
            "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Vercel.",
          );
          return;
        }
        const loaded = await loadData();
        setData(loaded);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Falha ao carregar dados",
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!data) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void saveData(data)
        .then(() => setSaveError(null))
        .catch((err: unknown) => {
          setSaveError(
            err instanceof Error ? err.message : "Falha ao salvar no Supabase",
          );
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [data]);

  function unlockAdmin() {
    sessionStorage.setItem(ADMIN_KEY, "1");
    setIsAdmin(true);
  }

  function lockAdmin() {
    sessionStorage.removeItem(ADMIN_KEY);
    setIsAdmin(false);
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <div className="status err">{loadError}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-shell">
        <p className="hint">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        isAdmin={isAdmin}
        onUnlock={unlockAdmin}
        onLock={lockAdmin}
      />

      {saveError ? (
        <div className="status err" style={{ marginBottom: "1rem" }}>
          {saveError}
        </div>
      ) : null}

      <DayTabs value={day} onChange={setDay} />
      <RouteView day={day} route={data.routes[day]} motoboys={data.motoboys} />
      {isAdmin ? (
        <AdminPanel data={data} day={day} onChange={setData} />
      ) : null}
    </div>
  );
}
