import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import type { DailySales, Shift, StaffMember } from "./_data/types";
import { LABOR_TARGET_PCT, TEAM_SALES_KEY, TEAM_SCHEDULE_KEY, TEAM_STAFF_KEY } from "./_data/keys";
import { TEAM_STAFF_SEED } from "./_data/seeds";
import {
  addWeeks, fmtDayShort, fmtHours, fmtWeekday, mondayOf, shiftHours,
  staffById, todayIso, weekDays,
} from "./_data/util";

/**
 * Team · Labor Cost — scheduled labor cost vs sales. Labor cost per day is
 * computed from that day's scheduled shifts (hours × the assigned staffer's
 * hourly rate). Daily sales are editable and persist to
 * dal.settings["team.sales"]. Shows labor % per day and for the week against a
 * 25% target line. Source: Manus LaborCostTracker.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";

/** Realistic demo sales (cents) by weekday index Mon..Sun for un-entered days. */
const SEED_SALES_BY_DOW = [0, 320_000, 410_000, 480_000, 690_000, 940_000, 610_000];

function pctClass(pct: number): string {
  if (pct === 0) return "text-zinc-500";
  if (pct <= LABOR_TARGET_PCT) return "text-green-400";
  if (pct <= LABOR_TARGET_PCT + 5) return "text-amber-400";
  return "text-red-400";
}

export function LaborCost() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [monday, setMonday] = useState<string>(() => mondayOf(todayIso()));

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ["settings", TEAM_STAFF_KEY],
    queryFn: () => dal.settings.get<StaffMember[]>(TEAM_STAFF_KEY, TEAM_STAFF_SEED),
  });
  const { data: shifts = [], isLoading: shiftLoading } = useQuery({
    queryKey: ["settings", TEAM_SCHEDULE_KEY],
    queryFn: () => dal.settings.get<Shift[]>(TEAM_SCHEDULE_KEY, []),
  });
  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["settings", TEAM_SALES_KEY],
    queryFn: () => dal.settings.get<DailySales[]>(TEAM_SALES_KEY, []),
  });

  const save = useMutation({
    mutationFn: (next: DailySales[]) => {
      setSync("saving");
      return dal.settings.set(TEAM_SALES_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", TEAM_SALES_KEY] }),
  });

  const days = useMemo(() => weekDays(monday), [monday]);

  /** date → entered sales cents (undefined ⇒ fall back to seed by weekday). */
  const salesByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sales) m.set(r.date, r.salesCents);
    return m;
  }, [sales]);

  function salesFor(date: string, dowIndex: number): number {
    const entered = salesByDate.get(date);
    return entered !== undefined ? entered : SEED_SALES_BY_DOW[dowIndex] ?? 0;
  }

  /** Scheduled labor cost (cents) for one date, from that day's shifts. */
  function laborCentsFor(date: string): number {
    let cents = 0;
    for (const sh of shifts) {
      if (sh.date !== date) continue;
      const member = staffById(staff, sh.staffId);
      if (!member) continue;
      cents += Math.round(shiftHours(sh.start, sh.end) * member.hourlyRateCents);
    }
    return cents;
  }

  function laborHoursFor(date: string): number {
    return shifts.filter(s => s.date === date).reduce((sum, s) => sum + shiftHours(s.start, s.end), 0);
  }

  const rows = useMemo(() => days.map((date, i) => {
    const salesCents = salesFor(date, i);
    const laborCents = laborCentsFor(date);
    const hours = laborHoursFor(date);
    const pct = salesCents > 0 ? (laborCents / salesCents) * 100 : 0;
    return { date, salesCents, laborCents, hours, pct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [days, sales, shifts, staff]);

  const weekSales = rows.reduce((a, r) => a + r.salesCents, 0);
  const weekLabor = rows.reduce((a, r) => a + r.laborCents, 0);
  const weekHours = rows.reduce((a, r) => a + r.hours, 0);
  const weekPct = weekSales > 0 ? (weekLabor / weekSales) * 100 : 0;

  function editSales(date: string, dollars: string) {
    const cleaned = dollars.replace(/[^0-9.]/g, "");
    const cents = Math.round((parseFloat(cleaned) || 0) * 100);
    const next = sales.filter(r => r.date !== date);
    next.push({ date, salesCents: cents });
    save.mutate(next);
  }

  if (staffLoading || shiftLoading || salesLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading labor cost…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Labor Cost</h1>
          <p className="text-sm text-zinc-500">
            Week of {fmtDayShort(days[0])} – {fmtDayShort(days[6])} · target ≤ {LABOR_TARGET_PCT}%
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

      {/* Week KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Week sales" value={formatCents(weekSales)} />
        <Kpi label="Week labor" value={formatCents(weekLabor)} />
        <Kpi label="Labor hours" value={`${fmtHours(weekHours)}h`} />
        <Kpi label="Labor %" value={`${weekPct.toFixed(1)}%`} accentClass={pctClass(weekPct)} />
      </div>

      <SyncPill sync={sync} />

      {/* Daily table */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-800 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Day</th>
              <th className="px-4 py-2.5 text-right font-semibold">Labor hrs</th>
              <th className="px-4 py-2.5 text-right font-semibold">Labor cost</th>
              <th className="px-4 py-2.5 text-right font-semibold">Sales</th>
              <th className="px-4 py-2.5 text-right font-semibold">Labor %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700">
            {rows.map(r => (
              <tr key={r.date} className={`bg-ink-900 ${r.date === todayIso() ? "ring-1 ring-inset ring-fire/40" : ""}`}>
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-zinc-100">{fmtWeekday(r.date)}</span>
                  <span className="ml-1.5 text-xs text-zinc-500">{fmtDayShort(r.date).replace(/^[A-Za-z]+ /, "")}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{fmtHours(r.hours)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{formatCents(r.laborCents)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-zinc-600">$</span>
                  <input
                    inputMode="decimal"
                    defaultValue={(r.salesCents / 100).toFixed(2)}
                    key={`${r.date}-${r.salesCents}`}
                    onBlur={e => {
                      const cents = Math.round((parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0) * 100);
                      if (cents !== r.salesCents) editSales(r.date, e.target.value);
                    }}
                    className="w-24 rounded border border-ink-700 bg-ink-800 px-2 py-1 text-right font-mono text-zinc-100 focus:border-fire/60 focus:outline-none" />
                </td>
                <td className={`px-4 py-2.5 text-right font-mono font-bold ${pctClass(r.pct)}`}>
                  {r.salesCents > 0 ? `${r.pct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-ink-800">
              <td className="px-4 py-3 text-sm font-black uppercase tracking-wide text-fire-light">Week</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{fmtHours(weekHours)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatCents(weekLabor)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatCents(weekSales)}</td>
              <td className={`px-4 py-3 text-right font-mono font-black ${pctClass(weekPct)}`}>{weekPct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Target line + labor % bars */}
      <section className="mt-6 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Labor % vs {LABOR_TARGET_PCT}% target</h2>
          <span className={`text-sm font-bold ${pctClass(weekPct)}`}>Week {weekPct.toFixed(1)}%</span>
        </div>
        <div className="mt-4 space-y-2.5">
          {rows.map(r => {
            const cap = Math.max(LABOR_TARGET_PCT * 2, 50); // chart ceiling
            const w = Math.min(100, (r.pct / cap) * 100);
            const targetLeft = (LABOR_TARGET_PCT / cap) * 100;
            const over = r.pct > LABOR_TARGET_PCT;
            return (
              <div key={r.date} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs font-semibold text-zinc-400">{fmtWeekday(r.date)}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-ink-800">
                  <div className={`h-full rounded-full ${r.pct === 0 ? "bg-ink-700" : over ? "bg-red-500/70" : "bg-green-500/70"}`}
                    style={{ width: `${w}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-fire" style={{ left: `${targetLeft}%` }} title={`${LABOR_TARGET_PCT}% target`} />
                </div>
                <span className={`w-12 shrink-0 text-right font-mono text-xs font-bold ${pctClass(r.pct)}`}>
                  {r.salesCents > 0 ? `${r.pct.toFixed(0)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          The <span className="font-semibold text-fire-light">orange line</span> marks the {LABOR_TARGET_PCT}% target. Bars turn red when a day runs over.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, accentClass }: { label: string; value: string; accentClass?: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${accentClass ?? "text-zinc-100"}`}>{value}</p>
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
  return <div className={`mt-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold ${m.cls}`}>{m.label}</div>;
}
