import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { etParts } from "../../lib/time";
import type { CateringOrder } from "../../dal/types";
import { currentTime } from "../../lib/clock";
import { getRecovery, setRecovery } from "./_data/overlay";
import { useOverlayVersion } from "./_data/useOverlayVersion";

/**
 * Catering - Red Zone: V2 counterpart of the Manus sales RedZone page.
 * Expanded view of the cockpit red-zone feed: booked leads and catering orders
 * inside the 7-day horizon that still have open issues, sorted soonest-first
 * with urgency coloring. Adds a per-row "Recovered" action (with a recovery
 * note) and a show/hide-resolved toggle. Recovery state rides a module-local
 * overlay keyed by the row id (noted in report).
 */

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function daysUntil(iso: string, today: string): number {
  const a = Date.parse(today + "T12:00:00Z");
  const b = Date.parse(iso + "T12:00:00Z");
  return Math.round((b - a) / 86_400_000);
}
function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

/** Lifecycle orders needing attention, translated into red-zone rows. */
function lifecycleIssues(o: CateringOrder, today: string): Array<{ leadOrQuoteId: string; label: string; eventDate: string; issues: string[] }> {
  const issues: string[] = [];
  const eventDate = o.event.eventDate;
  const daysToEvent = eventDate ? daysUntil(eventDate, today) : null;
  if (o.stage === "quote_sent" && o.quoteSentAt) {
    const sent = o.quoteSentAt.slice(0, 10);
    if (daysUntil(today, sent) >= 3) issues.push("Quote sent >3 days ago — no response");
  }
  if (o.stage === "invoiced" && o.paidCents < o.totalCents && daysToEvent !== null && daysToEvent <= 7 && daysToEvent >= 0) {
    issues.push("Invoiced & unpaid — event within 7 days");
  }
  if (o.stage === "in_kitchen" && !o.kitchen.pullSheetConfirmed) {
    issues.push("In kitchen — pull sheet not confirmed");
  }
  if (o.event.serviceType === "Full Service" && (o.staff ?? []).length === 0 && daysToEvent !== null && daysToEvent <= 3 && daysToEvent >= 0
      && o.stage !== "completed" && o.stage !== "lost" && o.stage !== "cancelled") {
    issues.push("Full Service in ≤3 days — no staff assigned");
  }
  if (issues.length === 0 || !eventDate) return [];
  return [{ leadOrQuoteId: `order-${o.id}`, label: `${o.ref} · ${o.customer}`, eventDate, issues }];
}

export function RedZoneView() {
  const dal = getDal();
  const today = todayEt();
  useOverlayVersion();
  const [showResolved, setShowResolved] = useState(false);
  const [recovering, setRecovering] = useState<{ id: string; label: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cockpit", "data"],
    queryFn: () => dal.cockpit.data(),
    refetchInterval: 30_000,
  });
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const allRows = useMemo(() => {
    if (!data) return [];
    const orderIssues = orders.flatMap(o => lifecycleIssues(o, today));
    return [...data.redZone, ...orderIssues].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [data, orders, today]);

  if (isLoading || !data || loadingOrders) return <p className="py-20 text-center text-zinc-500">Loading red zone...</p>;

  const rows = allRows.filter(r => showResolved || !getRecovery(r.leadOrQuoteId).resolved);
  const activeCount = allRows.filter(r => !getRecovery(r.leadOrQuoteId).resolved).length;
  const resolvedCount = allRows.length - activeCount;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🚨 Red Zone</h1>
          <p className="text-sm text-zinc-500">
            {activeCount} active{resolvedCount > 0 && ` · ${resolvedCount} recovered`}
          </p>
        </div>
        {resolvedCount > 0 && (
          <button onClick={() => setShowResolved(x => !x)}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-300">
            {showResolved ? "Hide recovered" : "Show recovered"}
          </button>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-green-800/50 bg-green-950/10 p-8 text-center">
          <p className="text-lg font-bold text-green-400">Red Zone is clear</p>
          <p className="mt-1 text-sm text-zinc-500">No upcoming events need recovery right now.</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map(r => {
            const rec = getRecovery(r.leadOrQuoteId);
            const days = daysUntil(r.eventDate, today);
            const critical = days <= 2;
            const soon = days <= 7;
            const border = rec.resolved
              ? "border-green-800/50 bg-green-950/10 opacity-70"
              : critical ? "border-red-700 bg-red-950/25" : soon ? "border-amber-700/70 bg-amber-950/15" : "border-ink-700 bg-ink-900";
            const dateCls = rec.resolved ? "text-green-400" : critical ? "text-red-400" : soon ? "text-amber-400" : "text-zinc-300";
            return (
              <li key={r.leadOrQuoteId} className={`rounded-2xl border-2 p-4 ${border}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-base font-bold text-zinc-100">
                    {r.label}
                    {rec.resolved && <span className="ml-2 rounded-full border border-green-700/60 bg-green-600/20 px-2 py-0.5 text-[10px] font-black uppercase text-green-300">Recovered</span>}
                  </p>
                  <div className="text-right">
                    <p className={`text-sm font-black ${dateCls}`}>
                      {days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : days < 0 ? `${-days}d ago` : `In ${days} days`}
                    </p>
                    <p className="text-xs text-zinc-500">{fmtDate(r.eventDate)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.issues.map(issue => (
                    <span key={issue}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        rec.resolved ? "border-ink-700 bg-ink-800 text-zinc-500" : critical ? "border-red-700/60 bg-red-600/20 text-red-300" : "border-amber-700/60 bg-amber-600/20 text-amber-300"
                      }`}>
                      {issue}
                    </span>
                  ))}
                </div>
                {rec.note && (
                  <p className="mt-2 rounded-lg border border-green-800/40 bg-green-950/20 px-3 py-2 text-xs text-green-300">
                    ✓ {rec.note}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {rec.resolved ? (
                    <button onClick={() => setRecovery(r.leadOrQuoteId, { resolved: false, note: "", resolvedAt: null })}
                      className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300">Reopen</button>
                  ) : (
                    <button onClick={() => setRecovering({ id: r.leadOrQuoteId, label: r.label })}
                      className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white">Mark Recovered</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-500">
        Order rows (ref-prefixed) resolve in the <span className="font-semibold text-zinc-300">Director Cockpit</span> —
        chase the quote, record payment, confirm the pull sheet, or assign staff. Lead rows resolve from the{" "}
        <span className="font-semibold text-zinc-300">Leads Pipeline</span> drawer. Marking a row recovered here logs a
        recovery note and removes it from the active list.
      </p>

      {recovering && (
        <RecoverDialog label={recovering.label}
          onCancel={() => setRecovering(null)}
          onSubmit={note => {
            setRecovery(recovering.id, { resolved: true, note, resolvedAt: currentTime().toISOString() });
            setRecovering(null);
          }} />
      )}
    </div>
  );
}

function RecoverDialog({ label, onSubmit, onCancel }: { label: string; onSubmit: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div role="dialog" aria-modal="true" aria-label="Mark recovered"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit(note.trim() || "Recovered"); }}>
        <h3 className="text-lg font-bold text-zinc-100">Mark recovered</h3>
        <p className="mt-1 text-sm text-zinc-500">{label}</p>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Recovery note
          <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="What resolved it? (e.g. deposit collected, staff assigned)"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit"
            className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white">Mark Recovered</button>
        </div>
      </form>
    </div>
  );
}
