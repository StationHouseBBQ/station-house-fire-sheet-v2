import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Preorder, PreorderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { formatCents, orderTotals } from "../../lib/money";
import { activeDropWeekend } from "../../lib/time";
import { downloadCsv, toCsv } from "../../lib/csv";

/**
 * Seminole · Preorders — V2 counterpart of the Manus RetailPreorders,
 * reorganized for floor use. Pickup-day tabs (Friday / Saturday of the
 * active drop weekend, Thursday for Cuban) sit above the channel tabs,
 * orders group under sticky day+window subheaders, and every active order
 * gets a one-tap fire "Picked Up ✓" bump. The default view shows only
 * active orders (pending/paid/ready); the other statuses, hide/unhide, and
 * history live behind a compact "⋯" menu so nothing is lost.
 */

const STATUSES: PreorderStatus[] = ["pending", "paid", "ready", "picked_up", "cancelled", "refunded"];

const STATUS_META: Record<PreorderStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-600/20 text-amber-400 border-amber-700/50" },
  paid: { label: "Paid", cls: "bg-blue-600/20 text-blue-400 border-blue-700/50" },
  ready: { label: "Ready", cls: "bg-green-600/20 text-green-400 border-green-700/50" },
  picked_up: { label: "Picked Up", cls: "bg-ink-700 text-zinc-400 border-ink-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-600/20 text-red-400 border-red-700/50" },
  refunded: { label: "Refunded", cls: "bg-purple-600/20 text-purple-400 border-purple-700/50" },
};

const CHANNEL_META = {
  fire_drop: { label: "Fire Drop", icon: "🔥" },
  cuban_thursday: { label: "Cuban Thu", icon: "🥖" },
} as const;

type ChannelFilter = "all" | "fire_drop" | "cuban_thursday";
type StatusFilter = "active" | "all" | "picked_up" | "cancelled" | "refunded";
type PickupDayTab = "all" | "friday" | "saturday" | "thursday";
type Sync = "idle" | "saving" | "saved" | "error";

const PICKUP_WINDOWS = ["11AM–12PM", "12–1PM", "1–2PM"];

/** Builds the standard preorder CSV (shared with Fire Drop Admin's export). */
export function preorderCsv(orders: Preorder[]): string {
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const headers = ["Ref", "Channel", "Customer", "Phone", "Email", "Pickup Date", "Window", "Items", "Subtotal", "Tax", "Total", "Status"];
  const rows = orders.map(o => [
    o.orderRef,
    o.channel === "fire_drop" ? "Fire Drop" : "Cuban Thursday",
    o.customer,
    o.phone,
    o.email,
    o.pickupDate,
    o.pickupWindow,
    o.items.map(i => `${i.qty}× ${i.name}`).join("; "),
    dollars(o.subtotalCents),
    dollars(o.taxCents),
    dollars(o.totalCents),
    o.status,
  ]);
  return toCsv(headers, rows);
}

/** Active = still on the floor: not picked up, cancelled, or refunded. */
function isActive(s: PreorderStatus): boolean {
  return s === "pending" || s === "paid" || s === "ready";
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function windowRank(w: string): number {
  const i = PICKUP_WINDOWS.indexOf(w);
  return i === -1 ? 99 : i;
}

const DAY_ORDER: Record<Exclude<PickupDayTab, "all">, number> = { thursday: 0, friday: 1, saturday: 2 };
const DAY_LABEL: Record<Exclude<PickupDayTab, "all">, string> = { thursday: "THURSDAY", friday: "FRIDAY", saturday: "SATURDAY" };

export function PreordersView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const undo = useUndo();
  const [sync, setSync] = useState<Sync>("idle");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [day, setDay] = useState<PickupDayTab>("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editItemsFor, setEditItemsFor] = useState<Preorder | null>(null);

  const weekend = useMemo(() => activeDropWeekend(new Date()), []);

  const { data: stats } = useQuery({
    queryKey: ["preorders", "stats"],
    queryFn: () => dal.preorders.stats(),
    refetchInterval: 30_000,
  });
  // Fetch all statuses so day-tab badges count active orders regardless of
  // the current status chip; status filtering happens client-side below.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["preorders", "list", channel, showHidden],
    queryFn: () => dal.preorders.list({ channel, status: "all", includeHidden: showHidden }),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["preorders", "list"] });
    qc.invalidateQueries({ queryKey: ["preorders", "stats"] });
  };

  const statusMut = useMutation({
    mutationFn: ({ id, to }: { id: string; to: PreorderStatus; from: PreorderStatus; customer: string }) =>
      withSync(dal.preorders.updateStatus(id, to, actor)),
    onSuccess: (_order, { id, to, from, customer }) => {
      invalidate();
      if (from !== to) {
        undo.offer(
          to === "picked_up" ? `${customer} picked up — undo?` : `${customer} → ${STATUS_META[to].label} — undo?`,
          async () => {
            await withSync(dal.preorders.updateStatus(id, from, actor));
            invalidate();
          },
        );
      }
    },
  });
  const hideMut = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      withSync(dal.preorders.setHidden(id, hidden, actor)),
    onSuccess: invalidate,
  });
  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof dal.preorders.createManual>[0]) =>
      withSync(dal.preorders.createManual(input, actor)),
    onSuccess: () => { setAddOpen(false); invalidate(); },
  });
  const editItemsMut = useMutation({
    mutationFn: ({ id, items }: {
      id: string; customer: string;
      items: Array<{ name: string; qty: number; unitPriceCents: number }>;
      prevItems: Array<{ name: string; qty: number; unitPriceCents: number }>;
    }) => withSync(dal.preorders.updateItems(id, items, actor)),
    onSuccess: (_order, { id, customer, prevItems }) => {
      setEditItemsFor(null);
      invalidate();
      undo.offer(`${customer} items updated — undo?`, async () => {
        await withSync(dal.preorders.updateItems(id, prevItems, actor));
        invalidate();
      });
    },
  });

  // Thursday (Cuban) = any pickup date that isn't the active weekend's Fri/Sat.
  const dayOf = (o: Preorder): Exclude<PickupDayTab, "all"> =>
    o.pickupDate === weekend.friday ? "friday" : o.pickupDate === weekend.saturday ? "saturday" : "thursday";

  const dayCounts = useMemo(() => {
    const c: Record<PickupDayTab, number> = { all: 0, friday: 0, saturday: 0, thursday: 0 };
    for (const o of orders) {
      if (!isActive(o.status)) continue;
      c.all += 1;
      c[dayOf(o)] += 1;
    }
    return c;
  }, [orders, weekend]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      if (status === "active" ? !isActive(o.status) : status !== "all" && o.status !== status) return false;
      if (day !== "all" && dayOf(o) !== day) return false;
      if (!q) return true;
      return o.customer.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q) ||
        o.orderRef.toLowerCase().includes(q);
    });
  }, [orders, search, status, day, weekend]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group under day + pickup-window subheaders; empty groups never render
  // because groups are built from the filtered orders themselves.
  const groups = useMemo(() => {
    const map = new Map<string, { day: Exclude<PickupDayTab, "all">; window: string; orders: Preorder[] }>();
    for (const o of filtered) {
      const d = dayOf(o);
      const key = `${d}|${o.pickupWindow}`;
      const g = map.get(key) ?? { day: d, window: o.pickupWindow, orders: [] };
      g.orders.push(o);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) =>
      DAY_ORDER[a.day] - DAY_ORDER[b.day] ||
      windowRank(a.window) - windowRank(b.window) ||
      a.window.localeCompare(b.window));
  }, [filtered, weekend]); // eslint-disable-line react-hooks/exhaustive-deps

  const DAY_TABS: Array<[PickupDayTab, string]> = [
    ["all", "All days"],
    ["friday", `Friday ${shortDate(weekend.friday)}`],
    ["saturday", `Saturday ${shortDate(weekend.saturday)}`],
    ["thursday", "Thursday (Cuban)"],
  ];

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Preorders</h1>
          <p className="text-sm text-zinc-500">Fire Drop + Cuban Thursday pickups</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => downloadCsv(`preorders-${new Date().toISOString().slice(0, 10)}.csv`, preorderCsv(filtered))}
            disabled={filtered.length === 0}
            title={filtered.length === 0 ? "No orders match the current filters" : `Export ${filtered.length} filtered orders`}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 disabled:opacity-40">
            ⬇ Export CSV
          </button>
          <button onClick={() => setAddOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Manual Order</button>
        </div>
      </header>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active pickups" value={stats ? String(stats.activeCount) : "—"} />
        <Stat label="Friday" value={stats ? String(stats.fridayCount) : "—"} />
        <Stat label="Saturday" value={stats ? String(stats.saturdayCount) : "—"} />
        <Stat label="Active revenue" value={stats ? formatCents(stats.activeRevenueCents) : "—"} accent />
      </div>

      {/* Pickup day tabs */}
      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1" role="tablist" aria-label="Pickup day">
        {DAY_TABS.map(([d, label]) => (
          <button key={d} onClick={() => setDay(d)} role="tab" aria-selected={day === d}
            className={`min-h-[44px] flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              day === d ? "bg-fire text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {label}
            <span className={`ml-1.5 inline-block min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-xs font-black ${
              day === d ? "bg-white/20 text-white" : "bg-ink-700 text-zinc-300"}`}
              aria-label={`${dayCounts[d]} active orders`}>
              {dayCounts[d]}
            </span>
          </button>
        ))}
      </div>

      {/* Channel tabs */}
      <div className="mt-2 flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        {([["all", "All"], ["fire_drop", "🔥 Fire Drop"], ["cuban_thursday", "🥖 Cuban Thursday"]] as Array<[ChannelFilter, string]>).map(([c, label]) => (
          <button key={c} onClick={() => setChannel(c)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              channel === c ? "bg-fire text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Status chips + search + hidden toggle */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["active", "all", "picked_up", "cancelled", "refunded"] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-bold ${
              status === s
                ? "border-fire bg-fire/20 text-fire-light"
                : "border-ink-700 bg-ink-900 text-zinc-400 hover:text-zinc-200"}`}>
            {s === "active" ? "Active" : s === "all" ? "All" : STATUS_META[s].label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)}
            className="h-4 w-4 accent-orange-600" />
          Show hidden
        </label>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, or order ref…"
        className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600"
        aria-label="Search preorders" />

      {/* Orders, grouped under sticky day + window subheaders */}
      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading preorders…</p>
      ) : groups.length === 0 ? (
        <p className="py-20 text-center text-zinc-500">No preorders match the current filters.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(g => (
            <section key={`${g.day}|${g.window}`} aria-label={`${DAY_LABEL[g.day]} ${g.window} pickups`}>
              <h2 className="sticky top-0 z-10 rounded-lg border border-ink-700 bg-ink-800/95 px-3 py-2 text-xs font-black uppercase tracking-widest text-fire-light backdrop-blur">
                {DAY_LABEL[g.day]} · {g.window} <span className="text-zinc-400">({g.orders.length})</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {g.orders.map(o => (
                  <OrderCard key={o.id} order={o}
                    busy={statusMut.isPending}
                    onStatus={to => statusMut.mutate({ id: o.id, to, from: o.status, customer: o.customer })}
                    onHide={hidden => hideMut.mutate({ id: o.id, hidden })}
                    onEditItems={() => { editItemsMut.reset(); setEditItemsFor(o); }} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {addOpen && (
        <ManualOrderDialog busy={createMut.isPending} error={createMut.error?.message ?? null}
          onCancel={() => setAddOpen(false)} onSubmit={i => createMut.mutate(i)} />
      )}
      {editItemsFor && (
        <EditItemsDialog order={editItemsFor} busy={editItemsMut.isPending}
          error={editItemsMut.error?.message ?? null}
          onCancel={() => setEditItemsFor(null)}
          onSave={items => editItemsMut.mutate({
            id: editItemsFor.id,
            customer: editItemsFor.customer,
            items,
            prevItems: editItemsFor.items.map(i => ({ name: i.name, qty: i.qty, unitPriceCents: i.unitPriceCents })),
          })} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-xl font-black ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function OrderCard({ order, busy, onStatus, onHide, onEditItems }: {
  order: Preorder; busy: boolean;
  onStatus: (to: PreorderStatus) => void; onHide: (hidden: boolean) => void;
  onEditItems: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const ch = CHANNEL_META[order.channel];
  const active = isActive(order.status);
  const itemsSummary = order.items.map(i => `${i.qty}× ${i.name}`).join(", ");
  return (
    <li className={`rounded-xl border bg-ink-900 p-3 ${order.hidden ? "border-ink-700 opacity-60" : "border-ink-700"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-ink-800 px-2 py-1 text-xs font-bold text-zinc-300">{ch.icon} {ch.label}</span>
        <span className="text-sm font-bold text-zinc-100">{order.customer}</span>
        <span className="font-mono text-xs text-zinc-500">{order.orderRef}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_META[order.status].cls}`}>
          {STATUS_META[order.status].label}
        </span>
        {order.hidden && <span className="rounded-full border border-ink-700 px-2 py-0.5 text-xs text-zinc-500">Hidden</span>}
        <span className="ml-auto text-sm font-black text-fire-light">{formatCents(order.totalCents)}</span>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        📅 {order.pickupDate} · ⏰ {order.pickupWindow} · 📞 {order.phone}{order.email ? ` · ✉️ ${order.email}` : ""}
      </p>
      <p className="mt-1 truncate text-sm text-zinc-300" title={itemsSummary}>{itemsSummary}</p>

      {/* Primary action: one-tap bump. Everything else lives behind ⋯ */}
      <div className="mt-2.5 flex items-stretch gap-2">
        {active && (
          <button onClick={() => onStatus("picked_up")} disabled={busy}
            className="min-h-[56px] flex-1 rounded-xl bg-fire px-4 text-lg font-black uppercase tracking-wide text-white disabled:opacity-50"
            aria-label={`Mark ${order.orderRef} picked up`}>
            Picked Up ✓
          </button>
        )}
        <button onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}
          aria-label={`More actions for ${order.orderRef}`}
          className={`rounded-xl border border-ink-700 px-4 text-xl font-black text-zinc-400 hover:text-zinc-200 ${
            active ? "min-h-[56px] w-16" : "min-h-[44px] flex-none px-5"}`}>
          ⋯
        </button>
        {!active && <span className="self-center text-xs text-zinc-600">{STATUS_META[order.status].label} — use ⋯ to reopen</span>}
      </div>

      {moreOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-950/50 p-2">
          <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-zinc-600">Set status</span>
          {STATUSES.filter(s => s !== order.status).map(s => (
            <button key={s} onClick={() => onStatus(s)} disabled={busy}
              className="min-h-[36px] rounded-full border border-ink-700 px-3 py-1 text-xs font-bold text-zinc-400 hover:text-zinc-100 disabled:opacity-50">
              {STATUS_META[s].label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-ink-700" aria-hidden="true" />
          <button onClick={onEditItems}
            className="min-h-[36px] rounded-full border border-ink-700 px-3 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            ✏️ Edit items
          </button>
          <button onClick={() => onHide(!order.hidden)}
            className="min-h-[36px] rounded-full border border-ink-700 px-3 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            {order.hidden ? "Unhide" : "Hide"}
          </button>
          <button onClick={() => setShowHistory(v => !v)} aria-expanded={showHistory}
            className="min-h-[36px] rounded-full border border-ink-700 px-3 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            {showHistory ? "Hide history ▲" : "History ▼"}
          </button>
        </div>
      )}

      {moreOpen && showHistory && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-950/50 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Status history</p>
          {order.statusHistory.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-600">No changes recorded.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {[...order.statusHistory].reverse().map((h, i) => (
                <li key={i} className="text-xs text-zinc-400">
                  {h.from ? `${STATUS_META[h.from].label} → ` : ""}<span className="font-bold">{STATUS_META[h.to].label}</span>
                  {" "}· {new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" "}· <span className="text-zinc-500">{h.actor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

interface DraftItem { name: string; qty: string; price: string; }

function dollarsToCents(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function EditItemsDialog({ order, onSave, onCancel, busy, error }: {
  order: Preorder;
  onSave: (items: Array<{ name: string; qty: number; unitPriceCents: number }>) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [items, setItems] = useState<DraftItem[]>(
    order.items.map(i => ({ name: i.name, qty: String(i.qty), price: (i.unitPriceCents / 100).toFixed(2) })));
  const [formError, setFormError] = useState<string | null>(null);

  const setItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const stepQty = (idx: number, delta: number) =>
    setItems(list => list.map((it, i) => {
      if (i !== idx) return it;
      const q = Math.trunc(Number(it.qty));
      const next = Math.max(1, (Number.isFinite(q) ? q : 1) + delta);
      return { ...it, qty: String(next) };
    }));

  const validLines = items
    .map(it => ({ name: it.name.trim(), qty: Math.trunc(Number(it.qty)), unitPriceCents: dollarsToCents(it.price) }))
    .filter((l): l is { name: string; qty: number; unitPriceCents: number } =>
      l.name !== "" && Number.isFinite(l.qty) && l.qty > 0 && l.unitPriceCents !== null);

  // Client-side preview only — the DAL recomputes authoritative totals on save.
  const preview = orderTotals(validLines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));

  const submit = () => {
    setFormError(null);
    if (items.length === 0 || validLines.length === 0) return setFormError("At least one item with a name, qty, and price is required.");
    if (validLines.length !== items.length) return setFormError("Every line needs a name, a whole-number qty of 1+, and a valid price.");
    onSave(validLines);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Edit items for ${order.orderRef}`}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <form className="my-auto w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">Edit items</h3>
        <p className="mt-0.5 text-sm text-zinc-500">{order.customer} · <span className="font-mono">{order.orderRef}</span></p>
        {(formError || error) && (
          <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>
        )}

        <div className="mt-4 space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input value={it.name} onChange={e => setItem(idx, { name: e.target.value })} placeholder="Item name"
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100"
                aria-label={`Line ${idx + 1} name`} />
              <div className="flex items-center rounded-lg border border-ink-700 bg-ink-800">
                <button type="button" onClick={() => stepQty(idx, -1)}
                  className="min-h-[44px] px-2.5 text-lg font-bold text-zinc-400 hover:text-zinc-100"
                  aria-label={`Decrease line ${idx + 1} qty`}>−</button>
                <input value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} inputMode="numeric"
                  className="w-10 bg-transparent py-2.5 text-center text-sm font-bold text-zinc-100"
                  aria-label={`Line ${idx + 1} qty`} />
                <button type="button" onClick={() => stepQty(idx, 1)}
                  className="min-h-[44px] px-2.5 text-lg font-bold text-zinc-400 hover:text-zinc-100"
                  aria-label={`Increase line ${idx + 1} qty`}>+</button>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                <input value={it.price} onChange={e => setItem(idx, { price: e.target.value })} inputMode="decimal" placeholder="0.00"
                  className="w-20 rounded-lg border border-ink-700 bg-ink-800 py-2.5 pl-6 pr-2 text-right text-sm text-zinc-100"
                  aria-label={`Line ${idx + 1} price in dollars`} />
              </div>
              <button type="button" onClick={() => setItems(list => list.filter((_, i) => i !== idx))}
                className="rounded-lg border border-ink-700 px-2.5 py-2.5 text-sm text-zinc-500 hover:text-red-400"
                aria-label={`Remove line ${idx + 1}`}>✕</button>
            </div>
          ))}
          {items.length === 0 && <p className="py-2 text-center text-sm text-zinc-600">No lines — add one below.</p>}
        </div>
        <button type="button" onClick={() => setItems(list => [...list, { name: "", qty: "1", price: "" }])}
          className="mt-2 rounded-lg border border-dashed border-ink-700 px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200">
          + Add line
        </button>

        <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-sm">
          <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatCents(preview.subtotalCents)}</span></div>
          <div className="flex justify-between text-zinc-400"><span>Tax (7.5%)</span><span>{formatCents(preview.taxCents)}</span></div>
          <div className="mt-1 flex justify-between border-t border-ink-700 pt-1 font-black text-zinc-100">
            <span>Total</span><span className="text-fire-light">{formatCents(preview.totalCents)}</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">Preview only — final totals are recomputed on save.</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save items"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ManualOrderDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (i: { channel: "fire_drop" | "cuban_thursday"; customer: string; phone: string; email: string; pickupDate: string; pickupWindow: string; items: Array<{ name: string; qty: number; unitPriceCents: number }> }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [channel, setChannel] = useState<"fire_drop" | "cuban_thursday">("fire_drop");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupWindow, setPickupWindow] = useState(PICKUP_WINDOWS[0]);
  const [items, setItems] = useState<DraftItem[]>([{ name: "", qty: "1", price: "" }]);
  const [formError, setFormError] = useState<string | null>(null);

  const setItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const validLines = items
    .map(it => ({ name: it.name.trim(), qty: Math.trunc(Number(it.qty)), unitPriceCents: dollarsToCents(it.price) }))
    .filter((l): l is { name: string; qty: number; unitPriceCents: number } =>
      l.name !== "" && Number.isFinite(l.qty) && l.qty > 0 && l.unitPriceCents !== null);

  // Client-side preview only — the DAL computes authoritative totals.
  const preview = orderTotals(validLines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));

  const submit = () => {
    setFormError(null);
    if (!customer.trim()) return setFormError("Customer name is required.");
    if (!pickupDate) return setFormError("Pickup date is required.");
    if (validLines.length === 0) return setFormError("At least one item with a name, qty, and price is required.");
    onSubmit({ channel, customer: customer.trim(), phone: phone.trim(), email: email.trim(), pickupDate, pickupWindow, items: validLines });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Create manual order"
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <form className="my-auto w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">Manual order</h3>
        {(formError || error) && (
          <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Channel
            <select value={channel} onChange={e => setChannel(e.target.value as "fire_drop" | "cuban_thursday")}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              <option value="fire_drop">Fire Drop</option>
              <option value="cuban_thursday">Cuban Thursday</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Customer
            <input value={customer} onChange={e => setCustomer(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Phone
            <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Email
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Pickup date
            <input value={pickupDate} onChange={e => setPickupDate(e.target.value)} type="date" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Pickup window
            <select value={pickupWindow} onChange={e => setPickupWindow(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {PICKUP_WINDOWS.map(w => <option key={w}>{w}</option>)}
            </select>
          </label>
        </div>

        <p className="mt-4 text-sm font-semibold text-zinc-400">Items</p>
        <div className="mt-1 space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input value={it.name} onChange={e => setItem(idx, { name: e.target.value })} placeholder="Item name"
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100"
                aria-label={`Item ${idx + 1} name`} />
              <input value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} inputMode="numeric" placeholder="Qty"
                className="w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-center text-sm text-zinc-100"
                aria-label={`Item ${idx + 1} qty`} />
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                <input value={it.price} onChange={e => setItem(idx, { price: e.target.value })} inputMode="decimal" placeholder="0.00"
                  className="w-24 rounded-lg border border-ink-700 bg-ink-800 py-2.5 pl-6 pr-2 text-right text-sm text-zinc-100"
                  aria-label={`Item ${idx + 1} price in dollars`} />
              </div>
              <button type="button" onClick={() => setItems(list => list.filter((_, i) => i !== idx))}
                disabled={items.length === 1}
                className="rounded-lg border border-ink-700 px-2.5 py-2.5 text-sm text-zinc-500 hover:text-red-400 disabled:opacity-30"
                aria-label={`Remove item ${idx + 1}`}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems(list => [...list, { name: "", qty: "1", price: "" }])}
          className="mt-2 rounded-lg border border-dashed border-ink-700 px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200">
          + Add line
        </button>

        <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-sm">
          <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatCents(preview.subtotalCents)}</span></div>
          <div className="flex justify-between text-zinc-400"><span>Tax (7.5%)</span><span>{formatCents(preview.taxCents)}</span></div>
          <div className="mt-1 flex justify-between border-t border-ink-700 pt-1 font-black text-zinc-100">
            <span>Total</span><span className="text-fire-light">{formatCents(preview.totalCents)}</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">Preview only — final totals are computed server-side.</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}
