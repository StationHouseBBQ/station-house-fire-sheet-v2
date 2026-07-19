import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Command Center — the marketing home dashboard.
 * A real overview computed live from dal.marketing.analytics(): tracked
 * revenue, weekend pre-order split, catering pipeline and lead totals, a
 * revenue-by-channel bar list, a top-days table, the lead funnel with
 * drop-off, and quick links into the rest of the workspace. Every number is
 * an aggregate over real preorder + lead data — nothing is invented here.
 */

const QUICK_LINKS: Array<{ id: string; label: string }> = [
  { id: "performance", label: "Performance" },
  { id: "leads", label: "Lead Analysis" },
  { id: "ads", label: "Ads Center" },
  { id: "calendar", label: "Content Calendar" },
  { id: "outreach", label: "Outreach" },
  { id: "hub", label: "Landing Pages" },
];

export function MarketingCommandCenter() {
  const dal = getDal();
  const { data, isLoading } = useQuery({
    queryKey: ["marketing", "analytics"],
    queryFn: () => dal.marketing.analytics(),
  });

  if (isLoading || !data) {
    return <p className="py-20 text-center text-zinc-500">Loading command center&hellip;</p>;
  }

  const { channelRevenue, totalRevenueCents, leadFunnel, weekendPreorders, cateringPipelineCents, topDays } = data;
  const totalLeads = leadFunnel.reduce((s, f) => s + f.count, 0);
  const maxChannel = Math.max(1, ...channelRevenue.map(c => c.revenueCents));
  const funnelTop = Math.max(1, leadFunnel[0]?.count ?? 1);

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Marketing Command Center</h1>
        <p className="text-sm text-zinc-500">Live overview from real pre-orders and leads</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tracked revenue" value={formatCents(totalRevenueCents)} accent />
        <Stat label="Weekend pre-orders"
          value={formatCents(weekendPreorders.revenueCents)}
          sub={`${weekendPreorders.count} orders · Fri ${weekendPreorders.friday} / Sat ${weekendPreorders.saturday}`} />
        <Stat label="Catering pipeline" value={formatCents(cateringPipelineCents)} sub="Open lead budgets" />
        <Stat label="Total leads" value={totalLeads.toLocaleString("en-US")} sub={`${leadFunnel.find(f => f.stage === "booked")?.count ?? 0} booked`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Revenue by channel</h2>
          <ul className="mt-3 space-y-3">
            {channelRevenue.map(c => {
              const pct = totalRevenueCents > 0 ? (c.revenueCents / totalRevenueCents) * 100 : 0;
              return (
                <li key={c.channel}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-zinc-200">{c.label}</span>
                    <span className="text-zinc-400">
                      <span className="font-semibold text-zinc-100">{formatCents(c.revenueCents)}</span>
                      <span className="ml-1 text-xs">· {c.orders} orders · {pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-fire to-fire-light"
                      style={{ width: `${(c.revenueCents / maxChannel) * 100}%` }} />
                  </div>
                </li>
              );
            })}
            {channelRevenue.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">No revenue tracked yet.</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Top days</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 text-right font-semibold">Orders</th>
                <th className="pb-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topDays.map(d => (
                <tr key={d.date} className="border-t border-ink-800">
                  <td className="py-2 font-semibold text-zinc-200">{d.date}</td>
                  <td className="py-2 text-right text-zinc-300">{d.orders}</td>
                  <td className="py-2 text-right text-zinc-100">{formatCents(d.revenueCents)}</td>
                </tr>
              ))}
              {topDays.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-zinc-500">No pickup days yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Lead funnel</h2>
        <ul className="mt-3 space-y-2.5">
          {leadFunnel.map((f, i) => {
            const prev = i > 0 ? leadFunnel[i - 1].count : null;
            const drop = prev && prev > 0 ? Math.round((1 - f.count / prev) * 100) : null;
            return (
              <li key={f.stage} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-semibold text-zinc-300">{f.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-ink-800">
                  <div className="flex h-full items-center rounded-md bg-gradient-to-r from-fire to-fire-light px-2 text-xs font-bold text-white"
                    style={{ width: `${Math.max(8, (f.count / funnelTop) * 100)}%` }}>
                    {f.count}
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-zinc-500">
                  {drop === null ? "—" : `-${drop}%`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Jump to</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_LINKS.map(l => (
            <Link key={l.id} href={`/marketing/${l.id}`}
              className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-fire/50">
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}
