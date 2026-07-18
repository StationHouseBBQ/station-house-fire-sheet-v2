import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { SmokeBatch } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";

/**
 * Pit · Smoked Inventory — V2 of the Manus SmokedInventory page.
 * Summary cards per protein (cooked lbs on hand / batches / last batch),
 * batch history table, and a Log Smoke Batch dialog with yield preview
 * and client + DAL validation (cooked ≤ raw, positive weights).
 */

function todayEt(): string {
  const p = etParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

const SMOKERS = ["Ol' Smokey (offset)", "Rotisserie 1", "Cabinet 2"];

type Sync = "idle" | "saving" | "saved" | "error";

export function SmokedInventoryView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [logOpen, setLogOpen] = useState(false);

  const summaryQ = useQuery({
    queryKey: ["pit", "smokedInventory", "summary"],
    queryFn: () => dal.smokedInventory.summary(),
    refetchInterval: 30_000,
  });
  const batchesQ = useQuery({
    queryKey: ["pit", "smokedInventory", "batches"],
    queryFn: () => dal.smokedInventory.batches(),
  });

  const logMut = useMutation({
    mutationFn: (b: Omit<SmokeBatch, "id" | "loggedAt">) => {
      setSync("saving");
      return dal.smokedInventory.logBatch(b).then(
        r => { setSync("saved"); return r; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pit", "smokedInventory"] });
      setLogOpen(false);
    },
  });

  const summary = summaryQ.data ?? [];
  const batches = batchesQ.data ?? [];
  const totalOnHand = summary.reduce((s, p) => s + p.cookedLbsOnHand, 0);

  if (summaryQ.isLoading) return <p className="py-20 text-center text-zinc-500">Loading smoked inventory…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Smoked Inventory</h1>
          <p className="text-sm text-zinc-500">{Math.round(totalOnHand)} lbs cooked on hand · {todayEt()}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => { logMut.reset(); setLogOpen(true); }}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">
            + Log Smoke Batch
          </button>
        </div>
      </header>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      {summary.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-8 text-center text-sm text-zinc-500">
          No batches logged yet — tap "Log Smoke Batch" to record your first smoke.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map(p => (
            <div key={p.protein} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <p className="truncate text-sm font-bold text-zinc-300">{p.protein}</p>
              <p className="mt-1 text-3xl font-black text-zinc-100">
                {Math.round(p.cookedLbsOnHand)} <span className="text-base font-semibold text-zinc-500">lbs cooked</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {p.batches} {p.batches === 1 ? "batch" : "batches"}
                {p.lastBatchAt && <> · last {new Date(p.lastBatchAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Batch history ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Batch history</h2>
        <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800 text-left text-xs font-bold uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Protein</th>
                <th className="px-4 py-3 text-right">Raw → Cooked</th>
                <th className="px-4 py-3 text-right">Yield</th>
                <th className="px-4 py-3">Smoker</th>
                <th className="px-4 py-3">Logged by</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-500">No batches yet</td></tr>
              )}
              {batches.map(b => (
                <tr key={b.id} className="border-b border-ink-800 bg-ink-900 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-300">{b.date}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-100">{b.protein}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-zinc-300">{b.rawLbs} → {b.cookedLbs} lbs</td>
                  <td className="px-4 py-3 text-right">
                    <span className="rounded bg-fire/15 px-2 py-0.5 text-xs font-bold text-fire-light">
                      {b.rawLbs > 0 ? ((b.cookedLbs / b.rawLbs) * 100).toFixed(1) : "—"}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{b.smoker}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{b.loggedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {logOpen && (
        <LogBatchDialog
          proteins={summary.map(p => p.protein)}
          busy={logMut.isPending}
          dalError={logMut.error?.message ?? null}
          onCancel={() => setLogOpen(false)}
          onSubmit={b => logMut.mutate({ ...b, loggedBy: actor })}
        />
      )}
    </div>
  );
}

function LogBatchDialog({ proteins, busy, dalError, onSubmit, onCancel }: {
  proteins: string[];
  busy: boolean;
  dalError: string | null;
  onSubmit: (b: { date: string; protein: string; rawLbs: number; cookedLbs: number; smoker: string }) => void;
  onCancel: () => void;
}) {
  const [protein, setProtein] = useState(proteins[0] ?? "");
  const [date, setDate] = useState(todayEt());
  const [rawLbs, setRawLbs] = useState("");
  const [cookedLbs, setCookedLbs] = useState("");
  const [smoker, setSmoker] = useState(SMOKERS[0]);
  const [clientError, setClientError] = useState<string | null>(null);

  const yieldPreview = useMemo(() => {
    const r = Number(rawLbs), c = Number(cookedLbs);
    return r > 0 && c > 0 ? ((c / r) * 100).toFixed(1) : null;
  }, [rawLbs, cookedLbs]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = Number(rawLbs), c = Number(cookedLbs);
    if (!protein.trim()) return setClientError("Protein is required");
    if (!date) return setClientError("Date is required");
    if (!Number.isFinite(r) || r <= 0) return setClientError("Raw lbs must be a positive number");
    if (!Number.isFinite(c) || c <= 0) return setClientError("Cooked lbs must be a positive number");
    if (c > r) return setClientError("Cooked lbs cannot exceed raw lbs");
    if (!smoker.trim()) return setClientError("Smoker is required");
    setClientError(null);
    onSubmit({ date, protein: protein.trim(), rawLbs: r, cookedLbs: c, smoker: smoker.trim() });
  };

  const error = clientError ?? dalError;

  return (
    <div role="dialog" aria-modal="true" aria-label="Log smoke batch"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">Log Smoke Batch</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Protein
          <input list="smoked-proteins" value={protein} onChange={e => setProtein(e.target.value)} required
            placeholder="e.g. Pork Butt"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          <datalist id="smoked-proteins">
            {proteins.map(p => <option key={p} value={p} />)}
          </datalist>
        </label>

        <label className="mt-3 block text-sm font-semibold text-zinc-400">Smoke date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Raw lbs in
            <input inputMode="decimal" value={rawLbs} onChange={e => setRawLbs(e.target.value)} placeholder="e.g. 100" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Cooked lbs out
            <input inputMode="decimal" value={cookedLbs} onChange={e => setCookedLbs(e.target.value)} placeholder="e.g. 65" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>

        {yieldPreview && (
          <p className="mt-3 rounded-lg bg-ink-800 px-3 py-2 text-sm text-zinc-400">
            Yield: <span className="font-bold text-fire-light">{yieldPreview}%</span>
          </p>
        )}

        <label className="mt-3 block text-sm font-semibold text-zinc-400">Smoker
          <input list="smoked-smokers" value={smoker} onChange={e => setSmoker(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          <datalist id="smoked-smokers">
            {SMOKERS.map(s => <option key={s} value={s} />)}
          </datalist>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Logging…" : "Log Batch"}
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
