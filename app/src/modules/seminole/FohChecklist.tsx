import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ChecklistItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Seminole · FOH Daily Checklist — V2 counterpart of the Manus
 * RetailChecklist. Same engine as the kitchen MorningChecklist but on the
 * "foh-daily" template: sections with big tap targets, per-section + overall
 * progress, and a Manager Sign-Off (owner_admin or counter_foh) that locks
 * the run once every item is done.
 */

type Sync = "idle" | "saving" | "saved" | "error";
const TEMPLATE_ID = "foh-daily";

export function FohChecklist() {
  const { actor, role } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data: run, isLoading } = useQuery({
    queryKey: ["checklist", TEMPLATE_ID],
    queryFn: () => dal.checklists.getTodayRun(TEMPLATE_ID),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["checklist", TEMPLATE_ID] });

  const toggleMut = useMutation({
    mutationFn: (itemId: string) => withSync(dal.checklists.toggleItem(run!.id, itemId, actor)),
    onSuccess: invalidate,
  });
  const signOffMut = useMutation({
    mutationFn: () => withSync(dal.checklists.managerSignOff(run!.id, actor)),
    onSuccess: invalidate,
  });

  const sections = useMemo(() => {
    if (!run) return [];
    const m = new Map<string, ChecklistItem[]>();
    for (const it of run.items) {
      const list = m.get(it.section) ?? [];
      list.push(it);
      m.set(it.section, list);
    }
    return [...m.entries()].map(([section, items]) => ({ section, items }));
  }, [run]);

  if (isLoading || !run) return <p className="py-20 text-center text-zinc-500">Loading checklist…</p>;

  const total = run.items.length;
  const done = run.items.filter(i => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const signedOff = !!run.signedOffBy;
  const canSignOff = role === "owner_admin" || role === "counter_foh";

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{run.templateName}</h1>
          <p className="text-sm text-zinc-500">{run.runDate} · {done}/{total} done</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {signedOff && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-700/50 bg-green-950/40 px-4 py-3">
          <span aria-hidden>🛡️</span>
          <p className="text-sm font-semibold text-green-400">
            Signed off by {run.signedOffBy}
            {run.signedOffAt && (
              <span className="font-normal text-green-500/80">
                {" "}· {new Date(run.signedOffAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <span className="block text-xs font-normal text-green-500/70">Checklist locked — counter ready for service.</span>
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-center justify-between">
          <span className="font-bold text-zinc-100">
            {signedOff ? "Complete & signed off" : allDone ? "All items complete — awaiting sign-off" : `${done} / ${total} items`}
          </span>
          <span className={`text-sm font-black ${pct === 100 ? "text-green-400" : "text-fire-light"}`}>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar"
          aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-gradient-to-r from-fire to-fire-light"}`}
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {sections.map(({ section, items }) => {
        const secDone = items.filter(i => i.done).length;
        const secPct = items.length ? Math.round((secDone / items.length) * 100) : 0;
        return (
          <section key={section}
            className={`mt-4 overflow-hidden rounded-xl border bg-ink-900 ${secPct === 100 ? "border-green-700/40" : "border-ink-700"}`}>
            <header className="px-4 pt-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                  {section} {secPct === 100 && <span className="text-green-400">✓</span>}
                </h2>
                <span className="text-xs text-zinc-500">{secDone}/{items.length}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full transition-all ${secPct === 100 ? "bg-green-500" : "bg-fire"}`} style={{ width: `${secPct}%` }} />
              </div>
            </header>
            <ul className="mt-2 divide-y divide-ink-800">
              {items.map(it => (
                <li key={it.id}>
                  <button
                    onClick={() => !signedOff && toggleMut.mutate(it.id)}
                    disabled={signedOff}
                    aria-pressed={it.done}
                    className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      it.done ? "bg-green-500/5" : "hover:bg-ink-800/60"
                    } ${signedOff ? "cursor-default opacity-80" : ""}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-black ${
                      it.done ? "border-green-500 bg-green-600 text-white" : "border-zinc-600 text-transparent"
                    }`}>✓</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${it.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{it.label}</span>
                      {it.done && it.doneBy && (
                        <span className="block text-xs text-zinc-600">
                          {it.doneBy}{it.doneAt && ` · ${new Date(it.doneAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!signedOff && canSignOff && (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button onClick={() => signOffMut.mutate()} disabled={!allDone || signOffMut.isPending}
              className="min-h-[52px] w-full rounded-xl bg-green-600 px-4 py-3 text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
              {signOffMut.isPending ? "Signing off…" : allDone ? "🛡️ Manager Sign-Off" : `Manager Sign-Off — ${total - done} item${total - done !== 1 ? "s" : ""} left`}
            </button>
          </div>
        </footer>
      )}
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
