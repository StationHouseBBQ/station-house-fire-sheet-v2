import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, OrderStatus, OrderTicket } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { etParts } from "../../lib/time";

/**
 * Kitchen · Fire Sheets — V2 implementation of the Manus ProductionBoard
 * Fire Sheets tab: date chips for the week, per-order tickets with inline
 * notes editing, status-advance flow, and a daily item-totals panel.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  fire_drop: { label: "Weekend Pre-Order", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  cuban_thursday: { label: "Cuban Thu", cls: "bg-green-500/20 text-green-300 border-green-500/30" },
  retail: { label: "Retail", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  walk_in: { label: "Walk-in", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
};

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-blue-500/20 text-blue-300" },
  in_prep: { label: "In Prep", cls: "bg-amber-500/20 text-amber-300" },
  ready: { label: "Ready", cls: "bg-green-500/20 text-green-300" },
  picked_up: { label: "Picked Up", cls: "bg-zinc-600/40 text-zinc-300" },
  delivered: { label: "Delivered", cls: "bg-zinc-600/40 text-zinc-300" },
  cancelled: { label: "Cancelled", cls: "bg-red-900/40 text-red-400" },
};

/** Fire-sheet advance flow: confirmed → in_prep → ready → picked_up. */
const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  confirmed: { to: "in_prep", label: "🔥 Start Prep" },
  in_prep: { to: "ready", label: "✅ Mark Ready" },
  ready: { to: "picked_up", label: "📦 Picked Up" },
};

type Sync = "idle" | "saving" | "saved" | "error";

function todayEt(): string {
  const p = etParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function chipLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

export function FireSheets() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const undo = useUndo();
  const today = todayEt();
  const [selected, setSelected] = useState<string>(today);
  const [sync, setSync] = useState<Sync>("idle");

  const { data: weekDates = [] } = useQuery({
    queryKey: ["orders", "weekDates"],
    queryFn: () => dal.orders.weekDates(),
  });
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "byDate", selected],
    queryFn: () => dal.orders.list({ date: selected }),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["orders"] });

  const statusMut = useMutation({
    mutationFn: ({ id, to }: { id: string; to: OrderStatus; from: OrderStatus; customer: string }) =>
      withSync(dal.orders.updateStatus(id, to, actor)),
    onSuccess: (_order, { id, to, from, customer }) => {
      invalidate();
      if (from !== to) {
        undo.offer(`${customer} → ${STATUS_META[to].label}`, async () => {
          await withSync(dal.orders.updateStatus(id, from, actor));
          invalidate();
        });
      }
    },
  });
  const notesMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => withSync(dal.orders.updateNotes(id, notes, actor)),
    onSuccess: invalidate,
  });

  const active = useMemo(() => orders.filter(o => o.status !== "cancelled"), [orders]);
  const dailyTotals = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; total: number }>();
    for (const o of active) for (const it of o.items) {
      const k = `${it.name}|${it.unit}`;
      const e = m.get(k) ?? { name: it.name, unit: it.unit, total: 0 };
      e.total += it.qty;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [active]);

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Fire Sheets</h1>
          <p className="text-sm text-zinc-500">{active.length} active order{active.length !== 1 ? "s" : ""} · {selected}</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Print-only sheet header (screen header + nav are hidden by the print CSS) */}
      <p className="hidden text-lg font-black print:block">
        Station House BBQ — Fire Sheet · {selected}
      </p>

      {/* Date chips */}
      <div className="no-print mt-4 flex flex-wrap gap-2">
        {weekDates.map(date => (
          <button key={date} onClick={() => setSelected(date)}
            className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
              selected === date
                ? "border-fire bg-fire text-white"
                : date === today
                ? "border-fire/50 bg-ink-800 text-fire-light"
                : "border-ink-700 bg-ink-800 text-zinc-300"
            }`}>
            {chipLabel(date)}{date === today && <span className="ml-1 text-[10px] uppercase">· today</span>}
          </button>
        ))}
      </div>

      {isLoading && <p className="py-20 text-center text-zinc-500">Loading fire sheets…</p>}

      {!isLoading && (
        <div className="print-area mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
          {/* Order tickets */}
          <div className="space-y-3">
            {orders.length === 0 && (
              <p className="rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">
                No orders for this day
              </p>
            )}
            {orders.map(o => (
              <Ticket key={o.id} order={o}
                onAdvance={to => statusMut.mutate({ id: o.id, to, from: o.status, customer: o.customer })}
                onSaveNotes={notes => notesMut.mutate({ id: o.id, notes })}
                busy={statusMut.isPending || notesMut.isPending} />
            ))}
          </div>

          {/* Daily totals */}
          <aside className="h-fit rounded-xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-fire-light">Daily totals</h2>
                <p className="text-xs text-zinc-500">All active orders · {selected}</p>
              </div>
              <button onClick={() => window.print()}
                className="no-print min-h-[44px] shrink-0 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-bold text-zinc-200 hover:text-white"
                aria-label={`Print fire sheet for ${selected}`}>
                🖨 Print
              </button>
            </div>
            {dailyTotals.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-600">Nothing to fire</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {dailyTotals.map(t => (
                  <li key={`${t.name}|${t.unit}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-zinc-300">{t.name}</span>
                    <span className="shrink-0 font-black text-zinc-100">{t.total} <span className="text-xs font-normal text-zinc-500">{t.unit}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Ticket({ order, onAdvance, onSaveNotes, busy }: {
  order: OrderTicket;
  onAdvance: (to: OrderStatus) => void;
  onSaveNotes: (notes: string) => void;
  busy: boolean;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState(order.notes ?? "");
  const next = NEXT_STATUS[order.status];

  return (
    <article className={`rounded-xl border bg-ink-900 p-4 ${order.status === "cancelled" ? "border-red-900/50 opacity-60" : "border-ink-700"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-zinc-100">{order.customer}</p>
          <p className="text-xs text-zinc-500">
            <span className="font-mono">{order.orderRef}</span> · {order.timeWindow}
            {order.guests != null && <> · {order.guests} guests</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded border px-2 py-0.5 text-xs font-bold ${CHANNEL_META[order.channel].cls}`}>{CHANNEL_META[order.channel].label}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${STATUS_META[order.status].cls}`}>{STATUS_META[order.status].label}</span>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-ink-800 rounded-lg border border-ink-800 bg-ink-950 px-3">
        {order.items.map(it => (
          <li key={it.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="text-zinc-200">{it.name}{it.notes ? <span className="ml-1 text-xs text-zinc-500">({it.notes})</span> : null}</span>
            <span className="shrink-0 font-black text-fire-light">{it.qty} <span className="text-xs font-normal text-zinc-500">{it.unit}</span></span>
          </li>
        ))}
      </ul>

      {/* Notes */}
      <div className="mt-3">
        {editingNotes ? (
          <div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
              className="w-full rounded-lg border border-fire/50 bg-ink-800 px-3 py-2 text-sm text-zinc-100"
              aria-label={`Notes for ${order.customer}`} />
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={() => { setDraft(order.notes ?? ""); setEditingNotes(false); }}
                className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-zinc-300">Cancel</button>
              <button onClick={() => { onSaveNotes(draft); setEditingNotes(false); }} disabled={busy}
                className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save notes</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setDraft(order.notes ?? ""); setEditingNotes(true); }}
            className={`min-h-[44px] w-full rounded-lg border border-dashed border-ink-700 px-3 py-2 text-left text-xs text-zinc-400 hover:border-fire/40 ${order.notes ? "" : "no-print"}`}>
            {order.notes ? <>📝 {order.notes} <span className="text-zinc-600">— tap to edit</span></> : "＋ Add notes"}
          </button>
        )}
      </div>

      {next && (
        <button onClick={() => onAdvance(next.to)} disabled={busy}
          className="no-print mt-3 min-h-[44px] w-full rounded-lg bg-fire px-4 py-2.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50">
          {next.label}
        </button>
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
