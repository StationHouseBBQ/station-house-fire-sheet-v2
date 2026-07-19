import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PrepCategory, PrepEntry, PrepStatus, PrepTemplateRow } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Kitchen · Prep — V2 implementation of the Manus DynamicPrepBoard
 * (parity row #6). Full behavior parity targets:
 *  - active session with entries grouped by category
 *  - tap-to-advance status flow (not_started → in_progress → complete → reset)
 *  - quantity edit with fraction display, add-entry form, hide-done filter
 *  - progress stats; auto-save with explicit sync state; input survives refresh
 */

const STATUS_FLOW: Record<PrepStatus, PrepStatus> = {
  not_started: "in_progress",
  in_progress: "complete",
  complete: "not_started",
};

const STATUS_META: Record<PrepStatus, { label: string; cls: string }> = {
  not_started: { label: "Not Started", cls: "bg-ink-700 text-zinc-300" },
  in_progress: { label: "In Progress", cls: "bg-amber-600 text-white" },
  complete: { label: "Done", cls: "bg-green-600 text-white" },
};

const CATEGORY_META: Record<PrepCategory, { icon: string; label: string }> = {
  meats: { icon: "🥩", label: "Meats" },
  sauces: { icon: "🫙", label: "Sauces" },
  sides: { icon: "🥗", label: "Sides" },
  retail_prep: { icon: "🛒", label: "Retail Prep" },
  misc: { icon: "📦", label: "Misc" },
  desserts: { icon: "🍮", label: "Desserts" },
};

const UNITS = ["lbs", "pans", "quarts", "pints", "each", "gallons", "oz", "bags", "containers", "batches", "racks", "loaves", "cases", "cups"];

/** 0.5 → "1/2", 1.5 → "1 1/2" — matches source formatQty behavior. */
export function formatQty(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 8) / 8;
  const map: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.375: "3/8", 0.5: "1/2", 0.625: "5/8", 0.75: "3/4", 0.875: "7/8" };
  const f = map[frac];
  if (!f) return String(whole + (frac === 1 ? 1 : 0)) || "0";
  return whole === 0 ? f : `${whole} ${f}`;
}

type Sync = "idle" | "saving" | "saved" | "error";

export function PrepBoard() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const [hideDone, setHideDone] = useState(false);
  const [sync, setSync] = useState<Sync>("idle");
  const [addOpen, setAddOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<PrepCategory>>(new Set());
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ["prep", "activeSession"],
    queryFn: () => dal.prep.getActiveSession(),
    refetchInterval: 30_000,
  });
  const { data: templates = [] } = useQuery({
    queryKey: ["prepTemplates"],
    queryFn: () => dal.prepTemplates.list(),
    staleTime: 5 * 60_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["prep", "activeSession"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PrepStatus }) =>
      withSync(dal.prep.updateEntryStatus(id, status, actor)),
    onSuccess: invalidate,
  });
  const qtyMut = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => withSync(dal.prep.updateEntryQty(id, qty, actor)),
    onSuccess: invalidate,
  });
  const addMut = useMutation({
    mutationFn: (input: { name: string; category: PrepCategory; unit: string; parQty: number }) =>
      withSync(dal.prep.addEntry(input, actor)),
    onSuccess: () => { invalidate(); setAddOpen(false); },
  });
  const bulkCompleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await dal.prep.updateEntryStatus(id, "complete", actor);
    },
    onSuccess: invalidate,
  });

  const toggleCategory = (cat: PrepCategory) =>
    setCollapsed(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  const entries = session?.entries ?? [];
  const visible = hideDone ? entries.filter(e => e.status !== "complete") : entries;
  const grouped = useMemo(() => {
    const g: Partial<Record<PrepCategory, PrepEntry[]>> = {};
    for (const e of visible) (g[e.category] ??= []).push(e);
    return g;
  }, [visible]);

  const stats = {
    total: entries.length,
    done: entries.filter(e => e.status === "complete").length,
    inProgress: entries.filter(e => e.status === "in_progress").length,
  };
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading prep list…</p>;
  if (!session) {
    return (
      <div className="py-20 text-center">
        <p className="text-base font-semibold text-zinc-300">No prep list generated yet</p>
        <p className="mt-1 text-sm text-zinc-500">Waiting for admin to generate today's prep list</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Prep · {session.serviceDate}</h1>
          <p className="text-sm text-zinc-500">{stats.done}/{stats.total} done · {stats.inProgress} in progress</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setTemplatesOpen(true)}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">
            📋 Templates
          </button>
          <button onClick={() => setHideDone(h => !h)}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">
            {hideDone ? "Show done" : "Hide done"}
          </button>
          <button onClick={() => setAddOpen(true)}
            className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      </header>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-gradient-to-r from-fire to-fire-light transition-all" style={{ width: `${pct}%` }} />
      </div>

      {(Object.keys(grouped) as PrepCategory[]).map(cat => {
        const items = grouped[cat]!;
        const secDone = items.filter(e => e.status === "complete").length;
        const isCollapsed = collapsed.has(cat);
        const pendingIds = items.filter(e => e.status !== "complete").map(e => e.id);
        return (
        <section key={cat} className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => toggleCategory(cat)} className="flex items-center gap-2 text-left" aria-expanded={!isCollapsed}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
              </h2>
              <span className="text-xs text-zinc-600">{secDone}/{items.length} · {isCollapsed ? "▾" : "▴"}</span>
            </button>
            {pendingIds.length > 0 && (
              <button onClick={() => bulkCompleteMut.mutate(pendingIds)} disabled={bulkCompleteMut.isPending}
                className="rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs font-bold text-zinc-300 disabled:opacity-50">
                ✓ Complete all
              </button>
            )}
          </div>
          {!isCollapsed && (
          <ul className="mt-2 space-y-2">
            {items.map(e => {
              const need = e.onHandQty != null ? Math.max(0, e.parQty - e.onHandQty) : null;
              return (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
                <button
                  onClick={() => statusMut.mutate({ id: e.id, status: STATUS_FLOW[e.status] })}
                  className={`min-w-[7.5rem] rounded-lg px-3 py-2 text-xs font-bold uppercase ${STATUS_META[e.status].cls}`}
                  aria-label={`${e.name}: ${STATUS_META[e.status].label}. Tap to advance.`}>
                  {STATUS_META[e.status].label}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${e.status === "complete" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{e.name}</p>
                  <p className="text-xs text-zinc-500">
                    PAR {formatQty(e.parQty)} {e.unit}
                    {e.onHandQty != null && <> · on hand {formatQty(e.onHandQty)}</>}
                    {need != null && need > 0 && <span className="text-amber-400"> · need {formatQty(need)}</span>}
                  </p>
                  {e.notes && <p className="truncate text-xs text-zinc-600">📝 {e.notes}</p>}
                </div>
                <QtyEditor entry={e} onChange={qty => qtyMut.mutate({ id: e.id, qty })} />
              </li>
              );
            })}
          </ul>
          )}
        </section>
        );
      })}

      {addOpen && <AddEntryForm busy={addMut.isPending} error={addMut.error?.message ?? null}
        onCancel={() => setAddOpen(false)}
        onSubmit={i => addMut.mutate(i)} />}

      {templatesOpen && <TemplatesPanel templates={templates} onClose={() => setTemplatesOpen(false)}
        onAdd={(t) => addMut.mutate({ name: t.name, category: t.category, unit: t.unit, parQty: t.parQty })} />}
    </div>
  );
}

function TemplatesPanel({ templates, onClose, onAdd }: {
  templates: PrepTemplateRow[]; onClose: () => void; onAdd: (t: PrepTemplateRow) => void;
}) {
  const active = templates.filter(t => t.active);
  const grouped: Partial<Record<PrepCategory, PrepTemplateRow[]>> = {};
  for (const t of active) (grouped[t.category] ??= []).push(t);
  return (
    <div role="dialog" aria-modal="true" aria-label="Prep templates"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">📋 Prep templates</h3>
            <p className="text-xs text-zinc-500">{active.length} active PAR items · tap ＋ to add to today's list</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 text-zinc-400">✕</button>
        </div>
        {active.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-600">No active templates configured</p>
        ) : (
          (Object.keys(grouped) as PrepCategory[]).map(cat => (
            <section key={cat} className="mt-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-fire-light">{CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}</h4>
              <ul className="mt-1.5 divide-y divide-ink-800">
                {grouped[cat]!.map(t => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-200">{t.name}{t.thursdayOnly && <span className="ml-1 text-[10px] font-bold uppercase text-green-400">Thu</span>}</p>
                      <p className="text-xs text-zinc-500">PAR {formatQty(t.parQty)} {t.unit}</p>
                    </div>
                    <button onClick={() => onAdd(t)} aria-label={`Add ${t.name}`}
                      className="min-h-[40px] shrink-0 rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-sm font-bold text-zinc-200 hover:text-white">＋</button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
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

function QtyEditor({ entry, onChange }: { entry: PrepEntry; onChange: (qty: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(entry.prepQty));
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(entry.prepQty)); setEditing(true); }}
        className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200"
        aria-label={`Edit quantity for ${entry.name}`}>
        {formatQty(entry.prepQty)} <span className="text-xs font-normal text-zinc-500">{entry.unit}</span>
      </button>
    );
  }
  const commit = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) onChange(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded-lg border border-fire/50 bg-ink-800 px-2 py-2 text-center text-sm font-bold text-zinc-100"
      aria-label={`Quantity for ${entry.name}`} />
  );
}

function AddEntryForm({ onSubmit, onCancel, busy, error }: {
  onSubmit: (i: { name: string; category: PrepCategory; unit: string; parQty: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PrepCategory>("sides");
  const [unit, setUnit] = useState("lbs");
  const [par, setPar] = useState("1");
  return (
    <div role="dialog" aria-modal="true" aria-label="Add prep item"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ name, category, unit, parQty: Number(par) || 0 }); }}>
        <h3 className="text-lg font-bold text-zinc-100">Add prep item</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <select value={category} onChange={e => setCategory(e.target.value as PrepCategory)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {(Object.keys(CATEGORY_META) as PrepCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <select value={unit} onChange={e => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">PAR
            <input value={par} onChange={e => setPar(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add to prep list"}
          </button>
        </div>
      </form>
    </div>
  );
}
