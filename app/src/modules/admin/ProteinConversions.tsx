import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ProteinConversion } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Admin · Protein Conversions — V2 counterpart of Manus ProteinConversionTable
 * (parity row 62), upgraded from read-only to fully editable: tap any cell to
 * edit (raw unit, yield, portions/lb, notes), add new proteins, two-tap
 * remove. The worked-example calculator reacts to edited values.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function ProteinConversionsView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: proteins, isLoading } = useQuery({ queryKey: ["proteins"], queryFn: () => dal.proteins.list() });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawQty, setRawQty] = useState("10");

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["proteins"] });

  const upsertMut = useMutation({
    mutationFn: (pc: Omit<ProteinConversion, "id"> & { id?: string }) => withSync(dal.proteins.upsert(pc, actor)),
    onSuccess: () => { setAddOpen(false); invalidate(); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.proteins.remove(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });

  if (isLoading || !proteins) return <p className="py-20 text-center text-zinc-500">Loading conversions…</p>;

  const patch = (p: ProteinConversion, changes: Partial<Omit<ProteinConversion, "id">>) =>
    upsertMut.mutate({ ...p, ...changes });

  const selected = proteins.find(p => p.id === selectedId) ?? proteins[0] ?? null;
  const qty = Number(rawQty);
  const validQty = Number.isFinite(qty) && qty >= 0;
  const cookedLbs = selected && validQty ? qty * selected.cookedYieldLbsPerUnit : null;
  const portions = selected && cookedLbs != null ? cookedLbs * selected.portionsPerCookedLb : null;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Protein Conversions</h1>
          <p className="text-sm text-zinc-500">Tap any value to edit — raw → cooked → portions</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setAddOpen(o => !o)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add protein</button>
        </div>
      </header>

      {upsertMut.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{upsertMut.error.message}</p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Protein</th>
              <th className="px-3 py-2.5">Raw unit</th>
              <th className="px-3 py-2.5 text-right">Cooked yield (lbs/unit)</th>
              <th className="px-3 py-2.5 text-right">Portions / cooked lb</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5 text-right">Remove</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {proteins.map(p => (
              <tr key={p.id} className={selected?.id === p.id ? "bg-ink-800/60" : ""}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{p.protein}</td>
                <td className="px-3 py-2.5">
                  <InlineText value={p.rawUnit} ariaLabel={`Raw unit for ${p.protein}`}
                    onSave={v => { if (v) patch(p, { rawUnit: v }); }} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <InlineDecimal value={p.cookedYieldLbsPerUnit} ariaLabel={`Cooked yield for ${p.protein}`}
                    onSave={v => patch(p, { cookedYieldLbsPerUnit: v })} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <InlineDecimal value={p.portionsPerCookedLb} ariaLabel={`Portions per cooked lb for ${p.protein}`}
                    onSave={v => patch(p, { portionsPerCookedLb: v })} />
                </td>
                <td className="px-3 py-2.5">
                  <InlineText value={p.notes ?? ""} placeholder="—" muted ariaLabel={`Notes for ${p.protein}`}
                    onSave={v => patch(p, { notes: v || null })} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {confirmRemove === p.id ? (
                    <span className="inline-flex gap-1">
                      <button onClick={() => removeMut.mutate(p.id)} disabled={removeMut.isPending}
                        className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                      <button onClick={() => setConfirmRemove(null)}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmRemove(p.id)}
                      className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {proteins.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">No conversion data.</td></tr>}
          </tbody>
        </table>
      </div>

      {addOpen && <AddProteinRow busy={upsertMut.isPending} onAdd={i => upsertMut.mutate(i)} onCancel={() => setAddOpen(false)} />}

      {/* Worked example calculator */}
      {selected && (
        <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Yield calculator">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Worked example</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-sm font-semibold text-zinc-400">Protein
              <select value={selected.id} onChange={e => setSelectedId(e.target.value)}
                className="mt-1 block min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
                {proteins.map(p => <option key={p.id} value={p.id}>{p.protein}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-zinc-400">Raw qty ({selected.rawUnit})
              <input value={rawQty} onChange={e => setRawQty(e.target.value)} inputMode="decimal"
                className="mt-1 block w-28 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-right font-mono text-zinc-100" />
            </label>
          </div>
          {validQty && cookedLbs != null && portions != null ? (
            <p className="mt-4 rounded-lg border border-fire/40 bg-ink-800 px-4 py-3 text-sm text-zinc-200">
              <span className="font-mono font-bold">{qty}</span> {selected.rawUnit} of {selected.protein} →{" "}
              <span className="font-mono font-bold text-fire-light">{cookedLbs.toFixed(1)} lbs cooked</span> →{" "}
              <span className="font-mono font-bold text-green-400">≈ {Math.floor(portions)} portions</span>
              <span className="ml-2 text-xs text-zinc-500">({selected.cookedYieldLbsPerUnit} lbs/unit yield × {selected.portionsPerCookedLb} portions/lb)</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-red-400">Enter a non-negative raw quantity.</p>
          )}
        </section>
      )}
    </div>
  );
}

function InlineText({ value, onSave, ariaLabel, placeholder, muted }: {
  value: string; onSave: (v: string) => void; ariaLabel: string; placeholder?: string; muted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal(value); setEditing(true); }} title="Tap to edit" aria-label={ariaLabel}
        className={`min-h-[36px] rounded-lg border border-transparent px-2 py-1 text-left hover:border-ink-700 hover:bg-ink-800 ${
          muted ? "text-xs text-zinc-500" : "text-sm text-zinc-300"}`}>
        {value || placeholder || "—"}
      </button>
    );
  }
  const commit = () => {
    const v = val.trim();
    if (v !== value) onSave(v);
    setEditing(false);
  };
  return (
    <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-36 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100"
      aria-label={ariaLabel} />
  );
}

function InlineDecimal({ value, onSave, ariaLabel }: {
  value: number; onSave: (v: number) => void; ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(value)); setEditing(true); }} title="Tap to edit" aria-label={ariaLabel}
        className="min-h-[36px] rounded-lg border border-transparent px-2 py-1 text-right font-mono text-sm text-zinc-200 hover:border-ink-700 hover:bg-ink-800">
        {value}
      </button>
    );
  }
  const commit = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0 && n !== value) onSave(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1.5 text-right font-mono text-sm text-zinc-100"
      aria-label={ariaLabel} />
  );
}

function AddProteinRow({ onAdd, onCancel, busy }: {
  onAdd: (i: { protein: string; rawUnit: string; cookedYieldLbsPerUnit: number; portionsPerCookedLb: number; notes: string | null }) => void;
  onCancel: () => void; busy: boolean;
}) {
  const [protein, setProtein] = useState("");
  const [rawUnit, setRawUnit] = useState("lb raw");
  const [yieldStr, setYieldStr] = useState("");
  const [portionsStr, setPortionsStr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!protein.trim()) return setFormError("Protein name is required.");
    if (!rawUnit.trim()) return setFormError("Raw unit is required.");
    const y = Number(yieldStr);
    if (!Number.isFinite(y) || y <= 0) return setFormError("Yield must be a positive number.");
    const pp = Number(portionsStr);
    if (!Number.isFinite(pp) || pp <= 0) return setFormError("Portions per cooked lb must be a positive number.");
    onAdd({ protein: protein.trim(), rawUnit: rawUnit.trim(), cookedYieldLbsPerUnit: y, portionsPerCookedLb: pp, notes: null });
  };

  return (
    <form className="mt-3 rounded-xl border border-ink-700 bg-ink-900 p-4"
      onSubmit={e => { e.preventDefault(); submit(); }} aria-label="Add protein">
      <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Add protein</h3>
      {formError && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError}</p>}
      <div className="mt-2 grid gap-3 sm:grid-cols-4">
        <label className="block text-sm font-semibold text-zinc-400">Protein
          <input value={protein} onChange={e => setProtein(e.target.value)} required placeholder="Turkey Breast"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Raw unit
          <input value={rawUnit} onChange={e => setRawUnit(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Yield (lbs/unit)
          <input value={yieldStr} onChange={e => setYieldStr(e.target.value)} inputMode="decimal" placeholder="0.55"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-right font-mono text-zinc-100" />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Portions / lb
          <input value={portionsStr} onChange={e => setPortionsStr(e.target.value)} inputMode="decimal" placeholder="3"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-right font-mono text-zinc-100" />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Adding…" : "Add protein"}
        </button>
      </div>
    </form>
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
