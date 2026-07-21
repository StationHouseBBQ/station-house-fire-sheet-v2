import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import type { Shift, StaffMember, TeamRole } from "./_data/types";
import { TEAM_SCHEDULE_KEY, TEAM_STAFF_KEY } from "./_data/keys";
import { TEAM_STAFF_SEED, SHIFT_TEMPLATE } from "./_data/seeds";
import {
  ROLE_LABELS, ROLE_OPTIONS, ROLE_ACCENT, addWeeks, fmt12h, fmtDayShort,
  fmtHours, fmtWeekday, mondayOf, shiftHours, todayIso, weekDays,
} from "./_data/util";

/**
 * Team · Staff Schedule — a weekly 7-day × staff shift grid. Add / edit /
 * remove shifts (role, start, end), navigate weeks via the business clock, and
 * see weekly hours per person plus the crew total. Persists the full shift
 * array to dal.settings["team.schedule"]. Source: Manus StaffSchedule.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";

interface Draft {
  id: string | null;      // null ⇒ new
  staffId: string;
  date: string;
  role: TeamRole;
  start: string;
  end: string;
}

function rid(): string {
  return "sh-" + Math.random().toString(36).slice(2, 10);
}

/** A seed week so the grid is populated on first paint. */
function seedSchedule(monday: string, staff: StaffMember[]): Shift[] {
  const days = weekDays(monday);
  const out: Shift[] = [];
  // Everyone Tue–Sat (indices 1..5); pitmaster also Sunday prep (index 6).
  for (const s of staff) {
    const tmpl = SHIFT_TEMPLATE[s.role] ?? { start: "09:00", end: "17:00" };
    const workDays = s.role === "pitmaster" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    for (const di of workDays) {
      out.push({ id: rid(), staffId: s.id, date: days[di], role: s.role, start: tmpl.start, end: tmpl.end });
    }
  }
  return out;
}

export function StaffSchedule() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [monday, setMonday] = useState<string>(() => mondayOf(todayIso()));
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ["settings", TEAM_STAFF_KEY],
    queryFn: () => dal.settings.get<StaffMember[]>(TEAM_STAFF_KEY, TEAM_STAFF_SEED),
  });
  const { data: shifts = [], isLoading: shiftLoading } = useQuery({
    queryKey: ["settings", TEAM_SCHEDULE_KEY],
    queryFn: () => dal.settings.get<Shift[]>(TEAM_SCHEDULE_KEY, []),
  });

  const save = useMutation({
    mutationFn: (next: Shift[]) => {
      setSync("saving");
      return dal.settings.set(TEAM_SCHEDULE_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", TEAM_SCHEDULE_KEY] }),
  });

  const days = useMemo(() => weekDays(monday), [monday]);
  const activeStaff = useMemo(() => staff.filter(s => s.active), [staff]);

  /** Shifts falling within the visible week. */
  const weekShifts = useMemo(() => {
    const set = new Set(days);
    return shifts.filter(s => set.has(s.date));
  }, [shifts, days]);

  /** (staffId,date) → shift lookup. */
  const grid = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of weekShifts) m.set(`${s.staffId}|${s.date}`, s);
    return m;
  }, [weekShifts]);

  const hoursByStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of weekShifts) m.set(s.staffId, (m.get(s.staffId) ?? 0) + shiftHours(s.start, s.end));
    return m;
  }, [weekShifts]);

  const weekTotal = Array.from(hoursByStaff.values()).reduce((a, b) => a + b, 0);
  const isSeeded = weekShifts.length > 0;

  function openCell(staffId: string, date: string) {
    const existing = grid.get(`${staffId}|${date}`);
    const member = staff.find(s => s.id === staffId);
    if (existing) {
      setDraft({ id: existing.id, staffId, date, role: existing.role, start: existing.start, end: existing.end });
    } else {
      const tmpl = member ? (SHIFT_TEMPLATE[member.role] ?? { start: "09:00", end: "17:00" }) : { start: "09:00", end: "17:00" };
      setDraft({ id: null, staffId, date, role: member?.role ?? "kitchen", start: tmpl.start, end: tmpl.end });
    }
  }

  function commitDraft() {
    if (!draft) return;
    if (shiftHours(draft.start, draft.end) <= 0) return; // guard invalid range
    let next: Shift[];
    if (draft.id) {
      next = shifts.map(s => (s.id === draft.id
        ? { ...s, staffId: draft.staffId, date: draft.date, role: draft.role, start: draft.start, end: draft.end }
        : s));
    } else {
      next = [...shifts, { id: rid(), staffId: draft.staffId, date: draft.date, role: draft.role, start: draft.start, end: draft.end }];
    }
    save.mutate(next);
    setDraft(null);
  }

  function removeDraft() {
    if (!draft || !draft.id) { setDraft(null); return; }
    save.mutate(shifts.filter(s => s.id !== draft.id));
    setDraft(null);
  }

  function autofill() {
    // Only fill days that have no shift yet for the visible week.
    const seeded = seedSchedule(monday, activeStaff);
    const have = new Set(weekShifts.map(s => `${s.staffId}|${s.date}`));
    const additions = seeded.filter(s => !have.has(`${s.staffId}|${s.date}`));
    if (additions.length === 0) return;
    save.mutate([...shifts, ...additions]);
  }

  if (staffLoading || shiftLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading schedule…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Staff Schedule</h1>
          <p className="text-sm text-zinc-500">
            Week of {fmtDayShort(days[0])} – {fmtDayShort(days[6])}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonday(m => addWeeks(m, -1))}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-fire/50">‹ Prev</button>
          <button onClick={() => setMonday(mondayOf(todayIso()))}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-fire/50">This week</button>
          <button onClick={() => setMonday(m => addWeeks(m, 1))}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-fire/50">Next ›</button>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SyncPill sync={sync} />
        {!isSeeded && (
          <button onClick={autofill} disabled={save.isPending}
            className="rounded-lg border border-fire/50 bg-fire/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-fire-light transition hover:bg-fire/20 disabled:opacity-50">
            Auto-fill typical week
          </button>
        )}
      </div>

      {activeStaff.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">No active staff on the roster.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-700">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-ink-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="sticky left-0 z-10 bg-ink-800 px-3 py-2.5 font-semibold">Staff</th>
                {days.map(d => (
                  <th key={d} className={`px-2 py-2.5 text-center font-semibold ${d === todayIso() ? "text-fire-light" : ""}`}>
                    <div>{fmtWeekday(d)}</div>
                    <div className="text-[10px] font-normal text-zinc-600">{fmtDayShort(d).replace(/^[A-Za-z]+ /, "")}</div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold">Hrs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {activeStaff.map(s => (
                <tr key={s.id} className="bg-ink-900">
                  <td className="sticky left-0 z-10 bg-ink-900 px-3 py-2.5">
                    <p className="font-semibold text-zinc-100">{s.name}</p>
                    <p className="text-[11px] text-zinc-500">{ROLE_LABELS[s.role]}</p>
                  </td>
                  {days.map(d => {
                    const sh = grid.get(`${s.id}|${d}`);
                    return (
                      <td key={d} className="px-1.5 py-1.5 text-center align-top">
                        <button onClick={() => openCell(s.id, d)}
                          className={`w-full rounded-lg border px-1.5 py-1.5 text-[11px] transition ${sh ? ROLE_ACCENT[sh.role] + " hover:brightness-125" : "border-dashed border-ink-700 text-zinc-600 hover:border-fire/40 hover:text-zinc-400"}`}>
                          {sh ? (
                            <>
                              <div className="font-semibold">{fmt12h(sh.start)}</div>
                              <div className="opacity-70">{fmt12h(sh.end)}</div>
                            </>
                          ) : "+"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-zinc-100">
                    {fmtHours(hoursByStaff.get(s.id) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-800">
                <td className="sticky left-0 z-10 bg-ink-800 px-3 py-2.5 text-sm font-black uppercase tracking-wide text-fire-light" colSpan={8}>
                  Week total
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-base font-black text-fire-light">{fmtHours(weekTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Edit / add dialog */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDraft(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black uppercase text-zinc-100">{draft.id ? "Edit shift" : "Add shift"}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {staff.find(s => s.id === draft.staffId)?.name} · {fmtDayShort(draft.date)}
            </p>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Role</label>
            <select value={draft.role} onChange={e => setDraft(d => d && { ...d, role: e.target.value as TeamRole })}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100">
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Start</label>
                <input type="time" value={draft.start} onChange={e => setDraft(d => d && { ...d, start: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">End</label>
                <input type="time" value={draft.end} onChange={e => setDraft(d => d && { ...d, end: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100" />
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {shiftHours(draft.start, draft.end) > 0
                ? `${fmtHours(shiftHours(draft.start, draft.end))} hours`
                : <span className="text-red-400">End must be after start</span>}
            </p>

            <div className="mt-5 flex items-center justify-between gap-2">
              {draft.id ? (
                <button onClick={removeDraft} disabled={save.isPending}
                  className="rounded-lg border border-red-700/50 bg-red-600/10 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-600/20 disabled:opacity-50">
                  Remove
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setDraft(null)}
                  className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500">
                  Cancel
                </button>
                <button onClick={commitDraft} disabled={save.isPending || shiftHours(draft.start, draft.end) <= 0}
                  className="rounded-lg border border-fire/50 bg-fire/20 px-4 py-2 text-sm font-black uppercase tracking-wide text-fire-light transition hover:bg-fire/30 disabled:opacity-50">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  return <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}
