import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import type { Punch, StaffMember } from "./_data/types";
import { TEAM_PUNCHES_KEY, TEAM_STAFF_KEY } from "./_data/keys";
import { TEAM_STAFF_SEED } from "./_data/seeds";
import {
  ROLE_LABELS, ROLE_ACCENT, elapsedLabel, fmtTime, fmtHours,
  punchHours, todayIso,
} from "./_data/util";

/**
 * Team · Time Clock — a live clock-in / clock-out board. Each active staff
 * member gets a big toggle; open punches show running elapsed time; the day's
 * punches and per-person hours totals sit below. Persists the punch array to
 * dal.settings["team.punches"]. Uses currentTime() for every punch stamp so
 * the demo clock override applies. Source: Manus TimeClock.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";

function rid(): string {
  return "pn-" + Math.random().toString(36).slice(2, 10);
}

export function TimeClock() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ["settings", TEAM_STAFF_KEY],
    queryFn: () => dal.settings.get<StaffMember[]>(TEAM_STAFF_KEY, TEAM_STAFF_SEED),
  });
  const { data: punches = [], isLoading: punchLoading } = useQuery({
    queryKey: ["settings", TEAM_PUNCHES_KEY],
    queryFn: () => dal.settings.get<Punch[]>(TEAM_PUNCHES_KEY, []),
    refetchInterval: 30_000, // keep elapsed labels fresh
  });

  const save = useMutation({
    mutationFn: (next: Punch[]) => {
      setSync("saving");
      return dal.settings.set(TEAM_PUNCHES_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", TEAM_PUNCHES_KEY] }),
  });

  const today = todayIso();
  const activeStaff = useMemo(() => staff.filter(s => s.active), [staff]);

  /** Today's punches (a punch is "today" when its clock-in date is today). */
  const todayPunches = useMemo(
    () => punches.filter(p => p.inAt.slice(0, 10) === today),
    [punches, today],
  );

  /** staffId → the currently-open punch, if any. */
  const openByStaff = useMemo(() => {
    const m = new Map<string, Punch>();
    for (const p of todayPunches) if (p.outAt === null) m.set(p.staffId, p);
    return m;
  }, [todayPunches]);

  /** staffId → decimal hours accrued today (closed + running open). */
  const hoursByStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of todayPunches) {
      m.set(p.staffId, (m.get(p.staffId) ?? 0) + punchHours(p.inAt, p.outAt));
    }
    return m;
  }, [todayPunches]);

  const totalOnClock = openByStaff.size;
  const totalHoursToday = Array.from(hoursByStaff.values()).reduce((a, b) => a + b, 0);

  function clockIn(staffId: string) {
    if (openByStaff.has(staffId)) return; // guard: already on the clock
    const next: Punch[] = [
      ...punches,
      { id: rid(), staffId, inAt: currentTime().toISOString(), outAt: null },
    ];
    save.mutate(next);
  }

  function clockOut(staffId: string) {
    const open = openByStaff.get(staffId);
    if (!open) return; // guard: nothing to close
    const stamp = currentTime().toISOString();
    const next = punches.map(p => (p.id === open.id ? { ...p, outAt: stamp } : p));
    save.mutate(next);
  }

  if (staffLoading || punchLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading time clock…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Time Clock</h1>
          <p className="text-sm text-zinc-500">
            {currentTime().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-zinc-500">On the clock</p>
          <p className="text-2xl font-black text-green-400">{totalOnClock}</p>
        </div>
      </header>

      <SyncPill sync={sync} />

      {/* Clock in/out board */}
      <section className="mt-4 space-y-3">
        {activeStaff.length === 0 ? (
          <p className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">
            No active staff on the roster.
          </p>
        ) : (
          activeStaff.map(s => {
            const open = openByStaff.get(s.id) ?? null;
            const hrs = hoursByStaff.get(s.id) ?? 0;
            return (
              <div key={s.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${open ? "border-green-700/60 bg-green-950/20" : "border-ink-700 bg-ink-900"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-zinc-100">{s.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ROLE_ACCENT[s.role]}`}>
                      {ROLE_LABELS[s.role]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {open
                      ? <>In at {fmtTime(open.inAt)} · <span className="font-semibold text-green-400">{elapsedLabel(open.inAt, null)}</span></>
                      : hrs > 0 ? <>Off the clock · {fmtHours(hrs)}h today</> : "Not clocked in today"}
                  </p>
                </div>
                {open ? (
                  <button
                    onClick={() => clockOut(s.id)}
                    disabled={save.isPending}
                    className="rounded-xl border border-red-700/60 bg-red-600/20 px-5 py-3 text-sm font-black uppercase tracking-wide text-red-300 transition hover:bg-red-600/30 disabled:opacity-50">
                    Clock Out
                  </button>
                ) : (
                  <button
                    onClick={() => clockIn(s.id)}
                    disabled={save.isPending}
                    className="rounded-xl border border-green-700/60 bg-green-600/20 px-5 py-3 text-sm font-black uppercase tracking-wide text-green-300 transition hover:bg-green-600/30 disabled:opacity-50">
                    Clock In
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Today's punches */}
      <section className="mt-8">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Today's punches</h2>
        {todayPunches.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No punches logged yet today.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-ink-700">
            <table className="w-full text-sm">
              <thead className="bg-ink-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Staff</th>
                  <th className="px-4 py-2.5 font-semibold">In</th>
                  <th className="px-4 py-2.5 font-semibold">Out</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Elapsed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {[...todayPunches]
                  .sort((a, b) => (a.inAt < b.inAt ? 1 : -1))
                  .map(p => {
                    const s = staff.find(x => x.id === p.staffId);
                    return (
                      <tr key={p.id} className="bg-ink-900">
                        <td className="px-4 py-2.5 font-medium text-zinc-100">{s ? s.name : "Unknown"}</td>
                        <td className="px-4 py-2.5 text-zinc-300">{fmtTime(p.inAt)}</td>
                        <td className="px-4 py-2.5 text-zinc-300">
                          {p.outAt ? fmtTime(p.outAt) : <span className="font-semibold text-green-400">On the clock</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-200">{elapsedLabel(p.inAt, p.outAt)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Daily hours summary */}
      <section className="mt-8">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Daily hours summary</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {activeStaff
            .filter(s => (hoursByStaff.get(s.id) ?? 0) > 0)
            .map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5">
                <span className="text-sm text-zinc-200">{s.name}</span>
                <span className="font-mono text-sm font-semibold text-zinc-100">{fmtHours(hoursByStaff.get(s.id) ?? 0)}h</span>
              </div>
            ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-fire/50 bg-fire/10 px-4 py-3">
          <span className="text-sm font-black uppercase tracking-wide text-fire-light">Total hours today</span>
          <span className="font-mono text-lg font-black text-fire-light">{fmtHours(totalHoursToday)}h</span>
        </div>
      </section>
    </div>
  );
}

function SyncPill({ sync }: { sync: Sync }) {
  if (sync === "idle") return null;
  const map: Record<Exclude<Sync, "idle">, { label: string; cls: string }> = {
    saving: { label: "Saving…", cls: "text-amber-300 border-amber-700/50 bg-amber-600/10" },
    saved: { label: "Saved", cls: "text-green-300 border-green-700/50 bg-green-600/10" },
    error: { label: "Save failed", cls: "text-red-300 border-red-700/50 bg-red-600/10" },
  };
  const m = map[sync];
  return (
    <div className={`mt-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold ${m.cls}`}>{m.label}</div>
  );
}
