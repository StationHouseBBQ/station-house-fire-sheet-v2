import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { MeatCost } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Pit · Meat Cost Guide — V2 of the Manus PitMeatCostGuide page.
 * Cost table with the computed effective COOKED cost/lb as the key number
 * (raw cost ÷ yield). Money is integer cents everywhere; the dialog takes
 * dollars and converts with rounding, rejecting negatives and NaN.
 */

type Sync = "idle" | "saving" | "saved" | "error";

function uid(): string {
  return `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Effective cooked cost per lb in integer cents. */
function cookedCostCents(mc: Pick<MeatCost, "costPerLbCents" | "yieldPct">): number {
  return Math.round(mc.costPerLbCents / (mc.yieldPct / 100));
}

export function MeatCostGuide() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ cost: MeatCost | null } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["pit", "meatCosts"],
    queryFn: () => dal.meatCosts.list(),
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pit", "meatCosts"] });

  const upsertMut = useMutation({
    mutationFn: (mc: Omit<MeatCost, "updatedAt">) => withSync(dal.meatCosts.upsert(mc, actor)),
    onSuccess: () => { invalidate(); setDialog(null); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.meatCosts.remove(id, actor)),
    onSuccess: () => { invalidate(); setConfirmRemove(null); },
  });

  const rows = useMemo(
    () => [...(listQ.data ?? [])].sort((a, b) => a.protein.localeCompare(b.protein)),
    [listQ.data],
  );

  if (listQ.isLoading) return <p className="py-20 text-center text-zinc-500">Loading meat costs…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Meat Cost Guide</h1>
          <p className="text-sm text-zinc-500">Raw purchase price · yield % · effective cooked cost per lb</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => { upsertMut.reset(); setDialog({ cost: null }); }}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">
            + Add meat
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-8 text-center text-sm text-zinc-500">
          No meats yet — tap "Add meat" to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800 text-left text-xs font-bold uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3">Protein</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Raw cost/lb</th>
                <th className="px-4 py-3 text-right">Case lbs</th>
                <th className="px-4 py-3 text-right">Yield %</th>
                <th className="px-4 py-3 text-right text-fire-light">🔥 Cooked cost/lb</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} className="border-b border-ink-800 bg-ink-900 last:border-0">
                  <td className="px-4 py-3 font-semibold text-zinc-100">{m.protein}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{m.vendor || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-300">{formatCents(m.costPerLbCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{m.caseLbs}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-bold text-blue-400">{m.yieldPct}%</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className="rounded bg-fire/15 px-2 py-1 font-bold tabular-nums text-fire-light">
                      {formatCents(cookedCostCents(m))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{m.updatedAt.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { upsertMut.reset(); setDialog({ cost: m }); }}
                        className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300"
                        aria-label={`Edit ${m.protein}`}>
                        Edit
                      </button>
                      {confirmRemove === m.id ? (
                        <button
                          onClick={() => removeMut.mutate(m.id)}
                          disabled={removeMut.isPending}
                          className="min-h-[44px] rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          aria-label={`Confirm remove ${m.protein}`}>
                          Confirm?
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(m.id)}
                          className="min-h-[44px] min-w-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-3 py-2 text-xs font-semibold text-red-400"
                          aria-label={`Remove ${m.protein}`}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-ink-700 bg-ink-900/60 p-4 text-xs text-zinc-500">
        <p className="font-bold uppercase tracking-wide text-zinc-400">How the key number is calculated</p>
        <p className="mt-1">
          <span className="font-semibold text-fire-light">Cooked cost/lb</span> = raw cost/lb ÷ (yield % / 100).
          Use it for menu pricing and food-cost math — it is the true cost of a pound that hits the plate.
        </p>
      </div>

      {dialog && (
        <CostDialog
          key={dialog.cost?.id ?? "new"}
          cost={dialog.cost}
          busy={upsertMut.isPending}
          error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog(null)}
          onSubmit={mc => upsertMut.mutate(mc)}
        />
      )}
    </div>
  );
}

function CostDialog({ cost, busy, error, onSubmit, onCancel }: {
  cost: MeatCost | null;
  busy: boolean;
  error: string | null;
  onSubmit: (mc: Omit<MeatCost, "updatedAt">) => void;
  onCancel: () => void;
}) {
  const [protein, setProtein] = useState(cost?.protein ?? "");
  const [vendor, setVendor] = useState(cost?.vendor ?? "");
  const [dollars, setDollars] = useState(cost ? (cost.costPerLbCents / 100).toFixed(2) : "");
  const [caseLbs, setCaseLbs] = useState(cost ? String(cost.caseLbs) : "");
  const [yieldPct, setYieldPct] = useState(cost ? String(cost.yieldPct) : "");
  const [clientError, setClientError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const d = Number(dollars), y = Number(yieldPct);
    if (!Number.isFinite(d) || d < 0 || !Number.isFinite(y) || y < 1 || y > 100) return null;
    const cents = Math.round(d * 100);
    return formatCents(Math.round(cents / (y / 100)));
  }, [dollars, yieldPct]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!protein.trim()) return setClientError("Protein is required");
    const d = Number(dollars);
    if (dollars.trim() === "" || Number.isNaN(d)) return setClientError("Cost per lb must be a number in dollars");
    if (d < 0) return setClientError("Cost per lb cannot be negative");
    const cents = Math.round(d * 100);
    const c = Number(caseLbs);
    if (!Number.isFinite(c) || c <= 0) return setClientError("Case lbs must be a positive number");
    const y = Number(yieldPct);
    if (!Number.isFinite(y) || y < 1 || y > 100) return setClientError("Yield % must be between 1 and 100");
    setClientError(null);
    onSubmit({
      id: cost?.id ?? uid(),
      protein: protein.trim(),
      vendor: vendor.trim(),
      costPerLbCents: cents,
      caseLbs: c,
      yieldPct: y,
    });
  };

  const shown = clientError ?? error;

  return (
    <div role="dialog" aria-modal="true" aria-label={cost ? "Edit meat cost" : "Add meat cost"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">{cost ? "Edit meat" : "Add meat"}</h3>
        {shown && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{shown}</p>}

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Protein
          <input value={protein} onChange={e => setProtein(e.target.value)} required placeholder="e.g. Brisket (whole packer)"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>

        <label className="mt-3 block text-sm font-semibold text-zinc-400">Vendor
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Cheney Brothers"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Cost/lb ($)
            <input inputMode="decimal" value={dollars} onChange={e => setDollars(e.target.value)} required placeholder="4.29"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Case lbs
            <input inputMode="decimal" value={caseLbs} onChange={e => setCaseLbs(e.target.value)} required placeholder="60"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Yield %
            <input inputMode="decimal" value={yieldPct} onChange={e => setYieldPct(e.target.value)} required placeholder="50"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>

        {preview && (
          <p className="mt-3 rounded-lg border border-fire/30 bg-fire/10 px-3 py-2 text-sm text-fire-light">
            🔥 Effective cooked cost: <span className="font-bold">{preview}/lb</span>
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : cost ? "Save changes" : "Add meat"}
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
