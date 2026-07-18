import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PerfRow } from "../../dal/types";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Performance — V2 take on the Manus PerformanceAgent.
 * Client-side sub-tabs over real DAL data: platform stat cards, the raw
 * metric table, posted content, and an attribution funnel. The CSV Import
 * tab is an honest placeholder — imports connect in the integrations phase.
 */

type Tab = "overview" | "accounts" | "posts" | "funnel" | "import";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "posts", label: "Posts" },
  { id: "funnel", label: "Funnel" },
  { id: "import", label: "CSV Import" },
];

export function PerformanceView() {
  const dal = getDal();
  const [tab, setTab] = useState<Tab>("overview");

  const perfQ = useQuery({ queryKey: ["marketing", "performance"], queryFn: () => dal.marketing.performance() });
  const postsQ = useQuery({ queryKey: ["marketing", "posts"], queryFn: () => dal.marketing.posts() });
  const attrQ = useQuery({ queryKey: ["marketing", "attribution"], queryFn: () => dal.marketing.attributionSummary() });

  const rows = perfQ.data ?? [];
  const byPlatform = useMemo(() => {
    const g = new Map<string, PerfRow[]>();
    for (const r of rows) {
      const l = g.get(r.platform) ?? [];
      l.push(r);
      g.set(r.platform, l);
    }
    return g;
  }, [rows]);

  if (perfQ.isLoading || postsQ.isLoading || attrQ.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading performance…</p>;
  }

  const posted = (postsQ.data ?? []).filter(p => p.status === "posted");
  const sources = [...(attrQ.data ?? [])].sort((a, b) => b.leads - a.leads);
  const maxLeads = Math.max(1, ...sources.map(s => s.leads));

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Performance</h1>
        <p className="text-sm text-zinc-500">Social + funnel metrics across platforms</p>
      </header>

      <div role="tablist" aria-label="Performance views" className="mt-4 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold ${
              tab === t.id ? "border-fire bg-fire/20 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...byPlatform.entries()].map(([platform, list]) => (
            <section key={platform} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-fire-light">{platform}</h2>
              <dl className="mt-3 space-y-2">
                {list.map(r => (
                  <div key={r.id} className="flex items-baseline justify-between gap-2">
                    <dt className="text-sm text-zinc-400">{r.metric}</dt>
                    <dd className="font-bold text-zinc-100">
                      {r.value.toLocaleString("en-US")}
                      <span className="ml-1 text-xs font-normal text-zinc-500">{r.period}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {byPlatform.size === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">
              No performance rows yet.
            </p>
          )}
        </div>
      )}

      {tab === "accounts" && (
        <section className="mt-4 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 font-semibold">Platform</th>
                <th className="pb-2 font-semibold">Metric</th>
                <th className="pb-2 text-right font-semibold">Value</th>
                <th className="pb-2 pl-4 font-semibold">Period</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-ink-800">
                  <td className="py-2 font-semibold text-zinc-200">{r.platform}</td>
                  <td className="py-2 text-zinc-300">{r.metric}</td>
                  <td className="py-2 text-right text-zinc-100">{r.value.toLocaleString("en-US")}</td>
                  <td className="py-2 pl-4 text-zinc-500">{r.period}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No rows yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === "posts" && (
        <ul className="mt-4 space-y-2">
          {posted.map(p => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
              <span className="text-xs font-semibold text-zinc-500">{p.date}</span>
              <span className="rounded-lg bg-ink-800 px-2.5 py-1 text-xs font-semibold text-zinc-300">{p.platform}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-zinc-100">{p.title}</span>
            </li>
          ))}
          {posted.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">
              Nothing posted yet.
            </li>
          )}
        </ul>
      )}

      {tab === "funnel" && (
        <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Leads → booked revenue by source</h2>
          <ul className="mt-4 space-y-4">
            {sources.map(s => (
              <li key={s.source}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-zinc-200">{s.source}</span>
                  <span className="text-zinc-400">
                    {s.leads} leads → <span className="font-semibold text-fire-light">{formatCents(s.bookedCents)}</span> booked
                  </span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-ink-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-fire to-fire-light"
                    style={{ width: `${(s.leads / maxLeads) * 100}%` }} />
                </div>
              </li>
            ))}
            {sources.length === 0 && <li className="py-8 text-center text-sm text-zinc-500">No attribution data yet.</li>}
          </ul>
        </section>
      )}

      {tab === "import" && (
        <p role="note" className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          CSV imports connect in the integrations phase (owner approval required). Platform exports
          (Meta, TikTok, Google) will land here and feed the Overview and Accounts tabs.
        </p>
      )}
    </div>
  );
}
