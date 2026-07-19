import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CateringOrder, CateringStage, Lead } from "../../dal/types";
import { etParts } from "../../lib/time";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";

/**
 * Catering · Sales Calendar — V2 counterpart of the Manus SalesCalendar.
 * Month grid merging catering calendar events with booked leads (by
 * eventDate). Clicking a lead pill opens an inline detail panel.
 */

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

type Pill =
  | { kind: "event"; id: string; date: string; title: string }
  | { kind: "lead"; id: string; date: string; title: string; lead: Lead }
  | { kind: "order"; id: string; date: string; title: string; order: CateringOrder };

const ORDER_STAGE_CLS: Record<CateringStage, string> = {
  inquiry: "border-zinc-500/40 bg-zinc-500/20 text-zinc-300",
  quoting: "border-sky-500/40 bg-sky-500/20 text-sky-300",
  quote_sent: "border-amber-500/40 bg-amber-500/20 text-amber-300",
  accepted: "border-emerald-500/40 bg-emerald-500/20 text-emerald-300",
  invoiced: "border-indigo-500/40 bg-indigo-500/20 text-indigo-300",
  paid: "border-green-500/40 bg-green-500/20 text-green-300",
  in_kitchen: "border-fire/50 bg-fire/20 text-fire-light",
  ready: "border-teal-500/40 bg-teal-500/20 text-teal-300",
  completed: "border-zinc-600/40 bg-zinc-600/20 text-zinc-400",
  lost: "border-red-500/40 bg-red-500/20 text-red-300",
  cancelled: "border-zinc-700/40 bg-zinc-800 text-zinc-500",
};

export function SalesCalendarView() {
  const dal = getDal();
  const today = todayEt();
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const p = etParts(currentTime());
    return { year: p.year, month: p.month };
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const yearMonth = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["calendar", yearMonth],
    queryFn: () => dal.calendar.eventsForMonth(yearMonth),
  });
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["leads", "list"],
    queryFn: () => dal.leads.list(),
  });
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
  });

  const pillsByDate = useMemo(() => {
    const m = new Map<string, Pill[]>();
    const push = (p: Pill) => {
      const list = m.get(p.date) ?? [];
      list.push(p);
      m.set(p.date, list);
    };
    for (const e of events) if (e.kind === "catering") push({ kind: "event", id: e.id, date: e.date, title: e.title });
    for (const l of leads) {
      if (l.stage === "booked" && l.eventDate && l.eventDate.startsWith(yearMonth)) {
        push({ kind: "lead", id: l.id, date: l.eventDate, title: `${l.name} · ${l.eventType}`, lead: l });
      }
    }
    for (const o of orders) {
      if (o.event.eventDate && o.event.eventDate.startsWith(yearMonth)) {
        push({ kind: "order", id: o.id, date: o.event.eventDate, title: o.customer, order: o });
      }
    }
    return m;
  }, [events, leads, orders, yearMonth]);

  const selectedLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) ?? null : null;

  const move = (delta: number) =>
    setCursor(c => {
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
  const monthTitle = new Date(cursor.year, cursor.month - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isLoading = loadingEvents || loadingLeads || loadingOrders;

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Sales Calendar</h1>
          <p className="text-sm text-zinc-500">Catering events + booked leads</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => move(-1)} aria-label="Previous month"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 font-bold text-zinc-300">←</button>
          <span className="min-w-[11rem] text-center text-base font-bold text-zinc-100">{monthTitle}</span>
          <button onClick={() => move(1)} aria-label="Next month"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 font-bold text-zinc-300">→</button>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-purple-400" /> Catering event</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Booked lead (tap for details)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Catering order (colored by stage · opens Cockpit)</span>
      </div>

      {selectedLead && (
        <div className="mt-4 rounded-2xl border border-green-800/60 bg-green-950/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-zinc-100">{selectedLead.name}{selectedLead.company ? ` — ${selectedLead.company}` : ""}</p>
              <p className="mt-0.5 text-sm text-zinc-400">
                {selectedLead.eventType} · {fmtDate(selectedLead.eventDate)}
                {selectedLead.guests !== null ? ` · ${selectedLead.guests} guests` : ""}
                {selectedLead.budgetCents !== null ? ` · ${formatCents(selectedLead.budgetCents)}` : ""}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{selectedLead.email} · {selectedLead.phone}</p>
              {selectedLead.notes && <p className="mt-2 text-sm text-zinc-300">{selectedLead.notes}</p>}
            </div>
            <button onClick={() => setSelectedLeadId(null)} aria-label="Close details"
              className="min-h-[44px] min-w-[44px] shrink-0 rounded-lg border border-ink-700 bg-ink-800 font-bold text-zinc-300">✕</button>
          </div>
        </div>
      )}

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
                const pills = pillsByDate.get(date) ?? [];
                return (
                  <div key={date}
                    className={`min-h-[7rem] rounded-lg border p-1.5 ${isToday ? "border-fire bg-fire/10" : "border-ink-800 bg-ink-900"}`}>
                    <p className={`text-xs font-bold ${isToday ? "text-fire-light" : "text-zinc-400"}`}>
                      {Number(date.slice(8))}
                      {isToday && <span className="ml-1 text-[9px] font-black uppercase">today</span>}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {pills.map(p =>
                        p.kind === "lead" ? (
                          <li key={`l-${p.id}`}>
                            <button onClick={() => setSelectedLeadId(p.id)} title={p.title}
                              className="w-full truncate rounded border border-green-500/30 bg-green-500/20 px-1.5 py-0.5 text-left text-[11px] leading-tight text-green-300">
                              {p.title}
                            </button>
                          </li>
                        ) : p.kind === "order" ? (
                          <li key={`o-${p.id}`}>
                            <a href="#/catering/cockpit" title={`${p.title} · ${p.order.stage}`}
                              className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight ${ORDER_STAGE_CLS[p.order.stage]}`}>
                              {p.title}
                            </a>
                          </li>
                        ) : (
                          <li key={`e-${p.id}`} title={p.title}
                            className="truncate rounded border border-purple-500/30 bg-purple-500/20 px-1.5 py-0.5 text-[11px] leading-tight text-purple-300">
                            {p.title}
                          </li>
                        )
                      )}
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
