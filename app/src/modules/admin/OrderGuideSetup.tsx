import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderGuideRow } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Admin · Order Guide Setup — V2 counterpart of Manus OrderGuideSetup
 * (parity row 61). Vendor order guide with inline on-hand entry; order qty is
 * computed (PAR − on hand, floored at 0) and highlighted when > 0.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function OrderGuideSetup() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ open: boolean; row: OrderGuideRow | null }>({ open: false, row: null });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({ queryKey: ["orderGuide"], queryFn: () => dal.orderGuide.rows() });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["orderGuide"] });

  const upsertMut = useMutation({
    mutationFn: (r: Parameters<typeof dal.orderGuide.upsert>[0]) => withSync(dal.orderGuide.upsert(r, actor)),
    onSuccess: () => { setDialog({ open: false, row: null }); invalidate(); },
  });
  const onHandMut = useMutation({
    mutationFn: ({ id, onHand }: { id: string; onHand: number }) => withSync(dal.orderGuide.setOnHand(id, onHand, actor)),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.orderGuide.remove(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });

  if (isLoading || !rows) return <p className="py-20 text-center text-zinc-500">Loading order guide…</p>;

  const linesToOrder = rows.filter(r => r.orderQty > 0).length;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Order Guide Setup</h1>
          <p className="text-sm text-zinc-500">{rows.length} lines · {linesToOrder} need ordering</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ open: true, row: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add line</button>
        </div>
      </header>

      <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
        linesToOrder > 0 ? "border-amber-700/50 bg-amber-950/40 text-amber-400" : "border-green-700/50 bg-green-950/40 text-green-400"}`}>
        {linesToOrder > 0 ? `📋 ${linesToOrder} line${linesToOrder === 1 ? "" : "s"} to order this run` : "✓ Everything is at PAR — nothing to order"}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Item</th>
              <th className="px-3 py-2.5">Vendor</th>
              <th className="px-3 py-2.5">Unit</th>
              <th className="px-3 py-2.5 text-right">PAR</th>
              <th className="px-3 py-2.5 text-right">On hand</th>
              <th className="px-3 py-2.5 text-right">Order</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{r.item}</td>
                <td className="px-3 py-2.5 text-zinc-400">{r.vendor}</td>
                <td className="px-3 py-2.5 text-zinc-400">{r.unit}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{r.parQty}</td>
                <td className="px-3 py-2.5 text-right">
                  <OnHandEditor row={r} onCommit={onHand => onHandMut.mutate({ id: r.id, onHand })} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`inline-block min-w-[2.5rem] rounded-lg px-2 py-1 font-mono text-sm font-black ${
                    r.orderQty > 0 ? "bg-amber-600 text-white" : "text-zinc-600"}`}>
                    {r.orderQty}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setDialog({ open: true, row: r })}
                      className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                      Edit
                    </button>
                    {confirmRemove === r.id ? (
                      <>
                        <button onClick={() => removeMut.mutate(r.id)} disabled={removeMut.isPending}
                          className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                        <button onClick={() => setConfirmRemove(null)}
                          className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmRemove(r.id)}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No lines yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {dialog.open && (
        <RowDialog row={dialog.row} busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, row: null })}
          onSubmit={r => upsertMut.mutate(r)} />
      )}
    </div>
  );
}

function OnHandEditor({ row, onCommit }: { row: OrderGuideRow; onCommit: (onHand: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(row.onHand));
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(row.onHand)); setEditing(true); }}
        className="min-h-[36px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1 font-mono text-sm font-bold text-zinc-200"
        aria-label={`Edit on-hand for ${row.item}`}>
        {row.onHand}
      </button>
    );
  }
  const commit = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) onCommit(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1.5 text-right font-mono text-sm font-bold text-zinc-100"
      aria-label={`On-hand for ${row.item}`} />
  );
}

function RowDialog({ row, onSubmit, onCancel, busy, error }: {
  row: OrderGuideRow | null;
  onSubmit: (r: { id?: string; item: string; vendor: string; unit: string; parQty: number; onHand: number; orderQty: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [item, setItem] = useState(row?.item ?? "");
  const [vendor, setVendor] = useState(row?.vendor ?? "");
  const [unit, setUnit] = useState(row?.unit ?? "cases");
  const [par, setPar] = useState(String(row?.parQty ?? 1));
  const [onHand, setOnHand] = useState(String(row?.onHand ?? 0));
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!item.trim()) return setFormError("Item is required.");
    const p = Number(par), oh = Number(onHand);
    if (!Number.isFinite(p) || p < 0) return setFormError("PAR must be a non-negative number.");
    if (!Number.isFinite(oh) || oh < 0) return setFormError("On hand must be a non-negative number.");
    onSubmit({
      id: row?.id, item: item.trim(), vendor: vendor.trim(), unit: unit.trim() || "each",
      parQty: p, onHand: oh, orderQty: Math.max(0, p - oh), // DAL recomputes orderQty anyway
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={row ? "Edit order guide line" : "Add order guide line"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{row ? "Edit line" : "Add line"}</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Item
            <input value={item} onChange={e => setItem(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Vendor
            <input value={vendor} onChange={e => setVendor(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Unit
            <input value={unit} onChange={e => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">PAR
            <input value={par} onChange={e => setPar(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">On hand
            <input value={onHand} onChange={e => setOnHand(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : row ? "Save changes" : "Add line"}
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
