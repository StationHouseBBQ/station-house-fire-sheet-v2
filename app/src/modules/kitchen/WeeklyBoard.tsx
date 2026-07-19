import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, OrderItem, OrderStatus, OrderTicket } from "../../dal/types";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Kitchen · Weekly Board — V2 implementation of the Manus WeeklyMasterBoard.
 * Mon–Sun grid from dal.orders.weekDates(); per-day order cards with channel
 * + status badges, inline item expansion, and a per-day item-totals footer.
 *
 * Parity additions over the day-grid-only version:
 *  - Two tabs: "Board" (the day grid) and "Shopping List" (the Manus PO tab)
 *    — the week's items rolled up and grouped into Meats / Sides / Desserts /
 *    Specials with color + emoji headers, printable.
 *  - Week stats strip (orders / channels / items) and channel legend.
 * Read-only view (no mutations).
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  fire_drop: { label: "Weekend Pre-Order", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
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

// ── Category grouping for the Shopping List tab (Manus GROUP_ORDER) ─────────
type ItemGroup = "Meats" | "Sides" | "Desserts" | "Specials";
const GROUP_ORDER: ItemGroup[] = ["Meats", "Sides", "Desserts", "Specials"];
const GROUP_META: Record<ItemGroup, { emoji: string; color: string; bg: string }> = {
  Meats: { emoji: "🥩", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  Sides: { emoji: "🥗", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  Desserts: { emoji: "🍮", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  Specials: { emoji: "🍢", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
};

const MEAT_HINTS = ["brisket", "pork", "rib", "chicken", "sausage", "turkey", "beef", "burnt", "wing", "belly"];
const SIDE_HINTS = ["mac", "bean", "slaw", "corn", "potato", "green", "salad", "side", "collard", "okra", "bread", "roll"];
const DESSERT_HINTS = ["pie", "cobbler", "banana", "cake", "brownie", "pudding", "dessert", "cookie"];

function groupForItem(name: string): ItemGroup {
  const n = name.toLowerCase();
  if (MEAT_HINTS.some(h => n.includes(h))) return "Meats";
  if (DESSERT_HINTS.some(h => n.includes(h))) return "Desserts";
  if (SIDE_HINTS.some(h => n.includes(h))) return "Sides";
  return "Specials";
}

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function dayLabel(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function WeeklyBoard() {
  const dal = getDal();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<"board" | "shopping">("board");
  const today = todayEt();

  const { data: weekDates = [] } = useQuery({
    queryKey: ["orders", "weekDates", offset],
    queryFn: () => dal.orders.weekDates(offset),
  });
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: () => dal.orders.list(),
    refetchInterval: 30_000,
  });

  const weekSet = useMemo(() => new Set(weekDates), [weekDates]);
  const weekOrders = useMemo(
    () => orders.filter(o => weekSet.has(o.serviceDate) && o.status !== "cancelled"),
    [orders, weekSet],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, OrderTicket[]>();
    for (const o of orders) (m.get(o.serviceDate) ?? m.set(o.serviceDate, []).get(o.serviceDate)!).push(o);
    return m;
  }, [orders]);

  // Week-wide item rollup, grouped by category group.
  const shopping = useMemo(() => {
    const groups: Record<ItemGroup, Map<string, { name: string; unit: string; qty: number }>> = {
      Meats: new Map(), Sides: new Map(), Desserts: new Map(), Specials: new Map(),
    };
    for (const o of weekOrders) {
      for (const it of o.items) {
        const g = groupForItem(it.name);
        const key = `${it.name}|${it.unit}`;
        const e = groups[g].get(key) ?? { name: it.name, unit: it.unit, qty: 0 };
        e.qty += it.qty;
        groups[g].set(key, e);
      }
    }
    return groups;
  }, [weekOrders]);

  const weekStats = useMemo(() => {
    const channels = new Set(weekOrders.map(o => o.channel));
    const itemCount = weekOrders.reduce((s, o) => s + o.items.reduce((si: number, it: OrderItem) => si + it.qty, 0), 0);
    return { orders: weekOrders.length, channels: channels.size, items: itemCount };
  }, [weekOrders]);

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
            {weekDates.length === 7 ? `${dayLabel(weekDates[0])} — ${dayLabel(weekDates[6])}` : "…"}
            {offset === 0 ? " · this week" : ` · ${offset > 0 ? `${offset} week${offset === 1 ? "" : "s"} ahead` : `${-offset} week${offset === -1 ? "" : "s"} back`}`}
          </p>
        </div>
        <div className="no-print flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1" role="group" aria-label="Week navigation">
          <button onClick={() => setOffset(o => o - 1)}
            className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold text-zinc-300 hover:bg-ink-800 hover:text-zinc-100">← Prev</button>
          <button onClick={() => setOffset(0)} disabled={offset === 0}
            className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold ${offset === 0 ? "bg-fire text-white" : "text-zinc-300 hover:bg-ink-800"}`}>This week</button>
          <button onClick={() => setOffset(o => o + 1)}
            className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold text-zinc-300 hover:bg-ink-800 hover:text-zinc-100">Next →</button>
        </div>
      </header>

      {/* Week stats + tabs */}
      <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <span className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs font-bold text-zinc-300">{weekStats.orders} orders</span>
          <span className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs font-bold text-zinc-300">{weekStats.channels} channels</span>
          <span className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs font-bold text-zinc-300">{weekStats.items} items</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          <button onClick={() => setTab("board")}
            className={`min-h-[40px] rounded-md px-4 py-1.5 text-sm font-bold ${tab === "board" ? "bg-fire text-white" : "text-zinc-400"}`}>📋 Board</button>
          <button onClick={() => setTab("shopping")}
            className={`min-h-[40px] rounded-md px-4 py-1.5 text-sm font-bold ${tab === "shopping" ? "bg-fire text-white" : "text-zinc-400"}`}>🛒 Shopping List</button>
        </div>
      </div>

      {tab === "board" && (
        <>
          <div className="no-print mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            {(Object.keys(CHANNEL_META) as OrderChannel[]).map(c => (
              <span key={c} className={`rounded border px-2 py-0.5 ${CHANNEL_META[c].cls}`}>{CHANNEL_META[c].label}</span>
            ))}
          </div>
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
                            <button onClick={() => toggle(o.id)} className="w-full min-h-[44px] px-2.5 py-2 text-left"
                              aria-expanded={open} aria-label={`${o.customer} — ${open ? "collapse" : "expand"} items`}>
                              <div className="flex items-center justify-between gap-1">
                                <p className="truncate text-sm font-semibold text-zinc-100">{o.customer}</p>
                                <span className="text-xs text-zinc-500">{open ? "▴" : "▾"}</span>
                              </div>
                              <p className="text-xs text-zinc-500">{o.timeWindow}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${CHANNEL_META[o.channel].cls}`}>{CHANNEL_META[o.channel].label}</span>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLS[o.status]}`}>{o.status.replace("_", " ")}</span>
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
        </>
      )}

      {tab === "shopping" && (
        <div className="print-area mt-4">
          <div className="flex items-center justify-between">
            <p className="hidden text-lg font-black print:block">Station House BBQ — Weekly Shopping List</p>
            <p className="text-sm text-zinc-500">Every active item this week, rolled up by category.</p>
            <button onClick={() => window.print()}
              className="no-print min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-bold text-zinc-200 hover:text-white">🖨 Print</button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {GROUP_ORDER.map(group => {
              const items = [...shopping[group].values()].sort((a, b) => b.qty - a.qty);
              if (items.length === 0) return null;
              return (
                <section key={group} className={`rounded-xl border p-4 ${GROUP_META[group].bg}`}>
                  <h3 className={`mb-2 text-xs font-black uppercase tracking-widest ${GROUP_META[group].color}`}>
                    {GROUP_META[group].emoji} {group} <span className="font-normal text-zinc-500">({items.length})</span>
                  </h3>
                  <ul className="space-y-1">
                    {items.map(it => (
                      <li key={`${it.name}|${it.unit}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-zinc-200">{it.name}</span>
                        <span className="shrink-0 font-black text-zinc-100">{it.qty} <span className="text-xs font-normal text-zinc-500">{it.unit}</span></span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {weekOrders.length === 0 && (
              <p className="md:col-span-2 rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">
                No active orders this week
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
