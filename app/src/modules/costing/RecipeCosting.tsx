import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import {
  COSTING_RECIPES_KEY,
  RECIPES_SEED,
  type Recipe,
  type RecipeIngredient,
  type RecipeUnit,
} from "./_data/seeds";
import {
  centsToInput,
  dollarsToCents,
  formatCents,
  uid,
  type Sync,
} from "./_data/helpers";
import { Kpi, SyncBadge } from "./_data/ui";

/**
 * Costing · Recipe Costing — build a recipe, cost the batch.
 *
 * Add ingredients (qty, unit, purchase cost per unit, raw→cooked yield %) →
 * total batch cost, cost per portion, and a suggested sell price at a target
 * food-cost %. The yield idea from YieldSystem is folded in: an ingredient's
 * effective cost is grossed up by its yield (cost ÷ yield%), so a 55%-yield
 * brisket costs ~1.8× its raw price per usable pound. Persists all recipes
 * under "costing.recipes"; money is integer cents.
 */

const UNITS: RecipeUnit[] = ["lb", "oz", "each", "cup", "qt", "gal", "dozen"];

/** Effective cost of an ingredient line after cook-yield loss, in cents. */
function lineCostCents(ing: RecipeIngredient): number {
  const raw = ing.qty * ing.unitCostCents;
  const yieldFrac = Math.max(0.01, Math.min(1, ing.yieldPct / 100));
  return Math.round(raw / yieldFrac);
}

interface RecipeMath {
  batchCents: number;
  perPortionCents: number;
  suggestedPriceCents: number;
}
function computeRecipe(r: Recipe): RecipeMath {
  const batchCents = r.ingredients.reduce((s, i) => s + lineCostCents(i), 0);
  const portions = Math.max(1, r.portions);
  const perPortionCents = Math.round(batchCents / portions);
  const targetFrac = Math.max(0.01, Math.min(0.99, r.targetFoodCostPct / 100));
  const suggestedPriceCents = Math.round(perPortionCents / targetFrac);
  return { batchCents, perPortionCents, suggestedPriceCents };
}

export function RecipeCosting() {
  const dal = getDal();
  const { actor } = useRole();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["settings", COSTING_RECIPES_KEY],
    queryFn: () => dal.settings.get<Recipe[]>(COSTING_RECIPES_KEY, RECIPES_SEED),
  });

  const save = useMutation({
    mutationFn: (next: Recipe[]) => {
      setSync("saving");
      return dal.settings.set(COSTING_RECIPES_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", COSTING_RECIPES_KEY] }),
  });

  const selected = useMemo(
    () => recipes.find(r => r.id === selectedId) ?? recipes[0] ?? null,
    [recipes, selectedId],
  );
  const math = selected ? computeRecipe(selected) : null;

  const patchRecipe = (id: string, fields: Partial<Recipe>) =>
    save.mutate(recipes.map(r => (r.id === id ? { ...r, ...fields } : r)));
  const patchIng = (rid: string, iid: string, fields: Partial<RecipeIngredient>) =>
    patchRecipe(rid, {
      ingredients: (recipes.find(r => r.id === rid)?.ingredients ?? []).map(i => (i.id === iid ? { ...i, ...fields } : i)),
    });
  const addIngredient = (rid: string) =>
    patchRecipe(rid, {
      ingredients: [
        ...(recipes.find(r => r.id === rid)?.ingredients ?? []),
        { id: uid("ing"), name: "New ingredient", qty: 1, unit: "lb", unitCostCents: 100, yieldPct: 100 },
      ],
    });
  const removeIngredient = (rid: string, iid: string) =>
    patchRecipe(rid, { ingredients: (recipes.find(r => r.id === rid)?.ingredients ?? []).filter(i => i.id !== iid) });

  const addRecipe = () => {
    const r: Recipe = { id: uid("recipe"), name: "New recipe", portions: 12, targetFoodCostPct: 30, ingredients: [] };
    save.mutate([...recipes, r]);
    setSelectedId(r.id);
  };
  const removeRecipe = (id: string) => {
    save.mutate(recipes.filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading recipes…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Recipe Costing</h1>
          <p className="text-sm text-zinc-500">Batch cost · cost/portion · suggested price at target food-cost %</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={addRecipe}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New recipe</button>
        </div>
      </header>

      {/* Recipe picker */}
      <div className="mt-4 flex flex-wrap gap-2">
        {recipes.map(r => (
          <div key={r.id} className="flex items-center gap-1 rounded-full border border-ink-700 bg-ink-800 pl-1">
            <button onClick={() => setSelectedId(r.id)}
              className={`min-h-[40px] rounded-full px-3 py-1.5 text-sm font-semibold ${
                selected?.id === r.id ? "text-white" : "text-zinc-400"
              }`}>{r.name}</button>
            <button onClick={() => removeRecipe(r.id)} aria-label={`Delete ${r.name}`}
              className="min-h-[40px] min-w-[36px] rounded-full px-2 text-zinc-600 hover:text-red-400">✕</button>
          </div>
        ))}
        {recipes.length === 0 && <p className="text-sm text-zinc-500">No recipes yet — tap "New recipe".</p>}
      </div>

      {selected && math && (
        <>
          {/* Recipe header controls */}
          <section className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4 sm:grid-cols-[1fr_auto_auto]">
            <label className="text-sm text-zinc-400">Recipe name
              <input defaultValue={selected.name} key={`n-${selected.id}`}
                onBlur={e => patchRecipe(selected.id, { name: e.target.value.trim() || selected.name })}
                aria-label="Recipe name"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm text-zinc-100 outline-none focus:border-fire" />
            </label>
            <label className="text-sm text-zinc-400">Portions / batch
              <input inputMode="numeric" defaultValue={String(selected.portions)} key={`p-${selected.id}-${selected.portions}`}
                onBlur={e => { const n = Math.max(1, Math.round(Number.parseFloat(e.target.value) || 1)); patchRecipe(selected.id, { portions: n }); }}
                aria-label="Portions per batch"
                className="mt-1 min-h-[44px] w-28 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
            </label>
            <label className="text-sm text-zinc-400">Target food cost %
              <input inputMode="numeric" defaultValue={String(selected.targetFoodCostPct)} key={`t-${selected.id}-${selected.targetFoodCostPct}`}
                onBlur={e => { const n = Math.max(1, Math.min(99, Math.round(Number.parseFloat(e.target.value) || 30))); patchRecipe(selected.id, { targetFoodCostPct: n }); }}
                aria-label="Target food cost percent"
                className="mt-1 min-h-[44px] w-28 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
            </label>
          </section>

          {/* Results */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Batch cost" value={formatCents(math.batchCents)} />
            <Kpi label="Cost / portion" value={formatCents(math.perPortionCents)} />
            <Kpi label={`Suggested price @ ${selected.targetFoodCostPct}%`} value={formatCents(math.suggestedPriceCents)} tone="ok" />
            <Kpi label="At that price" value={`${foodCostPctLabel(math.perPortionCents, math.suggestedPriceCents)}`}
              tone="ok" />
          </div>

          {/* Ingredients */}
          <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Ingredients</p>
              <button onClick={() => addIngredient(selected.id)}
                className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">+ Add ingredient</button>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-xs text-zinc-500">
                    <th className="px-2 py-2 text-left">Ingredient</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-left">Unit</th>
                    <th className="px-2 py-2 text-right">$/unit</th>
                    <th className="px-2 py-2 text-right">Yield %</th>
                    <th className="px-2 py-2 text-right">Line cost</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.ingredients.map(ing => (
                    <tr key={ing.id} className="border-b border-ink-800/60">
                      <td className="px-2 py-1.5">
                        <input defaultValue={ing.name} key={`in-${ing.id}`}
                          onBlur={e => patchIng(selected.id, ing.id, { name: e.target.value.trim() || ing.name })}
                          aria-label="Ingredient name"
                          className="min-h-[40px] w-full rounded-lg border border-ink-700 bg-ink-800 px-2 text-sm text-zinc-100 outline-none focus:border-fire" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input inputMode="decimal" defaultValue={String(ing.qty)} key={`q-${ing.id}-${ing.qty}`}
                          onBlur={e => { const n = Math.max(0, Number.parseFloat(e.target.value) || 0); patchIng(selected.id, ing.id, { qty: n }); }}
                          aria-label="Quantity"
                          className="min-h-[40px] w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={ing.unit}
                          onChange={e => patchIng(selected.id, ing.id, { unit: e.target.value as RecipeUnit })}
                          aria-label="Unit"
                          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-2 text-sm text-zinc-100 outline-none focus:border-fire">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input inputMode="decimal" defaultValue={centsToInput(ing.unitCostCents)} key={`c-${ing.id}-${ing.unitCostCents}`}
                          onBlur={e => patchIng(selected.id, ing.id, { unitCostCents: dollarsToCents(e.target.value) })}
                          aria-label="Cost per unit dollars"
                          className="min-h-[40px] w-20 rounded-lg border border-ink-700 bg-ink-800 px-2 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input inputMode="numeric" defaultValue={String(ing.yieldPct)} key={`y-${ing.id}-${ing.yieldPct}`}
                          onBlur={e => { const n = Math.max(1, Math.min(100, Math.round(Number.parseFloat(e.target.value) || 100))); patchIng(selected.id, ing.id, { yieldPct: n }); }}
                          aria-label="Yield percent"
                          className="min-h-[40px] w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-zinc-200">
                        {formatCents(lineCostCents(ing))}
                        {ing.yieldPct < 100 && (
                          <span className="ml-1 block text-[10px] font-normal text-amber-400">+{(100 / ing.yieldPct * 100 - 100).toFixed(0)}% yield</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button onClick={() => removeIngredient(selected.id, ing.id)} aria-label={`Remove ${ing.name}`}
                          className="min-h-[36px] min-w-[36px] rounded-lg border border-ink-700 bg-ink-800 px-2 text-zinc-600 hover:text-red-400">✕</button>
                      </td>
                    </tr>
                  ))}
                  {selected.ingredients.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-6 text-center text-sm text-zinc-500">No ingredients yet — add one to cost this recipe.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-ink-700">
                    <td className="px-2 py-2 text-sm font-semibold text-zinc-300" colSpan={5}>Total batch cost</td>
                    <td className="px-2 py-2 text-right font-black tabular-nums text-zinc-100">{formatCents(math.batchCents)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-zinc-600">
              Yield &lt; 100% grosses up an ingredient's cost (cost ÷ yield) to reflect trim & cook loss — a 55% brisket costs ~1.8× its raw price per usable lb.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function foodCostPctLabel(costCents: number, priceCents: number): string {
  if (priceCents <= 0) return "—";
  const pct = (costCents / priceCents) * 100;
  return `${pct.toFixed(0)}%`;
}
