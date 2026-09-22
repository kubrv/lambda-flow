import { WEEKDAYS, type Weekday } from "../lib/types";

type Props = {
  value: Weekday;
  onChange: (day: Weekday) => void;
};

export function DayTabs({ value, onChange }: Props) {
  return (
    <div className="day-tabs" role="tablist" aria-label="Dia da semana">
      {WEEKDAYS.map((day) => (
        <button
          key={day.id}
          type="button"
          role="tab"
          aria-selected={value === day.id}
          className={`day-tab${value === day.id ? " active" : ""}`}
          onClick={() => onChange(day.id)}
        >
          {day.short}
        </button>
      ))}
    </div>
  );
}
