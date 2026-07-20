import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { formatCents } from "../../lib/money";
import type { CrmTask, CrmOppOverlayMap } from "./_data/types";
import { CRM_TASKS_KEY, CRM_OPPS_KEY } from "./_data/keys";
import { CRM_TASKS_SEED } from "./_data/seeds";
import { fmtAt, todayIso, leadLabel, isOpenOpportunity, STAGE_LABELS, STAGE_PROBABILITY } from "./_data/util";

/**
 * CRM · Dashboard — overview of the pipeline: open opportunities and their
 * value + weighted forecast (dal.leads augmented by the opportunity overlay),
 * task load (due today / overdue), a live activity feed aggregated across all
 * leads, and a simple conversion snapshot. Source: Manus CrmDashboard.tsx.
 */

function oppValueCents(lead: Lead, ov: CrmOppOverlayMap): number {
  return ov[lead.id]?.estimatedValueCents ?? lead.budgetCents ?? 0;
}
function oppProbability(lead: Lead, ov: CrmOppOverlayMap): number {
  return ov[lead.id]?.probabilityPct ?? STAGE_PROBABILITY[lead.stage];
}

export function CrmDashboard() {
  const dal = getDal();
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["settings", CRM_TASKS_KEY], queryFn: () => dal.settings.get<CrmTask[]>(CRM_TASKS_KEY, CRM_TASKS_SEED) });
  const { data: overlay = {} } = useQuery({ queryKey: ["settings", CRM_OPPS_KEY], queryFn: () => dal.settings.get<CrmOppOverlayMap>(CRM_OPPS_KEY, {}) });

  const today = todayIso();

  const stats = useMemo(() => {
    const open = leads.filter(isOpenOpportunity);
    const pipeline = open.reduce((s, l) => s + oppValueCents(l, overlay), 0);
    const weighted = open.reduce((s, l) => s + Math.round(oppValueCents(l, overlay) * oppProbability(l, overlay) / 100), 0);
    const booked = leads.filter(l => l.stage === "booked").length;
    const lost = leads.filter(l => l.stage === "lost").length;
    const decided = booked + lost;
    const winRate = decided > 0 ? Math.round((booked / decided) * 100) : 0;
    return { openCount: open.length, pipeline, weighted, booked, lost, winRate };
  }, [leads, overlay]);

  const taskLoad = useMemo(() => {
    const active = tasks.filter(t => !t.done);
    const due = (t: CrmTask) => t.dueDate ?? today;
    return {
      dueToday: active.filter(t => due(t) === today).length,
      overdue: active.filter(t => due(t) < today).length,
      openTotal: active.length,
    };
  }, [tasks, today]);

  const feed = useMemo(() => {
    const rows = leads.flatMap(l => (l.activity ?? []).map(a => ({ ...a, lead: leadLabel(l) })));
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }, [leads]);

  const byStage = useMemo(() => {
    const open = leads.filter(isOpenOpportunity);
    const map = new Map<string, { count: number; value: number }>();
    for (const l of open) {
      const cur = map.get(l.stage) ?? { count: 0, value: 0 };
      cur.count += 1; cur.value += oppValueCents(l, overlay);
      map.set(l.stage, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [leads, overlay]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading CRM…</p>;
  const maxStageVal = Math.max(1, ...byStage.map(([, v]) => v.value));

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">CRM Dashboard</h1>
        <p className="text-sm text-zinc-500">Pipeline, tasks and activity at a glance</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Open opportunities" value={String(stats.openCount)} />
        <Kpi label="Pipeline value" value={formatCents(stats.pipeline)} accent />
        <Kpi label="Weighted forecast" value={formatCents(stats.weighted)} />
        <Kpi label="Win rate" value={`${stats.winRate}%`} />
        <Kpi label="Tasks overdue" value={String(taskLoad.overdue)} warn={taskLoad.overdue > 0} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Pipeline by stage</h2>
          {byStage.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No open opportunities.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {byStage.map(([stage, v]) => (
                <li key={stage}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-zinc-200">{STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage} <span className="text-zinc-500">· {v.count}</span></span>
                    <span className="font-mono text-fire-light">{formatCents(v.value)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full bg-fire" style={{ width: `${Math.round((v.value / maxStageVal) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-4 border-t border-ink-800 pt-3 text-sm">
            <span className="text-zinc-400">Tasks due today: <span className="font-bold text-zinc-100">{taskLoad.dueToday}</span></span>
            <span className="text-zinc-400">Open tasks: <span className="font-bold text-zinc-100">{taskLoad.openTotal}</span></span>
          </div>
        </section>

        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Recent activity</h2>
          {feed.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {feed.map(a => (
                <li key={a.id} className="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-200">{a.lead}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{fmtAt(a.at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400"><span className="uppercase text-zinc-500">{a.kind}</span> · {a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-amber-700/50 bg-amber-950/20" : "border-ink-700 bg-ink-900"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${accent ? "text-fire-light" : warn ? "text-amber-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}
