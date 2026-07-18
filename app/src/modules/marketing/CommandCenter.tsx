import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PostStatus } from "../../dal/types";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Command Center — V2 take on the Manus MarketingCommandCenter.
 * Read-only rollup across the marketing surface: landing-page traffic,
 * lead attribution, ad spend, and the content pipeline. Every number here
 * is an aggregate over real DAL data — nothing is invented client-side.
 */

const PIPELINE_STATUSES: Array<{ id: PostStatus; label: string; cls: string }> = [
  { id: "idea", label: "Ideas", cls: "text-zinc-300" },
  { id: "drafted", label: "Drafted", cls: "text-amber-400" },
  { id: "scheduled", label: "Scheduled", cls: "text-blue-400" },
  { id: "posted", label: "Posted", cls: "text-green-400" },
];

export function MarketingCommandCenter() {
  const dal = getDal();
  const pagesQ = useQuery({ queryKey: ["marketing", "landingPages"], queryFn: () => dal.marketing.landingPages() });
  const attrQ = useQuery({ queryKey: ["marketing", "attribution"], queryFn: () => dal.marketing.attributionSummary() });
  const adsQ = useQuery({ queryKey: ["marketing", "adCampaigns"], queryFn: () => dal.marketing.adCampaigns() });
  const postsQ = useQuery({ queryKey: ["marketing", "posts"], queryFn: () => dal.marketing.posts() });

  if (pagesQ.isLoading || attrQ.isLoading || adsQ.isLoading || postsQ.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading command center…</p>;
  }

  const pages = pagesQ.data ?? [];
  const attribution = attrQ.data ?? [];
  const campaigns = adsQ.data ?? [];
  const posts = postsQ.data ?? [];

  const visits = pages.reduce((s, p) => s + p.visits, 0);
  const conversions = pages.reduce((s, p) => s + p.conversions, 0);
  const convRate = visits > 0 ? (conversions / visits) * 100 : 0;
  const spendCents = campaigns.reduce((s, c) => s + c.spendCents, 0);
  const adLeads = campaigns.reduce((s, c) => s + c.leads, 0);
  const topSources = [...attribution].sort((a, b) => b.leads - a.leads).slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Marketing Command Center</h1>
        <p className="text-sm text-zinc-500">Read-only rollup across landing pages, attribution, ads, and content</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Page visits" value={visits.toLocaleString("en-US")} />
        <Stat label="Conversions" value={conversions.toLocaleString("en-US")} />
        <Stat label="Conv. rate" value={`${convRate.toFixed(1)}%`} accent />
        <Stat label="Ad spend" value={formatCents(spendCents)} />
        <Stat label="Ad leads" value={adLeads.toLocaleString("en-US")} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Top lead sources</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 font-semibold">Source</th>
                <th className="pb-2 text-right font-semibold">Leads</th>
                <th className="pb-2 text-right font-semibold">Booked</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map(s => (
                <tr key={s.source} className="border-t border-ink-800">
                  <td className="py-2 font-semibold text-zinc-200">{s.source}</td>
                  <td className="py-2 text-right text-zinc-300">{s.leads}</td>
                  <td className="py-2 text-right text-zinc-300">{formatCents(s.bookedCents)}</td>
                </tr>
              ))}
              {topSources.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-zinc-500">No attribution data yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Ad campaign spend</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {campaigns.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-zinc-200">
                    {c.name} <span className="text-xs text-zinc-500">· {c.platform} · {c.status}</span>
                  </span>
                  <span className="font-semibold text-zinc-300">{formatCents(c.spendCents)}</span>
                </li>
              ))}
              {campaigns.length === 0 && <li className="py-4 text-center text-zinc-500">No campaigns yet.</li>}
            </ul>
          </section>

          <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Content pipeline</h2>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {PIPELINE_STATUSES.map(s => (
                <div key={s.id} className="rounded-lg bg-ink-800 px-2 py-2.5">
                  <p className={`text-lg font-bold ${s.cls}`}>{posts.filter(p => p.status === s.id).length}</p>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}
