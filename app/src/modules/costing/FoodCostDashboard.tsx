import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import {
  COSTING_PLATES_KEY,
  COSTING_PLATES_SEED,
  type CostingPlate,
} from "./_data/seeds";
import {
  centsToInput,
  dollarsToCents,
  foodCostBar,
  foodCostTone,
  formatCents,
  uid,
  type Sync,
} from "./_data/helpers";
import { Kpi, SyncBadge } from "./_data/ui";

/**
 * Costing · Food Cost Dashboard — per-menu-item plate economics.
 *
 * For every plate we track its estimated food cost vs its menu price, then
 * derive food-cost % (green ≤30 / amber ≤38 / red), margin $ per plate, and a
 * summary (item count, avg food-cost %, best/worst performer). Every row is
 * editable inline; the whole model persists under "costing.plates" via
 * dal.settings, seeded with ~10 real Station House items.
 *
 * Money is integer cents throughout; food-cost % = plate cost ÷ menu price.
 */

interface PlateRow extends CostingPlate {
  foodCostPct: number;
  marginCents: number;
}

function computeRow(p: CostingPlate): PlateRow {
  const foodCostPct = p.menuPriceCents > 0 ? (p.plateCostCents / p.menuPriceCents) * 100 : 0;
  return { ...p, foodCostPct, marginCents: p.menuPriceCents - p.plateCostCents };
}

type SortKey = "worst" | "best" | "name" | "margin";

export function FoodCostDashboard() {
  const dal = getDal();
  const { actor } = useRole();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [sortKey, setSortKey] = useState<SortKey>("worst");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftCost, setDraftCost] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftName, setDraftName] = useState("");

  const { data: plates = [], isLoading } = useQuery({
    queryKey: ["settings", COSTING_PLATES_KEY],
    queryFn: () => dal.settings.get<CostingPlate[]>(COSTING_PLATES_KEY, COSTING_PLATES_SEED),
  });

  const save = useMutation({
    mutationFn: (next: CostingPlate[]) => {
      setSync("saving");
      return dal.settings.set(COSTING_PLATES_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", COSTING_PLATES_KEY] }),
  });

  const rows = useMemo(() => {
    const built = plates.map(computeRow);
    built.sort((a, b) => {
      switch (sortKey) {
        case "worst": return b.foodCostPct - a.foodCostPct;
        case "best": return a.foodCostPct - b.foodCostPct;
        case "margin": return b.marginCents - a.marginCents;
        case "name": return a.name.localeCompare(b.name);
      }
    });
    return built;
  }, [plates, sortKey]);

  const summary = useMemo(() => {
    const priced = plates.map(computeRow).filter(r => r.menuPriceCents > 0);
    if (priced.length === 0) return { count: plates.length, avgPct: 0, best: null as PlateRow | null, worst: null as PlateRow | null, over: 0 };
    const avgPct = priced.reduce((s, r) => s + r.foodCostPct, 0) / priced.length;
    const sorted = [...priced].sort((a, b) => a.foodCostPct - b.foodCostPct);
    return {
      count: plates.length,
      avgPct,
      best: sorted[0] ?? null,
      worst: sorted[sorted.length - 1] ?? null,
      over: priced.filter(r => r.foodCostPct > 30).length,
    };
  }, [plates]);

  const startEdit = (r: PlateRow) => {
    setEditingId(r.id);
    setDraftName(r.name);
    setDraftCost(centsToInput(r.plateCostCents));
    setDraftPrice(centsToInput(r.menuPriceCents));
  };
  const commitEdit = () => {
    if (!editingId) return;
    const next = plates.map(p =>
      p.id === editingId
        ? { ...p, name: draftName.trim() || p.name, plateCostCents: dollarsToCents(draftCost), menuPriceCents: dollarsToCents(draftPrice) }
        : p,
    );
    save.mutate(next);
    setEditingId(null);
  };
  const addPlate = () => {
    const p: CostingPlate = { id: uid("plate"), name: "New menu item", category: "Plate", plateCostCents: 300, menuPriceCents: 1000 };
    save.mutate([...plates, p]);
    startEdit(computeRow(p));
  };
  const removePlate = (id: string) => {
    save.mutate(plates.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading plate costs…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Food Cost Dashboard</h1>
          <p className="text-sm text-zinc-500">Plate cost vs menu price · target ≤ 30% food cost</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={addPlate}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      </header>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Items tracked" value={String(summary.count)} />
        <Kpi label="Avg food cost %" value={summary.avgPct > 0 ? `${summary.avgPct.toFixed(1)}%` : "—"}
          tone={summary.avgPct === 0 ? undefined : summary.avgPct <= 30 ? "ok" : summary.avgPct <= 38 ? "warn" : "bad"} />
        <Kpi label="Over 30%" value={String(summary.over)} tone={summary.over > 0 ? "warn" : "ok"} />
        <Kpi label="Best margin" value={summary.best ? `${summary.best.foodCostPct.toFixed(0)}%` : "—"} tone="ok" />
      </div>

      {(summary.best || summary.worst) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summary.best && (
            <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-400">Best food-cost item</p>
              <p className="mt-1 text-sm font-bold text-zinc-100">{summary.best.name}</p>
              <p className="text-xs text-zinc-400">{summary.best.foodCostPct.toFixed(1)}% food cost · {formatCents(summary.best.marginCents)} margin</p>
            </div>
          )}
          {summary.worst && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-red-400">Worst food-cost item</p>
              <p className="mt-1 text-sm font-bold text-zinc-100">{summary.worst.name}</p>
              <p className="text-xs text-zinc-400">{summary.worst.foodCostPct.toFixed(1)}% food cost · {formatCents(summary.worst.marginCents)} margin</p>
            </div>
          )}
        </div>
      )}

      {/* Sort */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sort</span>
        {([["worst", "Worst first"], ["best", "Best first"], ["margin", "Margin $"], ["name", "Name"]] as Array<[SortKey, string]>).map(([k, label]) => (
          <button key={k} onClick={() => setSortKey(k)}
            className={`min-h-[40px] rounded-full border px-3 py-1.5 text-sm font-semibold ${
              sortKey === k ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-400"
            }`}>{label}</button>
        ))}
      </div>

      {/* Rows */}
      <div className="mt-4 space-y-2">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-700 bg-ink-900 p-8 text-center text-sm text-zinc-500">
            No items yet — tap "Add item" to start costing the menu.
          </p>
        )}
        {rows.map(r => {
          const editing = editingId === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              {editing ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <input value={draftName} onChange={e => setDraftName(e.target.value)} aria-label="Item name"
                    className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm text-zinc-100 outline-none focus:border-fire" />
                  <label className="flex items-center gap-1 text-sm text-zinc-400">Cost $
                    <input value={draftCost} onChange={e => setDraftCost(e.target.value)} inputMode="decimal" aria-label="Plate cost dollars"
                      className="min-h-[44px] w-24 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" /></label>
                  <label className="flex items-center gap-1 text-sm text-zinc-400">Price $
                    <input value={draftPrice} onChange={e => setDraftPrice(e.target.value)} inputMode="decimal" aria-label="Menu price dollars"
                      className="min-h-[44px] w-24 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" /></label>
                  <div className="flex items-center gap-2">
                    <button onClick={commitEdit}
                      className="min-h-[44px] rounded-lg bg-fire px-4 text-sm font-bold text-white">Save</button>
                    <button onClick={() => setEditingId(null)}
                      className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 text-sm font-semibold text-zinc-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-zinc-100">{r.name}</span>
                      <span className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">{r.category}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatCents(r.plateCostCents)} cost · {formatCents(r.menuPriceCents)} price · {formatCents(r.marginCents)} margin
                    </p>
                    <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-ink-800">
                      <div className={`h-2 rounded-full ${foodCostBar(r.foodCostPct)}`} style={{ width: `${Math.min(r.foodCostPct, 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-2xl font-black tabular-nums ${foodCostTone(r.foodCostPct)}`}>
                      {r.foodCostPct > 0 ? `${r.foodCostPct.toFixed(0)}%` : "—"}
                    </span>
                    <button onClick={() => startEdit(r)}
                      className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">Edit</button>
                    <button onClick={() => removePlate(r.id)} aria-label={`Remove ${r.name}`}
                      className="min-h-[40px] min-w-[40px] rounded-lg border border-ink-700 bg-ink-800 px-2 text-zinc-600 hover:text-red-400">✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
