import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import {
  aggregateItems,
  groupByCategory,
  ordersInRange,
  CATEGORY_META,
  type AggregatedItem,
} from "./_prod/prep";

/**
 * Catering · Order Guide — the purchasing / shopping guide for upcoming
 * catering. Rolls up every menu item across live, future-dated orders in a
 * selectable window into a consolidated buy-list grouped by station. For each
 * item the kitchen enters an "on hand" count; "to order" is computed
 * (needed − on hand, floored at 0). "On hand" edits are module-local. A print
 * button produces a shopping sheet via window.print().
 */

const RANGES = [
  { key: 7, label: "Next 7 days" },
  { key: 14, label: "Next 14 days" },
  { key: 30, label: "Next 30 days" },
] as const;

export function CateringOrderGuideView() {
  const dal = getDal();
  const [rangeDays, setRangeDays] = useState<number>(14);
  const [onHand, setOnHand] = useState<Record<string, number>>({});

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const now = currentTime();
  const rangeEnd = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + rangeDays);
    return d;
  }, [now, rangeDays]);

  const inWindow = useMemo(() => ordersInRange(orders, now, rangeEnd), [orders, now, rangeEnd]);
  const groups = useMemo(() => groupByCategory(aggregateItems(inWindow)), [inWindow]);

  const toOrderOf = (item: AggregatedItem): number =>
    Math.max(0, item.totalQty - (onHand[item.name.toLowerCase()] ?? 0));

  const grandCost = groups.reduce(
    (sum, g) => sum + g.items.reduce((s, i) => s + toOrderOf(i) * i.unitPriceCents, 0),
    0,
  );
  const linesToBuy = groups.reduce(
    (n, g) => n + g.items.filter(i => toOrderOf(i) > 0).length,
    0,
  );

  function setHand(name: string, raw: string) {
    const v = Math.max(0, Math.floor(Number(raw) || 0));
    setOnHand(prev => ({ ...prev, [name.toLowerCase()]: v }));
  }

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Catering Order Guide</h1>
          <p className="text-sm text-zinc-500">
            Consolidated buy-list for upcoming catering. Enter on-hand; we compute what to order.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-fire"
        >
          🖨 Print guide
        </button>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRangeDays(r.key)}
              className={`min-h-[40px] rounded-lg px-3 py-2 text-sm font-bold ${
                rangeDays === r.key ? "bg-fire text-white" : "text-zinc-400"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-zinc-500">
          {inWindow.length} event{inWindow.length === 1 ? "" : "s"} · {linesToBuy} line
          {linesToBuy === 1 ? "" : "s"} to order
        </div>
        <div className="ml-auto rounded-lg border border-ink-700 bg-ink-900 px-4 py-2">
          <span className="text-xs uppercase text-zinc-500">Est. order cost</span>
          <span className="ml-2 text-lg font-black text-green-400">{formatCents(grandCost)}</span>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-black text-black">Station House BBQ — Catering Order Guide</h1>
        <p className="text-sm text-neutral-700">
          {RANGES.find(r => r.key === rangeDays)?.label} ·{" "}
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading order guide…</p>
      ) : groups.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">Nothing to purchase for this window.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map(group => {
            const meta = CATEGORY_META[group.category];
            const groupCost = group.items.reduce((s, i) => s + toOrderOf(i) * i.unitPriceCents, 0);
            return (
              <section key={group.category} className={`rounded-2xl border ${meta.bg} p-4`}>
                <div className="flex items-center justify-between">
                  <h2 className={`text-sm font-black uppercase tracking-wider ${meta.text}`}>
                    {meta.emoji} {group.category}
                  </h2>
                  <span className="text-sm font-bold text-green-400">{formatCents(groupCost)}</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2 text-right">Needed</th>
                        <th className="px-2 py-2 text-right">On hand</th>
                        <th className="px-2 py-2 text-right">To order</th>
                        <th className="px-2 py-2 text-right">Est. cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(item => {
                        const hand = onHand[item.name.toLowerCase()] ?? 0;
                        const toOrder = toOrderOf(item);
                        return (
                          <tr key={item.name} className="border-b border-ink-800">
                            <td className="px-2 py-2.5 font-semibold text-zinc-100">
                              {item.name}
                              <span className="ml-2 text-xs font-normal text-zinc-500">
                                {item.contributions.length} event
                                {item.contributions.length === 1 ? "" : "s"}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono text-zinc-300">
                              {item.totalQty}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              <input
                                type="number"
                                min={0}
                                value={hand === 0 ? "" : hand}
                                placeholder="0"
                                onChange={e => setHand(item.name, e.target.value)}
                                className="w-16 rounded-md border border-ink-700 bg-ink-950 px-2 py-1 text-right font-mono text-zinc-100 print:border-black"
                              />
                            </td>
                            <td
                              className={`px-2 py-2.5 text-right font-mono font-bold ${
                                toOrder > 0 ? "text-fire-light" : "text-zinc-600"
                              }`}
                            >
                              {toOrder}
                            </td>
                            <td className="px-2 py-2.5 text-right text-zinc-300">
                              {formatCents(toOrder * item.unitPriceCents)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <div className="flex items-center justify-end gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <span className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Estimated order total
            </span>
            <span className="text-xl font-black text-green-400">{formatCents(grandCost)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
