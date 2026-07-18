import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, PackJob } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";

/**
 * Packing · Pack Queue — V2 implementation of the Manus PackingQueue.
 * Job cards with per-item packing checklists, progress ring, and a
 * Confirm Packed action gated on every item being checked.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "border-purple-700/50 bg-purple-600/20 text-purple-300" },
  fire_drop: { label: "Fire Drop", cls: "border-fire/40 bg-fire/20 text-fire-light" },
  cuban_thursday: { label: "Cuban Thursday", cls: "border-emerald-700/50 bg-emerald-600/20 text-emerald-300" },
  retail: { label: "Retail", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300" },
  walk_in: { label: "Walk-in", cls: "border-ink-700 bg-ink-800 text-zinc-300" },
};

function etToday(): string {
  const p = etParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
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

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`${done} of ${total} items packed`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="#26262a" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={pct === 1 ? "#16a34a" : "#ff5a1f"} strokeWidth="5"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="#e4e4e7">{done}/{total}</text>
    </svg>
  );
}

export function PackQueue() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const [sync, setSync] = useState<Sync>("idle");
  const [packedOpen, setPackedOpen] = useState(false);
  const [confirmErr, setConfirmErr] = useState<Record<string, string>>({});
  const today = etToday();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["packing", "queue"],
    queryFn: () => dal.packing.queue(),
    refetchInterval: 30_000,
  });
  const { data: packed } = useQuery({
    queryKey: ["packing", "packedToday"],
    queryFn: () => dal.packing.packedToday(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["packing", "queue"] });
    void qc.invalidateQueries({ queryKey: ["packing", "packedToday"] });
  };

  const toggleMut = useMutation({
    mutationFn: ({ jobId, itemId }: { jobId: string; itemId: string }) =>
      withSync(dal.packing.toggleChecklistItem(jobId, itemId, actor)),
    onSuccess: invalidate,
  });
  const confirmMut = useMutation({
    mutationFn: (jobId: string) => withSync(dal.packing.confirmPacked(jobId, actor)),
    onSuccess: (_job, jobId) => {
      setConfirmErr(prev => { const { [jobId]: _drop, ...rest } = prev; return rest; });
      invalidate();
    },
    onError: (e, jobId) => {
      setConfirmErr(prev => ({ ...prev, [jobId]: e instanceof Error ? e.message : "Could not confirm packed" }));
    },
  });

  const jobs = queue ?? [];
  const packedJobs = packed ?? [];

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading pack queue…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Pack Queue</h1>
          <p className="text-sm text-zinc-500">{jobs.length} to pack · {packedJobs.length} packed today</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {jobs.length === 0 ? (
        <div className="mt-10 py-16 text-center">
          <p className="text-base font-semibold text-zinc-300">Nothing waiting to be packed</p>
          <p className="mt-1 text-sm text-zinc-500">New orders will appear here automatically</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} today={today}
              error={confirmErr[job.id] ?? null}
              confirmBusy={confirmMut.isPending && confirmMut.variables === job.id}
              onToggle={itemId => toggleMut.mutate({ jobId: job.id, itemId })}
              onConfirm={() => confirmMut.mutate(job.id)} />
          ))}
        </ul>
      )}

      <section className="mt-8">
        <button onClick={() => setPackedOpen(o => !o)} aria-expanded={packedOpen}
          className="flex w-full items-center justify-between rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-left">
          <span className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            Packed today ({packedJobs.length})
          </span>
          <span className="text-zinc-500" aria-hidden="true">{packedOpen ? "▾" : "▸"}</span>
        </button>
        {packedOpen && (
          packedJobs.length === 0
            ? <p className="px-4 py-3 text-sm text-zinc-500">Nothing packed yet today.</p>
            : (
              <ul className="mt-2 space-y-2">
                {packedJobs.map(job => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-300">{job.customer} <span className="font-normal text-zinc-500">· {job.orderRef}</span></p>
                      <p className="text-xs text-zinc-500">{fmtDate(job.serviceDate)} · {job.timeWindow}</p>
                    </div>
                    <p className="text-xs font-semibold text-green-400">
                      ✓ {job.packedBy ?? "unknown"}{job.packedAt ? ` · ${fmtTime(job.packedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )
        )}
      </section>
    </div>
  );
}

function JobCard({ job, today, error, confirmBusy, onToggle, onConfirm }: {
  job: PackJob; today: string; error: string | null; confirmBusy: boolean;
  onToggle: (itemId: string) => void; onConfirm: () => void;
}) {
  const done = job.checklist.filter(i => i.done).length;
  const total = job.checklist.length;
  const allDone = total > 0 && done === total;
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-bold text-zinc-100">{job.customer}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${CHANNEL_META[job.channel].cls}`}>
              {CHANNEL_META[job.channel].label}
            </span>
            {job.serviceDate === today && (
              <span className="rounded-full border border-amber-700/50 bg-amber-600/20 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-300">Today</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">{job.orderRef} · {fmtDate(job.serviceDate)} · {job.timeWindow}</p>
        </div>
        <ProgressRing done={done} total={total} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {job.checklist.map(item => (
          <li key={item.id}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
              <input type="checkbox" checked={item.done} onChange={() => onToggle(item.id)}
                className="h-5 w-5 accent-orange-600" aria-label={`Packed: ${item.label}`} />
              <span className={`text-sm ${item.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

      <button onClick={onConfirm} disabled={!allDone || confirmBusy}
        className="mt-3 w-full rounded-lg bg-fire px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        title={allDone ? "Confirm this order is packed" : "Check every item before confirming"}>
        {confirmBusy ? "Confirming…" : allDone ? "Confirm Packed" : `Confirm Packed (${done}/${total} checked)`}
      </button>
    </li>
  );
}
