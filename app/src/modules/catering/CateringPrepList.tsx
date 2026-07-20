import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { currentTime } from "../../lib/clock";
import {
  aggregateItems,
  groupByCategory,
  ordersInRange,
  fmtEventDate,
  CATEGORY_META,
  type AggregatedItem,
} from "./_prod/prep";

/**
 * Catering · Prep List — the consolidated kitchen prep sheet. Aggregates every
 * line item across all upcoming (future-dated, live) catering orders within a
 * selectable window, sums identical items across events, and groups them by
 * inferred station (Meats / Sides / Desserts / Other). Each item expands to
 * show which events/customers it's for. Check-off state is module-local; a
 * print button produces a kitchen-friendly sheet via window.print().
 */

const RANGES = [
  { key: 7, label: "Next 7 days" },
  { key: 14, label: "Next 14 days" },
  { key: 30, label: "Next 30 days" },
] as const;

export function CateringPrepList() {
  const dal = getDal();
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());

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

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const totalPortions = groups.reduce((n, g) => n + g.items.reduce((s, i) => s + i.totalQty, 0), 0);
  const checkedCount = groups.reduce(
    (n, g) => n + g.items.filter(i => checked.has(i.name.toLowerCase())).length,
    0,
  );

  function toggleExpand(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      const k = name.toLowerCase();
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function toggleCheck(name: string) {
    setChecked(prev => {
      const next = new Set(prev);
      const k = name.toLowerCase();
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Catering Prep List</h1>
          <p className="text-sm text-zinc-500">
            Consolidated kitchen prep across upcoming catering events.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-fire"
        >
          🖨 Print sheet
        </button>
      </header>

      {/* Range picker + summary */}
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
          {inWindow.length} event{inWindow.length === 1 ? "" : "s"} · {totalItems} item
          {totalItems === 1 ? "" : "s"} · {totalPortions} portions
        </div>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-black text-black">Station House BBQ — Catering Prep List</h1>
        <p className="text-sm text-neutral-700">
          {RANGES.find(r => r.key === rangeDays)?.label} ·{" "}
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading prep list…</p>
      ) : totalItems === 0 ? (
        <p className="py-16 text-center text-zinc-500">
          No catering items to prep in this window.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Progress */}
          <div className="print:hidden">
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-2 rounded-full bg-green-600 transition-all"
                style={{ width: `${totalItems ? (checkedCount / totalItems) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {checkedCount}/{totalItems} items prepped
            </p>
          </div>

          {groups.map(group => {
            const meta = CATEGORY_META[group.category];
            return (
              <section key={group.category} className={`rounded-2xl border ${meta.bg} p-4`}>
                <h2 className={`text-sm font-black uppercase tracking-wider ${meta.text}`}>
                  {meta.emoji} {group.category}
                  <span className="ml-2 text-xs font-semibold text-zinc-500">
                    {group.items.length} item{group.items.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ul className="mt-3 space-y-2">
                  {group.items.map(item => (
                    <PrepRow
                      key={item.name}
                      item={item}
                      isChecked={checked.has(item.name.toLowerCase())}
                      isExpanded={expanded.has(item.name.toLowerCase())}
                      onToggleCheck={() => toggleCheck(item.name)}
                      onToggleExpand={() => toggleExpand(item.name)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PrepRow({
  item,
  isChecked,
  isExpanded,
  onToggleCheck,
  onToggleExpand,
}: {
  item: AggregatedItem;
  isChecked: boolean;
  isExpanded: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <li
      className={`rounded-xl border p-3 transition-colors ${
        isChecked ? "border-green-800/40 bg-green-950/20 opacity-70" : "border-ink-700 bg-ink-900"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleCheck}
          title="Mark prepped"
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-sm print:border-black ${
            isChecked ? "border-green-600 bg-green-600 text-white" : "border-ink-700 text-transparent"
          }`}
        >
          ✓
        </button>
        <div className="flex-1 min-w-0">
          <span
            className={`font-semibold ${
              isChecked ? "text-zinc-500 line-through" : "text-zinc-100"
            }`}
          >
            {item.name}
          </span>
          <span className="ml-2 text-xs text-zinc-500">
            {item.contributions.length} event{item.contributions.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="flex-shrink-0 rounded-lg bg-ink-800 px-3 py-1 font-mono text-sm font-bold text-fire-light print:text-black">
          × {item.totalQty}
        </span>
        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-300 print:hidden"
        >
          {isExpanded ? "Hide" : "For…"}
        </button>
      </div>

      {isExpanded && (
        <ul className="mt-3 space-y-1 border-t border-ink-800 pt-3 pl-9 print:pl-0">
          {item.contributions.map((c, i) => (
            <li key={`${c.orderId}-${i}`} className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-mono text-zinc-500">{c.ref}</span>
              <span className="font-semibold text-zinc-300">{c.customer}</span>
              <span>· {fmtEventDate(c.eventDate)}</span>
              <span>· {c.guests === null ? "guests TBD" : `${c.guests} guests`}</span>
              <span className="ml-auto font-mono font-bold text-zinc-300">× {c.qty}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
