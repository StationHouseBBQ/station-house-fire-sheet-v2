import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Preorder, PreorderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Preorder channel admin — generic per-channel preorder manager used
 * by the Weekend Pre-Orders (fire_drop) and Cuban Thursday admin surfaces
 * (Manus OnlineOrdersAdmin / CubanThursdayAdmin order lists). Status filters,
 * search, per-row status dropdown, hide/unhide, and a totals summary.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const STATUSES: PreorderStatus[] = ["pending", "paid", "ready", "picked_up", "cancelled", "refunded"];

const STATUS_CLS: Record<PreorderStatus, string> = {
  pending: "bg-ink-700 text-zinc-300",
  paid: "bg-blue-600 text-white",
  ready: "bg-amber-600 text-white",
  picked_up: "bg-green-600 text-white",
  cancelled: "bg-red-700 text-white",
  refunded: "bg-red-900 text-red-200",
};

export function PreorderChannelAdmin({ channel, title }: { channel: "fire_drop" | "cuban_thursday"; title: string }) {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [statusFilter, setStatusFilter] = useState<PreorderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["preorders", channel, statusFilter, showHidden],
    queryFn: () => dal.preorders.list({ channel, status: statusFilter, includeHidden: showHidden }),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["preorders"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PreorderStatus }) =>
      withSync(dal.preorders.updateStatus(id, status, actor)),
    onSuccess: invalidate,
  });
  const hideMut = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      withSync(dal.preorders.setHidden(id, hidden, actor)),
    onSuccess: invalidate,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders ?? [];
    return (orders ?? []).filter(o =>
      [o.customer, o.orderRef, o.email, o.phone].some(f => f.toLowerCase().includes(q)));
  }, [orders, search]);

  const revenue = filtered
    .filter(o => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((s, o) => s + o.totalCents, 0);

  if (isLoading || !orders) return <p className="py-20 text-center text-zinc-500">Loading preorders…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500">{channel === "fire_drop" ? "Weekend Pre-Order weekend pickup preorders" : "Cuban Thursday preorders"}</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
              statusFilter === s ? "bg-fire text-white" : "border border-ink-700 bg-ink-900 text-zinc-400"}`}>
            {s.replace("_", " ")}
          </button>
        ))}
        <label className="ml-auto flex min-h-[36px] items-center gap-2 text-xs font-semibold text-zinc-400">
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} className="h-4 w-4" />
          Show hidden
        </label>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, ref, email, phone…"
        aria-label="Search preorders"
        className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />

      {/* Totals summary */}
      <div className="mt-4 flex flex-wrap gap-4 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-300">{filtered.length} order{filtered.length === 1 ? "" : "s"} shown</p>
        <p className="text-sm font-semibold text-zinc-300">Revenue: <span className="font-mono text-fire-light">{formatCents(revenue)}</span>
          <span className="ml-1 text-xs font-normal text-zinc-600">(excludes cancelled/refunded)</span></p>
      </div>

      <ul className="mt-4 space-y-3">
        {filtered.map(o => (
          <PreorderCard key={o.id} order={o}
            onStatus={status => statusMut.mutate({ id: o.id, status })}
            onHide={() => hideMut.mutate({ id: o.id, hidden: !o.hidden })} />
        ))}
        {filtered.length === 0 && <li className="py-10 text-center text-zinc-500">No preorders match.</li>}
      </ul>
    </div>
  );
}

function PreorderCard({ order: o, onStatus, onHide }: {
  order: Preorder;
  onStatus: (s: PreorderStatus) => void;
  onHide: () => void;
}) {
  return (
    <li className={`rounded-xl border border-ink-700 bg-ink-900 p-4 ${o.hidden ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-zinc-100">
            {o.customer}
            <span className="ml-2 font-mono text-xs font-normal text-zinc-500">{o.orderRef}</span>
            {o.hidden && <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-black text-zinc-400">HIDDEN</span>}
          </p>
          <p className="text-xs text-zinc-500">{o.phone} · {o.email}</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-400">Pickup {o.pickupDate} · {o.pickupWindow}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${STATUS_CLS[o.status]}`}>{o.status.replace("_", " ")}</span>
          <select value={o.status} onChange={e => onStatus(e.target.value as PreorderStatus)}
            aria-label={`Status for ${o.orderRef}`}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-xs font-semibold text-zinc-200">
            {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <button onClick={onHide}
            className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            {o.hidden ? "Unhide" : "Hide"}
          </button>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 border-t border-ink-800 pt-2 text-sm text-zinc-300">
        {o.items.map(i => (
          <li key={i.id} className="flex justify-between">
            <span>{i.qty}× {i.name}</span>
            <span className="font-mono text-zinc-500">{formatCents(i.unitPriceCents * i.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-right text-sm font-bold text-zinc-100">
        Total <span className="font-mono text-fire-light">{formatCents(o.totalCents)}</span>
        <span className="ml-2 text-xs font-normal text-zinc-600">(incl. tax {formatCents(o.taxCents)})</span>
      </p>
    </li>
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
