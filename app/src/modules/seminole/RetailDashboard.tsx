import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { RetailItemStatus } from "../../dal/types";
import { formatCents } from "../../lib/money";

/**
 * Seminole · Retail Dashboard — V2 counterpart of the Manus RetailDashboard.
 * At-a-glance FOH stats: preorder pickup counts + revenue, today's fire-sheet
 * case status, and the Weekend Pre-Order ordering-window state per the authoritative
 * ET rules (see src/lib/time.ts).
 */

const ITEM_STATUS_META: Record<RetailItemStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  firing: { label: "Firing", cls: "bg-amber-600 text-white" },
  in_case: { label: "In Case", cls: "bg-green-600 text-white" },
  sold_out_86: { label: "86'd", cls: "bg-red-600 text-white" },
};

const ITEM_STATUSES: RetailItemStatus[] = ["queued", "firing", "in_case", "sold_out_86"];

export function RetailDashboard() {
  const dal = getDal();

  const { data: stats } = useQuery({
    queryKey: ["preorders", "stats"],
    queryFn: () => dal.preorders.stats(),
    refetchInterval: 30_000,
  });
  const { data: session } = useQuery({
    queryKey: ["retailFireSheet", "session"],
    queryFn: () => dal.retailFireSheet.getSession(),
    refetchInterval: 30_000,
  });
  const { data: drop } = useQuery({
    queryKey: ["fireDrop", "currentDrop"],
    queryFn: () => dal.fireDrop.currentDrop(),
    refetchInterval: 60_000,
  });
  const ordering = dal.fireDrop.orderingStatus();

  const counts: Record<RetailItemStatus, number> = { queued: 0, firing: 0, in_case: 0, sold_out_86: 0 };
  for (const it of session?.items ?? []) counts[it.status]++;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Seminole Heights · Retail</h1>
        <p className="text-sm text-zinc-500">Preorders, case status, and Weekend Pre-Order windows at a glance</p>
      </header>

      {/* Preorder stats */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Preorder stats">
        <StatCard label="Active pickups" value={stats ? String(stats.activeCount) : "—"} />
        <StatCard label="Friday" value={stats ? String(stats.fridayCount) : "—"} />
        <StatCard label="Saturday" value={stats ? String(stats.saturdayCount) : "—"} />
        <StatCard label="Active revenue" value={stats ? formatCents(stats.activeRevenueCents) : "—"} accent />
      </section>

      {/* Today's fire sheet */}
      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Today's fire sheet">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
            🔥 Today's Fire Sheet {session && <span className="font-normal text-zinc-500">· {session.serviceDate}</span>}
          </h2>
          {session?.submittedToKitchenAt ? (
            <span className="rounded-full border border-green-700/50 bg-green-950/40 px-3 py-1 text-xs font-bold text-green-400">
              Submitted to kitchen ·{" "}
              {new Date(session.submittedToKitchenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          ) : (
            <span className="rounded-full border border-ink-700 bg-ink-800 px-3 py-1 text-xs font-semibold text-zinc-400">
              Not yet submitted
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ITEM_STATUSES.map(s => (
            <div key={s} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5">
              <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${ITEM_STATUS_META[s].cls}`}>
                {ITEM_STATUS_META[s].label}
              </span>
              <span className="text-lg font-black text-zinc-100">{counts[s]}</span>
            </div>
          ))}
        </div>
        {session && session.items.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500">No items on today's sheet yet — sync from PAR on the Fire Sheet tab.</p>
        )}
      </section>

      {/* Weekend Pre-Order ordering windows */}
      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Weekend Pre-Order ordering windows">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">🛒 Weekend Pre-Order Ordering</h2>
          {drop && <span className="text-sm font-bold text-fire-light">{drop.title}</span>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <WindowCard day="Friday" date={drop?.fridayDate ?? null} open={ordering.friday}
            rule="Ordering closes Thursday 5:00 PM ET" />
          <WindowCard day="Saturday" date={drop?.saturdayDate ?? null} open={ordering.saturday}
            rule="Ordering opens Thursday 5:00 PM ET · closes Friday 3:00 PM ET" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function WindowCard({ day, date, open, rule }: { day: string; date: string | null; open: boolean; rule: string }) {
  return (
    <div className={`rounded-xl border p-4 ${open ? "border-green-700/50 bg-green-950/20" : "border-ink-700 bg-ink-800"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-zinc-100">{day}</p>
          <p className="text-xs text-zinc-500">{date ?? "—"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
          open ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {open ? "Open" : "Closed"}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{rule}</p>
    </div>
  );
}
