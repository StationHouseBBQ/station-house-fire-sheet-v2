import { useState } from "react";
import { currentTime } from "../../lib/clock";
import { SyncBadge, timeLabel, uid, useSettingsState } from "./_ext/opsState";
import { seedTasks } from "./_ext/opsSeeds";

/**
 * Kitchen · Task Board — kanban (To do / In progress / Done) for kitchen
 * prep & cleaning tasks. Create a card (title, assignee, priority), move it
 * across columns with ◀ ▶ controls, and it stamps who/when on each move.
 * Persists via dal.settings key "kitchen.tasks".
 */

export type TaskStatus = "todo" | "in_progress" | "done";
export type Priority = "low" | "med" | "high";

export interface TaskCard {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string;
  priority: Priority;
  createdAt: string;
  movedAt: string;
}

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "todo", label: "To Do", accent: "text-zinc-300 border-ink-700" },
  { status: "in_progress", label: "In Progress", accent: "text-amber-400 border-amber-700/50" },
  { status: "done", label: "Done", accent: "text-green-400 border-green-700/50" },
];

const PRIORITY_META: Record<Priority, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-red-900 text-red-300" },
  med: { label: "Med", cls: "bg-amber-900 text-amber-300" },
  low: { label: "Low", cls: "bg-ink-700 text-zinc-300" },
};

const ASSIGNEES = ["Unassigned", "Marcus", "Dana", "Jess", "Tyler"];

const NEXT: Record<TaskStatus, TaskStatus | null> = { todo: "in_progress", in_progress: "done", done: null };
const PREV: Record<TaskStatus, TaskStatus | null> = { todo: null, in_progress: "todo", done: "in_progress" };

export function KitchenTaskBoard() {
  const { value: tasks, set: setTasks, loading, sync } = useSettingsState<TaskCard[]>("kitchen.tasks", seedTasks());
  const [addOpen, setAddOpen] = useState(false);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  if (loading) return <p className="py-20 text-center text-zinc-500">Loading task board…</p>;

  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const move = (id: string, dir: "next" | "prev") => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const target = dir === "next" ? NEXT[t.status] : PREV[t.status];
      if (!target) return t;
      return { ...t, status: target, movedAt: currentTime().toISOString() };
    }));
  };

  const addTask = (title: string, assignee: string, priority: Priority) => {
    const now = currentTime().toISOString();
    setTasks(prev => [{ id: uid(), title, status: "todo", assignee, priority, createdAt: now, movedAt: now }, ...prev]);
    setAddOpen(false);
  };

  const removeTask = (id: string) => {
    if (armedDelete === id) {
      setTasks(prev => prev.filter(t => t.id !== id));
      setArmedDelete(null);
    } else {
      setArmedDelete(id);
      setTimeout(() => setArmedDelete(prev => (prev === id ? null : prev)), 4000);
    }
  };

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">📋 Task Board</h1>
          <p className="text-sm text-zinc-500">Kitchen prep &amp; cleaning · {done}/{total} done</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setAddOpen(true)} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New task</button>
        </div>
      </header>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full transition-all ${pct === 100 ? "bg-green-500" : "bg-gradient-to-r from-fire to-fire-light"}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.status);
          return (
            <section key={col.status} className={`rounded-xl border bg-ink-900/60 ${col.accent.split(" ")[1]}`}>
              <header className={`flex items-center justify-between border-b px-3 py-2.5 ${col.accent.split(" ")[1]}`}>
                <h2 className={`text-sm font-black uppercase tracking-wider ${col.accent.split(" ")[0]}`}>{col.label}</h2>
                <span className="text-xs text-zinc-500">{colTasks.length}</span>
              </header>
              <ul className="min-h-[80px] space-y-2 p-3">
                {colTasks.length === 0 && <li className="py-6 text-center text-xs text-zinc-600">No tasks</li>}
                {colTasks.map(t => (
                  <li key={t.id} className={`rounded-lg border border-ink-700 bg-ink-900 p-3 ${t.status === "done" ? "opacity-70" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${t.status === "done" ? "text-zinc-400 line-through" : "text-zinc-100"}`}>{t.title}</p>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${PRIORITY_META[t.priority].cls}`}>{PRIORITY_META[t.priority].label}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">👤 {t.assignee} · {timeLabel(t.movedAt)}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button onClick={() => move(t.id, "prev")} disabled={!PREV[t.status]} aria-label="Move left"
                        className="min-h-[32px] flex-1 rounded-md border border-ink-700 bg-ink-800 text-xs font-bold text-zinc-300 disabled:opacity-30">◀</button>
                      <button onClick={() => move(t.id, "next")} disabled={!NEXT[t.status]} aria-label="Move right"
                        className="min-h-[32px] flex-1 rounded-md border border-ink-700 bg-ink-800 text-xs font-bold text-zinc-300 disabled:opacity-30">▶</button>
                      <button onClick={() => removeTask(t.id)} aria-label="Delete task"
                        className={`min-h-[32px] rounded-md border px-2 text-xs font-bold transition-colors ${armedDelete === t.id ? "animate-pulse border-red-500 bg-red-500/20 text-red-300" : "border-ink-700 bg-ink-800 text-zinc-500"}`}>
                        {armedDelete === t.id ? "Confirm?" : "✕"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {addOpen && <AddDialog onAdd={addTask} onCancel={() => setAddOpen(false)} />}
    </div>
  );
}

function AddDialog({ onAdd, onCancel }: { onAdd: (title: string, assignee: string, priority: Priority) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(ASSIGNEES[0]);
  const [priority, setPriority] = useState<Priority>("med");
  return (
    <div role="dialog" aria-modal="true" aria-label="New task" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (title.trim()) onAdd(title.trim(), assignee, priority); }}>
        <h3 className="text-lg font-bold text-zinc-100">New task</h3>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Task
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus required placeholder="e.g. Trim & season briskets"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Assignee
            <select value={assignee} onChange={e => setAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {ASSIGNEES.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Priority
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              <option value="high">High</option>
              <option value="med">Med</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={!title.trim()} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add task</button>
        </div>
      </form>
    </div>
  );
}
