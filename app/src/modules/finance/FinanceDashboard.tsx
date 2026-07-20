import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { balanceCents, isInvoiced, isOpenQuote, monthKey, monthLabel } from "./_data/util";

/**
 * Finance · Command Center — the owner dashboard. Every KPI is derived from the
 * unified catering lifecycle (dal.cateringLifecycle), which already holds the
 * money system (subtotal/tax/total/paid + invoicedAt/paidAt). No parallel
 * ledger is invented here. Mirrors Manus pages/FinanceDashboard.tsx, rebuilt on
 * V2's real data + Tailwind (no recharts/lucide).
 */

function Kpi({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-fire/40 bg-fire/10" : warn ? "border-amber-700/50 bg-amber-950/20" : "border-ink-700 bg-ink-900"}`}>
      <div className="text-xs font-black uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${accent ? "text-fire-light" : warn ? "text-amber-300" : "text-zinc-100"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function FinanceDashboard() {
  const dal = getDal();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const metrics = useMemo(() => {
    const paidRevenueCents = orders.reduce((s, o) => s + o.paidCents, 0);
    const outstandingArCents = orders
      .filter(o => isInvoiced(o))
      .reduce((s, o) => s + balanceCents(o), 0);
    const openQuotes = orders.filter(isOpenQuote);
    const quotesOutstandingCents = openQuotes.reduce((s, o) => s + o.totalCents, 0);

    const booked = orders.filter(o => o.stage !== "lost" && o.stage !== "cancelled");
    const eventValues = booked.filter(o => o.totalCents > 0);
    const avgEventCents = eventValues.length > 0
      ? Math.round(eventValues.reduce((s, o) => s + o.totalCents, 0) / eventValues.length)
      : 0;

    // Revenue by month from actual payments (paidAt + paidCents).
    const byMonth = new Map<string, number>();
    for (const o of orders) {
      if (o.paidCents <= 0) continue;
      const key = monthKey(o.paidAt ?? o.invoicedAt ?? o.createdAt);
      if (!key) continue;
      byMonth.set(key, (byMonth.get(key) ?? 0) + o.paidCents);
    }
    const revenueByMonth = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, cents]) => ({ key, label: monthLabel(key), cents }));
    const monthMax = revenueByMonth.reduce((m, r) => Math.max(m, r.cents), 0);

    // Top customers by paid revenue.
    const custMap = new Map<string, { name: string; company: string | null; cents: number; events: number }>();
    for (const o of orders) {
      const name = o.companyName ?? o.customer;
      const cur = custMap.get(name) ?? { name: o.customer, company: o.companyName, cents: 0, events: 0 };
      cur.cents += o.paidCents;
      if (o.stage !== "lost" && o.stage !== "cancelled") cur.events += 1;
      custMap.set(name, cur);
    }
    const topCustomers = Array.from(custMap.values())
      .filter(c => c.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 6);

    return {
      paidRevenueCents, outstandingArCents, quotesOutstandingCents,
      openQuotesCount: openQuotes.length, avgEventCents, bookedCount: booked.length,
      revenueByMonth, monthMax, topCustomers,
    };
  }, [orders]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading finance…</p>;

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Finance Command Center</h1>
        <p className="text-sm text-zinc-500">Money at a glance — revenue, receivables, and pipeline value from the catering lifecycle.</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total revenue (paid)" value={formatCents(metrics.paidRevenueCents)} accent />
        <Kpi label="Outstanding A/R" value={formatCents(metrics.outstandingArCents)} warn={metrics.outstandingArCents > 0} sub="invoiced & unpaid" />
        <Kpi label="Quotes outstanding" value={formatCents(metrics.quotesOutstandingCents)} sub={`${metrics.openQuotesCount} open`} />
        <Kpi label="Avg event value" value={formatCents(metrics.avgEventCents)} sub={`${metrics.bookedCount} booked`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Revenue by month</h2>
          {metrics.revenueByMonth.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No payments recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {metrics.revenueByMonth.map(r => (
                <li key={r.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{r.label}</span>
                    <span className="font-bold text-zinc-200">{formatCents(r.cents)}</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full bg-fire" style={{ width: `${metrics.monthMax > 0 ? Math.max(4, (r.cents / metrics.monthMax) * 100) : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Top customers</h2>
          {metrics.topCustomers.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No paying customers yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-800">
              {metrics.topCustomers.map((c: { name: string; company: string | null; cents: number; events: number }) => (
                <li key={c.company ?? c.name} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{c.company ?? c.name}</div>
                    <div className="text-xs text-zinc-500">{c.events} event{c.events === 1 ? "" : "s"}</div>
                  </div>
                  <span className="font-bold text-green-400">{formatCents(c.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
