import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { RetailFireItem, RetailItemStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Seminole · Retail Fire Sheet — V2 counterpart of the Manus RetailFireSheet.
 * Case-flow board for today's session: tap-to-cycle item status
 * (queued → firing → in_case → 86'd → queued), inline qty edits, add/remove
 * items, PAR sync, and a one-way Submit-to-Kitchen handoff.
 */

const STATUS_FLOW: Record<RetailItemStatus, RetailItemStatus> = {
  queued: "firing",
  firing: "in_case",
  in_case: "sold_out_86",
  sold_out_86: "queued",
};

const STATUS_META: Record<RetailItemStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  firing: { label: "Firing", cls: "bg-amber-600 text-white" },
  in_case: { label: "In Case", cls: "bg-green-600 text-white" },
  sold_out_86: { label: "86'd", cls: "bg-red-600 text-white" },
};

const UNITS = ["pans", "racks", "each", "quarts", "lbs"];

type Sync = "idle" | "saving" | "saved" | "error";

export function RetailFireSheetView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["retailFireSheet", "session"],
    queryFn: () => dal.retailFireSheet.getSession(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["retailFireSheet", "session"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RetailItemStatus }) =>
      withSync(dal.retailFireSheet.updateItemStatus(id, status, actor)),
    onSuccess: invalidate,
  });
  const qtyMut = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      withSync(dal.retailFireSheet.updateItemQty(id, qty, actor)),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.retailFireSheet.removeItem(id, actor)),
    onSuccess: () => { setConfirmingRemoveId(null); invalidate(); },
  });
  const addMut = useMutation({
    mutationFn: (input: { name: string; unit: string; qty: number }) =>
      withSync(dal.retailFireSheet.addItem(input, actor)),
    onSuccess: () => { setAddOpen(false); invalidate(); },
  });
  const syncParMut = useMutation({
    mutationFn: () => withSync(dal.retailFireSheet.syncFromPar(actor)),
    onSuccess: invalidate,
  });
  const submitMut = useMutation({
    mutationFn: () => withSync(dal.retailFireSheet.submitToKitchen(actor)),
    onSuccess: invalidate,
  });

  if (isLoading || !session) return <p className="py-20 text-center text-zinc-500">Loading fire sheet…</p>;

  const submitted = !!session.submittedToKitchenAt;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Retail Fire Sheet</h1>
          <p className="text-sm text-zinc-500">{session.serviceDate} · {session.items.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => syncParMut.mutate()} disabled={syncParMut.isPending}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 disabled:opacity-50">
            {syncParMut.isPending ? "Syncing…" : "Sync from PAR"}
          </button>
          <button onClick={() => setAddOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      </header>

      {/* Status legend */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span>Tap status to advance:</span>
        {(["queued", "firing", "in_case", "sold_out_86"] as RetailItemStatus[]).map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>→</span>}
            <span className={`rounded px-1.5 py-0.5 font-bold ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span>
          </span>
        ))}
      </div>

      {session.items.length === 0 ? (
        <div className="mt-10 py-16 text-center">
          <p className="text-base font-semibold text-zinc-300">No items on today's sheet</p>
          <p className="mt-1 text-sm text-zinc-500">Sync from PAR or add items by hand.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {session.items.map(item => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
              <button
                onClick={() => statusMut.mutate({ id: item.id, status: STATUS_FLOW[item.status] })}
                className={`min-h-[44px] min-w-[6.5rem] rounded-lg px-3 py-2 text-xs font-bold uppercase ${STATUS_META[item.status].cls}`}
                aria-label={`${item.name}: ${STATUS_META[item.status].label}. Tap to advance.`}>
                {STATUS_META[item.status].label}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${item.status === "sold_out_86" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                  {item.name}
                </p>
              </div>
              <QtyEditor item={item} onChange={qty => qtyMut.mutate({ id: item.id, qty })} />
              {confirmingRemoveId === item.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => removeMut.mutate(item.id)} disabled={removeMut.isPending}
                    className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmingRemoveId(null)}
                    className="min-h-[44px] rounded-lg border border-ink-700 px-2 py-2 text-xs font-semibold text-zinc-400">
                    ✕
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmingRemoveId(item.id)}
                  className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-zinc-500 hover:text-red-400"
                  aria-label={`Remove ${item.name}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Submit to kitchen footer */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button onClick={() => submitMut.mutate()} disabled={submitted || submitMut.isPending || session.items.length === 0}
            className="min-h-[52px] w-full rounded-xl bg-fire px-4 py-3 text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
            {submitted
              ? `✓ Submitted to kitchen · ${new Date(session.submittedToKitchenAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : submitMut.isPending ? "Submitting…" : "Submit to Kitchen"}
          </button>
        </div>
      </footer>

      {addOpen && (
        <AddItemDialog busy={addMut.isPending} error={addMut.error?.message ?? null}
          onCancel={() => setAddOpen(false)} onSubmit={i => addMut.mutate(i)} />
      )}
    </div>
  );
}

function QtyEditor({ item, onChange }: { item: RetailFireItem; onChange: (qty: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.qty));
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(item.qty)); setEditing(true); }}
        className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200"
        aria-label={`Edit quantity for ${item.name}`}>
        {item.qty} <span className="text-xs font-normal text-zinc-500">{item.unit}</span>
      </button>
    );
  }
  const commit = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) onChange(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded-lg border border-fire/50 bg-ink-800 px-2 py-2 text-center text-sm font-bold text-zinc-100"
      aria-label={`Quantity for ${item.name}`} />
  );
}

function AddItemDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (i: { name: string; unit: string; qty: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pans");
  const [qty, setQty] = useState("1");
  return (
    <div role="dialog" aria-modal="true" aria-label="Add fire sheet item"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ name, unit, qty: Number(qty) || 0 }); }}>
        <h3 className="text-lg font-bold text-zinc-100">Add item</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <select value={unit} onChange={e => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Qty
            <input value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add item"}
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
