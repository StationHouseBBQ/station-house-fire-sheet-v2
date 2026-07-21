import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import type { CateringOrder, CateringStage } from "../../dal/types";
import { localDateStr, mondayOfWeek } from "./_prod/prep";

/**
 * Catering · Weekly Board — a week-at-a-glance of catering events. Seven day
 * columns (Mon–Sun) for the week containing today (currentTime), with prev/next
 * week navigation. Each live catering order lands in its event-date column as a
 * card (customer, time, guests, service type, stage, total, fulfillment).
 * Cards expand to show line items and staff. A week summary tallies events,
 * guests, and revenue.
 */

const STAGE_META: Record<CateringStage, { label: string; cls: string }> = {
  inquiry: { label: "Inquiry", cls: "bg-ink-700 text-zinc-300" },
  quoting: { label: "Quoting", cls: "bg-sky-600/20 text-sky-300" },
  quote_sent: { label: "Quote sent", cls: "bg-amber-600/20 text-amber-300" },
  accepted: { label: "Accepted", cls: "bg-emerald-600/20 text-emerald-300" },
  invoiced: { label: "Invoiced", cls: "bg-indigo-600/20 text-indigo-300" },
  paid: { label: "Paid", cls: "bg-green-600/20 text-green-300" },
  in_kitchen: { label: "In kitchen", cls: "bg-fire/20 text-fire-light" },
  ready: { label: "Ready", cls: "bg-teal-600/20 text-teal-300" },
  completed: { label: "Completed", cls: "bg-zinc-600/30 text-zinc-300" },
  lost: { label: "Lost", cls: "bg-red-600/20 text-red-300" },
  cancelled: { label: "Cancelled", cls: "bg-zinc-800 text-zinc-400" },
};

const DEAD = new Set<CateringStage>(["lost", "cancelled"]);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CateringWeeklyBoard() {
  const dal = getDal();
  const now = currentTime();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeek(currentTime()));
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const weekEnd = days[6];
  const todayStr = localDateStr(now);

  // Map of dateStr -> orders that day (live only, with a date).
  const byDay = useMemo(() => {
    const m = new Map<string, CateringOrder[]>();
    for (const o of orders) {
      if (DEAD.has(o.stage) || !o.event.eventDate) continue;
      const arr = m.get(o.event.eventDate);
      if (arr) arr.push(o);
      else m.set(o.event.eventDate, [o]);
    }
    return m;
  }, [orders]);

  const weekOrders = useMemo(
    () => days.flatMap(d => byDay.get(localDateStr(d)) ?? []),
    [days, byDay],
  );
  const weekGuests = weekOrders.reduce((n, o) => n + (o.event.guests ?? 0), 0);
  const weekRevenue = weekOrders.reduce((n, o) => n + o.totalCents, 0);

  function shiftWeek(deltaWeeks: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + deltaWeeks * 7);
    setWeekStart(d);
  }

  const rangeLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="mx-auto max-w-7xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Catering Weekly Board</h1>
          <p className="text-sm text-zinc-500">Every catering event this week, day by day.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-fire"
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekStart(mondayOfWeek(currentTime()))}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-300"
          >
            This week
          </button>
          <button
            onClick={() => shiftWeek(1)}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-fire"
          >
            Next →
          </button>
        </div>
      </header>

      {/* Week summary */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Week of" value={rangeLabel} />
        <Stat label="Events" value={String(weekOrders.length)} />
        <Stat label="Total guests" value={weekGuests === 0 ? "—" : String(weekGuests)} />
        <Stat label="Revenue" value={formatCents(weekRevenue)} accent />
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading week…</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((d, i) => {
            const dStr = localDateStr(d);
            const dayOrders = (byDay.get(dStr) ?? []).sort((a, b) =>
              (a.event.eventTime ?? "").localeCompare(b.event.eventTime ?? ""),
            );
            const isToday = dStr === todayStr;
            return (
              <div
                key={dStr}
                className={`rounded-2xl border p-2 ${
                  isToday ? "border-fire/60 bg-fire/5" : "border-ink-800 bg-ink-900"
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className={`text-xs font-black uppercase ${isToday ? "text-fire-light" : "text-zinc-400"}`}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                {dayOrders.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-zinc-600">—</p>
                ) : (
                  <ul className="space-y-2">
                    {dayOrders.map(o => (
                      <EventCard
                        key={o.id}
                        order={o}
                        isExpanded={expanded === o.id}
                        onToggle={() => setExpanded(prev => (prev === o.id ? null : o.id))}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-black ${accent ? "text-green-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function EventCard({
  order,
  isExpanded,
  onToggle,
}: {
  order: CateringOrder;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const stage = STAGE_META[order.stage];
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-950">
      <button onClick={onToggle} className="w-full p-2.5 text-left">
        <div className="flex items-start justify-between gap-1">
          <span className="text-sm font-bold text-zinc-100">{order.customer}</span>
          <span className="flex-shrink-0 text-xs font-bold text-zinc-300">{formatCents(order.totalCents)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
          {order.event.eventTime && <span>🕑 {order.event.eventTime}</span>}
          <span>· {order.event.guests === null ? "guests TBD" : `${order.event.guests} gst`}</span>
          {order.event.serviceType && <span>· {order.event.serviceType}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${stage.cls}`}>{stage.label}</span>
          <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
            {order.fulfillment === "delivery" ? "🚚 Delivery" : "🏠 Pickup"}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-ink-800 px-2.5 pb-2.5 pt-2 text-xs">
          <p className="font-mono text-[10px] text-zinc-600">{order.ref}</p>
          {order.lines.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {order.lines.map(l => (
                <li key={l.id} className="flex justify-between text-zinc-400">
                  <span className="truncate">{l.name}</span>
                  <span className="ml-2 flex-shrink-0 font-mono text-zinc-500">× {l.qty}</span>
                </li>
              ))}
            </ul>
          )}
          {order.staff.length > 0 && (
            <div className="mt-2 border-t border-ink-800 pt-1.5">
              <p className="text-[10px] font-bold uppercase text-zinc-500">Staff</p>
              <ul className="mt-0.5 space-y-0.5">
                {order.staff.map(s => (
                  <li key={s.id} className="text-zinc-400">
                    {s.name} <span className="text-zinc-600">· {s.role}</span>
                    {s.callTime && <span className="text-zinc-600"> · {s.callTime}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <a
            href={`#/catering/cockpit`}
            className="mt-2 block text-[11px] font-semibold text-fire-light hover:underline"
          >
            Open in Cockpit →
          </a>
        </div>
      )}
    </li>
  );
}
