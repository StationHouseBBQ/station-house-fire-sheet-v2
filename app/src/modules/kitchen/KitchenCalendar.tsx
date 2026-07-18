import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CalendarEvent } from "../../dal/types";
import { etParts } from "../../lib/time";

/**
 * Kitchen · Calendar — V2 implementation of the Manus MasterCalendarPage.
 * Month grid with prev/next navigation; events from
 * dal.calendar.eventsForMonth, color-coded by kind; today (ET) highlighted.
 */

const KIND_META: Record<CalendarEvent["kind"], { label: string; cls: string; dot: string }> = {
  catering: { label: "Catering", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30", dot: "bg-purple-400" },
  fire_drop: { label: "Weekend Pre-Order", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30", dot: "bg-orange-400" },
  cuban_thursday: { label: "Cuban Thursday", cls: "bg-green-500/20 text-green-300 border-green-500/30", dot: "bg-green-400" },
  retail: { label: "Retail", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30", dot: "bg-blue-400" },
  holiday: { label: "Holiday", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400" },
};

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayEt(): string {
  const p = etParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function KitchenCalendar() {
  const dal = getDal();
  const today = todayEt();
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const p = etParts(new Date());
    return { year: p.year, month: p.month };
  });

  const yearMonth = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar", yearMonth],
    queryFn: () => dal.calendar.eventsForMonth(yearMonth),
  });

  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [events]);

  const move = (delta: number) =>
    setCursor(c => {
      let month = c.month + delta;
      let year = c.year;
      if (month < 1) { month = 12; year -= 1; }
      if (month > 12) { month = 1; year += 1; }
      return { year, month };
    });

  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const leadingBlanks = new Date(cursor.year, cursor.month - 1, 1).getDay(); // 0=Sun
  const cells: Array<string | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthTitle = new Date(cursor.year, cursor.month - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Kitchen Calendar</h1>
          <p className="text-sm text-zinc-500">Orders, drops & weekly rhythm</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => move(-1)} aria-label="Previous month"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 font-bold text-zinc-300">←</button>
          <span className="min-w-[11rem] text-center text-base font-bold text-zinc-100">{monthTitle}</span>
          <button onClick={() => move(1)} aria-label="Next month"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 font-bold text-zinc-300">→</button>
        </div>
      </header>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
        {(Object.keys(KIND_META) as Array<CalendarEvent["kind"]>).map(k => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${KIND_META[k].dot}`} />
            {KIND_META[k].label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading calendar…</p>
      ) : (
        <div className="mt-4 overflow-x-auto pb-4">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_HEADERS.map(d => (
                <div key={d} className="px-2 py-1 text-center text-xs font-black uppercase tracking-wider text-zinc-500">{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} className="min-h-[7rem] rounded-lg bg-ink-950/40" />;
                const isToday = date === today;
                const dayEvents = eventsByDate.get(date) ?? [];
                return (
                  <div key={date}
                    className={`min-h-[7rem] rounded-lg border p-1.5 ${
                      isToday ? "border-fire bg-fire/10" : "border-ink-800 bg-ink-900"
                    }`}>
                    <p className={`text-xs font-bold ${isToday ? "text-fire-light" : "text-zinc-400"}`}>
                      {Number(date.slice(8))}
                      {isToday && <span className="ml-1 text-[9px] font-black uppercase">today</span>}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {dayEvents.map(e => (
                        <li key={e.id}
                          title={e.title}
                          className={`truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight ${KIND_META[e.kind].cls}`}>
                          {e.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
