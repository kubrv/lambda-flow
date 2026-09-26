import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell, type AdminTab } from "./components/AdminShell";
import { MasterAdminPanel } from "./components/admin/MasterAdminPanel";
import { AuthScreen } from "./components/auth/AuthScreen";
import { CompanySignupScreen } from "./components/auth/CompanySignupScreen";
import { BillingScreen } from "./components/billing/BillingScreen";
import { Header } from "./components/Header";
import { LandingPage } from "./components/landing/LandingPage";
import { MonthCalendar } from "./components/MonthCalendar";
import { MotoboyPrefsPanel } from "./components/MotoboyPrefsPanel";
import { RouteView } from "./components/RouteView";
import { WhatsAppFloat } from "./components/WhatsAppFloat";
import { SiteFooter } from "./components/SiteFooter";
import {
  LAMBDA_COMPANY_ID,
  type Company,
  type Profile,
  companyHasActivePlan,
  fetchCompany,
  fetchProfile,
  fetchSession,
  signOut,
} from "./lib/auth";
import { localDateKey } from "./lib/dates";
import { getSupabase, isSupabaseConfigured } from "./lib/supabase";
import { loadData, saveData } from "./lib/storage";
import type { AppData } from "./lib/types";
import { getRoute } from "./lib/types";
import { logCompanyAccess } from "./components/admin/AccessHistoryPanel";
import { BrandLogo } from "./components/BrandLogo";

type Gate = "landing" | "auth" | "signup" | "maintenance";

function BrandLogoGate() {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <BrandLogo height={48} />
    </div>
  );
}

export default function App() {
  const today = localDateKey();
  const todayDate = new Date();
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [date, setDate] = useState(today);
  const [year, setYear] = useState(todayDate.getFullYear());
  const [monthIndex, setMonthIndex] = useState(todayDate.getMonth());
  const [view, setView] = useState<"public" | "admin" | "profile" | "master">(
    "public",
  );
  const [adminTab, setAdminTab] = useState<AdminTab>("rotas");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate>("landing");
  const [maintInfo, setMaintInfo] = useState<{
    message: string;
    whatsapp: string;
  } | null>(null);
  const skipFirstSave = useRef(true);
  const accessLogged = useRef<string | null>(null);

  const isLambdaMaster =
    Boolean(company) && company?.id === LAMBDA_COMPANY_ID;

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/master?action=public-settings");
        const json = (await res.json()) as {
          ok?: boolean;
          maintenance?: boolean;
          message?: string;
          whatsapp?: string;
        };
        if (json.ok && json.maintenance) {
          setMaintInfo({
            message:
              json.message ||
              "Rotaz em manutenção rápida. Já voltamos em breve.",
            whatsapp: json.whatsapp || "5511947200616",
          });
          setGate("maintenance");
        }
      } catch {
        // ignore — site segue normal
      }
    })();
  }, []);

  const refreshAuth = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoadError(
        "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
      );
      setAuthReady(true);
      return;
    }
    try {
      const session = await fetchSession();
      if (!session?.user) {
        setProfile(null);
        setCompany(null);
        setAuthReady(true);
        return;
      }
      const p = await fetchProfile(session.user.id);
      setProfile(p);
      if (p?.companyId) {
        const c = await fetchCompany(p.companyId);
        setCompany(c);
        if (p.role === "company") {
          setView("admin");
          if (accessLogged.current !== p.userId) {
            accessLogged.current = p.userId;
            void logCompanyAccess({
              companyId: p.companyId,
              userId: p.userId,
              email: p.email,
              fullName: p.fullName,
              event: "login",
              role: "company",
            });
          }
        } else if (p.role === "motoboy" && p.companyId) {
          if (accessLogged.current !== p.userId) {
            accessLogged.current = p.userId;
            void logCompanyAccess({
              companyId: p.companyId,
              userId: p.userId,
              email: p.email,
              fullName: p.fullName,
              event: "login",
              role: "motoboy",
              motoboyId: p.motoboyId,
            });
          }
        }
      } else {
        setCompany(null);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Falha ao carregar sessão (rode migration_auth_billing.sql).",
      );
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
    if (!isSupabaseConfigured()) return;
    const sb = getSupabase();
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void refreshAuth();
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshAuth]);

  useEffect(() => {
    if (!profile) {
      setData(null);
      return;
    }
    void (async () => {
      try {
        const loaded = await loadData();
        setData(loaded);
        skipFirstSave.current = true;
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Falha ao carregar dados",
        );
      }
    })();
  }, [profile?.userId]);

  useEffect(() => {
    if (!data || !profile) return;
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
    }, 500);
    return () => window.clearTimeout(t);
  }, [data, profile]);

  async function handleSignOut() {
    await signOut();
    setProfile(null);
    setCompany(null);
    setData(null);
    setView("public");
    setGate("landing");
  }

  function selectDate(next: string) {
    setDate(next);
    const [y, m] = next.split("-").map(Number);
    setYear(y);
    setMonthIndex(m - 1);
  }

  function changeMonth(y: number, m: number) {
    setYear(y);
    setMonthIndex(m);
    const day = Math.min(
      Number(date.slice(-2)),
      new Date(y, m + 1, 0).getDate(),
    );
    setDate(
      `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }

  if (loadError) {
    const sqlHint = /addresses|schema cache/i.test(loadError)
      ? "supabase/migration_addresses_catalog.sql"
      : "supabase/migration_auth_billing.sql";
    return (
      <div className="app-shell">
        <div className="status err">{loadError}</div>
        <p className="hint">
          Rode no Supabase SQL Editor: <code>{sqlHint}</code>
        </p>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="app-shell">
        <p className="hint">Carregando…</p>
      </div>
    );
  }

  if (!profile) {
    if (gate === "maintenance" && maintInfo) {
      const wa = maintInfo.whatsapp.replace(/\D/g, "");
      return (
        <div className="app-shell maintenance-screen">
          <BrandLogoGate />
          <h1>Rotaz em manutenção</h1>
          <p className="lede">{maintInfo.message}</p>
          <a
            className="btn btn-whatsapp"
            href={`https://wa.me/${wa}?text=${encodeURIComponent("Olá! Vi que o Rotaz está em manutenção.")}`}
            target="_blank"
            rel="noreferrer"
          >
            Falar no WhatsApp
          </a>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: "0.75rem" }}
            onClick={() => setGate("auth")}
          >
            Sou da equipe — entrar
          </button>
          <SiteFooter compact hideLogo />
        </div>
      );
    }
    if (gate === "landing") {
      return (
        <div className="landing-shell">
          <LandingPage
            onLogin={() => setGate("auth")}
            onCreateCompany={() => setGate("signup")}
          />
        </div>
      );
    }
    if (gate === "signup") {
      return (
        <div className="app-shell">
          <CompanySignupScreen
            onAuthenticated={() => void refreshAuth()}
            onBack={() => setGate("landing")}
          />
          <WhatsAppFloat />
          <SiteFooter compact />
        </div>
      );
    }
    return (
      <div className="app-shell">
        <AuthScreen
          onAuthenticated={() => void refreshAuth()}
          onBack={() => setGate("landing")}
          onCreateCompany={() => setGate("signup")}
        />
        <WhatsAppFloat />
        <SiteFooter compact />
      </div>
    );
  }

  const isCompany = profile.role === "company";
  const planOk = !isCompany || companyHasActivePlan(company);

  if (isCompany && company && !planOk) {
    return (
      <div className="app-shell">
        <Header
          subtitle={`${company.name} · plano pendente`}
          onSignOut={() => void handleSignOut()}
        />
        <BillingScreen
          company={company}
          onRefresh={() => void refreshAuth()}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-shell">
        <p className="hint">Carregando rotas…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        companyName={company?.name || null}
        subtitle={
          isCompany
            ? view === "master"
              ? "Painel Master"
              : view === "admin"
                ? "painel administrador"
                : "visão motoboy"
            : `${profile.fullName || "Motoboy"} · rotas`
        }
        showAdminLink={isCompany}
        showProfileLink={!isCompany}
        showMasterLink={isLambdaMaster}
        view={view}
        onOpenAdmin={() => setView("admin")}
        onOpenPublic={() => setView("public")}
        onOpenProfile={() => setView("profile")}
        onOpenMaster={() => setView("master")}
        onSignOut={() => void handleSignOut()}
      />

      {saveError ? (
        <div className="status err" style={{ marginBottom: "1rem" }}>
          {saveError}
        </div>
      ) : null}

      {isCompany && view === "master" && company ? (
        <MasterAdminPanel companyId={company.id} />
      ) : isCompany && view === "admin" ? (
        <AdminShell
          data={data}
          date={date}
          year={year}
          monthIndex={monthIndex}
          tab={adminTab}
          company={company}
          onTabChange={setAdminTab}
          onChange={setData}
          onSelectDate={selectDate}
          onMonthChange={changeMonth}
          onBackToRoutes={() => setView("public")}
          onRefreshCompany={() => void refreshAuth()}
        />
      ) : !isCompany && view === "profile" ? (
        <MotoboyPrefsPanel
          data={data}
          motoboyId={profile.motoboyId}
          onChange={setData}
        />
      ) : (
        <>
          <MonthCalendar
            year={year}
            monthIndex={monthIndex}
            selectedDate={date}
            data={data}
            onMonthChange={changeMonth}
            onSelectDate={selectDate}
          />
          <RouteView
            date={date}
            route={getRoute(data, date)}
            motoboys={data.motoboys}
            addresses={data.addresses}
            pricePerKm={data.pricePerKm}
            role={isCompany ? "company" : "motoboy"}
            actorName={profile.fullName || profile.email || ""}
            viewerMotoboyId={profile.motoboyId}
            onRouteChange={(next) => {
              setData({
                ...data,
                routesByDate: { ...data.routesByDate, [date]: next },
              });
            }}
          />
        </>
      )}
      <WhatsAppFloat />
      <SiteFooter compact />
    </div>
  );
}
