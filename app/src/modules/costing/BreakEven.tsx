import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import {
  BREAKEVEN_SEED,
  COSTING_BREAKEVEN_KEY,
  type BreakEvenFixedCost,
  type BreakEvenModel,
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
 * Costing · Break-Even Calculator.
 *
 * Editable monthly fixed costs + a variable-cost % (food + variable labor +
 * card fees, as a share of each sales dollar) + an average guest ticket →
 * break-even revenue and covers/day.
 *
 * Contribution margin ratio = 1 − variableCostPct. Break-even revenue =
 * fixed ÷ CM ratio. Covers = revenue ÷ average ticket. A sensitivity table
 * flexes the average ticket ±20% to show how covers/day move. Persists the
 * whole model under "costing.breakeven"; money is integer cents.
 */

interface BreakEvenResult {
  fixedCents: number;
  cmRatio: number;          // 0..1 contribution margin ratio
  breakEvenRevenueCents: number;  // monthly
  breakEvenCoversMonth: number;
  breakEvenCoversDay: number;
}

function compute(model: BreakEvenModel): BreakEvenResult {
  const fixedCents = model.fixedCosts.reduce((s, c) => s + c.amountCents, 0);
  const cmRatio = Math.max(0, 1 - model.variableCostPct / 100);
  const breakEvenRevenueCents = cmRatio > 0 ? Math.round(fixedCents / cmRatio) : 0;
  const contributionPerCover = model.averageTicketCents * cmRatio;
  const breakEvenCoversMonth = contributionPerCover > 0 ? Math.ceil(fixedCents / contributionPerCover) : 0;
  const days = Math.max(1, model.operatingDaysPerMonth);
  return {
    fixedCents,
    cmRatio,
    breakEvenRevenueCents,
    breakEvenCoversMonth,
    breakEvenCoversDay: Math.ceil(breakEvenCoversMonth / days),
  };
}

export function BreakEven() {
  const dal = getDal();
  const { actor } = useRole();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data: model, isLoading } = useQuery({
    queryKey: ["settings", COSTING_BREAKEVEN_KEY],
    queryFn: () => dal.settings.get<BreakEvenModel>(COSTING_BREAKEVEN_KEY, BREAKEVEN_SEED),
  });

  const save = useMutation({
    mutationFn: (next: BreakEvenModel) => {
      setSync("saving");
      return dal.settings.set(COSTING_BREAKEVEN_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", COSTING_BREAKEVEN_KEY] }),
  });

  const m = model ?? BREAKEVEN_SEED;
  const result = useMemo(() => compute(m), [m]);

  const patch = (next: Partial<BreakEvenModel>) => save.mutate({ ...m, ...next });
  const setFixed = (id: string, fields: Partial<BreakEvenFixedCost>) =>
    patch({ fixedCosts: m.fixedCosts.map(c => (c.id === id ? { ...c, ...fields } : c)) });
  const addFixed = () =>
    patch({ fixedCosts: [...m.fixedCosts, { id: uid("fc"), label: "New fixed cost", amountCents: 0 }] });
  const removeFixed = (id: string) => patch({ fixedCosts: m.fixedCosts.filter(c => c.id !== id) });

  const sensitivity = useMemo(() => {
    const deltas = [-0.2, -0.1, 0, 0.1, 0.2];
    return deltas.map(d => {
      const ticket = Math.round(m.averageTicketCents * (1 + d));
      const r = compute({ ...m, averageTicketCents: ticket });
      return { d, ticket, coversDay: r.breakEvenCoversDay, revenue: r.breakEvenRevenueCents };
    });
  }, [m]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading break-even model…</p>;

  const numInput = (value: number, onChange: (n: number) => void, ariaLabel: string, suffix?: string) => (
    <label className="flex items-center gap-1 text-sm text-zinc-400">
      <input inputMode="numeric" defaultValue={String(value)} key={value}
        onBlur={e => { const n = Number.parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        aria-label={ariaLabel}
        className="min-h-[44px] w-24 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
      {suffix && <span className="text-zinc-500">{suffix}</span>}
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Break-Even Calculator</h1>
          <p className="text-sm text-zinc-500">Fixed costs ÷ contribution margin → break-even revenue & covers/day</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Headline results */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Break-even revenue / mo" value={formatCents(result.breakEvenRevenueCents)} />
        <Kpi label="Covers / day to break even" value={String(result.breakEvenCoversDay)} tone="warn" />
        <Kpi label="Contribution margin" value={`${(result.cmRatio * 100).toFixed(0)}%`}
          tone={result.cmRatio >= 0.6 ? "ok" : result.cmRatio >= 0.5 ? "warn" : "bad"} />
      </div>

      {/* Fixed costs */}
      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Monthly fixed costs</p>
          <button onClick={addFixed}
            className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">+ Add</button>
        </div>
        <div className="mt-3 space-y-2">
          {m.fixedCosts.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <input defaultValue={c.label} key={`l-${c.id}`}
                onBlur={e => setFixed(c.id, { label: e.target.value.trim() || c.label })}
                aria-label="Fixed cost label"
                className="min-h-[44px] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm text-zinc-100 outline-none focus:border-fire" />
              <span className="text-zinc-500">$</span>
              <input inputMode="decimal" defaultValue={centsToInput(c.amountCents)} key={`a-${c.id}`}
                onBlur={e => setFixed(c.id, { amountCents: dollarsToCents(e.target.value) })}
                aria-label="Fixed cost amount"
                className="min-h-[44px] w-32 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
              <button onClick={() => removeFixed(c.id)} aria-label={`Remove ${c.label}`}
                className="min-h-[40px] min-w-[40px] rounded-lg border border-ink-700 bg-ink-800 px-2 text-zinc-600 hover:text-red-400">✕</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-ink-800 pt-3 text-sm">
          <span className="font-semibold text-zinc-300">Total fixed / month</span>
          <span className="font-black text-zinc-100">{formatCents(result.fixedCents)}</span>
        </div>
      </section>

      {/* Assumptions */}
      <section className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Variable cost %</p>
          <p className="mb-2 text-[11px] text-zinc-600">Food + variable labor + card fees, per sales $</p>
          {numInput(m.variableCostPct, n => patch({ variableCostPct: Math.max(0, Math.min(99, n)) }), "Variable cost percent", "%")}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Average ticket</p>
          <p className="mb-2 text-[11px] text-zinc-600">Per guest check</p>
          <label className="flex items-center gap-1 text-sm text-zinc-400">$
            <input inputMode="decimal" defaultValue={centsToInput(m.averageTicketCents)} key={m.averageTicketCents}
              onBlur={e => patch({ averageTicketCents: dollarsToCents(e.target.value) })}
              aria-label="Average ticket dollars"
              className="min-h-[44px] w-24 rounded-lg border border-ink-700 bg-ink-800 px-3 text-right text-sm text-zinc-100 outline-none focus:border-fire" />
          </label>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Operating days / mo</p>
          <p className="mb-2 text-[11px] text-zinc-600">For covers/day</p>
          {numInput(m.operatingDaysPerMonth, n => patch({ operatingDaysPerMonth: Math.max(1, Math.min(31, Math.round(n))) }), "Operating days per month", "days")}
        </div>
      </section>

      {/* Sensitivity table */}
      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Sensitivity — average ticket ±20%</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-xs text-zinc-500">
                <th className="px-3 py-2 text-left">Avg ticket</th>
                <th className="px-3 py-2 text-right">Break-even revenue / mo</th>
                <th className="px-3 py-2 text-right">Covers / day</th>
              </tr>
            </thead>
            <tbody>
              {sensitivity.map(row => (
                <tr key={row.d} className={`border-b border-ink-800/60 ${row.d === 0 ? "bg-ink-800/40" : ""}`}>
                  <td className="px-3 py-2 text-zinc-200">
                    {formatCents(row.ticket)}
                    {row.d !== 0 && <span className="ml-1 text-xs text-zinc-500">({row.d > 0 ? "+" : ""}{(row.d * 100).toFixed(0)}%)</span>}
                    {row.d === 0 && <span className="ml-1 text-xs text-fire">(current)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{formatCents(row.revenue)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-zinc-100">{row.coversDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.cmRatio <= 0 && (
          <p className="mt-3 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
            Variable cost % is at or above 100% — there is no contribution margin, so the business cannot break even at any volume.
          </p>
        )}
      </section>
    </div>
  );
}
