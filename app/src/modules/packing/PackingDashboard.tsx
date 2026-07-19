import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, PackJob } from "../../dal/types";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Packing · Dashboard — V2 take on the Manus PackingStationDashboard.
 * Station overview: urgency-aware headline stats (today · this week ·
 * urgent-not-ready · ready/done), search, status + date filters, and a
 * date-sorted gig list with urgency badges and packing progress. All
 * numbers derive from the same queue the Pack Queue and Board work from.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "border-purple-700/50 bg-purple-600/20 text-purple-300" },
  fire_drop: { label: "Weekend Pre-Order", cls: "border-fire/40 bg-fire/20 text-fire-light" },
  cuban_thursday: { label: "Cuban Thursday", cls: "border-emerald-700/50 bg-emerald-600/20 text-emerald-300" },
  retail: { label: "Retail", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300" },
  walk_in: { label: "Walk-in", cls: "border-ink-700 bg-ink-800 text-zinc-300" },
};

type PackState = "not_started" | "in_progress" | "ready";
function packStateOf(j: PackJob): PackState {
  const done = j.checklist.filter(i => i.done).length;
  if (done === 0) return "not_started";
  if (done === j.checklist.length && j.checklist.length > 0) return "ready";
  return "in_progress";
}

type DateFilter = "today" | "tomorrow" | "this_week" | "upcoming";
const DATE_FILTERS: Array<{ key: DateFilter; label: string }> = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "this_week", label: "This Week" },
  { key: "upcoming", label: "All Upcoming" },
];
type StatusFilter = "all" | PackState;
const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "ready", label: "Ready" },
];

function etToday(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function UrgencyBadge({ days }: { days: number }) {
  if (days < 0) return <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">Past</span>;
  if (days === 0) return <span className="animate-pulse rounded-full bg-orange-900/40 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-300">Today</span>;
  if (days === 1) return <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">Tomorrow</span>;
  if (days <= 3) return <span className="rounded-full bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">{days}d away</span>;
  return <span className="text-[10px] text-zinc-500">{days}d away</span>;
}

export function PackingDashboard() {
  const dal = getDal();
  const [dateFilter, setDateFilter] = useState<DateFilter>("upcoming");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const today = etToday();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  const { data: queue } = useQuery({
    queryKey: ["packing", "queue"],
    queryFn: () => dal.packing.queue(),
    refetchInterval: 30_000,
  });
  const { data: packed } = useQuery({
    queryKey: ["packing", "packedToday"],
    queryFn: () => dal.packing.packedToday(),
    refetchInterval: 30_000,
  });
  const { data: deliveries } = useQuery({
    queryKey: ["deliveries", "list"],
    queryFn: () => dal.deliveries.list(),
    refetchInterval: 30_000,
  });

  const jobs = queue ?? [];

  const todayCount = jobs.filter(j => j.serviceDate === today).length;
  const weekCount = jobs.filter(j => j.serviceDate >= today && j.serviceDate <= weekEnd).length;
  const urgentNotReady = jobs.filter(j => {
    const d = daysUntil(j.serviceDate, today);
    return d >= 0 && d <= 1 && packStateOf(j) !== "ready";
  }).length;
  const readyDone = jobs.filter(j => packStateOf(j) === "ready").length + (packed ?? []).length;
  const enRoute = (deliveries ?? []).filter(d => d.status === "en_route").length;

  const stats: Array<{ label: string; value: number; cls: string }> = [
    { label: "Today", value: todayCount, cls: "border-orange-800/50 bg-orange-950/20 text-orange-400" },
    { label: "This week", value: weekCount, cls: "border-sky-800/50 bg-sky-950/20 text-sky-400" },
    { label: "Urgent (≤1d, not ready)", value: urgentNotReady, cls: "border-red-800/50 bg-red-950/20 text-red-400" },
    { label: "Ready / done", value: readyDone, cls: "border-green-800/50 bg-green-950/20 text-green-400" },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter(j => {
      const d = daysUntil(j.serviceDate, today);
      let matchDate = true;
      if (dateFilter === "today") matchDate = j.serviceDate === today;
      else if (dateFilter === "tomorrow") matchDate = j.serviceDate === tomorrow;
      else if (dateFilter === "this_week") matchDate = d >= 0 && d <= 7;
      else matchDate = d >= 0;
      const matchStatus = statusFilter === "all" || packStateOf(j) === statusFilter;
      const matchSearch = !q || j.customer.toLowerCase().includes(q) || j.orderRef.toLowerCase().includes(q);
      return matchDate && matchStatus && matchSearch;
    }).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.timeWindow.localeCompare(b.timeWindow));
  }, [jobs, dateFilter, statusFilter, search, today, tomorrow]);

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Packing Station</h1>
        <p className="text-sm text-zinc-500">All gigs to pack — sorted by service date · {fmtDate(today)} · {enRoute} en route</p>
      </header>

      {/* Urgency-aware stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.cls}`}>
            <p className="text-3xl font-black">{s.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-5 space-y-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer or order ref…"
          className="min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          aria-label="Search gigs" />
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by date">
            {DATE_FILTERS.map(f => (
              <Chip key={f.key} active={dateFilter === f.key} onClick={() => setDateFilter(f.key)}>{f.label}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map(f => (
              <Chip key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>{f.label}</Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Gig list */}
      {filtered.length === 0 ? (
        <p className="mt-8 py-12 text-center text-sm text-zinc-500">No gigs match your filters.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {filtered.map(j => {
            const days = daysUntil(j.serviceDate, today);
            const state = packStateOf(j);
            const done = j.checklist.filter(i => i.done).length;
            const total = j.checklist.length;
            const isUrgent = days >= 0 && days <= 1 && state !== "ready";
            const rail = days === 0 ? "bg-orange-500" : days === 1 ? "bg-amber-500" : state === "ready" ? "bg-green-500" : "bg-ink-700";
            return (
              <li key={j.id}
                className={`flex items-stretch gap-3 rounded-xl border p-3 ${isUrgent ? "border-orange-800/40 bg-orange-950/20" : "border-ink-700 bg-ink-900"}`}>
                <div className={`w-1.5 shrink-0 rounded-full ${rail}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold text-zinc-100">{j.customer}</p>
                    <UrgencyBadge days={days} />
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${CHANNEL_META[j.channel].cls}`}>
                      {CHANNEL_META[j.channel].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {j.orderRef} · {new Date(`${j.serviceDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {j.timeWindow}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center gap-1">
                  <span className={`text-xs font-bold ${state === "ready" ? "text-green-400" : state === "in_progress" ? "text-amber-400" : "text-zinc-500"}`}>
                    {state === "ready" ? "Ready" : state === "in_progress" ? "In progress" : "Not started"}
                  </span>
                  <span className="text-[11px] text-zinc-500">{done}/{total} packed</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-[36px] whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${active ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
      {children}
    </button>
  );
}
