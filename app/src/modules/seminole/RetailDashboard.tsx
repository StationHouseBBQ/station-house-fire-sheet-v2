import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Preorder, RetailItemStatus } from "../../dal/types";
import { formatCents } from "../../lib/money";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Seminole · Retail Dashboard — V2 counterpart of the Manus RetailDashboard.
 * A production board for the FOH: a month calendar with per-day markers
 * (preorders / weekend pre-orders / fire-sheet), a selectable date that
 * drives the pickup list and per-date stats, today's fire-sheet case status
 * with a live SOLD-OUT (86) board, and the Weekend Pre-Order ordering-window
 * state per the authoritative ET rules (see src/lib/time.ts).
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const ITEM_STATUS_META: Record<RetailItemStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  firing: { label: "Firing", cls: "bg-amber-600 text-white" },
  in_case: { label: "In Case", cls: "bg-green-600 text-white" },
  sold_out_86: { label: "86'd", cls: "bg-red-600 text-white" },
};
const ITEM_STATUSES: RetailItemStatus[] = ["queued", "firing", "in_case", "sold_out_86"];

const PREORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-600/20 text-amber-400" },
  paid: { label: "Paid", cls: "bg-blue-600/20 text-blue-400" },
  ready: { label: "Ready", cls: "bg-green-600/20 text-green-400" },
  picked_up: { label: "Picked Up", cls: "bg-ink-700 text-zinc-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-600/20 text-red-400" },
  refunded: { label: "Refunded", cls: "bg-purple-600/20 text-purple-400" },
};

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function isRetailDay(iso: string): boolean {
  const dow = new Date(iso + "T12:00:00").getDay();
  return dow === 4 || dow === 5 || dow === 6; // Thu / Fri / Sat
}

export function RetailDashboard() {
  const dal = getDal();
  const today = todayEt();
  const [selectedDate, setSelectedDate] = useState(today);
  const [tp] = useState(() => etParts(currentTime()));
  const [calYear, setCalYear] = useState(tp.year);
  const [calMonth, setCalMonth] = useState(tp.month);

  const { data: stats } = useQuery({
    queryKey: ["preorders", "stats"],
    queryFn: () => dal.preorders.stats(),
    refetchInterval: 30_000,
  });
  const { data: session } = useQuery({
    queryKey: ["retailFireSheet", "session"],
    queryFn: () => dal.retailFireSheet.getSession(),
    refetchInterval: 30_000,
  });
  const { data: drop } = useQuery({
    queryKey: ["fireDrop", "currentDrop"],
    queryFn: () => dal.fireDrop.currentDrop(),
    refetchInterval: 60_000,
  });
  const { data: allPreorders = [] } = useQuery({
    queryKey: ["preorders", "dashboard-all"],
    queryFn: () => dal.preorders.list({ channel: "all", status: "all" }),
    refetchInterval: 30_000,
  });
  const ordering = dal.fireDrop.orderingStatus();

  // Per-date markers computed from preorders + weekend drop + today's sheet.
  const dayMarkers = useMemo(() => {
    const m = new Map<string, { preorders: number; weekend: number }>();
    for (const p of allPreorders) {
      const e = m.get(p.pickupDate) ?? { preorders: 0, weekend: 0 };
      e.preorders++;
      if (p.channel === "fire_drop") e.weekend++;
      m.set(p.pickupDate, e);
    }
    return m;
  }, [allPreorders]);

  const calendarGrid = useMemo(() => {
    const firstDow = new Date(calYear, calMonth - 1, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${calYear}-${String(calMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d });
    }
    return cells;
  }, [calYear, calMonth]);

  const selectedPickups = useMemo(() =>
    allPreorders
      .filter(p => p.pickupDate === selectedDate)
      .sort((a, b) => a.pickupWindow.localeCompare(b.pickupWindow) || a.customer.localeCompare(b.customer)),
  [allPreorders, selectedDate]);

  const selActive = selectedPickups.filter(p => p.status === "pending" || p.status === "paid" || p.status === "ready").length;
  const selRevenue = selectedPickups
    .filter(p => p.status !== "cancelled" && p.status !== "refunded")
    .reduce((s, p) => s + p.totalCents, 0);

  const counts: Record<RetailItemStatus, number> = { queued: 0, firing: 0, in_case: 0, sold_out_86: 0 };
  for (const it of session?.items ?? []) counts[it.status]++;
  const soldOut = (session?.items ?? []).filter(it => it.status === "sold_out_86");

  function prevMonth() { if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); } else setCalMonth(m => m - 1); }
  function nextMonth() { if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); } else setCalMonth(m => m + 1); }

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🔥 Retail Production Board</h1>
          <p className="text-sm text-zinc-500">Pick a date to see pickups; today's case status and windows below</p>
        </div>
        <button onClick={() => { setSelectedDate(today); setCalYear(tp.year); setCalMonth(tp.month); }}
          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">
          Today
        </button>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Calendar */}
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 lg:col-span-1" aria-label="Calendar">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-100">{MONTH_NAMES[calMonth - 1]} {calYear}</h2>
            <div className="flex gap-1">
              <button onClick={prevMonth} aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-700 bg-ink-800 text-zinc-300">‹</button>
              <button onClick={nextMonth} aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-700 bg-ink-800 text-zinc-300">›</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7">
            {DAY_NAMES.map(d => <div key={d} className="py-1 text-center text-xs font-medium text-zinc-600">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarGrid.map((cell, idx) => {
              if (!cell.date) return <div key={idx} className="h-10" />;
              const isToday = cell.date === today;
              const isSelected = cell.date === selectedDate;
              const mk = dayMarkers.get(cell.date);
              const retail = isRetailDay(cell.date);
              return (
                <button key={cell.date} onClick={() => setSelectedDate(cell.date!)}
                  className={`relative flex h-10 w-full flex-col items-center justify-center rounded-md text-xs font-medium transition-colors ${
                    isSelected ? "bg-fire text-white"
                      : isToday ? "border border-fire/40 bg-fire/20 text-fire-light"
                      : retail ? "bg-ink-800/60 text-zinc-200 hover:bg-ink-800"
                      : "text-zinc-500 hover:bg-ink-800/50"}`}>
                  <span>{cell.day}</span>
                  <span className="mt-0.5 flex gap-0.5">
                    {mk && mk.preorders > 0 && <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white/80" : "bg-green-400"}`} />}
                    {mk && mk.weekend > 0 && <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white/80" : "bg-fire-light"}`} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Preorders</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-fire-light" /> Weekend Pre-Order</span>
          </div>

          {/* Per-date quick stats */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Active pickups" value={String(selActive)} />
            <MiniStat label="Revenue" value={formatCents(selRevenue)} accent />
          </div>
        </section>

        {/* Selected-date pickups */}
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 lg:col-span-2" aria-label="Pickups for selected date">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
              📦 Pickups · {longDate(selectedDate)}
            </h2>
            <span className="rounded-full border border-ink-700 bg-ink-800 px-3 py-1 text-xs font-semibold text-zinc-400">
              {selectedPickups.length} order{selectedPickups.length !== 1 ? "s" : ""}
            </span>
          </div>
          {selectedPickups.length === 0 ? (
            <p className="py-12 text-center text-zinc-500">No preorders for this date.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedPickups.map(o => <PickupRow key={o.id} order={o} />)}
            </ul>
          )}
        </section>
      </div>

      {/* Overall preorder stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Preorder stats">
        <StatCard label="All active pickups" value={stats ? String(stats.activeCount) : "—"} />
        <StatCard label="Friday" value={stats ? String(stats.fridayCount) : "—"} />
        <StatCard label="Saturday" value={stats ? String(stats.saturdayCount) : "—"} />
        <StatCard label="Active revenue" value={stats ? formatCents(stats.activeRevenueCents) : "—"} accent />
      </section>

      {/* Today's fire sheet */}
      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Today's fire sheet">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
            🔥 Today's Fire Sheet {session && <span className="font-normal text-zinc-500">· {session.serviceDate}</span>}
          </h2>
          {session?.submittedToKitchenAt ? (
            <span className="rounded-full border border-green-700/50 bg-green-950/40 px-3 py-1 text-xs font-bold text-green-400">
              Submitted to kitchen · {new Date(session.submittedToKitchenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          ) : (
            <span className="rounded-full border border-ink-700 bg-ink-800 px-3 py-1 text-xs font-semibold text-zinc-400">Not yet submitted</span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ITEM_STATUSES.map(s => (
            <div key={s} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5">
              <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${ITEM_STATUS_META[s].cls}`}>{ITEM_STATUS_META[s].label}</span>
              <span className="text-lg font-black text-zinc-100">{counts[s]}</span>
            </div>
          ))}
        </div>

        {/* Sold-out (86) board */}
        <div className="mt-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-red-400">🚫 Sold Out / 86'd ({soldOut.length})</h3>
          {soldOut.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">Nothing 86'd — full case.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {soldOut.map(it => (
                <span key={it.id} className="rounded-lg border border-red-700/50 bg-red-950/40 px-3 py-1.5 text-sm font-bold text-red-300 line-through">
                  {it.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {session && session.items.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500">No items on today's sheet yet — sync from PAR on the Fire Sheet tab.</p>
        )}
      </section>

      {/* Weekend Pre-Order ordering windows */}
      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Weekend Pre-Order ordering windows">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">🛒 Weekend Pre-Order Ordering</h2>
          {drop && <span className="text-sm font-bold text-fire-light">{drop.title}</span>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <WindowCard day="Friday" date={drop?.fridayDate ?? null} open={ordering.friday}
            rule="Ordering closes Thursday 5:00 PM ET" />
          <WindowCard day="Saturday" date={drop?.saturdayDate ?? null} open={ordering.saturday}
            rule="Ordering opens Thursday 5:00 PM ET · closes Friday 3:00 PM ET" />
        </div>
      </section>
    </div>
  );
}

function PickupRow({ order }: { order: Preorder }) {
  const ch = order.channel === "fire_drop" ? "🔥" : order.channel === "catering" ? "🚚" : "🥖";
  const meta = PREORDER_STATUS_META[order.status] ?? { label: order.status, cls: "bg-ink-700 text-zinc-400" };
  const items = order.items.map(i => `${i.qty}× ${i.name}`).join(", ");
  return (
    <li className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800/50 p-3">
      <span className="shrink-0 text-lg" aria-hidden>{ch}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-zinc-100">{order.customer}</p>
          <span className="shrink-0 text-xs text-fire-light">⏰ {order.pickupWindow}</span>
        </div>
        <p className="truncate text-xs text-zinc-500" title={items}>{items}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-zinc-300">{formatCents(order.totalCents)}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
    </li>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-800 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-black ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function WindowCard({ day, date, open, rule }: { day: string; date: string | null; open: boolean; rule: string }) {
  return (
    <div className={`rounded-xl border p-4 ${open ? "border-green-700/50 bg-green-950/20" : "border-ink-700 bg-ink-800"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-zinc-100">{day}</p>
          <p className="text-xs text-zinc-500">{date ?? "—"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${open ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {open ? "Open" : "Closed"}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{rule}</p>
    </div>
  );
}
