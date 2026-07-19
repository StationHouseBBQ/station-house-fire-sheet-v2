import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { EquipmentItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { getEquipmentOverlay, setEquipmentOverlay } from "./_data/overlay";
import { useOverlayVersion } from "./_data/useOverlayVersion";

/**
 * Catering - Equipment Catalog: V2 counterpart of the Manus EquipmentCatalog /
 * CateringInventory. Items grouped into collapsible categories, searchable,
 * with per-guest packing ratio, owned quantity, and an on-hand vs PAR level
 * count (on-hand turns red when below PAR). Inline edit of on-hand + PAR + notes
 * per row, plus an add/edit dialog for name/category/ratio.
 *
 * On-hand + PAR ride a module-local overlay (noted in report) until the shared
 * EquipmentItem type carries stock levels; name/category/qtyOwned/perGuestRatio
 * /notes persist through the shared DAL.
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
  useOverlayVersion();
  const [sync, setSync] = useState<Sync>("idle");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.notes ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const grouped = useMemo(() => {
    const g = new Map<string, EquipmentItem[]>();
    for (const it of filtered) {
      const list = g.get(it.category) ?? [];
      list.push(it);
      g.set(it.category, list);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const categories = useMemo(() => [...new Set(items.map(i => i.category))].sort(), [items]);
  const belowPar = useMemo(
    () => items.filter(i => { const o = getEquipmentOverlay(i.id, i.qtyOwned); return o.par > 0 && o.onHand < o.par; }).length,
    [items],
  );

  const toggle = (cat: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });

  const saveInline = (item: EquipmentItem, onHand: number, par: number) => {
    setEquipmentOverlay(item.id, { onHand: Math.max(0, onHand), par: Math.max(0, par) });
    setInlineId(null);
  };

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Equipment Catalog</h1>
          <p className="text-sm text-zinc-500">
            {items.length} items{belowPar > 0 && <span className="text-red-400"> · {belowPar} below PAR</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add Equipment</button>
        </div>
      </header>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item, category, notes..."
        className="mt-4 w-full rounded-lg border border-ink-700 bg-ink-800 px-4 py-3 text-zinc-100" />

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading equipment...</p>
      ) : grouped.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No equipment items found.</p>
      ) : (
        grouped.map(([category, rows]) => {
          const isCollapsed = collapsed.has(category);
          return (
            <section key={category} className="mt-6">
              <button onClick={() => toggle(category)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-left">
                <span className="text-sm font-black uppercase tracking-wider text-zinc-300">
                  <span className="mr-2 inline-block text-zinc-500">{isCollapsed ? "▸" : "▾"}</span>
                  {category}
                </span>
                <span className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-xs font-bold text-zinc-400">{rows.length}</span>
              </button>
              {!isCollapsed && (
                <ul className="mt-2 space-y-2">
                  {rows.map(it => {
                    const o = getEquipmentOverlay(it.id, it.qtyOwned);
                    const under = o.par > 0 && o.onHand < o.par;
                    if (inlineId === it.id) {
                      return <InlineEditRow key={it.id} item={it} initial={o} onCancel={() => setInlineId(null)} onSave={(h, p) => saveInline(it, h, p)} />;
                    }
                    return (
                      <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-100">{it.name}</p>
                          <p className="text-xs text-zinc-500">
                            {ratioLabel(it.perGuestRatio)}
                            {it.notes ? ` · ${it.notes}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-lg border px-3 py-2 text-sm font-bold ${under ? "border-red-700/60 bg-red-950/30 text-red-400" : "border-ink-700 bg-ink-800 text-emerald-300"}`}>
                            {o.onHand} <span className="text-xs font-normal text-zinc-500">on hand</span>
                          </span>
                          <span className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-300">
                            {o.par || "—"} <span className="text-xs font-normal text-zinc-500">PAR</span>
                          </span>
                          <button onClick={() => setInlineId(it.id)}
                            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Stock</button>
                          <button onClick={() => setEditing(it)}
                            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Edit</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
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

function InlineEditRow({ item, initial, onSave, onCancel }: {
  item: EquipmentItem; initial: { onHand: number; par: number };
  onSave: (onHand: number, par: number) => void; onCancel: () => void;
}) {
  const [onHand, setOnHand] = useState(String(initial.onHand));
  const [par, setPar] = useState(String(initial.par));
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fire/40 bg-ink-900 p-3">
      <p className="min-w-0 font-semibold text-zinc-100">{item.name}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-zinc-400">On hand
          <input inputMode="numeric" value={onHand} onChange={e => setOnHand(e.target.value)}
            className="ml-1 w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-zinc-100" />
        </label>
        <label className="text-xs font-semibold text-zinc-400">PAR
          <input inputMode="numeric" value={par} onChange={e => setPar(e.target.value)}
            className="ml-1 w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-zinc-100" />
        </label>
        <button onClick={() => onSave(Math.round(Number(onHand) || 0), Math.round(Number(par) || 0))}
          className="min-h-[40px] rounded-lg bg-fire px-3 text-sm font-bold text-white">Save</button>
        <button onClick={onCancel}
          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-300">Cancel</button>
      </div>
    </li>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving...", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed - retry", cls: "text-red-400 border-red-700/50" },
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
            placeholder="e.g. 20 -> 1 per 20 guests (blank = no ratio)"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <p className="mt-2 text-xs text-zinc-500">Set on-hand + PAR levels with the "Stock" button on each row.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving..." : "Save equipment"}
          </button>
        </div>
      </form>
    </div>
  );
}
