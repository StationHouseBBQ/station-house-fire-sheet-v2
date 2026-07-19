import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { MeatCost } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import { listPortions, upsertPortion, type PortionEcon } from "./_data/pitLocalStore";

/**
 * Pit · Meat Cost Guide — deepened to full plate economics.
 * Beyond raw→yield→cooked cost, each protein now carries an editable portion
 * size, menu price and weekly waste. From those we compute cost per portion,
 * profit per portion, food-cost % / margin %, and weekly waste cost — the
 * numbers managers actually price the menu from. Money is integer cents.
 * Portion economics live in a pit-module-local overlay (the shared MeatCost
 * repo has no portion/price fields).
 */

type Sync = "idle" | "saving" | "saved" | "error";
const OZ_PER_LB = 16;

function uid(): string {
  return `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function cookedCostCents(mc: Pick<MeatCost, "costPerLbCents" | "yieldPct">): number {
  return Math.round(mc.costPerLbCents / (mc.yieldPct / 100));
}

interface Econ {
  cookedCents: number;         // cooked cost per lb
  portionCostCents: number;    // cooked cost of one portion
  menuPriceCents: number;
  profitCents: number;         // menu - portion cost
  foodCostPct: number;         // portion cost / menu * 100
  marginPct: number;           // 100 - foodCostPct
  weeklyWasteCents: number;    // waste lbs * cooked cost/lb
}
function computeEcon(mc: MeatCost, p: PortionEcon | undefined): Econ {
  const cookedCents = cookedCostCents(mc);
  const portionOz = p?.portionOz ?? 5;
  const menuPriceCents = p?.menuPriceCents ?? 0;
  const wasteLbs = p?.wasteLbsPerWeek ?? 0;
  const portionCostCents = Math.round((cookedCents * portionOz) / OZ_PER_LB);
  const profitCents = menuPriceCents - portionCostCents;
  const foodCostPct = menuPriceCents > 0 ? (portionCostCents / menuPriceCents) * 100 : 0;
  return {
    cookedCents, portionCostCents, menuPriceCents, profitCents,
    foodCostPct, marginPct: menuPriceCents > 0 ? 100 - foodCostPct : 0,
    weeklyWasteCents: Math.round(cookedCents * wasteLbs),
  };
}
function foodCostTone(pct: number): string {
  if (pct === 0) return "text-zinc-500";
  if (pct <= 30) return "text-green-400";
  if (pct <= 38) return "text-amber-300";
  return "text-red-400";
}

export function MeatCostGuide() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ cost: MeatCost | null } | null>(null);
  const [portionDialog, setPortionDialog] = useState<{ protein: string; econ: PortionEcon | undefined } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const listQ = useQuery({ queryKey: ["pit", "meatCosts"], queryFn: () => dal.meatCosts.list() });
  const portionsQ = useQuery({ queryKey: ["pit", "portions"], queryFn: () => listPortions() });

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
  const portionMut = useMutation({
    mutationFn: (p: PortionEcon) => withSync(upsertPortion(p)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pit", "portions"] }); setPortionDialog(null); },
  });

  const portionMap = useMemo(() => {
    const m = new Map<string, PortionEcon>();
    for (const p of portionsQ.data ?? []) m.set(p.protein, p);
    return m;
  }, [portionsQ.data]);

  const rows = useMemo(
    () => [...(listQ.data ?? [])].sort((a, b) => a.protein.localeCompare(b.protein)),
    [listQ.data],
  );

  const totals = useMemo(() => {
    let wasteCents = 0, priced = 0, marginSum = 0;
    for (const m of rows) {
      const e = computeEcon(m, portionMap.get(m.protein));
      wasteCents += e.weeklyWasteCents;
      if (e.menuPriceCents > 0) { priced++; marginSum += e.marginPct; }
    }
    return { wasteCents, avgMargin: priced ? marginSum / priced : 0, priced };
  }, [rows, portionMap]);

  if (listQ.isLoading) return <p className="py-20 text-center text-zinc-500">Loading meat costs…</p>;

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Meat Cost Guide</h1>
          <p className="text-sm text-zinc-500">Raw cost · yield · cooked cost · plate economics</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => { upsertMut.reset(); setDialog({ cost: null }); }}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add meat</button>
        </div>
      </header>

      {/* ── Summary stats ─────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Proteins tracked" value={String(rows.length)} />
          <StatCard label="Avg margin (priced)" value={totals.priced ? `${totals.avgMargin.toFixed(0)}%` : "—"}
            tone={totals.priced ? (totals.avgMargin >= 62 ? "ok" : totals.avgMargin >= 55 ? "warn" : "bad") : undefined} />
          <StatCard label="Est. weekly waste cost" value={formatCents(totals.wasteCents)} tone={totals.wasteCents > 0 ? "bad" : undefined} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-8 text-center text-sm text-zinc-500">
          No meats yet — tap "Add meat" to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800 text-left text-xs font-bold uppercase tracking-wide text-zinc-400">
                <th className="px-3 py-3">Protein</th>
                <th className="px-3 py-3 text-right">Raw/lb</th>
                <th className="px-3 py-3 text-right">Yield</th>
                <th className="px-3 py-3 text-right text-fire-light">Cooked/lb</th>
                <th className="px-3 py-3 text-right">Portion</th>
                <th className="px-3 py-3 text-right">Portion cost</th>
                <th className="px-3 py-3 text-right">Menu $</th>
                <th className="px-3 py-3 text-right">Profit</th>
                <th className="px-3 py-3 text-right">Food cost %</th>
                <th className="px-3 py-3 text-right">Waste/wk</th>
                <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => {
                const pe = portionMap.get(m.protein);
                const e = computeEcon(m, pe);
                return (
                  <tr key={m.id} className="border-b border-ink-800 bg-ink-900 last:border-0">
                    <td className="px-3 py-3 font-semibold text-zinc-100">
                      {m.protein}
                      <span className="block text-[11px] font-normal text-zinc-600">{m.vendor || "—"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-300">{formatCents(m.costPerLbCents)}</td>
                    <td className="px-3 py-3 text-right"><span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-bold text-blue-400">{m.yieldPct}%</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right"><span className="rounded bg-fire/15 px-2 py-1 font-bold tabular-nums text-fire-light">{formatCents(e.cookedCents)}</span></td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-400">{pe ? `${pe.portionOz} oz` : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-300">{formatCents(e.portionCostCents)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-300">{e.menuPriceCents > 0 ? formatCents(e.menuPriceCents) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {e.menuPriceCents > 0 ? <span className={e.profitCents >= 0 ? "font-bold text-green-400" : "font-bold text-red-400"}>{formatCents(e.profitCents)}</span> : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums"><span className={`font-bold ${foodCostTone(e.foodCostPct)}`}>{e.menuPriceCents > 0 ? `${e.foodCostPct.toFixed(0)}%` : "—"}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-400">{e.weeklyWasteCents > 0 ? formatCents(e.weeklyWasteCents) : "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setPortionDialog({ protein: m.protein, econ: pe })}
                          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-xs font-semibold text-zinc-300"
                          aria-label={`Edit portion economics for ${m.protein}`}>Portion</button>
                        <button onClick={() => { upsertMut.reset(); setDialog({ cost: m }); }}
                          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-xs font-semibold text-zinc-300"
                          aria-label={`Edit ${m.protein}`}>Cost</button>
                        {confirmRemove === m.id ? (
                          <button onClick={() => removeMut.mutate(m.id)} disabled={removeMut.isPending}
                            className="min-h-[44px] rounded-lg bg-red-700 px-2 py-2 text-xs font-bold text-white disabled:opacity-50"
                            aria-label={`Confirm remove ${m.protein}`}>Confirm?</button>
                        ) : (
                          <button onClick={() => setConfirmRemove(m.id)}
                            className="min-h-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-2 py-2 text-xs font-semibold text-red-400"
                            aria-label={`Remove ${m.protein}`}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-ink-700 bg-ink-900/60 p-4 text-xs text-zinc-500 sm:grid-cols-2">
        <div>
          <p className="font-bold uppercase tracking-wide text-zinc-400">Cooked cost / lb</p>
          <p className="mt-1">Raw cost/lb ÷ (yield % / 100). The true cost of a pound that hits the plate.</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-zinc-400">Plate economics</p>
          <p className="mt-1">Portion cost = cooked cost/lb × portion oz ÷ 16. Food cost % = portion cost ÷ menu price. Target ≤ 30% (green), ≤ 38% (amber).</p>
        </div>
      </div>

      {dialog && (
        <CostDialog key={dialog.cost?.id ?? "new"} cost={dialog.cost}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog(null)} onSubmit={mc => upsertMut.mutate(mc)} />
      )}
      {portionDialog && (
        <PortionDialog key={portionDialog.protein} protein={portionDialog.protein} econ={portionDialog.econ}
          busy={portionMut.isPending} error={portionMut.error?.message ?? null}
          onCancel={() => setPortionDialog(null)} onSubmit={p => portionMut.mutate(p)} />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const cls = tone === "ok" ? "text-green-400" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-400" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${cls}`}>{value}</p>
    </div>
  );
}

function PortionDialog({ protein, econ, busy, error, onSubmit, onCancel }: {
  protein: string; econ: PortionEcon | undefined;
  busy: boolean; error: string | null;
  onSubmit: (p: PortionEcon) => void; onCancel: () => void;
}) {
  const [portionOz, setPortionOz] = useState(econ ? String(econ.portionOz) : "5");
  const [menuDollars, setMenuDollars] = useState(econ ? (econ.menuPriceCents / 100).toFixed(2) : "");
  const [waste, setWaste] = useState(econ ? String(econ.wasteLbsPerWeek) : "0");
  const [err, setErr] = useState<string | null>(null);
  const shown = err ?? error;
  return (
    <div role="dialog" aria-modal="true" aria-label="Portion economics"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          const oz = Number(portionOz), d = Number(menuDollars), w = Number(waste);
          if (!Number.isFinite(oz) || oz <= 0) return setErr("Portion oz must be positive");
          if (menuDollars.trim() !== "" && (!Number.isFinite(d) || d < 0)) return setErr("Menu price must be a non-negative number");
          if (!Number.isFinite(w) || w < 0) return setErr("Waste lbs must be non-negative");
          setErr(null);
          onSubmit({ protein, portionOz: oz, menuPriceCents: menuDollars.trim() === "" ? 0 : Math.round(d * 100), wasteLbsPerWeek: w });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">Plate economics · {protein}</h3>
        {shown && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{shown}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Portion size (oz cooked)
          <input inputMode="decimal" value={portionOz} onChange={e => setPortionOz(e.target.value)} required placeholder="5"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Menu price ($)
          <input inputMode="decimal" value={menuDollars} onChange={e => setMenuDollars(e.target.value)} placeholder="e.g. 16.00"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Typical waste (lbs / week)
          <input inputMode="decimal" value={waste} onChange={e => setWaste(e.target.value)} placeholder="0"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
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
    onSubmit({ id: cost?.id ?? uid(), protein: protein.trim(), vendor: vendor.trim(), costPerLbCents: cents, caseLbs: c, yieldPct: y });
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
