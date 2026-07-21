import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import {
  DEFAULT_PAYROLL, FINANCE_PAYROLL_KEY, payrollGrossCents,
  type PayrollStaff, type PayrollState,
} from "./_data/payroll";

/**
 * Finance · Payroll — a manual pay-period tracker. There is no payroll
 * repository in the DAL, so the roster (name / role / hourly rate) and the
 * hours entered for the current period live in a module-local model persisted
 * through dal.settings under FINANCE_PAYROLL_KEY. Gross pay is computed in the
 * integer-cents domain. Source: Manus pages/FinancePayroll.tsx.
 */

function newId(): string {
  return `pr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function FinancePayroll() {
  const dal = getDal();
  const qc = useQueryClient();
  const { actor } = useRole();
  const [draft, setDraft] = useState<PayrollState | null>(null);
  const [sync, setSync] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { data, isLoading } = useQuery({
    queryKey: ["settings", FINANCE_PAYROLL_KEY],
    queryFn: () => dal.settings.get<PayrollState>(FINANCE_PAYROLL_KEY, DEFAULT_PAYROLL),
  });

  useEffect(() => { if (data && !draft) setDraft(data); }, [data, draft]);

  const saveMut = useMutation({
    mutationFn: (v: PayrollState) => {
      setSync("saving");
      return dal.settings.set(FINANCE_PAYROLL_KEY, v, actor).then(
        () => setSync("saved"),
        (e: unknown) => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", FINANCE_PAYROLL_KEY] }),
  });

  const commit = (next: PayrollState) => { setDraft(next); saveMut.mutate(next); };

  const totals = useMemo(() => {
    if (!draft) return { hours: 0, grossCents: 0 };
    return draft.staff.reduce((acc, s) => ({
      hours: acc.hours + s.hours,
      grossCents: acc.grossCents + payrollGrossCents(s),
    }), { hours: 0, grossCents: 0 });
  }, [draft]);

  if (isLoading || !draft) return <p className="py-20 text-center text-zinc-500">Loading payroll…</p>;

  const patchStaff = (id: string, patch: Partial<PayrollStaff>) =>
    commit({ ...draft, staff: draft.staff.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeStaff = (id: string) =>
    commit({ ...draft, staff: draft.staff.filter(s => s.id !== id) });
  const addStaff = () =>
    commit({ ...draft, staff: [...draft.staff, { id: newId(), name: "New staffer", role: "Crew", rateCentsPerHour: 1500, hours: 0 }] });

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Payroll</h1>
          <p className="text-sm text-zinc-500">Manual pay-period tracker — editable roster, rates &amp; hours.</p>
        </div>
        <span className={`text-xs font-bold ${sync === "error" ? "text-red-400" : sync === "saving" ? "text-amber-400" : sync === "saved" ? "text-green-400" : "text-zinc-600"}`}>
          {sync === "saving" ? "Saving…" : sync === "saved" ? "Saved" : sync === "error" ? "Save failed" : ""}
        </span>
      </header>

      <div className="mt-4 flex items-center gap-3">
        <label className="text-xs font-black uppercase tracking-wider text-zinc-500">Period</label>
        <input value={draft.periodLabel} onChange={e => setDraft({ ...draft, periodLabel: e.target.value })}
          onBlur={() => commit(draft)}
          className="min-h-[40px] flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 text-sm text-zinc-200 focus:border-fire focus:outline-none" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Staff</div>
          <div className="mt-1 text-2xl font-black text-zinc-100">{draft.staff.length}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Total hours</div>
          <div className="mt-1 text-2xl font-black text-zinc-100">{totals.hours.toLocaleString("en-US")}</div>
        </div>
        <div className="rounded-2xl border border-fire/40 bg-fire/10 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Gross payroll</div>
          <div className="mt-1 text-2xl font-black text-fire-light">{formatCents(totals.grossCents)}</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Rate / hr</th>
              <th className="px-3 py-2 text-right">Hours</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.staff.map(s => (
              <tr key={s.id} className="border-b border-ink-800">
                <td className="px-3 py-2">
                  <input value={s.name} onChange={e => patchStaff(s.id, { name: e.target.value })}
                    className="min-h-[40px] w-40 rounded-lg border border-ink-700 bg-ink-900 px-2 text-sm font-semibold text-zinc-100 focus:border-fire focus:outline-none" />
                </td>
                <td className="px-3 py-2">
                  <input value={s.role} onChange={e => patchStaff(s.id, { role: e.target.value })}
                    className="min-h-[40px] w-36 rounded-lg border border-ink-700 bg-ink-900 px-2 text-sm text-zinc-300 focus:border-fire focus:outline-none" />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-zinc-600">$</span>
                    <input type="number" min={0} step={0.25} value={(s.rateCentsPerHour / 100).toFixed(2)}
                      onChange={e => patchStaff(s.id, { rateCentsPerHour: Math.max(0, Math.round(Number(e.target.value) * 100)) })}
                      className="min-h-[40px] w-24 rounded-lg border border-ink-700 bg-ink-900 px-2 text-right text-sm font-mono text-zinc-100 focus:border-fire focus:outline-none" />
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" min={0} step={0.5} value={s.hours}
                    onChange={e => patchStaff(s.id, { hours: Math.max(0, Number(e.target.value)) })}
                    className="min-h-[40px] w-20 rounded-lg border border-ink-700 bg-ink-900 px-2 text-right text-sm font-mono text-zinc-100 focus:border-fire focus:outline-none" />
                </td>
                <td className="px-3 py-2 text-right font-bold text-green-400">{formatCents(payrollGrossCents(s))}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => removeStaff(s.id)}
                    className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-red-300 hover:border-red-700/50">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={addStaff}
        className="mt-4 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-fire/50">+ Add staffer</button>
    </div>
  );
}
