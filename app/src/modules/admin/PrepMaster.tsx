import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PrepCategory, PrepTemplateRow } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Admin · Prep Master — V2 counterpart of Manus AdminPrepMaster (parity row
 * 54). Master PAR template rows that drive the daily prep engine: each
 * morning's Kitchen prep list is generated from the active rows here
 * (Thursday-only rows join on Thursdays).
 */

type Sync = "idle" | "saving" | "saved" | "error";

const CATEGORIES: Array<{ id: PrepCategory; label: string }> = [
  { id: "meats", label: "Meats" },
  { id: "sauces", label: "Sauces" },
  { id: "sides", label: "Sides" },
  { id: "retail_prep", label: "Retail Prep" },
  { id: "misc", label: "Misc" },
  { id: "desserts", label: "Desserts" },
];

export function PrepMaster() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ open: boolean; row: PrepTemplateRow | null }>({ open: false, row: null });

  const { data: rows, isLoading } = useQuery({ queryKey: ["prepTemplates"], queryFn: () => dal.prepTemplates.list() });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["prepTemplates"] });

  const upsertMut = useMutation({
    mutationFn: (t: Parameters<typeof dal.prepTemplates.upsert>[0]) => withSync(dal.prepTemplates.upsert(t, actor)),
    onSuccess: () => { setDialog({ open: false, row: null }); invalidate(); },
  });
  const toggleMut = useMutation({
    mutationFn: (id: string) => withSync(dal.prepTemplates.toggleActive(id, actor)),
    onSuccess: invalidate,
  });

  if (isLoading || !rows) return <p className="py-20 text-center text-zinc-500">Loading prep master…</p>;

  const activeCount = rows.filter(r => r.active).length;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Prep Master</h1>
          <p className="text-sm text-zinc-500">{activeCount}/{rows.length} rows active</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ open: true, row: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add row</button>
        </div>
      </header>

      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        These PAR rows drive the daily prep engine — each morning's Kitchen prep list is generated from active rows here.
        Thursday-only rows are added on Thursdays automatically.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Unit</th>
              <th className="px-3 py-2.5 text-right">PAR</th>
              <th className="px-3 py-2.5">Thursday</th>
              <th className="px-3 py-2.5">Active</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {rows.map(r => (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{r.name}</td>
                <td className="px-3 py-2.5 text-zinc-400">{CATEGORIES.find(c => c.id === r.category)?.label ?? r.category}</td>
                <td className="px-3 py-2.5 text-zinc-400">{r.unit}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{r.parQty}</td>
                <td className="px-3 py-2.5">
                  {r.thursdayOnly && <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-black text-white">THU ONLY</span>}
                </td>
                <td className="px-3 py-2.5">
                  <button role="switch" aria-checked={r.active} aria-label={`${r.name} active`}
                    onClick={() => toggleMut.mutate(r.id)}
                    className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                      r.active ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                    {r.active ? "Active" : "Off"}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => setDialog({ open: true, row: r })}
                    className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No template rows yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {dialog.open && (
        <RowDialog row={dialog.row} busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, row: null })}
          onSubmit={t => upsertMut.mutate(t)} />
      )}
    </div>
  );
}

function RowDialog({ row, onSubmit, onCancel, busy, error }: {
  row: PrepTemplateRow | null;
  onSubmit: (t: { id?: string; name: string; category: PrepCategory; unit: string; parQty: number; thursdayOnly: boolean; active: boolean }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [category, setCategory] = useState<PrepCategory>(row?.category ?? "meats");
  const [unit, setUnit] = useState(row?.unit ?? "pans");
  const [par, setPar] = useState(String(row?.parQty ?? 1));
  const [thursdayOnly, setThursdayOnly] = useState(row?.thursdayOnly ?? false);
  const [active, setActive] = useState(row?.active ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    const p = Number(par);
    if (!Number.isFinite(p) || p < 0) return setFormError("PAR must be a non-negative number.");
    onSubmit({ id: row?.id, name: name.trim(), category, unit: unit.trim() || "each", parQty: p, thursdayOnly, active });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={row ? "Edit template row" : "Add template row"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{row ? "Edit template row" : "Add template row"}</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <select value={category} onChange={e => setCategory(e.target.value as PrepCategory)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <input value={unit} onChange={e => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">PAR
            <input value={par} onChange={e => setPar(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-3 flex gap-6">
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300">
            <input type="checkbox" checked={thursdayOnly} onChange={e => setThursdayOnly(e.target.checked)} className="h-4 w-4" />
            Thursday only
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
            Active
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : row ? "Save changes" : "Add row"}
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
