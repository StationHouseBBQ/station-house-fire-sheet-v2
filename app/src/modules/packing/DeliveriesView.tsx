import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Delivery, DeliveryStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";

/**
 * Packing · Deliveries — V2 implementation of the Manus DeliveriesTab.
 * Driver assignment, one-tap status advancement
 * (assigned → loaded → en_route → delivered), and inline delivery notes.
 */

const STATUS_META: Record<DeliveryStatus, { label: string; cls: string; next: DeliveryStatus | null }> = {
  assigned: { label: "Assigned", cls: "border-zinc-600/50 bg-ink-800 text-zinc-300", next: "loaded" },
  loaded: { label: "Loaded", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300", next: "en_route" },
  en_route: { label: "En route", cls: "border-fire/40 bg-fire/20 text-fire-light", next: "delivered" },
  delivered: { label: "Delivered", cls: "border-green-700/50 bg-green-600/20 text-green-400", next: null },
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

type Sync = "idle" | "saving" | "saved" | "error";

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

export function DeliveriesView() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const undo = useUndo();
  const [sync, setSync] = useState<Sync>("idle");
  const drivers = dal.deliveries.drivers();

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["deliveries", "list"],
    queryFn: () => dal.deliveries.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["deliveries", "list"] }); };

  const assignMut = useMutation({
    mutationFn: ({ id, driver }: { id: string; driver: string }) =>
      withSync(dal.deliveries.assignDriver(id, driver, actor)),
    onSuccess: invalidate,
  });
  const advanceMut = useMutation({
    mutationFn: ({ id }: { id: string; from: DeliveryStatus; customer: string }) =>
      withSync(dal.deliveries.advance(id, actor)),
    onSuccess: (updated, { id, from, customer }) => {
      invalidate();
      undo.offer(`${customer} → ${STATUS_META[updated.status].label}`, async () => {
        await withSync(dal.deliveries.setStatus(id, from, actor));
        invalidate();
      });
    },
  });
  const notesMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      withSync(dal.deliveries.updateNotes(id, notes, actor)),
    onSuccess: invalidate,
  });

  const rows = deliveries ?? [];
  const outForDelivery = rows.filter(d => d.status === "en_route").length;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading deliveries…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Deliveries</h1>
          <p className="text-sm text-zinc-500">{rows.length} deliveries · {outForDelivery} en route</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {rows.length === 0 ? (
        <div className="mt-10 py-16 text-center">
          <p className="text-base font-semibold text-zinc-300">No deliveries scheduled</p>
          <p className="mt-1 text-sm text-zinc-500">Delivery orders will appear here once booked</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map(d => (
            <DeliveryRow key={d.id} delivery={d} drivers={drivers}
              onAssign={driver => assignMut.mutate({ id: d.id, driver })}
              onAdvance={() => advanceMut.mutate({ id: d.id, from: d.status, customer: d.customer })}
              onNotes={notes => notesMut.mutate({ id: d.id, notes })} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveryRow({ delivery: d, drivers, onAssign, onAdvance, onNotes }: {
  delivery: Delivery; drivers: string[];
  onAssign: (driver: string) => void; onAdvance: () => void; onNotes: (notes: string) => void;
}) {
  const meta = STATUS_META[d.status];
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-bold text-zinc-100">{d.customer}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${meta.cls}`}>{meta.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-400">{d.address}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{d.orderRef} · {fmtDate(d.serviceDate)} · {d.window}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-zinc-500">
            Driver
            <select value={d.driver ?? ""} aria-label={`Driver for ${d.customer}`}
              onChange={e => { if (e.target.value) onAssign(e.target.value); }}
              className="mt-1 block min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-100">
              <option value="" disabled>Unassigned</option>
              {drivers.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          {meta.next && (
            <button onClick={onAdvance}
              className="mt-4 min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white"
              aria-label={`Advance ${d.customer} to ${STATUS_META[meta.next].label}`}>
              Advance → {STATUS_META[meta.next].label}
            </button>
          )}
        </div>
      </div>
      <NotesEditor value={d.notes} onCommit={onNotes} customer={d.customer} />
    </li>
  );
}

function NotesEditor({ value, onCommit, customer }: { value: string | null; onCommit: (notes: string) => void; customer: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        className="mt-3 w-full min-h-[44px] rounded-lg border border-dashed border-ink-700 bg-ink-800/50 px-3 py-2 text-left text-sm text-zinc-400"
        aria-label={`Edit delivery notes for ${customer}`}>
        {value ? value : <span className="italic text-zinc-600">Add delivery notes…</span>}
      </button>
    );
  }
  const commit = () => { onCommit(draft.trim()); setEditing(false); };
  return (
    <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={2}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === "Escape") setEditing(false);
      }}
      className="mt-3 w-full rounded-lg border border-fire/50 bg-ink-800 px-3 py-2 text-sm text-zinc-100"
      aria-label={`Delivery notes for ${customer}`} />
  );
}
