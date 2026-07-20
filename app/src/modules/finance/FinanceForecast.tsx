import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import type { CateringOrder } from "../../dal/types";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import { balanceCents, isOpenQuote, monthKey, monthLabel } from "./_data/util";
import { DEFAULT_FORECAST, FINANCE_FORECAST_KEY, type ForecastAssumptions } from "./_data/forecast";

/**
 * Finance · Forecast — projected revenue by month ahead. Booked/upcoming
 * catering orders contribute their outstanding balance (money still to be
 * collected) in their event month; outstanding quotes contribute their value
 * weighted by an editable close rate; a baseline covers non-catering revenue.
 * Assumptions persist through dal.settings under FINANCE_FORECAST_KEY. Source:
 * Manus pages/FinanceForecast.tsx.
 */

const BOOKED_STAGES: CateringOrder["stage"][] = ["accepted", "invoiced", "paid", "in_kitchen", "ready"];

export function FinanceForecast() {
  const dal = getDal();
  const qc = useQueryClient();
  const { actor } = useRole();
  const now = currentTime();
  const [draft, setDraft] = useState<ForecastAssumptions | null>(null);
  const [sync, setSync] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });
  const { data: assumptions } = useQuery({
    queryKey: ["settings", FINANCE_FORECAST_KEY],
    queryFn: () => dal.settings.get<ForecastAssumptions>(FINANCE_FORECAST_KEY, DEFAULT_FORECAST),
  });

  useEffect(() => { if (assumptions && !draft) setDraft(assumptions); }, [assumptions, draft]);

  const saveMut = useMutation({
    mutationFn: (v: ForecastAssumptions) => {
      setSync("saving");
      return dal.settings.set(FINANCE_FORECAST_KEY, v, actor).then(
        () => setSync("saved"),
        (e: unknown) => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", FINANCE_FORECAST_KEY] }),
  });

  const commit = (patch: Partial<ForecastAssumptions>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    saveMut.mutate(next);
  };

  const projection = useMemo(() => {
    if (!draft) return { months: [] as Array<{ key: string; label: string; bookedCents: number; quoteWeightedCents: number; baselineCents: number; totalCents: number }>, max: 0, total: 0 };

    // Forward month keys from the current month.
    const keys: string[] = [];
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (let i = 0; i < Math.max(1, draft.horizonMonths); i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
      keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    const keySet = new Set(keys);

    const booked = new Map<string, number>();
    const quoteWeighted = new Map<string, number>();
    for (const o of orders) {
      const mk = monthKey(o.event.eventDate);
      if (!mk || !keySet.has(mk)) continue;
      if (BOOKED_STAGES.includes(o.stage)) {
        // Money still to be collected on already-booked events.
        booked.set(mk, (booked.get(mk) ?? 0) + balanceCents(o));
      } else if (isOpenQuote(o)) {
        const weighted = Math.round(o.totalCents * (draft.quoteCloseRatePct / 100));
        quoteWeighted.set(mk, (quoteWeighted.get(mk) ?? 0) + weighted);
      }
    }

    const months = keys.map(key => {
      const bookedCents = booked.get(key) ?? 0;
      const quoteWeightedCents = quoteWeighted.get(key) ?? 0;
      const baselineCents = draft.baselineMonthlyCents;
      return { key, label: monthLabel(key), bookedCents, quoteWeightedCents, baselineCents, totalCents: bookedCents + quoteWeightedCents + baselineCents };
    });
    const max = months.reduce((m, r) => Math.max(m, r.totalCents), 0);
    const total = months.reduce((s, r) => s + r.totalCents, 0);
    return { months, max, total };
  }, [draft, orders, now]);

  if (isLoading || !draft) return <p className="py-20 text-center text-zinc-500">Loading forecast…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Forecast</h1>
          <p className="text-sm text-zinc-500">Projected revenue by month from booked events, weighted quotes &amp; baseline.</p>
        </div>
        <span className={`text-xs font-bold ${sync === "error" ? "text-red-400" : sync === "saving" ? "text-amber-400" : sync === "saved" ? "text-green-400" : "text-zinc-600"}`}>
          {sync === "saving" ? "Saving…" : sync === "saved" ? "Saved" : sync === "error" ? "Save failed" : ""}
        </span>
      </header>

      <section className="mt-4 grid gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Quote close rate</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="range" min={0} max={100} step={5} value={draft.quoteCloseRatePct}
              onChange={e => commit({ quoteCloseRatePct: Number(e.target.value) })}
              className="flex-1 accent-fire" />
            <span className="w-12 text-right text-sm font-mono font-bold text-fire-light">{draft.quoteCloseRatePct}%</span>
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Baseline / month</span>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-zinc-600">$</span>
            <input type="number" min={0} step={100} value={(draft.baselineMonthlyCents / 100).toFixed(0)}
              onChange={e => commit({ baselineMonthlyCents: Math.max(0, Math.round(Number(e.target.value) * 100)) })}
              className="min-h-[40px] w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-right text-sm font-mono text-zinc-100 focus:border-fire focus:outline-none" />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Horizon (months)</span>
          <input type="number" min={1} max={12} step={1} value={draft.horizonMonths}
            onChange={e => commit({ horizonMonths: Math.min(12, Math.max(1, Math.round(Number(e.target.value)))) })}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-right text-sm font-mono text-zinc-100 focus:border-fire focus:outline-none" />
        </label>
      </section>

      <div className="mt-4 rounded-2xl border border-fire/40 bg-fire/10 p-4">
        <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Projected revenue ({draft.horizonMonths} mo)</div>
        <div className="mt-1 text-2xl font-black text-fire-light">{formatCents(projection.total)}</div>
      </div>

      <section className="mt-4 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" />Booked</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-600" />Weighted quotes</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-700" />Baseline</span>
        </div>
        <ul className="mt-3 space-y-3">
          {projection.months.map(m => (
            <li key={m.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{m.label}</span>
                <span className="font-bold text-zinc-200">{formatCents(m.totalCents)}</span>
              </div>
              <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full bg-green-600" style={{ width: `${projection.max > 0 ? (m.bookedCents / projection.max) * 100 : 0}%` }} />
                <div className="h-full bg-amber-600" style={{ width: `${projection.max > 0 ? (m.quoteWeightedCents / projection.max) * 100 : 0}%` }} />
                <div className="h-full bg-sky-700" style={{ width: `${projection.max > 0 ? (m.baselineCents / projection.max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
