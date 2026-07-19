import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PitTask, SmokerEntry } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Pit · Fire Sheet dashboard — V2 of the Manus PitDashboard (today's pit
 * checklist + today's smoker schedule). Tasks come from dal.pitChecklist;
 * "Sync from schedule" pulls Load tasks from today's smoker forecast entries.
 */

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOfWeek(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Sun
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
function fmtTime(t: string): string {
  const [hs, ms] = t.split(":");
  const h = Number(hs);
  const m = Number(ms ?? "0");
  if (!Number.isFinite(h)) return t;
  return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

type Sync = "idle" | "saving" | "saved" | "error";

export function PitDashboard() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [newLabel, setNewLabel] = useState("");

  const today = useMemo(() => todayEt(), []);
  const weekStart = useMemo(() => mondayOfWeek(today), [today]);

  const checklistQ = useQuery({
    queryKey: ["pit", "checklist", "today"],
    queryFn: () => dal.pitChecklist.today(),
    refetchInterval: 30_000,
  });
  const weekQ = useQuery({
    queryKey: ["pit", "forecast", weekStart],
    queryFn: () => dal.smokerForecast.week(weekStart),
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pit", "checklist", "today"] });

  const toggleMut = useMutation({
    mutationFn: (taskId: string) => withSync(dal.pitChecklist.toggle(taskId, actor)),
    onSuccess: invalidate,
  });
  const syncMut = useMutation({
    mutationFn: () => withSync(dal.pitChecklist.syncFromForecast(actor)),
    onSuccess: invalidate,
  });
  const addMut = useMutation({
    mutationFn: (label: string) => withSync(dal.pitChecklist.addTask(label, actor)),
    onSuccess: () => { setNewLabel(""); invalidate(); },
  });

  const run = checklistQ.data;
  const tasks: PitTask[] = run?.tasks ?? [];
  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const todayEntries: SmokerEntry[] = useMemo(
    () => (weekQ.data ?? []).filter(e => e.date === today),
    [weekQ.data, today],
  );

  if (checklistQ.isLoading) return <p className="py-20 text-center text-zinc-500">Loading fire sheet…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🔥 Pit Fire Sheet · {today}</h1>
          <p className="text-sm text-zinc-500">{done}/{tasks.length} tasks done</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 disabled:opacity-50">
            {syncMut.isPending ? "Syncing…" : "Sync from schedule"}
          </button>
        </div>
      </header>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-gradient-to-r from-fire to-fire-light transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* ── Checklist ─────────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Today's tasks</h2>
        {tasks.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">
            No tasks yet — tap "Sync from schedule" to pull today's smoker loads, or add one below.
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {tasks.map(t => (
            <li key={t.id} className={`flex items-center gap-3 rounded-xl border p-3 ${t.done ? "border-green-800/50 bg-green-950/20" : "border-ink-700 bg-ink-900"}`}>
              <button
                onClick={() => toggleMut.mutate(t.id)}
                aria-pressed={t.done}
                aria-label={`${t.label}: ${t.done ? "done" : "not done"}. Tap to toggle.`}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black transition-colors ${
                  t.done ? "border-green-600 bg-green-600 text-white" : "border-ink-700 bg-ink-800 text-transparent"
                }`}>
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${t.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{t.label}</p>
                {(t.protein || t.targetLbs !== null) && (
                  <p className="text-xs text-zinc-500">
                    {t.protein ?? ""}{t.protein && t.targetLbs !== null ? " · " : ""}{t.targetLbs !== null ? `${t.targetLbs} lbs` : ""}
                  </p>
                )}
              </div>
              {t.done && t.doneAt && (
                <span className="text-xs text-zinc-500">
                  {new Date(t.doneAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </li>
          ))}
        </ul>

        <form
          className="mt-3 flex gap-2"
          onSubmit={e => { e.preventDefault(); if (newLabel.trim()) addMut.mutate(newLabel.trim()); }}>
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="+ Add task (e.g. Spritz ribs at noon)"
            aria-label="New task label"
            className="min-h-[44px] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
          <button
            type="submit"
            disabled={!newLabel.trim() || addMut.isPending}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {addMut.isPending ? "Adding…" : "+ Add task"}
          </button>
        </form>
        {addMut.error && <p className="mt-2 text-sm text-red-400">{addMut.error.message}</p>}
      </section>

      {/* ── Today's smoker schedule ───────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Today's smoker schedule</h2>
        {weekQ.isLoading && <p className="mt-3 text-sm text-zinc-500">Loading schedule…</p>}
        {!weekQ.isLoading && todayEntries.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">
            Nothing scheduled on the smokers today. Set it up in Smoker Forecast.
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {todayEntries.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-ink-700 bg-ink-900 p-3">
              <span className="min-w-0 flex-1 font-semibold text-zinc-100">{e.protein}</span>
              <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-bold text-zinc-300">{e.rawLbs} lbs</span>
              <span className="text-xs text-zinc-500">{e.smoker}</span>
              <span className="text-xs font-semibold text-fire-light">
                🔥 {fmtTime(e.loadTime)} → {fmtTime(e.targetDone)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}
