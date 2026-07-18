import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { etParts } from "../../lib/time";

/**
 * Catering · Red Zone — V2 counterpart of the Manus sales RedZone page.
 * Expanded view of the cockpit red-zone feed: booked events inside the
 * 7-day horizon that still have open issues, sorted soonest-first with
 * urgency coloring (≤2 days red, ≤7 days amber).
 */

function todayEt(): string {
  const p = etParts(new Date());
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

export function RedZoneView() {
  const dal = getDal();
  const today = todayEt();
  const { data, isLoading } = useQuery({
    queryKey: ["cockpit", "data"],
    queryFn: () => dal.cockpit.data(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return <p className="py-20 text-center text-zinc-500">Loading red zone…</p>;

  const rows = [...data.redZone].sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">🚨 Red Zone</h1>
        <p className="text-sm text-zinc-500">Booked events in the next 7 days with unresolved issues</p>
      </header>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-green-800/50 bg-green-950/10 p-8 text-center">
          <p className="text-lg font-bold text-green-400">All clear</p>
          <p className="mt-1 text-sm text-zinc-500">No upcoming events have open issues.</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map(r => {
            const days = daysUntil(r.eventDate, today);
            const critical = days <= 2;
            const soon = days <= 7;
            const border = critical ? "border-red-700 bg-red-950/25" : soon ? "border-amber-700/70 bg-amber-950/15" : "border-ink-700 bg-ink-900";
            const dateCls = critical ? "text-red-400" : soon ? "text-amber-400" : "text-zinc-300";
            return (
              <li key={r.leadOrQuoteId} className={`rounded-2xl border-2 p-4 ${border}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-base font-bold text-zinc-100">{r.label}</p>
                  <div className="text-right">
                    <p className={`text-sm font-black ${dateCls}`}>
                      {days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : `In ${days} days`}
                    </p>
                    <p className="text-xs text-zinc-500">{fmtDate(r.eventDate)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.issues.map(issue => (
                    <span key={issue}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        critical ? "border-red-700/60 bg-red-600/20 text-red-300" : "border-amber-700/60 bg-amber-600/20 text-amber-300"
                      }`}>
                      {issue}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-500">
        Resolve issues from the <span className="font-semibold text-zinc-300">Leads Pipeline</span> tab — open the lead's
        drawer to log activity, set budget details, or adjust priority.
      </p>
    </div>
  );
}
