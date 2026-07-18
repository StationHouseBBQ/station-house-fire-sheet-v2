import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Lead Analysis — V2 take on the Manus LeadAnalysis page.
 * Attribution summary by source (leads, booked revenue, share of leads)
 * plus a per-lead attribution list with UTM campaign + landing page.
 */

export function LeadAnalysisView() {
  const dal = getDal();
  const attrQ = useQuery({ queryKey: ["marketing", "attribution"], queryFn: () => dal.marketing.attributionSummary() });
  const leadsQ = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });

  if (attrQ.isLoading || leadsQ.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading lead analysis…</p>;
  }

  const sources = attrQ.data ?? [];
  const leads = leadsQ.data ?? [];
  const totalLeads = sources.reduce((s, r) => s + r.leads, 0);
  const totalBooked = sources.reduce((s, r) => s + r.bookedCents, 0);

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Lead Analysis</h1>
        <p className="text-sm text-zinc-500">
          {totalLeads} leads attributed · {formatCents(totalBooked)} booked revenue
        </p>
      </header>

      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Attribution by source</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-semibold">Source</th>
              <th className="pb-2 text-right font-semibold">Leads</th>
              <th className="pb-2 text-right font-semibold">Booked</th>
              <th className="pb-2 pl-4 font-semibold">Share</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(s => {
              const share = totalLeads > 0 ? (s.leads / totalLeads) * 100 : 0;
              return (
                <tr key={s.source} className="border-t border-ink-800">
                  <td className="py-2.5 font-semibold text-zinc-200">{s.source}</td>
                  <td className="py-2.5 text-right text-zinc-300">{s.leads}</td>
                  <td className="py-2.5 text-right text-zinc-300">{formatCents(s.bookedCents)}</td>
                  <td className="py-2.5 pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-full max-w-[10rem] overflow-hidden rounded-full bg-ink-800">
                        <div className="h-full bg-gradient-to-r from-fire to-fire-light" style={{ width: `${share}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs text-zinc-400">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sources.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No attribution data yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Per-lead attribution</h2>
        <ul className="mt-2 space-y-2">
          {leads.map(l => (
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
          {leads.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-700 py-10 text-center text-sm text-zinc-500">No leads yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
