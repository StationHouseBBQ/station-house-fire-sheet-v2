import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Lead Analysis — real lead-source intelligence.
 * A conversion table from dal.marketing.analytics() (leads -> booked -> %
 * per source with bars), a "best converting source" callout, a source filter,
 * and the per-lead attribution list (source / UTM campaign / landing page).
 * All numbers are aggregates over real lead data.
 */

export function LeadAnalysisView() {
  const dal = getDal();
  const analyticsQ = useQuery({ queryKey: ["marketing", "analytics"], queryFn: () => dal.marketing.analytics() });
  const leadsQ = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });
  const [source, setSource] = useState<string>("all");

  if (analyticsQ.isLoading || leadsQ.isLoading || !analyticsQ.data) {
    return <p className="py-20 text-center text-zinc-500">Loading lead analysis&hellip;</p>;
  }

  const sources = analyticsQ.data.leadSources;
  const leads = leadsQ.data ?? [];
  const totalLeads = sources.reduce((s, r) => s + r.leads, 0);
  const totalBooked = sources.reduce((s, r) => s + r.bookedCents, 0);
  const maxLeads = Math.max(1, ...sources.map(s => s.leads));

  // Best converting source: highest conversion%, tie-break by volume, needs a booking.
  const best = useMemo(() => {
    const eligible = sources.filter(s => s.booked > 0);
    return [...eligible].sort((a, b) => b.conversionPct - a.conversionPct || b.leads - a.leads)[0] ?? null;
  }, [sources]);

  const filtered = source === "all" ? leads : leads.filter(l => l.source === source);
  const sourceOptions = useMemo(() => [...new Set(leads.map(l => l.source))].sort(), [leads]);

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Lead Analysis</h1>
        <p className="text-sm text-zinc-500">
          {totalLeads} leads attributed · {formatCents(totalBooked)} booked revenue
        </p>
      </header>

      {best && (
        <div className="mt-4 rounded-xl border border-fire/40 bg-fire/10 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-fire-light">Best converting source</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-100">
            {best.source} <span className="text-fire-light">· {best.conversionPct}%</span>
          </p>
          <p className="text-xs text-zinc-400">
            {best.booked} of {best.leads} leads booked · {formatCents(best.bookedCents)} revenue
          </p>
        </div>
      )}

      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Conversion by source</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-semibold">Source</th>
              <th className="pb-2 text-right font-semibold">Leads</th>
              <th className="pb-2 text-right font-semibold">Booked</th>
              <th className="pb-2 text-right font-semibold">Revenue</th>
              <th className="pb-2 pl-4 font-semibold">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.source} className="border-t border-ink-800">
                <td className="py-2.5 font-semibold text-zinc-200">{s.source}</td>
                <td className="py-2.5 text-right text-zinc-300">{s.leads}</td>
                <td className="py-2.5 text-right text-zinc-300">{s.booked}</td>
                <td className="py-2.5 text-right text-zinc-300">{formatCents(s.bookedCents)}</td>
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-full max-w-[9rem] overflow-hidden rounded-full bg-ink-800">
                      <div className="h-full bg-gradient-to-r from-fire to-fire-light" style={{ width: `${(s.leads / maxLeads) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs text-fire-light">{s.conversionPct}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-zinc-500">No attribution data yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Per-lead attribution</h2>
          <label className="text-sm text-zinc-400">
            Source
            <select value={source} onChange={e => setSource(e.target.value)}
              aria-label="Filter leads by source"
              className="ml-2 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-zinc-100">
              <option value="all">All sources</option>
              {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <ul className="mt-2 space-y-2">
          {filtered.map(l => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-semibold text-zinc-100">{l.name}</span>
              <span className="rounded-lg bg-ink-800 px-2.5 py-1 text-xs font-semibold text-zinc-300">{l.source}</span>
              <span className="text-xs text-zinc-500">
                campaign: <span className="text-zinc-300">{l.utm.campaign ?? "—"}</span>
              </span>
              <span className="text-xs text-zinc-500">
                landing: <span className="text-zinc-300">{l.utm.landingPage ?? "—"}</span>
              </span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-700 py-10 text-center text-sm text-zinc-500">No leads for this source.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
