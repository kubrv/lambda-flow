import { useEffect, useState } from "react";
import { AdminPanel } from "./components/AdminPanel";
import { DayTabs } from "./components/DayTabs";
import { Header } from "./components/Header";
import { RouteView } from "./components/RouteView";
import { loadData, saveData } from "./lib/storage";
import type { AppData, Weekday } from "./lib/types";

const ADMIN_KEY = "lambda-flow:admin";

function todayWeekday(): Weekday {
  const map: Weekday[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return map[new Date().getDay()];
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [day, setDay] = useState<Weekday>(() => todayWeekday());
  const [isAdmin, setIsAdmin] = useState(
    () => sessionStorage.getItem(ADMIN_KEY) === "1",
  );

  useEffect(() => {
    saveData(data);
  }, [data]);

  function unlockAdmin() {
    sessionStorage.setItem(ADMIN_KEY, "1");
    setIsAdmin(true);
  }

  function lockAdmin() {
    sessionStorage.removeItem(ADMIN_KEY);
    setIsAdmin(false);
  }

  return (
    <div className="app-shell">
      <Header
        isAdmin={isAdmin}
        onUnlock={unlockAdmin}
        onLock={lockAdmin}
      />
      <DayTabs value={day} onChange={setDay} />
      <RouteView day={day} route={data.routes[day]} motoboys={data.motoboys} />
      {isAdmin ? (
        <AdminPanel data={data} day={day} onChange={setData} />
      ) : null}
    </div>
  );
}
