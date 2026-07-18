import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { EquipmentItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Catering · Equipment Catalog — V2 counterpart of the Manus
 * EquipmentCatalog (parity row #39). Items grouped by category with
 * owned quantity, per-guest ratio ("1 per N guests") and notes; upsert
 * dialog for add/edit.
 */

type Sync = "idle" | "saving" | "saved" | "error";

function ratioLabel(r: number | null): string {
  if (r === null || r <= 0) return "—";
  return `1 per ${Math.round(1 / r)} guests`;
}

export function EquipmentCatalogView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["equipment", "list"],
    queryFn: () => dal.equipment.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const upsertMut = useMutation({
    mutationFn: (e: Omit<EquipmentItem, "id"> & { id?: string }) => withSync(dal.equipment.upsert(e, actor)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment", "list"] }); setEditing(null); },
  });

  const grouped = useMemo(() => {
    const g = new Map<string, EquipmentItem[]>();
    for (const it of items) {
      const list = g.get(it.category) ?? [];
      list.push(it);
      g.set(it.category, list);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const categories = useMemo(() => [...new Set(items.map(i => i.category))].sort(), [items]);

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Equipment Catalog</h1>
          <p className="text-sm text-zinc-500">{items.length} items — ratios drive per-event packing counts</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add Equipment</button>
        </div>
      </header>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading equipment…</p>
      ) : (
        grouped.map(([category, rows]) => (
          <section key={category} className="mt-6">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">{category}</h2>
            <ul className="mt-2 space-y-2">
              {rows.map(it => (
                <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100">{it.name}</p>
                    <p className="text-xs text-zinc-500">
                      {ratioLabel(it.perGuestRatio)}
                      {it.notes ? ` · ${it.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200">
                      {it.qtyOwned} <span className="text-xs font-normal text-zinc-500">owned</span>
                    </span>
                    <button onClick={() => setEditing(it)}
                      className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Edit</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <EquipmentDialog item={editing === "new" ? null : editing} categories={categories}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setEditing(null)}
          onSubmit={e => upsertMut.mutate(e)} />
      )}
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

function EquipmentDialog({ item, categories, onSubmit, onCancel, busy, error }: {
  item: EquipmentItem | null; categories: string[];
  onSubmit: (e: Omit<EquipmentItem, "id"> & { id?: string }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "service");
  const [qtyOwned, setQtyOwned] = useState(item ? String(item.qtyOwned) : "1");
  const [guestsPerUnit, setGuestsPerUnit] = useState(
    item?.perGuestRatio ? String(Math.round(1 / item.perGuestRatio)) : "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  return (
    <div role="dialog" aria-modal="true" aria-label={item ? "Edit equipment" : "Add equipment"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          const n = Number(guestsPerUnit);
          onSubmit({
            id: item?.id,
            name: name.trim(), category: category.trim() || "misc",
            qtyOwned: Math.max(0, Math.round(Number(qtyOwned) || 0)),
            perGuestRatio: Number.isFinite(n) && n > 0 ? 1 / n : null,
            notes: notes.trim() || null,
          });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{item ? "Edit equipment" : "Add equipment"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name *
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <input value={category} onChange={e => setCategory(e.target.value)} list="equipment-categories"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
            <datalist id="equipment-categories">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Qty owned
            <input inputMode="numeric" value={qtyOwned} onChange={e => setQtyOwned(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Guests per unit
          <input inputMode="numeric" value={guestsPerUnit} onChange={e => setGuestsPerUnit(e.target.value)}
            placeholder="e.g. 20 → “1 per 20 guests” (blank = no ratio)"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save equipment"}
          </button>
        </div>
      </form>
    </div>
  );
}
