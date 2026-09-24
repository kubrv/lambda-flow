import {
  dateKeysInMonth,
  formatDateShort,
  localDateKey,
  monthLabel,
  shiftMonth,
  weekdayFromDateKey,
} from "../lib/dates";
import { WEEKDAYS, getRoute, type AppData } from "../lib/types";
import { completionDotClass } from "./RouteCompletionPanel";

type Props = {
  year: number;
  monthIndex: number;
  selectedDate: string;
  data: AppData;
  onMonthChange: (year: number, monthIndex: number) => void;
  onSelectDate: (date: string) => void;
};

export function MonthCalendar({
  year,
  monthIndex,
  selectedDate,
  data,
  onMonthChange,
  onSelectDate,
}: Props) {
  const keys = dateKeysInMonth(year, monthIndex);
  const firstWeekdayJs = new Date(year, monthIndex, 1).getDay();
  const pad = (firstWeekdayJs + 6) % 7;
  const today = localDateKey();

  return (
    <div className="month-cal">
      <div className="month-cal-head">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const n = shiftMonth(year, monthIndex, -1);
            onMonthChange(n.year, n.monthIndex);
          }}
        >
          ←
        </button>
        <strong>{monthLabel(year, monthIndex)}</strong>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const n = shiftMonth(year, monthIndex, 1);
            onMonthChange(n.year, n.monthIndex);
          }}
        >
          →
        </button>
      </div>
      <div className="month-cal-grid labels">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-cal-grid">
        {Array.from({ length: pad }).map((_, i) => (
          <span key={`pad-${i}`} className="month-day empty" />
        ))}
        {keys.map((key) => {
          const route = getRoute(data, key);
          const hasRoute = Boolean(
            data.routesByDate[key] &&
              (route.stops.length > 0 || route.startAddress.trim()),
          );
          const dayNum = Number(key.slice(-2));
          const wd = WEEKDAYS.find((w) => w.id === weekdayFromDateKey(key));
          const isPast = key < today;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              className={`month-day${selectedDate === key ? " active" : ""}${
                hasRoute ? " has-route" : ""
              }${isPast ? " past" : ""}${isToday ? " today" : ""}${
                hasRoute && route.completionStatus === "verified"
                  ? " verified"
                  : hasRoute && route.completionStatus === "completed"
                    ? " pending-verify"
                    : ""
              }`}
              onClick={() => onSelectDate(key)}
              title={`${wd?.label ?? ""} ${formatDateShort(key)}${
                route.completionStatus === "verified"
                  ? " · verificada"
                  : route.completionStatus === "completed"
                    ? " · aguarda verificação"
                    : ""
              }`}
            >
              <span className="day-num">{dayNum}</span>
              {hasRoute ? (
                <span className={completionDotClass(route)} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
