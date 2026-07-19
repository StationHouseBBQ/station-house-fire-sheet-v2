import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { KdsStage, KdsTicket, Preorder, PreorderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Seminole · FOH KDS — V2 counterpart of the Manus SeminoleKDS. Read-focused
 * board for the retail counter: today's tickets grouped Kitchen / Expo /
 * Ready with big floor-visible type. Item check marks mirror the kitchen and
 * expo lanes read-only; the actions here are handing off a ready ticket and
 * bumping today's preorder pickups off the PICKUPS board below the lanes.
 */

const STAGES: Array<{ stage: KdsStage; label: string; cls: string }> = [
  { stage: "kitchen", label: "Kitchen", cls: "text-amber-400 border-amber-700/50" },
  { stage: "expo", label: "Expo", cls: "text-fire-light border-fire/40" },
  { stage: "ready", label: "Ready", cls: "text-green-400 border-green-700/50" },
];

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function SeminoleKds() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const undo = useUndo();
  const date = todayEt();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["kds", "seminole", date],
    queryFn: () => dal.kds.tickets(date),
    refetchInterval: 10_000,
  });

  const handOffMut = useMutation({
    mutationFn: ({ id }: { id: string; orderRef: string }) => dal.kds.advance(id, "handed_off", actor),
    onSuccess: (_ticket, { id, orderRef }) => {
      void qc.invalidateQueries({ queryKey: ["kds", "seminole", date] });
      undo.offer(`${orderRef} handed off — undo?`, async () => {
        await dal.kds.advance(id, "ready", actor);
        await qc.invalidateQueries({ queryKey: ["kds", "seminole", date] });
      });
    },
  });

  // FOH pickup board: today's active preorders (any channel), 10s refresh.
  const { data: preorders = [] } = useQuery({
    queryKey: ["preorders", "kds-pickups", date],
    queryFn: () => dal.preorders.list({ channel: "all", status: "all" }),
    refetchInterval: 10_000,
  });
  const bumpMut = useMutation({
    mutationFn: ({ id }: { id: string; from: PreorderStatus; customer: string }) =>
      dal.preorders.updateStatus(id, "picked_up", actor),
    onSuccess: (_order, { id, from, customer }) => {
      void qc.invalidateQueries({ queryKey: ["preorders"] });
      undo.offer(`${customer} picked up — undo?`, async () => {
        await dal.preorders.updateStatus(id, from, actor);
        await qc.invalidateQueries({ queryKey: ["preorders"] });
      });
    },
  });

  const pickups = preorders
    .filter(p => p.pickupDate === date &&
      (p.status === "pending" || p.status === "paid" || p.status === "ready"))
    .sort((a, b) => a.pickupWindow.localeCompare(b.pickupWindow) || a.customer.localeCompare(b.customer));

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading tickets…</p>;

  const active = tickets.filter(t => t.stage !== "handed_off");
  const handedOff = tickets.length - active.length;

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🔥 Seminole Heights KDS</h1>
          <p className="text-sm text-zinc-500">{date} · {active.length} active · {handedOff} handed off · refreshes every 10s</p>
        </div>
      </header>

      {active.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-2xl font-black text-zinc-300">All clear</p>
          <p className="mt-2 text-base text-zinc-500">No open tickets for today.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {STAGES.map(({ stage, label, cls }) => {
            const group = active.filter(t => t.stage === stage);
            return (
              <section key={stage} aria-label={`${label} tickets`}>
                <h2 className={`rounded-t-xl border border-b-0 bg-ink-900 px-4 py-2.5 text-base font-black uppercase tracking-widest ${cls}`}>
                  {label} <span className="text-sm font-bold text-zinc-500">({group.length})</span>
                </h2>
                <div className="space-y-3 rounded-b-xl border border-ink-700 bg-ink-950/40 p-3">
                  {group.length === 0 && <p className="py-6 text-center text-sm text-zinc-600">Empty</p>}
                  {group.map(t => (
                    <TicketCard key={t.id} ticket={t}
                      onHandOff={stage === "ready" ? () => handOffMut.mutate({ id: t.id, orderRef: t.orderRef }) : undefined}
                      busy={handOffMut.isPending} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* FOH pickup bump board */}
      <section aria-label="Pickups" className="mt-8">
        <h2 className="rounded-t-xl border border-b-0 border-fire/40 bg-ink-900 px-4 py-2.5 text-base font-black uppercase tracking-widest text-fire-light">
          Pickups <span className="text-sm font-bold text-zinc-500">({pickups.length} waiting today)</span>
        </h2>
        <div className="rounded-b-xl border border-ink-700 bg-ink-950/40 p-3">
          {pickups.length === 0 ? (
            <p className="py-8 text-center text-lg font-bold text-zinc-500">No pickups waiting</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pickups.map(p => (
                <PickupCard key={p.id} order={p} busy={bumpMut.isPending}
                  onBump={() => bumpMut.mutate({ id: p.id, from: p.status, customer: p.customer })} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PickupCard({ order, onBump, busy }: { order: Preorder; onBump: () => void; busy: boolean }) {
  const ch = order.channel === "fire_drop"
    ? { icon: "🔥", label: "Weekend Pre-Order" }
    : { icon: "🥖", label: "Cuban Thu" };
  const items = order.items.map(i => `${i.qty}× ${i.name}`).join(", ");
  return (
    <article className="flex flex-col rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xl font-black text-zinc-100">{order.customer}</p>
        <span className="shrink-0 rounded bg-ink-800 px-2 py-1 text-xs font-bold text-zinc-300">{ch.icon} {ch.label}</span>
      </div>
      <p className="mt-1 text-base font-bold text-fire-light">⏰ {order.pickupWindow}</p>
      <p className="mt-1.5 flex-1 text-sm text-zinc-300" title={items}>{items}</p>
      <button onClick={onBump} disabled={busy}
        className="mt-3 min-h-[56px] w-full rounded-xl bg-fire px-4 py-2.5 text-lg font-black uppercase tracking-wide text-white disabled:opacity-50"
        aria-label={`Mark ${order.orderRef} picked up`}>
        Picked Up ✓
      </button>
    </article>
  );
}

function TicketCard({ ticket, onHandOff, busy }: { ticket: KdsTicket; onHandOff?: () => void; busy: boolean }) {
  return (
    <article className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-zinc-100">{ticket.customer}</p>
          <p className="text-sm text-zinc-500">
            <span className="font-mono">{ticket.orderRef}</span> · ⏰ {ticket.timeWindow}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-600">
          fired {new Date(ticket.firedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {ticket.items.map(it => (
          <li key={it.id} className="flex items-center gap-2 rounded-lg bg-ink-800/70 px-3 py-2">
            <span className="min-w-[2.5rem] rounded bg-ink-700 px-1.5 py-0.5 text-center text-base font-black text-zinc-100">
              ×{it.qty}
            </span>
            <span className="flex-1 text-base font-semibold text-zinc-200">
              {it.name} <span className="text-sm font-normal text-zinc-500">{it.unit}</span>
            </span>
            <span className={`text-sm font-bold ${it.kitchenChecked ? "text-amber-400" : "text-zinc-700"}`}
              title="Kitchen check" aria-label={`Kitchen ${it.kitchenChecked ? "checked" : "unchecked"}`}>K✓</span>
            <span className={`text-sm font-bold ${it.expoChecked ? "text-green-400" : "text-zinc-700"}`}
              title="Expo check" aria-label={`Expo ${it.expoChecked ? "checked" : "unchecked"}`}>E✓</span>
          </li>
        ))}
      </ul>

      {onHandOff && (
        <button onClick={onHandOff} disabled={busy}
          className="mt-3 min-h-[48px] w-full rounded-xl bg-green-600 px-4 py-2.5 text-base font-black uppercase tracking-wide text-white disabled:opacity-50">
          {busy ? "Handing off…" : "Mark Handed Off"}
        </button>
      )}
    </article>
  );
}
