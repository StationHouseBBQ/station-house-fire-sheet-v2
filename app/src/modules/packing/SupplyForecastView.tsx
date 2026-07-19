import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import {
  CATEGORY_LABELS, CATEGORY_ORDER, loadMeta,
  type SupplyCategory, type SupplyMeta,
} from "./_data/supplyMeta";

/**
 * Packing · Supply Forecast — V2 implementation of Manus SupplyForecast.
 * Projects supply need from per-order usage × this week's orders, with a
 * 1/2-week horizon toggle, a category-grouped purchase-order table
 * (needed · order qty · est cost), summary cards, a printable PO, and a
 * well-stocked chip list.
 */

function money(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }
function moneyWhole(cents: number): string { return `$${Math.round(cents / 100)}`; }

function etToday(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function SupplyForecastView() {
  const dal = getDal();
  const [weeks, setWeeks] = useState<1 | 2>(1);

  const { data: base, isLoading } = useQuery({
    queryKey: ["supplies", "forecast"],
    queryFn: () => dal.supplies.forecast(),
    refetchInterval: 30_000,
  });
  const { data: meta } = useQuery({
    queryKey: ["supplies", "meta", (base ?? []).map(r => r.item.id).join(",")],
    enabled: !!base,
    queryFn: () => loadMeta((base ?? []).map(r => ({ id: r.item.id, name: r.item.name }))),
  });
  // Count upcoming orders across the chosen horizon for the header line.
  const { data: orders } = useQuery({
    queryKey: ["orders", "list", "forecast"],
    queryFn: () => dal.orders.list(),
  });

  const metaFor = (id: string): SupplyMeta => (meta ?? {})[id] ?? { category: "packaging", reorderQty: 0, costPerUnitCents: 0 };

  const today = etToday();
  const horizonEnd = addDays(today, weeks * 7);
  const orderCount = (orders ?? []).filter(o => o.serviceDate >= today && o.serviceDate < horizonEnd && o.status !== "cancelled").length;

  // Scale the base (1-week) need by the horizon.
  const rows = useMemo(() => (base ?? []).map(r => {
    const needed = r.weekNeed * weeks;
    const gap = Math.max(0, needed - r.item.onHand);
    return { ...r, needed, gap };
  }), [base, weeks]);

  const needsOrder = rows.filter(r => r.gap > 0);
  const wellStocked = rows.filter(r => r.gap === 0);

  const orderLine = (r: (typeof rows)[number]) => {
    const m = metaFor(r.item.id);
    const orderQty = Math.max(r.gap, m.reorderQty);
    const costCents = orderQty * m.costPerUnitCents;
    return { orderQty, costCents };
  };
  const totalPOCents = needsOrder.reduce((s, r) => s + orderLine(r).costCents, 0);

  const grouped = useMemo(() => {
    const map = new Map<SupplyCategory, typeof needsOrder>();
    for (const r of needsOrder) {
      const cat = metaFor(r.item.id).category;
      const list = map.get(cat) ?? [];
      list.push(r);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOrder, meta]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading supply forecast…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 print:text-black">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100 print:text-black">Supply Forecast</h1>
          <p className="text-sm text-zinc-500">Based on {orderCount} upcoming order{orderCount === 1 ? "" : "s"} · {weeks}-week horizon</p>
        </div>
        <button onClick={() => window.print()}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-300 print:hidden">
          🖨 Print PO
        </button>
      </header>

      {/* Horizon toggle */}
      <div className="mt-4 flex gap-2 print:hidden" role="group" aria-label="Forecast horizon">
        {([1, 2] as const).map(w => (
          <button key={w} onClick={() => setWeeks(w)} aria-pressed={weeks === w}
            className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wider ${weeks === w ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
            {w} Week{w > 1 ? "s" : ""}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-center">
          <p className="text-2xl font-black text-zinc-100">{rows.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Items checked</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${needsOrder.length > 0 ? "border-red-700/50 bg-red-950/30" : "border-green-700/50 bg-green-950/20"}`}>
          <p className={`text-2xl font-black ${needsOrder.length > 0 ? "text-red-400" : "text-green-400"}`}>{needsOrder.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Need to order</p>
        </div>
        <div className="rounded-xl border border-fire/40 bg-fire/10 p-4 text-center">
          <p className="text-2xl font-black text-fire-light">{moneyWhole(totalPOCents)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Est. PO cost</p>
        </div>
      </div>

      {needsOrder.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-red-400">
            Purchase order — {weeks}-week forecast
          </h2>
          {/* Print-only header */}
          <div className="mb-4 hidden border-b border-gray-300 pb-3 print:block">
            <h2 className="text-lg font-bold text-black">Station House BBQ — Supply Purchase Order</h2>
            <p className="text-sm text-gray-600">{weeks}-week forecast · Generated {new Date().toLocaleDateString()} · {orderCount} upcoming orders</p>
          </div>

          {grouped.map(([cat, catRows]) => (
            <div key={cat} className="mb-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-fire-light">
                {CATEGORY_LABELS[cat]}
                <div className="h-px flex-1 bg-ink-700 print:bg-gray-300" />
              </div>
              <div className="overflow-x-auto rounded-xl border border-ink-700 print:border-gray-300">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-3 py-2.5 text-right">On hand</th>
                      <th className="px-3 py-2.5 text-right">Needed</th>
                      <th className="px-3 py-2.5 text-right">Order qty</th>
                      <th className="px-3 py-2.5 text-right">Est. cost</th>
                      <th className="hidden px-3 py-2.5 text-center print:table-cell">✓</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700 bg-ink-900">
                    {catRows.map(r => {
                      const { orderQty, costCents } = orderLine(r);
                      return (
                        <tr key={r.item.id}>
                          <td className="px-4 py-2.5 font-semibold text-zinc-100 print:text-black">{r.item.name}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400">{r.item.onHand} {r.item.unit}</td>
                          <td className="px-3 py-2.5 text-right text-amber-400">{r.needed} {r.item.unit}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-red-400 print:text-black">{orderQty} {r.item.unit}</td>
                          <td className="px-3 py-2.5 text-right text-fire-light">{money(costCents)}</td>
                          <td className="hidden px-3 py-2.5 text-center print:table-cell">☐</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl border border-fire/40 bg-ink-900 p-3 print:border-gray-400">
            <span className="text-sm font-black uppercase tracking-wider text-fire-light print:text-black">Estimated total</span>
            <span className="text-xl font-black text-fire-light print:text-black">{money(totalPOCents)}</span>
          </div>
        </section>
      ) : (
        <div className="mt-6 rounded-xl border border-green-700/50 bg-green-950/20 p-6 text-center">
          <p className="text-2xl">✓</p>
          <p className="mt-1 font-black uppercase tracking-wider text-green-400">All stocked up</p>
          <p className="mt-1 text-xs text-zinc-500">No supply orders needed for the next {weeks} week{weeks > 1 ? "s" : ""}.</p>
        </div>
      )}

      {wellStocked.length > 0 && (
        <section className="mt-6 print:hidden">
          <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-green-400">Well stocked ({wellStocked.length} items)</h2>
          <div className="flex flex-wrap gap-2">
            {wellStocked.map(r => (
              <span key={r.item.id} className="rounded-lg border border-green-800/50 bg-green-950/40 px-2.5 py-1 text-xs font-medium text-green-400">
                {r.item.name}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="mt-4 text-xs text-zinc-600 print:hidden">
        Need = per-order usage × upcoming orders in the horizon. Order qty = max(gap, reorder qty). Est. cost uses each item's cost/unit.
      </p>
    </div>
  );
}
