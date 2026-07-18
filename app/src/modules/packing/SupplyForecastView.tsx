import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";

/**
 * Packing · Supply Forecast — V2 implementation of Manus SupplyForecast.
 * Read-only: projects this week's supply need from per-order usage and
 * flags items whose on-hand won't cover it.
 */

export function SupplyForecastView() {
  const dal = getDal();

  const { data: forecast, isLoading } = useQuery({
    queryKey: ["supplies", "forecast"],
    queryFn: () => dal.supplies.forecast(),
    refetchInterval: 30_000,
  });

  const rows = forecast ?? [];
  const shortRows = rows.filter(r => r.gap > 0);
  const totalGap = shortRows.reduce((s, r) => s + r.gap, 0);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading supply forecast…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Supply Forecast</h1>
        <p className="text-sm text-zinc-500">Need = per-order usage × this week's orders</p>
      </header>

      <div className={`mt-4 rounded-xl border p-4 ${
        totalGap > 0 ? "border-red-700/50 bg-red-950/30" : "border-green-700/50 bg-green-950/20"
      }`}>
        {totalGap > 0 ? (
          <p className="text-sm font-semibold text-red-400">
            Short {totalGap} unit{totalGap === 1 ? "" : "s"} across {shortRows.length} item{shortRows.length === 1 ? "" : "s"} — restock before service.
          </p>
        ) : (
          <p className="text-sm font-semibold text-green-400">All supplies cover this week's projected need.</p>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-3 py-3 text-right">On hand</th>
              <th className="px-3 py-3 text-right">Week need</th>
              <th className="px-3 py-3 text-right">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {rows.map(({ item, weekNeed, gap }) => {
              const short = gap > 0;
              return (
                <tr key={item.id} className={short ? "bg-red-950/30" : undefined}>
                  <td className="px-4 py-2.5 font-semibold text-zinc-100">
                    {item.name} <span className="font-normal text-zinc-500">({item.unit})</span>
                    {short && <span className="ml-2 rounded-full border border-red-700/50 bg-red-600/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">Short</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{item.onHand}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{weekNeed}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${short ? "text-red-400" : "text-green-400"}`}>
                    {short ? `−${gap}` : "OK"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-500">No supply items to forecast.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-600">
        Week need multiplies each item's per-order usage by the number of orders on this week's calendar. Gap = week need − on hand.
      </p>
    </div>
  );
}
