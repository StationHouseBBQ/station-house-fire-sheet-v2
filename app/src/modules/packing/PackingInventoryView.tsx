import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { SupplyItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import {
  ADJUST_REASONS, CATEGORY_LABELS, CATEGORY_ORDER,
  appendLog, loadLog, loadMeta, saveMeta,
  type AdjustReason, type SupplyCategory, type SupplyMeta,
} from "./_data/supplyMeta";

/**
 * Packing · Supplies Inventory — V2 implementation of Manus PackingInventory.
 * Category-grouped stock with low/critical thresholds, search + category
 * filters, a stats bar (items · low · stock value), reason-tagged stock
 * adjustments (receive/use/waste/manual), full item editing (category,
 * reorder qty, cost) and a recent-movement history panel.
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

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type EditDraft = {
  id?: string; name: string; unit: string;
  onHand: string; parLevel: string; perOrderUsage: string;
  category: SupplyCategory; reorderQty: string; costDollars: string;
};

export function PackingInventoryView() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const [sync, setSync] = useState<Sync>("idle");
  const [adjustItem, setAdjustItem] = useState<SupplyItem | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [filterCat, setFilterCat] = useState<SupplyCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["supplies", "list"],
    queryFn: () => dal.supplies.list(),
    refetchInterval: 30_000,
  });
  const { data: meta } = useQuery({
    queryKey: ["supplies", "meta", (items ?? []).map(i => i.id).join(",")],
    enabled: !!items,
    queryFn: () => loadMeta((items ?? []).map(i => ({ id: i.id, name: i.name }))),
  });
  const { data: log } = useQuery({ queryKey: ["supplies", "log"], queryFn: () => loadLog() });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["supplies", "list"] });
    void qc.invalidateQueries({ queryKey: ["supplies", "meta"] });
    void qc.invalidateQueries({ queryKey: ["supplies", "log"] });
    void qc.invalidateQueries({ queryKey: ["supplies", "forecast"] });
  };

  const adjustMut = useMutation({
    mutationFn: async ({ item, delta, reason }: { item: SupplyItem; delta: number; reason: AdjustReason }) => {
      const updated = await withSync(dal.supplies.adjust(item.id, delta, actor));
      await appendLog({ itemId: item.id, itemName: item.name, reason, delta, by: actor });
      return updated;
    },
    onSuccess: () => { invalidate(); setAdjustItem(null); },
  });
  const upsertMut = useMutation({
    mutationFn: async (d: EditDraft) => {
      const saved = await withSync(dal.supplies.upsert({
        id: d.id, name: d.name.trim(), unit: d.unit.trim() || "ea",
        onHand: Number(d.onHand) || 0, parLevel: Number(d.parLevel) || 0,
        perOrderUsage: Number(d.perOrderUsage) || 0,
      }, actor));
      await saveMeta(saved.id, {
        category: d.category,
        reorderQty: Number(d.reorderQty) || 0,
        costPerUnitCents: Math.round((Number(d.costDollars) || 0) * 100),
      });
      return saved;
    },
    onSuccess: () => { invalidate(); setEditDraft(null); },
  });

  const rows = items ?? [];
  const metaMap = meta ?? {};
  const metaFor = (id: string): SupplyMeta => metaMap[id] ?? { category: "packaging", reorderQty: 0, costPerUnitCents: 0 };

  const lowCount = rows.filter(i => i.onHand <= i.parLevel).length;
  const criticalCount = rows.filter(i => i.onHand <= i.parLevel * 0.5).length;
  const stockValueCents = rows.reduce((s, i) => s + i.onHand * metaFor(i.id).costPerUnitCents, 0);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<SupplyCategory, SupplyItem[]>();
    for (const it of rows) {
      const cat = metaFor(it.id).category;
      if (filterCat !== "all" && cat !== filterCat) continue;
      if (q && !it.name.toLowerCase().includes(q)) continue;
      const list = map.get(cat) ?? [];
      list.push(it);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, metaMap, filterCat, search]);

  const openNew = () => setEditDraft({
    name: "", unit: "ea", onHand: "0", parLevel: "0", perOrderUsage: "1",
    category: "packaging", reorderQty: "0", costDollars: "",
  });
  const openEdit = (it: SupplyItem) => {
    const m = metaFor(it.id);
    setEditDraft({
      id: it.id, name: it.name, unit: it.unit,
      onHand: String(it.onHand), parLevel: String(it.parLevel), perOrderUsage: String(it.perOrderUsage),
      category: m.category, reorderQty: String(m.reorderQty), costDollars: m.costPerUnitCents ? (m.costPerUnitCents / 100).toFixed(2) : "",
    });
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading supplies…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Packing Supplies</h1>
          <p className="text-sm text-zinc-500">Supply stock levels · boxes, containers, serving ware, labels</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={openNew} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-3xl font-black text-zinc-100">{rows.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Total items</p>
        </div>
        <div className={`rounded-xl border p-4 ${lowCount > 0 ? "border-amber-700/50 bg-amber-950/30" : "border-ink-700 bg-ink-900"}`}>
          <p className={`text-3xl font-black ${lowCount > 0 ? "text-amber-400" : "text-green-400"}`}>{lowCount}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Low stock</p>
        </div>
        <div className={`rounded-xl border p-4 ${criticalCount > 0 ? "border-red-700/50 bg-red-950/30" : "border-ink-700 bg-ink-900"}`}>
          <p className={`text-3xl font-black ${criticalCount > 0 ? "text-red-400" : "text-green-400"}`}>{criticalCount}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Critical</p>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-3xl font-black text-fire-light">{money(stockValueCents)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Stock value</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          <FilterChip active={filterCat === "all"} onClick={() => setFilterCat("all")}>All</FilterChip>
          {CATEGORY_ORDER.map(c => (
            <FilterChip key={c} active={filterCat === c} onClick={() => setFilterCat(c)}>{CATEGORY_LABELS[c]}</FilterChip>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplies…"
          className="ml-auto min-h-[40px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:w-56"
          aria-label="Search supplies" />
      </div>

      {/* Grouped inventory */}
      {grouped.length === 0 ? (
        <p className="mt-10 py-12 text-center text-sm text-zinc-500">No supply items match this filter.</p>
      ) : grouped.map(([cat, catItems]) => (
        <section key={cat} className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-fire-light">{CATEGORY_LABELS[cat]}</span>
            <div className="h-px flex-1 bg-ink-700" />
            <span className="text-xs text-zinc-500">{catItems.length} item{catItems.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="space-y-2">
            {catItems.map(item => {
              const m = metaFor(item.id);
              const isLow = item.onHand <= item.parLevel;
              const isCritical = item.onHand <= item.parLevel * 0.5;
              return (
                <li key={item.id}
                  className={`rounded-xl border p-3 ${isCritical ? "border-red-700/50 bg-red-950/30" : isLow ? "border-amber-700/50 bg-amber-950/20" : "border-ink-700 bg-ink-900"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-zinc-100">{item.name}</span>
                        {isCritical
                          ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Critical</span>
                          : isLow
                            ? <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Low</span>
                            : <span className="text-xs text-green-400">✓</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                        <span>On hand: <span className={`font-bold ${isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-green-400"}`}>{item.onHand} {item.unit}</span></span>
                        <span>PAR: {item.parLevel} {item.unit}</span>
                        <span>Reorder: {m.reorderQty} {item.unit}</span>
                        {m.costPerUnitCents > 0 && <span>{money(m.costPerUnitCents)}/{item.unit}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button onClick={() => adjustMut.mutate({ item, delta: -1, reason: "use" })}
                        disabled={item.onHand <= 0}
                        className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-bold text-zinc-200 disabled:opacity-40"
                        aria-label={`Use one ${item.unit} of ${item.name}`}>−</button>
                      <button onClick={() => adjustMut.mutate({ item, delta: 1, reason: "receive" })}
                        className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-bold text-zinc-200"
                        aria-label={`Receive one ${item.unit} of ${item.name}`}>+</button>
                      <button onClick={() => setAdjustItem(item)}
                        className="h-11 rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-300"
                        aria-label={`Adjust stock for ${item.name}`}>Adjust</button>
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

      {/* Movement history */}
      <section className="mt-8">
        <button onClick={() => setHistoryOpen(o => !o)} aria-expanded={historyOpen}
          className="flex w-full items-center justify-between rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-left">
          <span className="text-sm font-bold uppercase tracking-wider text-zinc-400">Recent movements ({(log ?? []).length})</span>
          <span className="text-zinc-500" aria-hidden="true">{historyOpen ? "▾" : "▸"}</span>
        </button>
        {historyOpen && (
          (log ?? []).length === 0
            ? <p className="px-4 py-3 text-sm text-zinc-500">No stock movements logged yet.</p>
            : (
              <ul className="mt-2 space-y-1.5">
                {(log ?? []).slice(0, 25).map(e => {
                  const r = ADJUST_REASONS.find(x => x.key === e.reason);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-zinc-300"><span className="font-semibold">{e.itemName}</span> · {r?.label ?? e.reason}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className={`font-bold ${e.delta >= 0 ? "text-green-400" : "text-red-400"}`}>{e.delta >= 0 ? "+" : ""}{e.delta}</span>
                        <span className="text-zinc-500">{e.by} · {new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
        )}
      </section>

      {adjustItem && (
        <AdjustDialog item={adjustItem} busy={adjustMut.isPending}
          error={adjustMut.error instanceof Error ? adjustMut.error.message : null}
          onCancel={() => setAdjustItem(null)}
          onSubmit={(delta, reason) => adjustMut.mutate({ item: adjustItem, delta, reason })} />
      )}
      {editDraft && (
        <EditDialog draft={editDraft} setDraft={setEditDraft} busy={upsertMut.isPending}
          error={upsertMut.error instanceof Error ? upsertMut.error.message : null}
          onCancel={() => setEditDraft(null)}
          onSubmit={() => upsertMut.mutate(editDraft)} />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${active ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
      {children}
    </button>
  );
}

function AdjustDialog({ item, busy, error, onCancel, onSubmit }: {
  item: SupplyItem; busy: boolean; error: string | null;
  onCancel: () => void; onSubmit: (delta: number, reason: AdjustReason) => void;
}) {
  const [reason, setReason] = useState<AdjustReason>("receive");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const n = Number(qty);
  const cfg = ADJUST_REASONS.find(r => r.key === reason)!;
  const delta = reason === "adjustment" ? n : cfg.sign * Math.abs(n);
  const valid = Number.isFinite(n) && n !== 0;
  const projected = Math.max(0, item.onHand + delta);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Adjust ${item.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (valid) onSubmit(delta, reason); }}>
        <h3 className="text-lg font-bold text-zinc-100">Adjust stock — {item.name}</h3>
        <p className="mt-1 text-sm text-zinc-500">On hand: {item.onHand} {item.unit} · PAR {item.parLevel}</p>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Reason
          <select value={reason} onChange={e => setReason(e.target.value as AdjustReason)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
            {ADJUST_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">
          Quantity ({item.unit}){reason === "adjustment" && <span className="font-normal text-zinc-600"> — use negative to decrease</span>}
          <input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" autoFocus placeholder="0"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes <span className="font-normal text-zinc-600">(optional)</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Sysco delivery, Rivera wedding…"
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

function EditDialog({ draft, setDraft, busy, error, onCancel, onSubmit }: {
  draft: EditDraft; setDraft: (d: EditDraft) => void; busy: boolean; error: string | null;
  onCancel: () => void; onSubmit: () => void;
}) {
  const up = (patch: Partial<EditDraft>) => setDraft({ ...draft, ...patch });
  return (
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Edit item" : "Add supply item"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (draft.name.trim()) onSubmit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{draft.id ? "Edit item" : "Add supply item"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Item name
          <input value={draft.name} onChange={e => up({ name: e.target.value })} required autoFocus
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <select value={draft.category} onChange={e => up({ category: e.target.value as SupplyCategory })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
              {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <input value={draft.unit} onChange={e => up({ unit: e.target.value })} placeholder="ea, box, roll…"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">On hand
            <input value={draft.onHand} onChange={e => up({ onHand: e.target.value })} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">PAR level
            <input value={draft.parLevel} onChange={e => up({ parLevel: e.target.value })} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Reorder qty
            <input value={draft.reorderQty} onChange={e => up({ reorderQty: e.target.value })} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Per-order usage
            <input value={draft.perOrderUsage} onChange={e => up({ perOrderUsage: e.target.value })} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Cost / unit ($)
            <input value={draft.costDollars} onChange={e => up({ costDollars: e.target.value })} inputMode="decimal" placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
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
