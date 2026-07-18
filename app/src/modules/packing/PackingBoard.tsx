import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, PackJob } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Packing · Board — V2 take on the Manus PackingBoard. Kanban-style columns
 * derived from checklist progress on the live pack queue:
 * Not started → In progress → Ready to confirm.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "border-purple-700/50 bg-purple-600/20 text-purple-300" },
  fire_drop: { label: "Fire Drop", cls: "border-fire/40 bg-fire/20 text-fire-light" },
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

  const jobs = queue ?? [];
  const byColumn: Record<ColumnKey, PackJob[]> = { not_started: [], in_progress: [], ready: [] };
  for (const job of jobs) byColumn[columnFor(job)].push(job);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading packing board…</p>;

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Packing Board</h1>
          <p className="text-sm text-zinc-500">{jobs.length} open jobs · tap a card to work its checklist</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

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
                <BoardCard key={job.id} job={job}
                  expanded={expandedId === job.id}
                  onToggleExpand={() => setExpandedId(id => (id === job.id ? null : job.id))}
                  onToggleItem={itemId => toggleMut.mutate({ jobId: job.id, itemId })} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardCard({ job, expanded, onToggleExpand, onToggleItem }: {
  job: PackJob; expanded: boolean;
  onToggleExpand: () => void; onToggleItem: (itemId: string) => void;
}) {
  const done = job.checklist.filter(i => i.done).length;
  const total = job.checklist.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900">
      <button onClick={onToggleExpand} aria-expanded={expanded}
        className="w-full min-h-[44px] p-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-bold text-zinc-100">{job.customer}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${CHANNEL_META[job.channel].cls}`}>
            {CHANNEL_META[job.channel].label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{job.orderRef} · {fmtDate(job.serviceDate)} · {job.timeWindow}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800" role="progressbar"
          aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full transition-all ${pct === 100 ? "bg-green-500" : "bg-gradient-to-r from-fire to-fire-light"}`}
            style={{ width: `${pct}%` }} />
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
