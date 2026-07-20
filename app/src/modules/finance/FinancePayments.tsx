import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import { fmtDateTime, monthKey } from "./_data/util";

/**
 * Finance · Payments — a ledger of money actually received. Each order with
 * paidCents > 0 contributes one payment row (dated by paidAt, falling back to
 * invoicedAt/createdAt). Filter by date range; summary shows this-month vs
 * all-time; a running total accumulates down the ledger. Source: Manus
 * pages/FinancePayments.tsx.
 */

interface PaymentRow {
  id: string;
  ref: string;
  customer: string;
  company: string | null;
  at: string;
  cents: number;
}

type RangeKey = "all" | "month" | "90d";
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "all", label: "All time" },
  { key: "90d", label: "Last 90 days" },
  { key: "month", label: "This month" },
];

export function FinancePayments() {
  const dal = getDal();
  const [range, setRange] = useState<RangeKey>("all");
  const now = currentTime();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const payments = useMemo<PaymentRow[]>(() => orders
    .filter(o => o.paidCents > 0)
    .map(o => ({
      id: o.id,
      ref: o.ref,
      customer: o.customer,
      company: o.companyName,
      at: o.paidAt ?? o.invoicedAt ?? o.createdAt,
      cents: o.paidCents,
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [orders]);

  const thisMonthKey = monthKey(now.toISOString());
  const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => payments.filter(p => {
    if (range === "all") return true;
    if (range === "month") return monthKey(p.at) === thisMonthKey;
    return new Date(p.at).getTime() >= ninetyDaysAgo;
  }), [payments, range, thisMonthKey, ninetyDaysAgo]);

  const allTimeCents = useMemo(() => payments.reduce((s, p) => s + p.cents, 0), [payments]);
  const thisMonthCents = useMemo(
    () => payments.filter(p => monthKey(p.at) === thisMonthKey).reduce((s, p) => s + p.cents, 0),
    [payments, thisMonthKey],
  );
  const rangeCents = useMemo(() => filtered.reduce((s, p) => s + p.cents, 0), [filtered]);

  // Running total accumulates newest→oldest so the top row shows the range total.
  const withRunning = useMemo(() => {
    let acc = rangeCents;
    return filtered.map(p => {
      const running = acc;
      acc -= p.cents;
      return { ...p, running };
    });
  }, [filtered, rangeCents]);

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Payments</h1>
        <p className="text-sm text-zinc-500">Money received across the catering lifecycle.</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-fire/40 bg-fire/10 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">This month</div>
          <div className="mt-1 text-2xl font-black text-fire-light">{formatCents(thisMonthCents)}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">All time</div>
          <div className="mt-1 text-2xl font-black text-zinc-100">{formatCents(allTimeCents)}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">In view</div>
          <div className="mt-1 text-2xl font-black text-green-400">{formatCents(rangeCents)}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold ${range === r.key ? "bg-fire text-white" : "text-zinc-400"}`}>
            {r.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading…</p>
      ) : withRunning.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No payments in this range.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Running total</th>
              </tr>
            </thead>
            <tbody>
              {withRunning.map(p => (
                <tr key={p.id} className="border-b border-ink-800">
                  <td className="px-3 py-3 text-zinc-400">{fmtDateTime(p.at)}</td>
                  <td className="px-3 py-3 font-mono text-xs text-zinc-300">{p.ref}</td>
                  <td className="px-3 py-3 font-semibold text-zinc-100">
                    {p.customer}{p.company && <span className="block text-xs font-normal text-zinc-500">{p.company}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-green-400">{formatCents(p.cents)}</td>
                  <td className="px-3 py-3 text-right text-zinc-300">{formatCents(p.running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
