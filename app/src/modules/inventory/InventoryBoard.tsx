import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import {
  CATEGORY_LABELS, CATEGORY_ORDER, itemValueCents, newId, stockLevel,
  type InventoryCategory, type InventoryItem,
} from "./_data/inventoryData";
import {
  useInventoryItems, useVendors, useInventoryMutation, saveItems, applyStockDeltas,
} from "./_data/useInventory";

/**
 * Inventory · On-Hand Board — V2 of the Manus InventoryBoard.
 * Category-grouped stock with PAR vs on-hand, low/critical badges, a total
 * inventory-value stat, search + category filter, quick +/- adjust with a
 * reason, and full item add/edit (category, unit, PAR, cost, vendor).
 */

const ADJUST_REASONS = [
  { key: "receive", label: "Received (+)", sign: 1 },
  { key: "use", label: "Used / Sold (−)", sign: -1 },
  { key: "waste", label: "Waste / Spoilage (−)", sign: -1 },
  { key: "correction", label: "Count Correction (±)", sign: 1 },
] as const;
type AdjustReason = (typeof ADJUST_REASONS)[number]["key"];

interface EditDraft {
  id?: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  onHand: string;
  parLevel: string;
  costDollars: string;
  preferredVendorId: string;
}

export function InventoryBoard() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const { data: items, isLoading } = useInventoryItems();
  const { data: vendors } = useVendors();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<InventoryCategory | "all">("all");
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const adjustMut = useInventoryMutation(async ({ itemId, delta }: { itemId: string; delta: number }) => {
    await applyStockDeltas([{ itemId, delta }], actor);
  });

  const saveMut = useInventoryMutation(async (draft: EditDraft) => {
    const list = items ?? [];
    const patch: InventoryItem = {
      id: draft.id ?? newId("itm"),
      name: draft.name.trim(),
      category: draft.category,
      unit: draft.unit.trim() || "ea",
      onHand: Number(draft.onHand) || 0,
      parLevel: Number(draft.parLevel) || 0,
      unitCostCents: Math.round((Number(draft.costDollars) || 0) * 100),
      preferredVendorId: draft.preferredVendorId || null,
    };
    const next = draft.id
      ? list.map(i => (i.id === draft.id ? patch : i))
      : [...list, patch];
    await saveItems(next, actor);
  });

  const rows = items ?? [];
  const vendorName = (id: string | null) => vendors?.find(v => v.id === id)?.name ?? null;

  const lowCount = rows.filter(i => stockLevel(i) === "low").length;
  const criticalCount = rows.filter(i => stockLevel(i) === "critical").length;
  const totalValueCents = rows.reduce((s, i) => s + itemValueCents(i), 0);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<InventoryCategory, InventoryItem[]>();
    for (const it of rows) {
      if (filterCat !== "all" && it.category !== filterCat) continue;
      if (q && !it.name.toLowerCase().includes(q)) continue;
      const list = map.get(it.category) ?? [];
      list.push(it);
      map.set(it.category, list);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [rows, filterCat, search]);

  const openNew = () => setEditDraft({
    name: "", category: "proteins", unit: "lbs", onHand: "0", parLevel: "0",
    costDollars: "", preferredVendorId: "",
  });
  const openEdit = (it: InventoryItem) => setEditDraft({
    id: it.id, name: it.name, category: it.category, unit: it.unit,
    onHand: String(it.onHand), parLevel: String(it.parLevel),
    costDollars: it.unitCostCents ? (it.unitCostCents / 100).toFixed(2) : "",
    preferredVendorId: it.preferredVendorId ?? "",
  });

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading inventory…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Inventory Board</h1>
          <p className="text-sm text-zinc-500">On-hand stock vs PAR · proteins, sauces, packaging, propane & more</p>
        </div>
        <button onClick={openNew} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={String(rows.length)} label="Items tracked" />
        <Stat value={String(lowCount)} label="Low stock" tone={lowCount > 0 ? "amber" : "green"} />
        <Stat value={String(criticalCount)} label="Critical" tone={criticalCount > 0 ? "red" : "green"} />
        <Stat value={formatCents(totalValueCents)} label="Inventory value" tone="fire" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          <Chip active={filterCat === "all"} onClick={() => setFilterCat("all")}>All</Chip>
          {CATEGORY_ORDER.map(c => (
            <Chip key={c} active={filterCat === c} onClick={() => setFilterCat(c)}>{CATEGORY_LABELS[c]}</Chip>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
          aria-label="Search items"
          className="ml-auto min-h-[40px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:w-56" />
      </div>

      {grouped.length === 0 ? (
        <p className="mt-10 py-12 text-center text-sm text-zinc-500">No items match this filter.</p>
      ) : grouped.map(([cat, catItems]) => (
        <section key={cat} className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-fire-light">{CATEGORY_LABELS[cat]}</span>
            <div className="h-px flex-1 bg-ink-700" />
            <span className="text-xs text-zinc-500">{catItems.length} item{catItems.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="space-y-2">
            {catItems.map(item => {
              const level = stockLevel(item);
              return (
                <li key={item.id}
                  className={`rounded-xl border p-3 ${level === "critical" ? "border-red-700/50 bg-red-950/30" : level === "low" ? "border-amber-700/50 bg-amber-950/20" : "border-ink-700 bg-ink-900"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-zinc-100">{item.name}</span>
                        {level === "critical"
                          ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Critical</span>
                          : level === "low"
                            ? <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Low</span>
                            : <span className="text-xs text-green-400">✓</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                        <span>On hand: <span className={`font-bold ${level === "critical" ? "text-red-400" : level === "low" ? "text-amber-400" : "text-green-400"}`}>{item.onHand} {item.unit}</span></span>
                        <span>PAR: {item.parLevel} {item.unit}</span>
                        <span>{formatCents(item.unitCostCents)}/{item.unit}</span>
                        <span className="text-fire-light">{formatCents(itemValueCents(item))} on hand</span>
                        {vendorName(item.preferredVendorId) && <span className="text-zinc-500">· {vendorName(item.preferredVendorId)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button onClick={() => adjustMut.mutate({ itemId: item.id, delta: -1 })}
                        disabled={item.onHand <= 0}
                        className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-bold text-zinc-200 disabled:opacity-40"
                        aria-label={`Decrease ${item.name}`}>−</button>
                      <button onClick={() => adjustMut.mutate({ itemId: item.id, delta: 1 })}
                        className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-bold text-zinc-200"
                        aria-label={`Increase ${item.name}`}>+</button>
                      <button onClick={() => setAdjustItem(item)}
                        className="h-11 rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-300"
                        aria-label={`Adjust ${item.name}`}>Adjust</button>
                      <button onClick={() => openEdit(item)}
                        className="h-11 rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-300"
                        aria-label={`Edit ${item.name}`}>Edit</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {adjustItem && (
        <AdjustDialog item={adjustItem} busy={adjustMut.isPending}
          onCancel={() => setAdjustItem(null)}
          onSubmit={delta => { adjustMut.mutate({ itemId: adjustItem.id, delta }); setAdjustItem(null); }} />
      )}
      {editDraft && (
        <EditDialog draft={editDraft} setDraft={setEditDraft}
          vendors={(vendors ?? []).map(v => ({ id: v.id, name: v.name }))}
          busy={saveMut.isPending}
          onCancel={() => setEditDraft(null)}
          onSubmit={() => { saveMut.mutate(editDraft); setEditDraft(null); void qc.invalidateQueries({ queryKey: ["inventory"] }); }} />
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "amber" | "red" | "green" | "fire" }) {
  const cls = tone === "amber" ? "border-amber-700/50 bg-amber-950/30" : tone === "red" ? "border-red-700/50 bg-red-950/30" : "border-ink-700 bg-ink-900";
  const valueCls = tone === "amber" ? "text-amber-400" : tone === "red" ? "text-red-400" : tone === "green" ? "text-green-400" : tone === "fire" ? "text-fire-light" : "text-zinc-100";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className={`text-3xl font-black ${valueCls}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${active ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
      {children}
    </button>
  );
}

function AdjustDialog({ item, busy, onCancel, onSubmit }: {
  item: InventoryItem; busy: boolean; onCancel: () => void; onSubmit: (delta: number) => void;
}) {
  const [reason, setReason] = useState<AdjustReason>("receive");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const n = Number(qty);
  const cfg = ADJUST_REASONS.find(r => r.key === reason)!;
  const delta = reason === "correction" ? n : cfg.sign * Math.abs(n);
  const valid = Number.isFinite(n) && n !== 0;
  const projected = Math.max(0, Math.round((item.onHand + delta) * 100) / 100);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Adjust ${item.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (valid) onSubmit(delta); }}>
        <h3 className="text-lg font-bold text-zinc-100">Adjust stock — {item.name}</h3>
        <p className="mt-1 text-sm text-zinc-500">On hand: {item.onHand} {item.unit} · PAR {item.parLevel}</p>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Reason
          <select value={reason} onChange={e => setReason(e.target.value as AdjustReason)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
            {ADJUST_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">
          Quantity ({item.unit}){reason === "correction" && <span className="font-normal text-zinc-600"> — negative to decrease</span>}
          <input value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal" autoFocus placeholder="0"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes <span className="font-normal text-zinc-600">(optional)</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Sysco Tue delivery…"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        {valid && (
          <p className="mt-3 text-sm text-zinc-400">
            New on hand: <span className="font-bold text-zinc-100">{projected} {item.unit}</span>
            <span className={`ml-2 font-bold ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>({delta >= 0 ? "+" : ""}{delta})</span>
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !valid} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Update stock"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditDialog({ draft, setDraft, vendors, busy, onCancel, onSubmit }: {
  draft: EditDraft; setDraft: (d: EditDraft) => void; vendors: Array<{ id: string; name: string }>;
  busy: boolean; onCancel: () => void; onSubmit: () => void;
}) {
  const up = (patch: Partial<EditDraft>) => setDraft({ ...draft, ...patch });
  return (
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Edit item" : "Add item"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (draft.name.trim()) onSubmit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{draft.id ? "Edit item" : "Add inventory item"}</h3>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Item name
          <input value={draft.name} onChange={e => up({ name: e.target.value })} required autoFocus placeholder="e.g. Beef Brisket"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <select value={draft.category} onChange={e => up({ category: e.target.value as InventoryCategory })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
              {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <input value={draft.unit} onChange={e => up({ unit: e.target.value })} placeholder="lbs, ea, case…"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">On hand
            <input value={draft.onHand} onChange={e => up({ onHand: e.target.value })} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">PAR level
            <input value={draft.parLevel} onChange={e => up({ parLevel: e.target.value })} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Cost/unit ($)
            <input value={draft.costDollars} onChange={e => up({ costDollars: e.target.value })} inputMode="decimal" placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Preferred vendor
          <select value={draft.preferredVendorId} onChange={e => up({ preferredVendorId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
            <option value="">— None —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !draft.name.trim()} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save item"}
          </button>
        </div>
      </form>
    </div>
  );
}
