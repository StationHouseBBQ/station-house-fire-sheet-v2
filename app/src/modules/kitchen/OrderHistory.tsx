import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, OrderStatus, OrderTicket } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Kitchen · Order History — V2 implementation of the Manus KitchenOrderHistory.
 * Full order list across all dates with text search (customer/ref), status
 * filter chips, channel dropdown, expandable rows (items + status timeline),
 * and a status-update dropdown per order.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type StatusFilter = OrderStatus | "all";

const STATUSES: OrderStatus[] = ["confirmed", "in_prep", "ready", "picked_up", "delivered", "cancelled"];
const CHANNELS: OrderChannel[] = ["catering", "fire_drop", "cuban_thursday", "retail", "walk_in"];

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  in_prep: { label: "In Prep", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  ready: { label: "Ready", cls: "bg-green-500/20 text-green-300 border-green-500/30" },
  picked_up: { label: "Picked Up", cls: "bg-zinc-600/40 text-zinc-300 border-zinc-500/30" },
  delivered: { label: "Delivered", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  cancelled: { label: "Cancelled", cls: "bg-red-900/40 text-red-400 border-red-800/40" },
};

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  catering: "Catering", fire_drop: "Fire Drop", cuban_thursday: "Cuban Thursday", retail: "Retail", walk_in: "Walk-in",
};

export function OrderHistoryView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<OrderChannel | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sync, setSync] = useState<Sync>("idle");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: () => dal.orders.list(),
    refetchInterval: 60_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const statusMut = useMutation({
    mutationFn: ({ id, to }: { id: string; to: OrderStatus }) => withSync(dal.orders.updateStatus(id, to, actor)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter(o => status === "all" || o.status === status)
      .filter(o => channel === "all" || o.channel === channel)
      .filter(o => !q || o.customer.toLowerCase().includes(q) || o.orderRef.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.timeWindow.localeCompare(b.timeWindow));
  }, [orders, search, status, channel]);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const countFor = (s: StatusFilter) => (s === "all" ? orders.length : orders.filter(o => o.status === s).length);

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Order History</h1>
          <p className="text-sm text-zinc-500">{filtered.length} of {orders.length} orders</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Search + channel */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer or order ref…"
          aria-label="Search orders"
          className="min-h-[44px] flex-1 basis-56 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        <select value={channel} onChange={e => setChannel(e.target.value as OrderChannel | "all")}
          aria-label="Filter by channel"
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100">
          <option value="all">All channels</option>
          {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
      </div>

      {/* Status chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(["all", ...STATUSES] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`min-h-[44px] rounded-full border px-3.5 py-2 text-xs font-bold uppercase tracking-wide ${
              status === s ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-400"
            }`}>
            {s === "all" ? "All" : STATUS_META[s].label} <span className="font-normal opacity-70">({countFor(s)})</span>
          </button>
        ))}
      </div>

      {isLoading && <p className="py-20 text-center text-zinc-500">Loading orders…</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="mt-4 rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">
          No orders match {search ? "this search" : "these filters"}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {filtered.map(o => (
          <OrderRow key={o.id} order={o} expanded={expanded.has(o.id)} onToggle={() => toggle(o.id)}
            onStatus={to => statusMut.mutate({ id: o.id, to })} busy={statusMut.isPending} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order, expanded, onToggle, onStatus, busy }: {
  order: OrderTicket; expanded: boolean; onToggle: () => void;
  onStatus: (to: OrderStatus) => void; busy: boolean;
}) {
  return (
    <article className="rounded-xl border border-ink-700 bg-ink-900">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button onClick={onToggle} aria-expanded={expanded}
          className="min-h-[44px] min-w-0 flex-1 text-left" aria-label={`${order.customer} — ${expanded ? "collapse" : "expand"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-zinc-100">{order.customer}</p>
            <span className="font-mono text-xs text-zinc-500">{order.orderRef}</span>
          </div>
          <p className="text-xs text-zinc-500">
            {order.serviceDate} · {order.timeWindow} · {CHANNEL_LABEL[order.channel]}
            {order.guests != null && <> · {order.guests} guests</>}
          </p>
        </button>
        <span className={`rounded border px-2 py-1 text-xs font-bold ${STATUS_META[order.status].cls}`}>
          {STATUS_META[order.status].label}
        </span>
        <label className="sr-only" htmlFor={`status-${order.id}`}>Update status for {order.customer}</label>
        <select id={`status-${order.id}`} value={order.status} disabled={busy}
          onChange={e => { const to = e.target.value as OrderStatus; if (to !== order.status) onStatus(to); }}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {expanded && (
        <div className="grid gap-4 border-t border-ink-700 px-4 py-3 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Items</h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              {order.items.map(it => (
                <li key={it.id} className="flex justify-between gap-2">
                  <span className="text-zinc-300">{it.name}</span>
                  <span className="shrink-0 font-bold text-zinc-100">{it.qty} {it.unit}</span>
                </li>
              ))}
            </ul>
            {order.notes && <p className="mt-2 text-xs text-zinc-500">📝 {order.notes}</p>}
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Status timeline</h3>
            <ol className="mt-1.5 space-y-1.5 text-xs">
              {order.statusHistory.length === 0 && <li className="text-zinc-600">No status changes recorded</li>}
              {order.statusHistory.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fire" />
                  <span className="text-zinc-400">
                    <span className="font-semibold text-zinc-200">
                      {h.from ? `${STATUS_META[h.from].label} → ` : ""}{STATUS_META[h.to].label}
                    </span>{" "}
                    · {new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    <span className="text-zinc-600"> · {h.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </article>
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
