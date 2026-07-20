import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import type { CrmTask, CrmTaskPriority } from "./_data/types";
import { CRM_TASKS_KEY } from "./_data/keys";
import { CRM_TASKS_SEED } from "./_data/seeds";
import { fmtDate, todayIso, leadLabel } from "./_data/util";

/**
 * CRM · Tasks — a follow-up task board over dal.settings["crm.tasks"].
 * Create / edit / complete tasks, optionally linked to a lead, with
 * today / upcoming / overdue / done filters. Source: Manus CrmTasks.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type Filter = "today" | "upcoming" | "overdue" | "done";

const PRIORITIES: CrmTaskPriority[] = ["low", "normal", "high", "urgent"];
const PRIORITY_DOT: Record<CrmTaskPriority, string> = {
  low: "bg-zinc-500", normal: "bg-sky-400", high: "bg-amber-400", urgent: "bg-red-500",
};
const PRIORITY_BADGE: Record<CrmTaskPriority, string> = {
  low: "text-zinc-400 border-ink-700",
  normal: "text-sky-300 border-sky-700/50",
  high: "text-amber-300 border-amber-700/50",
  urgent: "text-red-300 border-red-700/50",
};

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "today", label: "Due today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "done", label: "Done" },
];

/** A seed task with dueDate null is treated as "due today" for the demo. */
function effectiveDue(t: CrmTask): string {
  return t.dueDate ?? todayIso();
}

function bucketOf(t: CrmTask, today: string): Filter {
  if (t.done) return "done";
  const due = effectiveDue(t);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

export function CrmTasks() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [filter, setFilter] = useState<Filter>("today");
  const [editing, setEditing] = useState<CrmTask | "new" | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["settings", CRM_TASKS_KEY],
    queryFn: () => dal.settings.get<CrmTask[]>(CRM_TASKS_KEY, CRM_TASKS_SEED),
  });
  const { data: leads = [] } = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });

  const save = useMutation({
    mutationFn: (next: CrmTask[]) => {
      setSync("saving");
      return dal.settings.set(CRM_TASKS_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", CRM_TASKS_KEY] }),
  });

  const today = todayIso();
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { today: 0, upcoming: 0, overdue: 0, done: 0 };
    for (const t of tasks) c[bucketOf(t, today)]++;
    return c;
  }, [tasks, today]);

  const visible = useMemo(() => {
    return tasks
      .filter(t => bucketOf(t, today) === filter)
      .sort((a, b) => effectiveDue(a).localeCompare(effectiveDue(b)));
  }, [tasks, filter, today]);

  function upsert(input: Omit<CrmTask, "createdAt" | "updatedAt" | "createdBy" | "id"> & { id?: string }) {
    const now = currentTime().toISOString();
    const existing = input.id ? tasks.find(t => t.id === input.id) : undefined;
    const rec: CrmTask = {
      id: input.id ?? `task-${Date.now()}`,
      title: input.title,
      dueDate: input.dueDate,
      priority: input.priority,
      done: input.done,
      leadId: input.leadId,
      linkedLabel: input.linkedLabel,
      notes: input.notes,
      createdBy: existing?.createdBy ?? "manual",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing ? tasks.map(t => (t.id === rec.id ? rec : t)) : [rec, ...tasks];
    save.mutate(next);
    setEditing(null);
  }

  function toggleDone(t: CrmTask) {
    const now = currentTime().toISOString();
    save.mutate(tasks.map(x => (x.id === t.id ? { ...x, done: !x.done, updatedAt: now } : x)));
  }

  function remove(id: string) {
    save.mutate(tasks.filter(t => t.id !== id));
  }

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading tasks…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Tasks</h1>
          <p className="text-sm text-zinc-500">{counts.overdue} overdue · {counts.today} due today</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Task</button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              filter === f.id ? "border-fire/60 bg-ink-800 text-fire-light" : "border-ink-700 bg-ink-900 text-zinc-400"
            }`}>
            {f.label} <span className="text-zinc-500">· {counts[f.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No tasks in this view.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map(t => (
            <li key={t.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleDone(t)} aria-label={t.done ? "Mark not done" : "Mark done"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-black ${
                    t.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-ink-700 bg-ink-800 text-transparent"
                  }`}>✓</button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} aria-label={`Priority ${t.priority}`} />
                    <p className={`min-w-0 flex-1 font-semibold ${t.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{t.title}</p>
                    <span className={`rounded-full border bg-ink-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Due {fmtDate(effectiveDue(t))}
                    {t.linkedLabel ? ` · ${t.linkedLabel}` : ""}
                  </p>
                  {t.notes && <p className="mt-1 text-sm text-zinc-400">{t.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEditing(t)}
                    className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Edit</button>
                  <button onClick={() => remove(t.id)}
                    className="min-h-[44px] rounded-lg border border-red-800/60 bg-ink-800 px-3 py-2 text-sm font-semibold text-red-400">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TaskDialog task={editing === "new" ? null : editing} leads={leads} busy={save.isPending}
          onCancel={() => setEditing(null)} onSubmit={upsert} />
      )}
    </div>
  );
}

function TaskDialog({ task, leads, busy, onCancel, onSubmit }: {
  task: CrmTask | null; leads: Lead[]; busy: boolean;
  onCancel: () => void;
  onSubmit: (input: Omit<CrmTask, "createdAt" | "updatedAt" | "createdBy" | "id"> & { id?: string }) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? todayIso());
  const [priority, setPriority] = useState<CrmTaskPriority>(task?.priority ?? "normal");
  const [leadId, setLeadId] = useState<string>(task?.leadId ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [done, setDone] = useState(task?.done ?? false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const lead = leadId ? leads.find(l => l.id === leadId) ?? null : null;
    onSubmit({
      id: task?.id,
      title: title.trim(),
      dueDate: dueDate || null,
      priority,
      done,
      leadId: lead ? lead.id : null,
      linkedLabel: lead ? leadLabel(lead) : task?.linkedLabel ?? null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={task ? "Edit task" : "New task"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-xl font-black text-zinc-100">{task ? "Edit task" : "New task"}</h2>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Title
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="e.g. Follow up on quote"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Due date
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Priority
            <select value={priority} onChange={e => setPriority(e.target.value as CrmTaskPriority)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-sm text-zinc-100">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Linked lead (optional)
          <select value={leadId} onChange={e => setLeadId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-sm text-zinc-100">
            <option value="">— None —</option>
            {leads.map(l => <option key={l.id} value={l.id}>{leadLabel(l)}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
        </label>
        {task && (
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} className="h-4 w-4" />
            Completed
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !title.trim()}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save task"}
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
