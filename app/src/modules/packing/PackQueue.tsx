import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OrderChannel, PackJob } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import {
  CHECKLIST_CATEGORY_LABELS, CHECKLIST_CATEGORY_ORDER, categorizeChecklistItem,
} from "./_data/checklistGroup";

/**
 * Packing · Pack Queue — V2 implementation of the Manus PackingQueue.
 * Three-section flow (Ready to pack · Coming next · Packed today) with a
 * "jump to" bar, category-grouped packing checklists (proteins / sides /
 * sauces / equipment / marketing), a Confirm-Packed action gated on every
 * item, and an Unpack action with an audited reason.
 */

const CHANNEL_META: Record<OrderChannel, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "border-purple-700/50 bg-purple-600/20 text-purple-300" },
  fire_drop: { label: "Weekend Pre-Order", cls: "border-fire/40 bg-fire/20 text-fire-light" },
  cuban_thursday: { label: "Cuban Thursday", cls: "border-emerald-700/50 bg-emerald-600/20 text-emerald-300" },
  retail: { label: "Retail", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300" },
  walk_in: { label: "Walk-in", cls: "border-ink-700 bg-ink-800 text-zinc-300" },
};

/** Delivery orders vs pickup — inferred from channel for the service badge. */
function serviceMeta(channel: OrderChannel): { label: string; cls: string } {
  if (channel === "catering") return { label: "Delivery", cls: "border-sky-700/50 bg-sky-600/15 text-sky-300" };
  return { label: "Pickup", cls: "border-purple-700/50 bg-purple-600/15 text-purple-300" };
}

function etToday(): string {
  const p = etParts(currentTime());
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
  const [unpackTarget, setUnpackTarget] = useState<PackJob | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);
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
      setOpenJob(null);
      invalidate();
    },
    onError: (e, jobId) => {
      setConfirmErr(prev => ({ ...prev, [jobId]: e instanceof Error ? e.message : "Could not confirm packed" }));
    },
  });
  const unpackMut = useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
      withSync(dal.packing.unpack(jobId, reason, actor)),
    onSuccess: () => { setUnpackTarget(null); invalidate(); },
  });

  const jobs = queue ?? [];
  const packedJobs = packed ?? [];

  // Sort by service date then window for stable ordering across sections.
  const sorted = useMemo(
    () => [...jobs].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.timeWindow.localeCompare(b.timeWindow)),
    [jobs],
  );
  // "Ready to pack" = work started (or all items ready to check); "Coming next" = untouched.
  const readyToPack = sorted.filter(j => j.checklist.some(i => i.done));
  const comingNext = sorted.filter(j => !j.checklist.some(i => i.done));

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading pack queue…</p>;

  const jumpTargets = [...readyToPack, ...comingNext];

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Pack Queue</h1>
          <p className="text-sm text-zinc-500">
            {readyToPack.length} ready · {comingNext.length} coming · {packedJobs.length} packed today · {fmtDate(today)}
          </p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Jump bar */}
      {jumpTargets.length > 1 && (
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">Jump to</span>
          {jumpTargets.map(j => {
            const started = j.checklist.some(i => i.done);
            return (
              <button key={j.id}
                onClick={() => { const el = document.getElementById(`pack-job-${j.id}`); el?.scrollIntoView({ behavior: "smooth", block: "start" }); setOpenJob(j.id); }}
                className={`flex-none rounded-full border px-3 py-1.5 text-xs font-bold ${started ? "border-fire/60 bg-fire/15 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"}`}>
                {j.customer.split(" ")[0]} · {j.timeWindow.split("–")[0]?.trim() || j.timeWindow}
              </button>
            );
          })}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="mt-10 py-16 text-center">
          <p className="text-base font-semibold text-zinc-300">Nothing waiting to be packed</p>
          <p className="mt-1 text-sm text-zinc-500">New orders will appear here automatically</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <Section title="Ready to pack now" count={readyToPack.length} accent="text-orange-400" empty="No orders in progress — start one from Coming next.">
            {readyToPack.map(job => (
              <JobCard key={job.id} job={job} today={today} open={openJob === job.id}
                onToggleOpen={() => setOpenJob(id => (id === job.id ? null : job.id))}
                error={confirmErr[job.id] ?? null}
                confirmBusy={confirmMut.isPending && confirmMut.variables === job.id}
                onToggle={itemId => toggleMut.mutate({ jobId: job.id, itemId })}
                onConfirm={() => confirmMut.mutate(job.id)} />
            ))}
          </Section>

          <Section title="Coming next" count={comingNext.length} accent="text-zinc-400" empty="All orders are in progress or packed.">
            {comingNext.map(job => (
              <JobCard key={job.id} job={job} today={today} open={openJob === job.id}
                onToggleOpen={() => setOpenJob(id => (id === job.id ? null : job.id))}
                error={confirmErr[job.id] ?? null}
                confirmBusy={confirmMut.isPending && confirmMut.variables === job.id}
                onToggle={itemId => toggleMut.mutate({ jobId: job.id, itemId })}
                onConfirm={() => confirmMut.mutate(job.id)} />
            ))}
          </Section>
        </div>
      )}

      {/* Packed today */}
      <section className="mt-8">
        <button onClick={() => setPackedOpen(o => !o)} aria-expanded={packedOpen}
          className="flex w-full items-center justify-between rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-left">
          <span className="text-sm font-bold uppercase tracking-wider text-green-400">Packed today ({packedJobs.length})</span>
          <span className="text-zinc-500" aria-hidden="true">{packedOpen ? "▾" : "▸"}</span>
        </button>
        {packedOpen && (
          packedJobs.length === 0
            ? <p className="px-4 py-3 text-sm text-zinc-500">Nothing packed yet today.</p>
            : (
              <ul className="mt-2 space-y-2">
                {packedJobs.map(job => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-green-900/40 bg-ink-900 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-300">✓ {job.customer} <span className="font-normal text-zinc-500">· {job.orderRef}</span></p>
                      <p className="text-xs text-zinc-500">{fmtDate(job.serviceDate)} · {job.timeWindow}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold text-green-400">
                        {job.packedBy ?? "unknown"}{job.packedAt ? ` · ${fmtTime(job.packedAt)}` : ""}
                      </p>
                      <button onClick={() => { unpackMut.reset(); setUnpackTarget(job); }}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-3 py-1 text-xs font-bold text-zinc-400 hover:border-red-700/60 hover:text-red-400"
                        aria-label={`Unpack ${job.orderRef}`}>Unpack</button>
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}
      </section>

      {unpackTarget && (
        <UnpackDialog job={unpackTarget} busy={unpackMut.isPending}
          error={unpackMut.error instanceof Error ? unpackMut.error.message : unpackMut.error ? "Could not unpack order" : null}
          onCancel={() => setUnpackTarget(null)}
          onConfirm={reason => unpackMut.mutate({ jobId: unpackTarget.id, reason })} />
      )}
    </div>
  );
}

function Section({ title, count, accent, empty, children }: {
  title: string; count: number; accent: string; empty: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className={`text-sm font-bold uppercase tracking-wider ${accent}`}>{title}</h2>
        <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-bold text-zinc-300">{count}</span>
      </div>
      {count === 0 ? <p className="rounded-lg border border-dashed border-ink-700 px-3 py-4 text-sm text-zinc-500">{empty}</p> : <ul className="space-y-4">{children}</ul>}
    </section>
  );
}

function JobCard({ job, today, open, onToggleOpen, error, confirmBusy, onToggle, onConfirm }: {
  job: PackJob; today: string; open: boolean; onToggleOpen: () => void;
  error: string | null; confirmBusy: boolean;
  onToggle: (itemId: string) => void; onConfirm: () => void;
}) {
  const done = job.checklist.filter(i => i.done).length;
  const total = job.checklist.length;
  const allDone = total > 0 && done === total;
  const svc = serviceMeta(job.channel);

  const groups = useMemo(() => {
    const map = new Map<string, PackJob["checklist"]>();
    for (const item of job.checklist) {
      const cat = categorizeChecklistItem(item.label);
      const list = map.get(cat) ?? [];
      list.push(item);
      map.set(cat, list);
    }
    return CHECKLIST_CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [job.checklist]);

  return (
    <li id={`pack-job-${job.id}`} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onToggleOpen} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-bold text-zinc-100">{job.customer}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${CHANNEL_META[job.channel].cls}`}>{CHANNEL_META[job.channel].label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${svc.cls}`}>{svc.label}</span>
            {job.serviceDate === today && (
              <span className="rounded-full border border-amber-700/50 bg-amber-600/20 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-300">Today</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">
            {job.orderRef} · {fmtDate(job.serviceDate)} · {job.timeWindow} · {total} item{total === 1 ? "" : "s"}
          </p>
        </button>
        <div className="flex items-center gap-2">
          <ProgressRing done={done} total={total} />
          <span className="text-zinc-500" aria-hidden="true">{open ? "▾" : "▸"}</span>
        </div>
      </div>

      {open && (
        <>
          <div className="mt-3 space-y-3">
            {groups.map(([cat, items]) => {
              const catDone = items.filter(i => i.done).length;
              return (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{CHECKLIST_CATEGORY_LABELS[cat as keyof typeof CHECKLIST_CATEGORY_LABELS]}</h3>
                    <span className="text-[10px] text-zinc-600">{catDone}/{items.length}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {items.map(item => (
                      <li key={item.id}>
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
                          <input type="checkbox" checked={item.done} onChange={() => onToggle(item.id)}
                            className="h-5 w-5 accent-orange-600" aria-label={`Packed: ${item.label}`} />
                          <span className={`text-sm ${item.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{item.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {error && <p className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

          <button onClick={onConfirm} disabled={!allDone || confirmBusy}
            className="mt-3 w-full rounded-lg bg-fire px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            title={allDone ? "Confirm this order is packed" : "Check every item before confirming"}>
            {confirmBusy ? "Confirming…" : allDone ? "Confirm Packed" : `Confirm Packed (${done}/${total} checked)`}
          </button>
          {allDone && <p className="mt-2 text-center text-xs text-zinc-500">Confirming records who packed it and clears it from the queue.</p>}
        </>
      )}
    </li>
  );
}

function UnpackDialog({ job, busy, error, onCancel, onConfirm }: {
  job: PackJob; busy: boolean; error: string | null;
  onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const submit = () => {
    setFormError(null);
    if (!reason.trim()) return setFormError("A reason is required to unpack an order.");
    onConfirm(reason.trim());
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Unpack ${job.orderRef}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">Unpack order</h3>
        <p className="mt-1 text-sm text-zinc-400">{job.customer} <span className="font-mono text-zinc-500">· {job.orderRef}</span></p>
        <p className="mt-1 text-xs text-zinc-500">
          Packed by <span className="font-semibold text-zinc-300">{job.packedBy ?? "unknown"}</span>
          {job.packedAt ? <> at <span className="font-semibold text-zinc-300">{fmtTime(job.packedAt)}</span> · {fmtDate(job.serviceDate)}</> : null}
        </p>
        <p className="mt-2 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          Unpacking puts this order back in the queue and clears its packed record. The reason is audited.
        </p>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Reason (required)
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus required
            placeholder="e.g. wrong pan count — needs repack"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !reason.trim()} className="min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Unpacking…" : "Unpack order"}
          </button>
        </div>
      </form>
    </div>
  );
}
