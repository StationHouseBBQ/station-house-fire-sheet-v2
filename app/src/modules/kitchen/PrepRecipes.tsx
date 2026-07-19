import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PrepCategory, PrepRecipe } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Kitchen · Prep Recipes — V2 implementation of the Manus PrepRecipeAdmin.
 * Recipe cards → detail dialog (ingredients table + numbered steps);
 * New/Edit form dialog with dynamic ingredient rows and one-step-per-line
 * textarea; two-tap delete confirm. All writes via dal.prepRecipes.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const CATEGORY_META: Record<PrepCategory, { icon: string; label: string }> = {
  meats: { icon: "🥩", label: "Meats" },
  sauces: { icon: "🫙", label: "Sauces" },
  sides: { icon: "🥗", label: "Sides" },
  retail_prep: { icon: "🛒", label: "Retail Prep" },
  misc: { icon: "📦", label: "Misc" },
  desserts: { icon: "🍮", label: "Desserts" },
};

const UNITS = ["lbs", "oz", "cups", "quarts", "pints", "gallons", "each", "pans", "batches", "tbsp", "tsp"];

interface IngredientDraft { id: string; name: string; qty: string; unit: string; }

interface RecipeDraft {
  id: string | null;
  name: string;
  category: PrepCategory;
  yieldQty: string;
  yieldUnit: string;
  ingredients: IngredientDraft[];
  stepsText: string;
}

function emptyDraft(): RecipeDraft {
  return {
    id: null, name: "", category: "sauces", yieldQty: "1", yieldUnit: "quarts",
    ingredients: [{ id: crypto.randomUUID(), name: "", qty: "1", unit: "cups" }],
    stepsText: "",
  };
}

function draftFrom(r: PrepRecipe): RecipeDraft {
  return {
    id: r.id, name: r.name, category: r.category,
    yieldQty: String(r.yieldQty), yieldUnit: r.yieldUnit,
    ingredients: r.ingredients.map(i => ({ id: i.id, name: i.name, qty: String(i.qty), unit: i.unit })),
    stepsText: r.steps.join("\n"),
  };
}

export function PrepRecipesView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [detail, setDetail] = useState<PrepRecipe | null>(null);
  const [form, setForm] = useState<RecipeDraft | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<PrepCategory | "all">("all");

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["prepRecipes"],
    queryFn: () => dal.prepRecipes.list(),
  });

  const q = search.trim().toLowerCase();
  const filtered = recipes
    .filter(r => catFilter === "all" || r.category === catFilter)
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.ingredients.some(i => i.name.toLowerCase().includes(q)));

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["prepRecipes"] });

  const upsertMut = useMutation({
    mutationFn: (recipe: Omit<PrepRecipe, "updatedAt">) => withSync(dal.prepRecipes.upsert(recipe, actor)),
    onSuccess: saved => { invalidate(); setForm(null); setDetail(d => (d && d.id === saved.id ? saved : d)); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.prepRecipes.remove(id, actor)),
    onSuccess: () => { invalidate(); setArmedDelete(null); setDetail(null); },
  });

  const handleDelete = (id: string) => {
    if (armedDelete === id) {
      removeMut.mutate(id);
    } else {
      setArmedDelete(id);
      setTimeout(() => setArmedDelete(prev => (prev === id ? null : prev)), 4000);
    }
  };

  const submitForm = (d: RecipeDraft) => {
    const steps = d.stepsText.split("\n").map(s => s.trim()).filter(Boolean);
    upsertMut.mutate({
      id: d.id ?? crypto.randomUUID(),
      name: d.name.trim(),
      category: d.category,
      yieldQty: Number(d.yieldQty) || 0,
      yieldUnit: d.yieldUnit,
      ingredients: d.ingredients
        .filter(i => i.name.trim())
        .map(i => ({ id: i.id, name: i.name.trim(), qty: Number(i.qty) || 0, unit: i.unit })),
      steps,
    });
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading recipes…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Prep Recipes</h1>
          <p className="text-sm text-zinc-500">{recipes.length} recipe{recipes.length !== 1 ? "s" : ""} on file</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setForm(emptyDraft())}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Recipe</button>
        </div>
      </header>

      {/* Search + category filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipe or ingredient…"
          aria-label="Search recipes"
          className="min-h-[44px] flex-1 basis-56 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value as PrepCategory | "all")}
          aria-label="Filter by category"
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100">
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_META) as PrepCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {filtered.map(r => (
          <article key={r.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <button onClick={() => setDetail(r)} className="min-h-[44px] w-full text-left" aria-label={`Open ${r.name}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>{CATEGORY_META[r.category].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-zinc-100">{r.name}</p>
                  <p className="text-xs text-zinc-500">
                    {CATEGORY_META[r.category].label} · yields {r.yieldQty} {r.yieldUnit}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {r.ingredients.length} ingredient{r.ingredients.length !== 1 ? "s" : ""} · {r.steps.length} step{r.steps.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </button>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setForm(draftFrom(r))}
                className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300">Edit</button>
              <button onClick={() => handleDelete(r.id)} disabled={removeMut.isPending}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  armedDelete === r.id
                    ? "animate-pulse border-red-500 bg-red-500/20 text-red-300"
                    : "border-ink-700 bg-ink-800 text-zinc-400"
                }`}>
                {armedDelete === r.id ? "Confirm delete?" : "Delete"}
              </button>
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">
            {recipes.length === 0 ? "No recipes yet — add your first one" : "No recipes match this filter"}
          </p>
        )}
      </div>

      {detail && !form && (
        <RecipeDetail recipe={detail} onEdit={() => setForm(draftFrom(detail))} onClose={() => setDetail(null)} />
      )}

      {form && (
        <RecipeForm draft={form} busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onChange={setForm} onCancel={() => setForm(null)} onSubmit={() => submitForm(form)} />
      )}
    </div>
  );
}

function RecipeDetail({ recipe, onEdit, onClose }: { recipe: PrepRecipe; onEdit: () => void; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const SCALES = [0.5, 1, 2, 3, 4];
  const fmt = (n: number) => {
    const v = n * scale;
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={recipe.name}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">{CATEGORY_META[recipe.category].icon} {recipe.name}</h3>
            <p className="text-xs text-zinc-500">
              {CATEGORY_META[recipe.category].label} · yields {fmt(recipe.yieldQty)} {recipe.yieldUnit}
              {scale !== 1 && <span className="text-fire-light"> ({scale}× batch)</span>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 text-zinc-400">✕</button>
        </div>

        {/* Batch scaler */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Scale batch</span>
          <div className="flex items-center rounded-lg border border-ink-700 text-xs" role="group" aria-label="Batch scale">
            {SCALES.map(sc => (
              <button key={sc} onClick={() => setScale(sc)}
                className={`min-h-[40px] px-3 py-1.5 font-bold first:rounded-l-lg last:rounded-r-lg ${scale === sc ? "bg-fire text-white" : "text-zinc-400"}`}>
                {sc}×
              </button>
            ))}
          </div>
        </div>

        <h4 className="mt-4 text-xs font-black uppercase tracking-wider text-fire-light">Ingredients</h4>
        <table className="mt-1.5 w-full text-sm">
          <tbody>
            {recipe.ingredients.map(i => (
              <tr key={i.id} className="border-b border-ink-800">
                <td className="py-1.5 text-zinc-200">{i.name}</td>
                <td className="py-1.5 text-right font-mono font-bold text-amber-300">{fmt(i.qty)}</td>
                <td className="w-20 py-1.5 pl-2 text-zinc-500">{i.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4 className="mt-4 text-xs font-black uppercase tracking-wider text-fire-light">Steps</h4>
        <ol className="mt-1.5 space-y-1.5">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-300">
              <span className="w-5 shrink-0 font-mono text-xs font-bold text-zinc-500">{i + 1}.</span>{s}
            </li>
          ))}
          {recipe.steps.length === 0 && <li className="text-sm text-zinc-600">No steps recorded</li>}
        </ol>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onEdit} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Edit</button>
          <button onClick={onClose} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">Done</button>
        </div>
      </div>
    </div>
  );
}

function RecipeForm({ draft, busy, error, onChange, onCancel, onSubmit }: {
  draft: RecipeDraft; busy: boolean; error: string | null;
  onChange: (d: RecipeDraft) => void; onCancel: () => void; onSubmit: () => void;
}) {
  const setIng = (id: string, patch: Partial<IngredientDraft>) =>
    onChange({ ...draft, ingredients: draft.ingredients.map(i => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Edit recipe" : "New recipe"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{draft.id ? "Edit recipe" : "New recipe"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <select value={draft.category} onChange={e => onChange({ ...draft, category: e.target.value as PrepCategory })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {(Object.keys(CATEGORY_META) as PrepCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_META[c].label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Yield qty
            <input value={draft.yieldQty} inputMode="decimal" onChange={e => onChange({ ...draft, yieldQty: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Yield unit
            <select value={draft.yieldUnit} onChange={e => onChange({ ...draft, yieldUnit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>

        {/* Ingredients */}
        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-400">Ingredients</p>
          <div className="mt-1 space-y-2">
            {draft.ingredients.map(i => (
              <div key={i.id} className="flex gap-2">
                <input value={i.name} placeholder="Ingredient" aria-label="Ingredient name"
                  onChange={e => setIng(i.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
                <input value={i.qty} inputMode="decimal" aria-label="Quantity"
                  onChange={e => setIng(i.id, { qty: e.target.value })}
                  className="w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-center text-sm text-zinc-100" />
                <select value={i.unit} aria-label="Unit"
                  onChange={e => setIng(i.id, { unit: e.target.value })}
                  className="w-24 rounded-lg border border-ink-700 bg-ink-800 px-1 py-2.5 text-sm text-zinc-100">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <button type="button" aria-label="Remove ingredient"
                  onClick={() => onChange({ ...draft, ingredients: draft.ingredients.filter(x => x.id !== i.id) })}
                  disabled={draft.ingredients.length === 1}
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 text-zinc-500 disabled:opacity-40">✕</button>
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => onChange({ ...draft, ingredients: [...draft.ingredients, { id: crypto.randomUUID(), name: "", qty: "1", unit: "cups" }] })}
            className="mt-2 min-h-[44px] w-full rounded-lg border border-dashed border-ink-700 px-3 py-2 text-sm text-zinc-400 hover:border-fire/40">
            ＋ Add ingredient
          </button>
        </div>

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Steps (one per line)
          <textarea value={draft.stepsText} rows={5}
            onChange={e => onChange({ ...draft, stepsText: e.target.value })}
            placeholder={"Whisk all ingredients cold\nSimmer 25 min, low\nCool, date & label"}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save recipe"}
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
