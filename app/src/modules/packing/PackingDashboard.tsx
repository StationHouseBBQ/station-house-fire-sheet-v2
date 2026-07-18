import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, PackJob } from "../../dal/types";
import { etParts } from "../../lib/time";

/**
 * Packing · Dashboard — V2 take on the Manus PackingStationDashboard.
 * Read-only station overview: headline stats plus a date-filtered summary
 * of upcoming pack jobs. All numbers derive from the same queue the
 * Pack Queue and Board screens work from.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "border-purple-700/50 bg-purple-600/20 text-purple-300" },
  fire_drop: { label: "Fire Drop", cls: "border-fire/40 bg-fire/20 text-fire-light" },
  cuban_thursday: { label: "Cuban Thursday", cls: "border-emerald-700/50 bg-emerald-600/20 text-emerald-300" },
  retail: { label: "Retail", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300" },
  walk_in: { label: "Walk-in", cls: "border-ink-700 bg-ink-800 text-zinc-300" },
};

type DateFilter = "today" | "tomorrow" | "week" | "all";

const FILTERS: Array<{ key: DateFilter; label: string }> = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This Week" },
  { key: "all", label: "All" },
];

function etToday(): string {
  const p = etParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function PackingDashboard() {
  const dal = getDal();
  const [filter, setFilter] = useState<DateFilter>("today");
  const today = etToday();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);

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
  const inProgress = jobs.filter(j => {
    const done = j.checklist.filter(i => i.done).length;
    return done > 0 && done < j.checklist.length;
  }).length;
  const enRoute = (deliveries ?? []).filter(d => d.status === "en_route").length;

  const stats: Array<{ label: string; value: number; accent: string }> = [
    { label: "Jobs in queue", value: jobs.length, accent: "text-zinc-100" },
    { label: "In progress", value: inProgress, accent: "text-amber-400" },
    { label: "Packed today", value: (packed ?? []).length, accent: "text-green-400" },
    { label: "Deliveries en route", value: enRoute, accent: "text-fire-light" },
  ];

  const filtered = jobs.filter(j => {
    if (filter === "today") return j.serviceDate === today;
    if (filter === "tomorrow") return j.serviceDate === tomorrow;
    if (filter === "week") return j.serviceDate >= today && j.serviceDate <= weekEnd;
    return true;
  });

  const byDate = new Map<string, PackJob[]>();
  for (const j of [...filtered].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))) {
    const list = byDate.get(j.serviceDate) ?? [];
    list.push(j);
    byDate.set(j.serviceDate, list);
  }

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Packing Dashboard</h1>
        <p className="text-sm text-zinc-500">Station overview · {fmtDate(today)}</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <p className={`text-3xl font-black ${s.accent}`}>{s.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter jobs by date">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
              filter === f.key ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-300"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {byDate.size === 0 ? (
        <p className="mt-8 py-12 text-center text-sm text-zinc-500">No pack jobs match this filter.</p>
      ) : (
        [...byDate.entries()].map(([date, dayJobs]) => (
          <section key={date} className="mt-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              {fmtDate(date)}{date === today ? " · Today" : date === tomorrow ? " · Tomorrow" : ""}
              <span className="ml-2 rounded-full bg-ink-800 px-2 py-0.5 text-xs text-zinc-300">{dayJobs.length}</span>
            </h2>
            <ul className="mt-2 space-y-2">
              {dayJobs.map(j => {
                const done = j.checklist.filter(i => i.done).length;
                const total = j.checklist.length;
                return (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-100">
                        {j.customer} <span className="font-normal text-zinc-500">· {j.orderRef}</span>
                      </p>
                      <p className="text-xs text-zinc-500">{j.timeWindow}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${CHANNEL_META[j.channel].cls}`}>
                        {CHANNEL_META[j.channel].label}
                      </span>
                      <span className={`text-xs font-semibold ${done === total && total > 0 ? "text-green-400" : done > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                        {done}/{total} packed
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
