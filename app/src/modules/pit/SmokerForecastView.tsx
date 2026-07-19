import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { SmokerEntry } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";

/**
 * Pit · Smoker Forecast — V2 of the Manus SmokerForecast page.
 * Monday-based week navigation, entries grouped by day, add/edit/remove
 * entries, auto-fill from confirmed order demand, and per-day locking
 * (two-tap confirm; locked entries render dimmed with a lock badge).
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
function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Sync = "idle" | "saving" | "saved" | "error";

interface DialogState {
  date: string;
  entry: SmokerEntry | null; // null = add
}

export function SmokerForecastView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [weekOffset, setWeekOffset] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirmLock, setConfirmLock] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const today = useMemo(() => todayEt(), []);
  const weekStart = useMemo(() => addDays(mondayOfWeek(today), weekOffset * 7), [today, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const weekQ = useQuery({
    queryKey: ["pit", "forecast", weekStart],
    queryFn: () => dal.smokerForecast.week(weekStart),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pit", "forecast"] });

  const upsertMut = useMutation({
    mutationFn: (entry: Omit<SmokerEntry, "id"> & { id?: string }) =>
      withSync(dal.smokerForecast.upsert(entry, actor)),
    onSuccess: () => { invalidate(); setDialog(null); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.smokerForecast.remove(id, actor)),
    onSuccess: invalidate,
  });
  const autoFillMut = useMutation({
    mutationFn: () => withSync(dal.smokerForecast.autoFillFromDemand(weekStart, actor)),
    onSuccess: result => {
      const before = weekQ.data?.length ?? 0;
      const added = result.length - before;
      setFeedback(added > 0 ? `Auto-fill added ${added} ${added === 1 ? "entry" : "entries"} from demand.` : "Schedule already covers this week's demand — nothing added.");
      invalidate();
    },
    onError: e => setFeedback(`Auto-fill failed: ${e.message}`),
  });
  const lockMut = useMutation({
    mutationFn: (date: string) => withSync(dal.smokerForecast.lockDay(date, actor)),
    onSuccess: () => { invalidate(); setConfirmLock(null); },
  });

  const entriesByDay = useMemo(() => {
    const m = new Map<string, SmokerEntry[]>();
    for (const e of weekQ.data ?? []) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [weekQ.data]);

  const weekLabel = `${fmtDay(weekStart)} – ${fmtDay(addDays(weekStart, 6))}`;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Smoker Forecast</h1>
          <p className="text-sm text-zinc-500">Week of {weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button
            onClick={() => { setFeedback(null); autoFillMut.mutate(); }}
            disabled={autoFillMut.isPending}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {autoFillMut.isPending ? "Filling…" : "✨ Auto-fill from demand"}
          </button>
        </div>
      </header>

      {feedback && (
        <p role="status" className="mt-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-300">
          {feedback}
        </p>
      )}

      {/* ── Week navigation ───────────────────────────────────────────── */}
      <nav className="mt-4 flex items-center gap-2" aria-label="Week navigation">
        <button onClick={() => setWeekOffset(o => o - 1)}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300"
          aria-label="Previous week">← Prev</button>
        <button onClick={() => setWeekOffset(0)}
          className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold ${
            weekOffset === 0 ? "border-fire bg-fire/15 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"
          }`}>
          This week
        </button>
        <button onClick={() => setWeekOffset(o => o + 1)}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300"
          aria-label="Next week">Next →</button>
      </nav>

      {weekQ.isLoading && <p className="mt-8 text-center text-sm text-zinc-500">Loading schedule…</p>}

      {/* ── Day sections ──────────────────────────────────────────────── */}
      {!weekQ.isLoading && days.map((date, i) => {
        const entries = entriesByDay.get(date) ?? [];
        const isToday = date === today;
        const dayLocked = entries.length > 0 && entries.every(e => e.locked);
        return (
          <section key={date} className={`mt-5 rounded-xl border p-3 ${isToday ? "border-fire/60 bg-fire/5" : "border-ink-700 bg-ink-900/40"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                {DAY_NAMES[i]} <span className="font-normal text-zinc-500">· {fmtDay(date)}</span>
                {isToday && <span className="ml-2 rounded-full bg-fire px-2 py-0.5 text-[10px] font-black text-white">TODAY</span>}
                {dayLocked && <span className="ml-2 rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-black text-zinc-400">🔒 LOCKED</span>}
              </h2>
              <div className="flex items-center gap-2">
                {!dayLocked && entries.length > 0 && (
                  confirmLock === date ? (
                    <>
                      <button onClick={() => lockMut.mutate(date)} disabled={lockMut.isPending}
                        className="min-h-[44px] rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                        Tap again to confirm lock
                      </button>
                      <button onClick={() => setConfirmLock(null)}
                        className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-zinc-400">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmLock(date)}
                      className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300">
                      🔒 Lock day
                    </button>
                  )
                )}
                <button onClick={() => { upsertMut.reset(); setDialog({ date, entry: null }); }}
                  className="min-h-[44px] rounded-lg border border-fire/50 bg-ink-800 px-3 py-2 text-xs font-bold text-fire-light">
                  + Add entry
                </button>
              </div>
            </div>

            {entries.length === 0 ? (
              <p className="mt-2 px-1 text-sm text-zinc-600">Nothing scheduled.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {entries.map(e => (
                  <li key={e.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-ink-700 bg-ink-900 p-3 ${e.locked ? "opacity-60" : ""}`}>
                    <span className="min-w-0 flex-1 font-semibold text-zinc-100">
                      {e.protein}
                      {e.locked && <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">🔒 Locked</span>}
                    </span>
                    <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-bold text-zinc-300">{e.rawLbs} lbs</span>
                    <span className="text-xs text-zinc-500">{e.smoker}</span>
                    <span className="text-xs font-semibold text-fire-light">🔥 {fmtTime(e.loadTime)} → {fmtTime(e.targetDone)}</span>
                    <span className="flex gap-1">
                      <button
                        onClick={() => { upsertMut.reset(); setDialog({ date: e.date, entry: e }); }}
                        disabled={e.locked}
                        aria-label={e.locked ? `${e.protein} is locked` : `Edit ${e.protein}`}
                        className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50">
                        {e.locked ? "🔒" : "Edit"}
                      </button>
                      <button
                        onClick={() => removeMut.mutate(e.id)}
                        disabled={e.locked || removeMut.isPending}
                        aria-label={e.locked ? `${e.protein} is locked` : `Remove ${e.protein}`}
                        className="min-h-[44px] min-w-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-3 py-2 text-xs font-semibold text-red-400 disabled:cursor-not-allowed disabled:opacity-50">
                        {e.locked ? "🔒" : "Remove"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {dialog && (
        <EntryDialog
          key={dialog.entry?.id ?? dialog.date}
          date={dialog.date}
          entry={dialog.entry}
          busy={upsertMut.isPending}
          error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog(null)}
          onSubmit={input => upsertMut.mutate(input)}
        />
      )}
    </div>
  );
}

function EntryDialog({ date, entry, busy, error, onSubmit, onCancel }: {
  date: string;
  entry: SmokerEntry | null;
  busy: boolean;
  error: string | null;
  onSubmit: (e: Omit<SmokerEntry, "id"> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [protein, setProtein] = useState(entry?.protein ?? "");
  const [lbs, setLbs] = useState(entry ? String(entry.rawLbs) : "");
  const [smoker, setSmoker] = useState(entry?.smoker ?? "Ol' Smokey (offset)");
  const [loadTime, setLoadTime] = useState(entry?.loadTime ?? "06:00");
  const [targetDone, setTargetDone] = useState(entry?.targetDone ?? "12:00");
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(lbs);
    if (!protein.trim()) return setClientError("Protein is required");
    if (!Number.isFinite(n) || n <= 0) return setClientError("Raw lbs must be a positive number");
    if (!smoker.trim()) return setClientError("Smoker is required");
    if (!loadTime || !targetDone) return setClientError("Load and target-done times are required");
    setClientError(null);
    onSubmit({
      id: entry?.id,
      date,
      protein: protein.trim(),
      rawLbs: n,
      smoker: smoker.trim(),
      loadTime,
      targetDone,
      locked: entry?.locked ?? false,
    });
  };

  const shown = clientError ?? error;

  return (
    <div role="dialog" aria-modal="true" aria-label={entry ? "Edit smoker entry" : "Add smoker entry"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">{entry ? "Edit entry" : "Add entry"} · {fmtDay(date)}</h3>
        {shown && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{shown}</p>}

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Protein
          <input value={protein} onChange={e => setProtein(e.target.value)} required placeholder="e.g. Pork Butt"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Raw lbs
            <input inputMode="decimal" value={lbs} onChange={e => setLbs(e.target.value)} required placeholder="e.g. 100"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Smoker
            <input value={smoker} onChange={e => setSmoker(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Load time
            <input type="time" value={loadTime} onChange={e => setLoadTime(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Target done
            <input type="time" value={targetDone} onChange={e => setTargetDone(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : entry ? "Save changes" : "Add entry"}
          </button>
        </div>
      </form>
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
