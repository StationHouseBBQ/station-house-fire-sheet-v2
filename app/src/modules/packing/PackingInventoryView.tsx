import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { SupplyItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Packing · Supplies Inventory — V2 implementation of Manus PackingInventory.
 * On-hand vs PAR with low-stock highlighting, ±1 quick adjustments, a bulk
 * adjust dialog, and a new-supply-item form.
 */

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

export function PackingInventoryView() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const [sync, setSync] = useState<Sync>("idle");
  const [adjustItem, setAdjustItem] = useState<SupplyItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["supplies", "list"],
    queryFn: () => dal.supplies.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["supplies", "list"] });
    void qc.invalidateQueries({ queryKey: ["supplies", "forecast"] });
  };

  const adjustMut = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      withSync(dal.supplies.adjust(id, delta, actor)),
    onSuccess: () => { invalidate(); setAdjustItem(null); },
  });
  const upsertMut = useMutation({
    mutationFn: (input: Omit<SupplyItem, "id">) => withSync(dal.supplies.upsert(input, actor)),
    onSuccess: () => { invalidate(); setNewOpen(false); },
  });

  const rows = items ?? [];
  const lowCount = rows.filter(i => i.onHand < i.parLevel).length;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading supplies…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Packing Supplies</h1>
          <p className="text-sm text-zinc-500">
            {rows.length} items{lowCount > 0 ? <span className="text-red-400"> · {lowCount} below PAR</span> : " · all at PAR"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setNewOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New supply item</button>
        </div>
      </header>

      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-3 py-3">Unit</th>
              <th className="px-3 py-3 text-right">On hand</th>
              <th className="px-3 py-3 text-right">PAR</th>
              <th className="px-3 py-3 text-right">Adjust</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {rows.map(item => {
              const low = item.onHand < item.parLevel;
              return (
                <tr key={item.id} className={low ? "bg-red-950/30" : undefined}>
                  <td className="px-4 py-2 font-semibold text-zinc-100">
                    {item.name}
                    {low && <span className="ml-2 rounded-full border border-red-700/50 bg-red-600/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">Low</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{item.unit}</td>
                  <td className={`px-3 py-2 text-right font-bold ${low ? "text-red-400" : "text-zinc-100"}`}>{item.onHand}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{item.parLevel}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => adjustMut.mutate({ id: item.id, delta: -1 })}
                        disabled={item.onHand <= 0}
                        className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-bold text-zinc-200 disabled:opacity-40"
                        aria-label={`Remove one ${item.unit} of ${item.name}`}>−</button>
                      <button onClick={() => adjustMut.mutate({ id: item.id, delta: 1 })}
                        className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-bold text-zinc-200"
                        aria-label={`Add one ${item.unit} of ${item.name}`}>+</button>
                      <button onClick={() => setAdjustItem(item)}
                        className="h-11 rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-300"
                        aria-label={`Bulk adjust ${item.name}`}>Adjust</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No supply items yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adjustItem && (
        <AdjustDialog item={adjustItem} busy={adjustMut.isPending} error={adjustMut.error instanceof Error ? adjustMut.error.message : null}
          onCancel={() => setAdjustItem(null)}
          onSubmit={delta => adjustMut.mutate({ id: adjustItem.id, delta })} />
      )}
      {newOpen && (
        <NewItemDialog busy={upsertMut.isPending} error={upsertMut.error instanceof Error ? upsertMut.error.message : null}
          onCancel={() => setNewOpen(false)}
          onSubmit={input => upsertMut.mutate(input)} />
      )}
    </div>
  );
}

function AdjustDialog({ item, busy, error, onCancel, onSubmit }: {
  item: SupplyItem; busy: boolean; error: string | null;
  onCancel: () => void; onSubmit: (delta: number) => void;
}) {
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");
  const n = Number(delta);
  const valid = Number.isFinite(n) && Number.isInteger(n) && n !== 0;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Adjust ${item.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (valid) onSubmit(n); }}>
        <h3 className="text-lg font-bold text-zinc-100">Adjust {item.name}</h3>
        <p className="mt-1 text-sm text-zinc-500">On hand: {item.onHand} {item.unit} · PAR {item.parLevel}</p>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Change (+ received / − used)
          <input value={delta} onChange={e => setDelta(e.target.value)} inputMode="numeric" autoFocus
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Reason <span className="font-normal text-zinc-600">(for your reference — not saved)</span>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. weekly restock"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        {valid && (
          <p className="mt-3 text-sm text-zinc-400">
            New on hand: <span className="font-bold text-zinc-100">{item.onHand + n} {item.unit}</span>
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !valid} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Apply adjustment"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NewItemDialog({ busy, error, onCancel, onSubmit }: {
  busy: boolean; error: string | null;
  onCancel: () => void; onSubmit: (input: Omit<SupplyItem, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("each");
  const [onHand, setOnHand] = useState("0");
  const [parLevel, setParLevel] = useState("0");
  const [perOrderUsage, setPerOrderUsage] = useState("1");
  return (
    <div role="dialog" aria-modal="true" aria-label="New supply item"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit({
            name: name.trim(), unit: unit.trim() || "each",
            onHand: Number(onHand) || 0, parLevel: Number(parLevel) || 0,
            perOrderUsage: Number(perOrderUsage) || 0,
          });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">New supply item</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <input value={unit} onChange={e => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">On hand
            <input value={onHand} onChange={e => setOnHand(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">PAR level
            <input value={parLevel} onChange={e => setParLevel(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Per-order usage
            <input value={perOrderUsage} onChange={e => setPerOrderUsage(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !name.trim()} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Add item"}
          </button>
        </div>
      </form>
    </div>
  );
}
