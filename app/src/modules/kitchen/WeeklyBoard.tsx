import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, OrderStatus, OrderTicket } from "../../dal/types";
import { etParts } from "../../lib/time";

/**
 * Kitchen · Weekly Board — V2 implementation of the Manus WeeklyMasterBoard.
 * Mon–Sun grid from dal.orders.weekDates(); per-day order cards with channel
 * + status badges, inline item expansion, and a per-day item-totals footer.
 * Read-only view (no mutations).
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  fire_drop: { label: "Fire Drop", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  cuban_thursday: { label: "Cuban Thu", cls: "bg-green-500/20 text-green-300 border-green-500/30" },
  retail: { label: "Retail", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  walk_in: { label: "Walk-in", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
};

const STATUS_CLS: Record<OrderStatus, string> = {
  confirmed: "bg-blue-500/20 text-blue-300",
  in_prep: "bg-amber-500/20 text-amber-300",
  ready: "bg-green-500/20 text-green-300",
  picked_up: "bg-zinc-600/40 text-zinc-300",
  delivered: "bg-zinc-600/40 text-zinc-300",
  cancelled: "bg-red-900/40 text-red-400",
};

function todayEt(): string {
  const p = etParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function dayLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function WeeklyBoard() {
  const dal = getDal();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const today = todayEt();

  const { data: weekDates = [] } = useQuery({
    queryKey: ["orders", "weekDates"],
    queryFn: () => dal.orders.weekDates(),
  });
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: () => dal.orders.list(),
    refetchInterval: 30_000,
  });

  const byDate = useMemo(() => {
    const m = new Map<string, OrderTicket[]>();
    for (const o of orders) {
      const list = m.get(o.serviceDate) ?? [];
      list.push(o);
      m.set(o.serviceDate, list);
    }
    return m;
  }, [orders]);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading weekly board…</p>;

  return (
    <div className="pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Weekly Master Board</h1>
          <p className="text-sm text-zinc-500">
            {weekDates.length === 7 ? `${dayLabel(weekDates[0])} — ${dayLabel(weekDates[6])}` : "This week"} · all channels
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          {(Object.keys(CHANNEL_META) as OrderChannel[]).map(c => (
            <span key={c} className={`rounded border px-2 py-0.5 ${CHANNEL_META[c].cls}`}>{CHANNEL_META[c].label}</span>
          ))}
        </div>
      </header>

      <div className="mt-4 overflow-x-auto pb-4">
        <div className="grid min-w-[1200px] grid-cols-7 gap-3">
          {weekDates.map(date => {
            const dayOrders = (byDate.get(date) ?? []).slice().sort((a, b) => a.timeWindow.localeCompare(b.timeWindow));
            const isToday = date === today;
            const totals = new Map<string, { name: string; unit: string; qty: number }>();
            for (const o of dayOrders) {
              if (o.status === "cancelled") continue;
              for (const it of o.items) {
                const k = `${it.name}|${it.unit}`;
                const e = totals.get(k) ?? { name: it.name, unit: it.unit, qty: 0 };
                e.qty += it.qty;
                totals.set(k, e);
              }
            }
            return (
              <section key={date}
                className={`flex flex-col rounded-xl border bg-ink-900 ${isToday ? "border-fire shadow-[0_0_0_1px] shadow-fire/40" : "border-ink-700"}`}>
                <header className={`rounded-t-xl px-3 py-2 ${isToday ? "bg-fire/15" : "bg-ink-800"}`}>
                  <p className={`text-sm font-bold ${isToday ? "text-fire-light" : "text-zinc-200"}`}>
                    {dayLabel(date)}{isToday && <span className="ml-1 text-[10px] font-black uppercase text-fire-light">· Today</span>}
                  </p>
                  <p className="text-xs text-zinc-500">{dayOrders.length} order{dayOrders.length !== 1 ? "s" : ""}</p>
                </header>

                <div className="flex-1 space-y-2 p-2">
                  {dayOrders.length === 0 && <p className="px-1 py-4 text-center text-xs text-zinc-600">No orders</p>}
                  {dayOrders.map(o => {
                    const open = expanded.has(o.id);
                    return (
                      <div key={o.id} className="rounded-lg border border-ink-700 bg-ink-950">
                        <button onClick={() => toggle(o.id)}
                          className="w-full min-h-[44px] px-2.5 py-2 text-left"
                          aria-expanded={open}
                          aria-label={`${o.customer} — ${open ? "collapse" : "expand"} items`}>
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-sm font-semibold text-zinc-100">{o.customer}</p>
                            <span className="text-xs text-zinc-500">{open ? "▴" : "▾"}</span>
                          </div>
                          <p className="text-xs text-zinc-500">{o.timeWindow}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${CHANNEL_META[o.channel].cls}`}>
                              {CHANNEL_META[o.channel].label}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLS[o.status]}`}>
                              {o.status.replace("_", " ")}
                            </span>
                          </div>
                        </button>
                        {open && (
                          <ul className="border-t border-ink-700 px-2.5 py-2 text-xs text-zinc-300">
                            {o.items.map(it => (
                              <li key={it.id} className="flex justify-between gap-2 py-0.5">
                                <span className="truncate">{it.name}</span>
                                <span className="shrink-0 font-bold text-zinc-100">{it.qty} {it.unit}</span>
                              </li>
                            ))}
                            {o.notes && <li className="mt-1 text-zinc-500">📝 {o.notes}</li>}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>

                {totals.size > 0 && (
                  <footer className="rounded-b-xl border-t border-ink-700 bg-ink-800/60 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Day totals</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {[...totals.values()].sort((a, b) => b.qty - a.qty).map(t => (
                        <li key={`${t.name}|${t.unit}`} className="flex justify-between gap-2 text-zinc-400">
                          <span className="truncate">{t.name}</span>
                          <span className="shrink-0 font-bold text-fire-light">{t.qty} {t.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </footer>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
