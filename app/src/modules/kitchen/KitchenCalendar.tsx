import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CalendarEvent } from "../../dal/types";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Kitchen · Calendar — V2 implementation of the Manus MasterCalendar.
 * Month grid + right-hand sidebar (day detail / upcoming), a stats bar,
 * kind filter tabs, event-kind color chips, today highlight, and a full
 * event detail popover. Read-only view (calendar repo is query-only).
 *
 * Parity additions over the lean month grid:
 *  - Two-column layout: calendar left, "Upcoming / selected day" sidebar right
 *  - Stats bar (total this month + per-kind counts)
 *  - Kind filter tabs (All / Catering / Weekend / Cuban / Retail / Holiday)
 *  - Click a day → sidebar shows that day; click a chip → detail popover
 *  - "+N more" overflow chips per day
 */

const KIND_META: Record<CalendarEvent["kind"], { label: string; cls: string; dot: string; chip: string }> = {
  catering: { label: "Catering", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30", dot: "bg-purple-400", chip: "bg-purple-600/80" },
  fire_drop: { label: "Weekend Pre-Order", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30", dot: "bg-orange-400", chip: "bg-orange-600/80" },
  cuban_thursday: { label: "Cuban Thursday", cls: "bg-green-500/20 text-green-300 border-green-500/30", dot: "bg-green-400", chip: "bg-green-600/80" },
  retail: { label: "Retail", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30", dot: "bg-blue-400", chip: "bg-blue-600/80" },
  holiday: { label: "Holiday", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400", chip: "bg-zinc-600/80" },
};

type KindFilter = CalendarEvent["kind"] | "all";
const KIND_TABS: KindFilter[] = ["all", "catering", "fire_drop", "cuban_thursday", "retail", "holiday"];

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function longDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function KitchenCalendar() {
  const dal = getDal();
  const today = todayEt();
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const p = etParts(currentTime());
    return { year: p.year, month: p.month };
  });
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);

  const yearMonth = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ["calendar", yearMonth],
    queryFn: () => dal.calendar.eventsForMonth(yearMonth),
  });

  const events = useMemo(
    () => (kindFilter === "all" ? allEvents : allEvents.filter(e => e.kind === kindFilter)),
    [allEvents, kindFilter],
  );

  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) (m.get(e.date) ?? m.set(e.date, []).get(e.date)!).push(e);
    return m;
  }, [events]);

  const stats = useMemo(() => {
    const byKind: Record<CalendarEvent["kind"], number> = { catering: 0, fire_drop: 0, cuban_thursday: 0, retail: 0, holiday: 0 };
    for (const e of allEvents) byKind[e.kind]++;
    return { total: allEvents.length, byKind };
  }, [allEvents]);

  const sidebarEvents = useMemo(() => {
    if (selectedDate) return (eventsByDate.get(selectedDate) ?? []);
    return [...events].sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedDate, eventsByDate, events]);

  const move = (delta: number) =>
    setCursor(c => {
      setSelectedDate(null);
      let month = c.month + delta;
      let year = c.year;
      if (month < 1) { month = 12; year -= 1; }
      if (month > 12) { month = 1; year += 1; }
      return { year, month };
    });

  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const leadingBlanks = new Date(cursor.year, cursor.month - 1, 1).getDay();
  const cells: Array<string | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthTitle = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

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

      {/* Stats bar */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <StatCard label="This month" value={stats.total} accent="text-fire-light" />
        {(Object.keys(KIND_META) as Array<CalendarEvent["kind"]>).map(k => (
          <StatCard key={k} label={KIND_META[k].label} value={stats.byKind[k]} accent={KIND_META[k].cls.split(" ").find(c => c.startsWith("text-")) ?? "text-zinc-300"} />
        ))}
      </div>

      {/* Kind filter tabs */}
      <div className="mt-3 flex flex-wrap gap-2">
        {KIND_TABS.map(k => (
          <button key={k} onClick={() => setKindFilter(k)}
            className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-xs font-bold ${
              kindFilter === k ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-400"
            }`}>
            {k === "all" ? "All" : KIND_META[k].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading calendar…</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
          {/* Calendar */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_HEADERS.map(d => (
                  <div key={d} className="px-2 py-1 text-center text-xs font-black uppercase tracking-wider text-zinc-500">{d}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((date, i) => {
                  if (!date) return <div key={`blank-${i}`} className="min-h-[6.5rem] rounded-lg bg-ink-950/40" />;
                  const isToday = date === today;
                  const isSel = date === selectedDate;
                  const dayEvents = eventsByDate.get(date) ?? [];
                  return (
                    <button key={date} onClick={() => setSelectedDate(p => (p === date ? null : date))}
                      aria-label={`${longDate(date)} — ${dayEvents.length} event${dayEvents.length !== 1 ? "s" : ""}`}
                      className={`min-h-[6.5rem] rounded-lg border p-1.5 text-left align-top ${
                        isSel ? "border-fire bg-fire/15" : isToday ? "border-fire/50 bg-fire/10" : "border-ink-800 bg-ink-900"
                      }`}>
                      <p className={`text-xs font-bold ${isToday ? "text-fire-light" : "text-zinc-400"}`}>
                        {Number(date.slice(8))}
                        {isToday && <span className="ml-1 text-[9px] font-black uppercase">today</span>}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {dayEvents.slice(0, MAX_CHIPS).map(e => (
                          <li key={e.id}>
                            <span onClick={ev => { ev.stopPropagation(); setDetail(e); }}
                              title={e.title}
                              className={`block cursor-pointer truncate rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white ${KIND_META[e.kind].chip}`}>
                              {e.title}
                            </span>
                          </li>
                        ))}
                        {dayEvents.length > MAX_CHIPS && (
                          <li className="pl-1 text-[10px] font-semibold text-zinc-500">+{dayEvents.length - MAX_CHIPS} more</li>
                        )}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="h-fit rounded-xl border border-ink-700 bg-ink-900">
            <header className="border-b border-ink-700 px-4 py-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-fire-light">
                {selectedDate ? longDate(selectedDate) : "Upcoming this month"}
              </h2>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="mt-0.5 text-xs text-zinc-500 hover:text-zinc-300">
                  ← Back to upcoming
                </button>
              )}
            </header>
            {sidebarEvents.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-600">
                {selectedDate ? "No events this day" : "🔥 Click a date to see its events"}
              </p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-ink-800 overflow-y-auto">
                {sidebarEvents.map(e => (
                  <li key={e.id}>
                    <button onClick={() => setDetail(e)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-800/50">
                      <div className="w-10 shrink-0 text-center">
                        <p className="text-[10px] font-bold uppercase text-fire-light">{new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}</p>
                        <p className="text-lg font-black leading-none text-zinc-100">{Number(e.date.slice(8))}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-100">{e.title}</p>
                        <p className="text-xs text-zinc-500">{KIND_META[e.kind].label}</p>
                      </div>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_META[e.kind].dot}`} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {detail && (
        <div role="dialog" aria-modal="true" aria-label={detail.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${KIND_META[detail.kind].dot}`} />
                <span className={`rounded border px-2 py-0.5 text-xs font-bold ${KIND_META[detail.kind].cls}`}>{KIND_META[detail.kind].label}</span>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Close"
                className="min-h-[40px] min-w-[40px] rounded-lg border border-ink-700 text-zinc-400">✕</button>
            </div>
            <h3 className="mt-3 text-lg font-bold text-zinc-100">{detail.title}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-500">Date</dt><dd className="text-zinc-200">{longDate(detail.date)}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-500">Type</dt><dd className="text-zinc-200">{KIND_META[detail.kind].label}</dd></div>
              {detail.orderId && <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-500">Order</dt><dd className="font-mono text-zinc-200">{detail.orderId}</dd></div>}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5">
      <p className={`text-2xl font-black ${accent}`}>{value}</p>
      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}
