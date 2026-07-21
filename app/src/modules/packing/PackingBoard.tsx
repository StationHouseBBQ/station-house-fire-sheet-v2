import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, PackJob } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Packing · Board — V2 take on the Manus PackingBoard. A 14-day date strip
 * with per-day sheet counts, a search box, a Board (kanban by checklist
 * progress) / Calendar (grouped by date) view toggle, and inline item
 * check-off. Columns derive from live pack-queue checklist progress.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "border-purple-700/50 bg-purple-600/20 text-purple-300" },
  fire_drop: { label: "Weekend Pre-Order", cls: "border-fire/40 bg-fire/20 text-fire-light" },
  cuban_thursday: { label: "Cuban Thursday", cls: "border-emerald-700/50 bg-emerald-600/20 text-emerald-300" },
  retail: { label: "Retail", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300" },
  walk_in: { label: "Walk-in", cls: "border-ink-700 bg-ink-800 text-zinc-300" },
};

type ColumnKey = "not_started" | "in_progress" | "ready";
const COLUMNS: Array<{ key: ColumnKey; title: string; accent: string }> = [
  { key: "not_started", title: "Not started", accent: "border-t-zinc-600" },
  { key: "in_progress", title: "In progress", accent: "border-t-amber-500" },
  { key: "ready", title: "Ready to confirm", accent: "border-t-green-500" },
];
function columnFor(job: PackJob): ColumnKey {
  const done = job.checklist.filter(i => i.done).length;
  if (done === 0) return "not_started";
  if (done === job.checklist.length) return "ready";
  return "in_progress";
}

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
function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

type Sync = "idle" | "saving" | "saved" | "error";
function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

export function PackingBoardView() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const [sync, setSync] = useState<Sync>("idle");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "calendar">("board");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<string | "all">("all");
  const today = etToday();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["packing", "queue"],
    queryFn: () => dal.packing.queue(),
    refetchInterval: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ jobId, itemId }: { jobId: string; itemId: string }) => {
      setSync("saving");
      return dal.packing.toggleChecklistItem(jobId, itemId, actor)
        .then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["packing", "queue"] }); },
  });

  const allJobs = queue ?? [];
  const countByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of allJobs) m[j.serviceDate] = (m[j.serviceDate] ?? 0) + 1;
    return m;
  }, [allJobs]);
  const strip = useMemo(() => Array.from({ length: 15 }, (_, i) => addDays(today, i - 1)), [today]);

  const jobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allJobs.filter(j => {
      if (dateFilter !== "all" && j.serviceDate !== dateFilter) return false;
      if (q && !j.customer.toLowerCase().includes(q) && !j.orderRef.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allJobs, dateFilter, search]);

  const byColumn: Record<ColumnKey, PackJob[]> = { not_started: [], in_progress: [], ready: [] };
  for (const job of jobs) byColumn[columnFor(job)].push(job);

  const byDate = useMemo(() => {
    const map = new Map<string, PackJob[]>();
    for (const j of [...jobs].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))) {
      const list = map.get(j.serviceDate) ?? [];
      list.push(j);
      map.set(j.serviceDate, list);
    }
    return [...map.entries()];
  }, [jobs]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading packing board…</p>;

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Packing Board</h1>
          <p className="text-sm text-zinc-500">{jobs.length} of {allJobs.length} jobs · tap a card to work its checklist</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink-700 bg-ink-800 p-0.5">
            {(["board", "calendar"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-bold capitalize ${view === v ? "bg-fire text-white" : "text-zinc-400"}`}>
                {v}
              </button>
            ))}
          </div>
          <SyncBadge sync={sync} />
        </div>
      </header>

      {/* Date strip */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <button onClick={() => setDateFilter("all")} aria-pressed={dateFilter === "all"}
          className={`flex min-w-[52px] flex-col items-center rounded-lg border px-2 py-1.5 text-xs ${dateFilter === "all" ? "border-fire/60 bg-fire/20 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-400"}`}>
          <span className="font-medium">All</span>
          <span className="text-base font-bold">{allJobs.length}</span>
        </button>
        {strip.map(d => {
          const count = countByDate[d] ?? 0;
          const isToday = d === today;
          const isSel = d === dateFilter;
          const day = Number(d.split("-")[2]);
          return (
            <button key={d} onClick={() => setDateFilter(d)} aria-pressed={isSel}
              className={`flex min-w-[52px] flex-col items-center rounded-lg border px-2 py-1.5 text-xs ${
                isSel ? "border-fire/60 bg-fire/20 text-fire-light" : isToday ? "border-ink-600 bg-ink-700 text-zinc-200" : "border-ink-700 bg-ink-800 text-zinc-400"}`}>
              <span className="font-medium">{new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span className="text-base font-bold">{day}</span>
              {count > 0 && <span className="text-[10px] font-bold text-fire-light">{count}</span>}
            </button>
          );
        })}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer or order ref…"
        className="mt-3 min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        aria-label="Search packing board" />

      {jobs.length === 0 ? (
        <p className="mt-8 py-12 text-center text-sm text-zinc-500">No pack jobs match this filter.</p>
      ) : view === "board" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map(col => (
            <section key={col.key} className={`rounded-xl border border-ink-700 border-t-4 bg-ink-950/40 p-3 ${col.accent}`}>
              <h2 className="flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wider text-zinc-400">
                {col.title}
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs text-zinc-300">{byColumn[col.key].length}</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {byColumn[col.key].length === 0 && (
                  <li className="rounded-lg border border-dashed border-ink-700 px-3 py-6 text-center text-xs text-zinc-600">Empty</li>
                )}
                {byColumn[col.key].map(job => (
                  <BoardCard key={job.id} job={job} today={today} expanded={expandedId === job.id}
                    onToggleExpand={() => setExpandedId(id => (id === job.id ? null : job.id))}
                    onToggleItem={itemId => toggleMut.mutate({ jobId: job.id, itemId })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {byDate.map(([date, dateJobs]) => (
            <section key={date}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-fire-light">{fmtDate(date)}{date === today ? " · Today" : ""}</h2>
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs text-zinc-300">{dateJobs.length}</span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dateJobs.map(job => (
                  <BoardCard key={job.id} job={job} today={today} expanded={expandedId === job.id}
                    onToggleExpand={() => setExpandedId(id => (id === job.id ? null : job.id))}
                    onToggleItem={itemId => toggleMut.mutate({ jobId: job.id, itemId })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({ job, today, expanded, onToggleExpand, onToggleItem }: {
  job: PackJob; today: string; expanded: boolean;
  onToggleExpand: () => void; onToggleItem: (itemId: string) => void;
}) {
  const done = job.checklist.filter(i => i.done).length;
  const total = job.checklist.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900">
      <button onClick={onToggleExpand} aria-expanded={expanded} className="min-h-[44px] w-full p-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-bold text-zinc-100">{job.customer}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${CHANNEL_META[job.channel].cls}`}>
            {CHANNEL_META[job.channel].label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {job.orderRef} · {fmtDate(job.serviceDate)}{job.serviceDate === today ? " · Today" : ""} · {job.timeWindow}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full transition-all ${pct === 100 ? "bg-green-500" : "bg-gradient-to-r from-fire to-fire-light"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">{done}/{total} packed</p>
      </button>
      {expanded && (
        <ul className="space-y-1.5 border-t border-ink-700 p-3">
          {job.checklist.map(item => (
            <li key={item.id}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
                <input type="checkbox" checked={item.done} onChange={() => onToggleItem(item.id)}
                  className="h-5 w-5 accent-orange-600" aria-label={`Packed: ${item.label}`} />
                <span className={`text-sm ${item.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
