import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import type { Lead } from "../../dal/types";

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

  const { data: leads = [] } = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });
  const [detailId, setDetailId] = useState<string | null>(null);

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
              <li key={r.leadOrQuoteId}>
                <button onClick={() => setDetailId(r.leadOrQuoteId)}
                  className="w-full rounded-xl border border-red-800/50 bg-ink-900 p-3 text-left transition hover:border-red-500 hover:bg-red-950/30">
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
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-red-400/70">Tap to view contact →</p>
                </button>
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

      {detailId && (
        <RedZoneDetail
          lead={leads.find(l => l.id === detailId) ?? null}
          issues={redZone.find(r => r.leadOrQuoteId === detailId)?.issues ?? []}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function RedZoneDetail({ lead, issues, onClose }: { lead: Lead | null; issues: string[]; onClose: () => void }) {
  const go = (hash: string) => { window.location.hash = hash; onClose(); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Red zone contact" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-red-700/60 bg-ink-900 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-black text-zinc-100">{lead ? lead.name : "Contact"}</h3>
            {lead?.company && <p className="text-sm text-zinc-400">{lead.company}</p>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-zinc-400 hover:text-zinc-100" aria-label="Close">✕</button>
        </div>

        {issues.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {issues.map(i => (
              <span key={i} className="rounded-full border border-red-700/50 bg-red-600/20 px-2.5 py-0.5 text-xs font-semibold text-red-300">{i}</span>
            ))}
          </div>
        )}

        {lead ? (
          <div className="mt-4 space-y-2 text-sm">
            <DetailRow label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} />
            <DetailRow label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
            <DetailRow label="Event" value={[lead.eventType, lead.eventDate].filter(Boolean).join(" · ")} />
            <DetailRow label="Guests" value={lead.guests != null ? String(lead.guests) : "—"} />
            <DetailRow label="Service" value={lead.serviceType ?? "—"} />
            <DetailRow label="Budget" value={lead.budgetCents != null ? formatCents(lead.budgetCents) : (lead.budgetRange ?? "—")} />
            <DetailRow label="Address" value={lead.eventAddress ?? "—"} />
            <DetailRow label="Source" value={lead.heardAbout ?? lead.source ?? "—"} />
            <DetailRow label="Stage" value={lead.stage} />
            {lead.notes && <DetailRow label="Notes" value={lead.notes} />}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Full contact record not found in the current lead list. Open the pipeline to locate it.</p>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={() => go("#/catering/pipeline")} className="flex-1 rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">Open in Leads Pipeline</button>
          <button onClick={() => go("#/catering/cockpit")} className="rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-300">Orders</button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink-800 pb-1.5">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {href ? <a href={href} className="min-w-0 truncate text-right text-fire-light hover:underline">{value || "—"}</a>
            : <span className="min-w-0 truncate text-right text-zinc-200">{value || "—"}</span>}
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
