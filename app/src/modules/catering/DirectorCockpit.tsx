import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";

/**
 * Catering · Director Cockpit — V2 counterpart of the Manus DirectorCockpit
 * (parity row #29). KPI cards, Red Zone panel, upcoming booked events and
 * wins this week, all sourced from dal.cockpit.data().
 */

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DirectorCockpit() {
  const dal = getDal();
  const { data, isLoading } = useQuery({
    queryKey: ["cockpit", "data"],
    queryFn: () => dal.cockpit.data(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return <p className="py-20 text-center text-zinc-500">Loading cockpit…</p>;

  const { kpis, redZone, upcoming, winsThisWeek } = data;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Director Cockpit</h1>
        <p className="text-sm text-zinc-500">Pipeline health at a glance</p>
      </header>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Pipeline value" value={formatCents(kpis.pipelineValueCents)} accent />
        <Kpi label="Open leads" value={String(kpis.openLeads)} />
        <Kpi label="Booked this month" value={String(kpis.bookedThisMonth)} />
        <Kpi label="Pending approvals" value={String(kpis.pendingApprovals)} warn={kpis.pendingApprovals > 0} />
        <Kpi label="Unpaid invoices" value={formatCents(kpis.unpaidInvoicesCents)} warn={kpis.unpaidInvoicesCents > 0} />
      </div>

      {/* Red Zone */}
      <section className="mt-6 rounded-2xl border-2 border-red-700/70 bg-red-950/20 p-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-red-400">🚨 Red Zone</h2>
        {redZone.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No events with open issues in the next 7 days.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {redZone.map(r => (
              <li key={r.leadOrQuoteId} className="rounded-xl border border-red-800/50 bg-ink-900 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-100">{r.label}</p>
                  <p className="text-sm font-bold text-red-400">{fmtDate(r.eventDate)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.issues.map(issue => (
                    <span key={issue} className="rounded-full border border-red-700/50 bg-red-600/20 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                      {issue}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Upcoming */}
        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">📅 Upcoming events</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nothing booked ahead.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {upcoming.map(u => (
                <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-100">{u.customer}</p>
                    <p className="text-xs text-zinc-500">
                      {u.guests !== null ? `${u.guests} guests · ` : ""}
                      <span className="uppercase">{u.status}</span>
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-fire-light">{fmtDate(u.eventDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Wins */}
        <section className="rounded-2xl border border-green-800/50 bg-green-950/10 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-green-400">🏆 Wins this week</h2>
          {winsThisWeek.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No bookings closed in the last 7 days.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {winsThisWeek.map(w => (
                <li key={`${w.id}-${w.at}`} className="flex items-center justify-between gap-3 rounded-lg border border-green-800/40 bg-ink-900 px-3 py-2.5">
                  <p className="min-w-0 truncate font-semibold text-zinc-100">🎉 {w.label}</p>
                  <p className="shrink-0 text-xs text-zinc-500">{fmtDateTime(w.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-amber-700/50 bg-amber-950/20" : "border-ink-700 bg-ink-900"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${accent ? "text-fire-light" : warn ? "text-amber-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}
