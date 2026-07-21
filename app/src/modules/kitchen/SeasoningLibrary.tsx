import { useMemo, useState } from "react";
import { SyncBadge, uid, useSettingsState } from "./_ext/opsState";
import { seedSeasonings } from "./_ext/opsSeeds";

/**
 * Kitchen · Seasoning Library — rub / blend recipes.
 * Card grid of seasonings; tap a card to expand its detail (ingredient table
 * with batch scaling, binder / timing / rest-time guide) folded in from the
 * Manus SeasoningDetail page. Add / edit blends with dynamic ingredient rows.
 * Persists via dal.settings key "kitchen.seasonings".
 */

export type MeatType = "brisket" | "pork" | "ribs" | "chicken" | "sausage" | "specialty" | "other";

export interface SeasoningIngredient {
  id: string;
  name: string;
  qty: number;
  unit: string;
}

export interface Seasoning {
  id: string;
  name: string;
  meatType: MeatType;
  description: string;
  batchQty: number;
  batchUnit: string;
  binder: string;
  timing: string;
  restTime: string;
  ingredients: SeasoningIngredient[];
}

const MEAT_META: Record<MeatType, { label: string; emoji: string; color: string }> = {
  brisket: { label: "Brisket", emoji: "🥩", color: "#7c2d12" },
  pork: { label: "Pork", emoji: "🐷", color: "#9a3412" },
  ribs: { label: "Ribs", emoji: "🍖", color: "#92400e" },
  chicken: { label: "Chicken", emoji: "🍗", color: "#d97706" },
  sausage: { label: "Sausage", emoji: "🌭", color: "#78350f" },
  specialty: { label: "Specialty", emoji: "✨", color: "#b45309" },
  other: { label: "Other", emoji: "🧂", color: "#a16207" },
};

const UNITS = ["cups", "tbsp", "tsp", "oz", "lbs", "grams"];
const MEAT_FILTERS: (MeatType | "all")[] = ["all", "brisket", "pork", "ribs", "chicken", "sausage", "specialty", "other"];

interface IngredientDraft { id: string; name: string; qty: string; unit: string; }
interface SeasoningDraft {
  id: string | null;
  name: string;
  meatType: MeatType;
  description: string;
  batchQty: string;
  batchUnit: string;
  binder: string;
  timing: string;
  restTime: string;
  ingredients: IngredientDraft[];
}

function emptyDraft(): SeasoningDraft {
  return {
    id: null, name: "", meatType: "brisket", description: "",
    batchQty: "4", batchUnit: "cups", binder: "", timing: "", restTime: "",
    ingredients: [{ id: uid(), name: "", qty: "1", unit: "cups" }],
  };
}
function draftFrom(s: Seasoning): SeasoningDraft {
  return {
    id: s.id, name: s.name, meatType: s.meatType, description: s.description,
    batchQty: String(s.batchQty), batchUnit: s.batchUnit, binder: s.binder, timing: s.timing, restTime: s.restTime,
    ingredients: s.ingredients.map(i => ({ id: i.id, name: i.name, qty: String(i.qty), unit: i.unit })),
  };
}
function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function SeasoningLibrary() {
  const { value: seasonings, set: setSeasonings, loading, sync } = useSettingsState<Seasoning[]>("kitchen.seasonings", seedSeasonings());
  const [filter, setFilter] = useState<MeatType | "all">("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<SeasoningDraft | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const filtered = useMemo(
    () => seasonings.filter(s => filter === "all" || s.meatType === filter),
    [seasonings, filter],
  );
  const detail = detailId ? seasonings.find(s => s.id === detailId) ?? null : null;

  if (loading) return <p className="py-20 text-center text-zinc-500">Loading seasonings…</p>;

  const submit = (d: SeasoningDraft) => {
    const saved: Seasoning = {
      id: d.id ?? uid(),
      name: d.name.trim(),
      meatType: d.meatType,
      description: d.description.trim(),
      batchQty: Number(d.batchQty) || 0,
      batchUnit: d.batchUnit.trim() || "cups",
      binder: d.binder.trim(),
      timing: d.timing.trim(),
      restTime: d.restTime.trim(),
      ingredients: d.ingredients
        .filter(i => i.name.trim())
        .map(i => ({ id: i.id, name: i.name.trim(), qty: Number(i.qty) || 0, unit: i.unit })),
    };
    setSeasonings(prev => (d.id ? prev.map(s => (s.id === d.id ? saved : s)) : [...prev, saved]));
    setForm(null);
  };

  const removeSeasoning = (id: string) => {
    if (armedDelete === id) {
      setSeasonings(prev => prev.filter(s => s.id !== id));
      setArmedDelete(null);
      setDetailId(null);
    } else {
      setArmedDelete(id);
      setTimeout(() => setArmedDelete(prev => (prev === id ? null : prev)), 4000);
    }
  };

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🧪 Seasoning Library</h1>
          <p className="text-sm text-zinc-500">Rubs &amp; blends · {seasonings.length} on file</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setForm(emptyDraft())} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New blend</button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {MEAT_FILTERS.map(f => {
          const count = f === "all" ? seasonings.length : seasonings.filter(s => s.meatType === f).length;
          const label = f === "all" ? "🔥 All" : `${MEAT_META[f].emoji} ${MEAT_META[f].label}`;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${filter === f ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-400"}`}>
              {label} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">No seasonings match this filter.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(s => {
            const meta = MEAT_META[s.meatType];
            return (
              <article key={s.id} className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900"
                style={{ borderLeft: `4px solid ${meta.color}` }}>
                <button onClick={() => setDetailId(s.id)} className="w-full p-4 text-left">
                  <div className="text-2xl" aria-hidden>{meta.emoji}</div>
                  <p className="mt-1 font-bold text-zinc-100">{s.name}</p>
                  <p className="text-xs text-zinc-500">{meta.label} · batch {fmtQty(s.batchQty)} {s.batchUnit}</p>
                  {s.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{s.description}</p>}
                  <p className="mt-2 text-xs text-zinc-600">{s.ingredients.length} ingredient{s.ingredients.length !== 1 ? "s" : ""} · tap for recipe</p>
                </button>
                <div className="flex justify-end gap-2 border-t border-ink-800 px-3 py-2">
                  <button onClick={() => setForm(draftFrom(s))} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">Edit</button>
                  <button onClick={() => removeSeasoning(s.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${armedDelete === s.id ? "animate-pulse border-red-500 bg-red-500/20 text-red-300" : "border-ink-700 bg-ink-800 text-zinc-400"}`}>
                    {armedDelete === s.id ? "Confirm delete?" : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {detail && !form && (
        <SeasoningDetail seasoning={detail} onEdit={() => setForm(draftFrom(detail))} onClose={() => setDetailId(null)} />
      )}
      {form && (
        <SeasoningForm draft={form} onChange={setForm} onCancel={() => setForm(null)} onSubmit={() => submit(form)} />
      )}
    </div>
  );
}

/** Folded-in SeasoningDetail: ingredient table with batch scaling + guide. */
function SeasoningDetail({ seasoning, onEdit, onClose }: { seasoning: Seasoning; onEdit: () => void; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const SCALES = [0.5, 1, 2, 3, 4];
  const meta = MEAT_META[seasoning.meatType];
  return (
    <div role="dialog" aria-modal="true" aria-label={seasoning.name}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        style={{ borderTop: `4px solid ${meta.color}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">{meta.emoji} {seasoning.name}</h3>
            <p className="text-xs text-zinc-500">
              {meta.label} · batch {fmtQty(seasoning.batchQty * scale)} {seasoning.batchUnit}{scale !== 1 && <span className="text-fire-light"> ({scale}×)</span>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 text-zinc-400">✕</button>
        </div>

        {seasoning.description && <p className="mt-3 text-sm text-zinc-300">{seasoning.description}</p>}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Scale</span>
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
            {seasoning.ingredients.map(i => (
              <tr key={i.id} className="border-b border-ink-800">
                <td className="py-1.5 text-zinc-200">{i.name}</td>
                <td className="py-1.5 text-right font-mono font-bold text-amber-300">{fmtQty(i.qty * scale)}</td>
                <td className="w-20 py-1.5 pl-2 text-zinc-500">{i.unit}</td>
              </tr>
            ))}
            {seasoning.ingredients.length === 0 && (
              <tr><td className="py-2 text-sm text-zinc-600">No ingredients recorded</td></tr>
            )}
          </tbody>
        </table>

        <h4 className="mt-4 text-xs font-black uppercase tracking-wider text-fire-light">Application guide</h4>
        <dl className="mt-1.5 space-y-1.5 text-sm">
          <Guide label="Binder" value={seasoning.binder} />
          <Guide label="Timing" value={seasoning.timing} />
          <Guide label="Rest time" value={seasoning.restTime} />
        </dl>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onEdit} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Edit</button>
          <button onClick={onClose} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">Done</button>
        </div>
      </div>
    </div>
  );
}

function Guide({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{value || <span className="text-zinc-600">—</span>}</dd>
    </div>
  );
}

function SeasoningForm({ draft, onChange, onCancel, onSubmit }: {
  draft: SeasoningDraft; onChange: (d: SeasoningDraft) => void; onCancel: () => void; onSubmit: () => void;
}) {
  const setIng = (id: string, patch: Partial<IngredientDraft>) =>
    onChange({ ...draft, ingredients: draft.ingredients.map(i => (i.id === id ? { ...i, ...patch } : i)) });
  return (
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Edit seasoning" : "New seasoning"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (draft.name.trim()) onSubmit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{draft.id ? "Edit blend" : "New blend"}</h3>

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Meat
            <select value={draft.meatType} onChange={e => onChange({ ...draft, meatType: e.target.value as MeatType })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {(Object.keys(MEAT_META) as MeatType[]).map(m => <option key={m} value={m}>{MEAT_META[m].label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Batch qty
            <input inputMode="decimal" value={draft.batchQty} onChange={e => onChange({ ...draft, batchQty: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Batch unit
            <select value={draft.batchUnit} onChange={e => onChange({ ...draft, batchUnit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-sm font-semibold text-zinc-400">Description
          <textarea value={draft.description} rows={2} onChange={e => onChange({ ...draft, description: e.target.value })}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
        </label>

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
                <select value={i.unit} aria-label="Unit" onChange={e => setIng(i.id, { unit: e.target.value })}
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
            onClick={() => onChange({ ...draft, ingredients: [...draft.ingredients, { id: uid(), name: "", qty: "1", unit: "cups" }] })}
            className="mt-2 min-h-[44px] w-full rounded-lg border border-dashed border-ink-700 px-3 py-2 text-sm text-zinc-400 hover:border-fire/40">
            ＋ Add ingredient
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm font-semibold text-zinc-400">Binder
            <input value={draft.binder} onChange={e => onChange({ ...draft, binder: e.target.value })} placeholder="Mustard, oil…"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Timing
            <input value={draft.timing} onChange={e => onChange({ ...draft, timing: e.target.value })} placeholder="When to season"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Rest time
            <input value={draft.restTime} onChange={e => onChange({ ...draft, restTime: e.target.value })} placeholder="Overnight…"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={!draft.name.trim()} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save blend</button>
        </div>
      </form>
    </div>
  );
}
