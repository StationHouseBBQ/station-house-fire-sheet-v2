import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ChecklistItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Seminole · FOH Daily Checklist — V2 counterpart of the Manus
 * RetailChecklist. Section-phase filter tabs (All / Opening / Floor /
 * Closing), collapsible sections, per-section + overall progress, and a
 * Manager Sign-Off dialog that captures the manager's name (owner_admin or
 * counter_foh) and locks the run once every item is done. Runs on the
 * "foh-daily" template through the shared checklist repo.
 */

type Sync = "idle" | "saving" | "saved" | "error";
const TEMPLATE_ID = "foh-daily";

const SECTION_META: Record<string, { emoji: string; cls: string }> = {
  Opening: { emoji: "🌅", cls: "text-amber-400" },
  Floor: { emoji: "🧹", cls: "text-cyan-400" },
  Closing: { emoji: "🌙", cls: "text-fire-light" },
};

export function FohChecklist() {
  const { actor, role } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [phase, setPhase] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [managerName, setManagerName] = useState("");

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
    // The DAL records the actor; we pass the typed manager name via a scoped
    // actor string so the sign-off attribution reflects who signed.
    mutationFn: (name: string) => withSync(dal.checklists.managerSignOff(run!.id, name.trim() || actor)),
    onSuccess: () => { setSignOffOpen(false); setManagerName(""); invalidate(); },
  });

  const allSections = useMemo(() => {
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

  const phaseTabs = ["all", ...allSections.map(s => s.section)];
  const sections = phase === "all" ? allSections : allSections.filter(s => s.section === phase);

  const toggleCollapse = (section: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(section)) next.delete(section); else next.add(section);
    return next;
  });

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">📋 {run.templateName}</h1>
          <p className="text-sm text-zinc-500">{run.runDate} · {done}/{total} done</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Phase filter tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        {phaseTabs.map(p => {
          const secItems = p === "all" ? run.items : allSections.find(s => s.section === p)?.items ?? [];
          const secDone = secItems.filter(i => i.done).length;
          const complete = secItems.length > 0 && secDone === secItems.length;
          const meta = p === "all" ? { emoji: "📋", cls: "text-zinc-300" } : SECTION_META[p] ?? { emoji: "•", cls: "text-zinc-300" };
          return (
            <button key={p} onClick={() => setPhase(p)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all ${
                phase === p ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-900 text-zinc-400 hover:text-zinc-100"}`}>
              <span aria-hidden>{meta.emoji}</span>
              {p === "all" ? "All" : p}
              <span className={`text-xs ${phase === p ? "text-white/80" : "text-zinc-600"}`}>
                {secDone}/{secItems.length}{complete && " ✓"}
              </span>
            </button>
          );
        })}
      </div>

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
        const isCollapsed = collapsed.has(section);
        const meta = SECTION_META[section] ?? { emoji: "•", cls: "text-zinc-300" };
        return (
          <section key={section}
            className={`mt-4 overflow-hidden rounded-xl border bg-ink-900 ${secPct === 100 ? "border-green-700/40" : "border-ink-700"}`}>
            <button onClick={() => toggleCollapse(section)}
              className="w-full px-4 pt-3 pb-3 text-left" aria-expanded={!isCollapsed}>
              <div className="flex items-center justify-between">
                <h2 className={`flex items-center gap-2 text-sm font-black uppercase tracking-wider ${meta.cls}`}>
                  <span aria-hidden>{meta.emoji}</span> {section} {secPct === 100 && <span className="text-green-400">✓</span>}
                </h2>
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {secDone}/{items.length}
                  <span aria-hidden>{isCollapsed ? "▼" : "▲"}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full transition-all ${secPct === 100 ? "bg-green-500" : "bg-fire"}`} style={{ width: `${secPct}%` }} />
              </div>
            </button>
            {!isCollapsed && (
              <ul className="divide-y divide-ink-800 border-t border-ink-800">
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
            )}
          </section>
        );
      })}

      {!signedOff && canSignOff && (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button onClick={() => { setManagerName(actor.replace(/^demo:/, "")); setSignOffOpen(true); }} disabled={!allDone}
              className="min-h-[52px] w-full rounded-xl bg-green-600 px-4 py-3 text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
              {allDone ? "🛡️ Manager Sign-Off" : `Manager Sign-Off — ${total - done} item${total - done !== 1 ? "s" : ""} left`}
            </button>
          </div>
        </footer>
      )}

      {signOffOpen && (
        <div role="dialog" aria-modal="true" aria-label="Manager sign-off"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
            onSubmit={e => { e.preventDefault(); if (managerName.trim()) signOffMut.mutate(managerName); }}>
            <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-100"><span aria-hidden>🛡️</span> Manager Sign-Off</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Confirm all {total} items are complete. This locks the checklist for the day.
            </p>
            <label className="mt-4 block text-sm font-semibold text-zinc-400">Manager name
              <input autoFocus value={managerName} onChange={e => setManagerName(e.target.value)} required
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSignOffOpen(false)}
                className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
              <button type="submit" disabled={signOffMut.isPending || managerName.trim() === ""}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {signOffMut.isPending ? "Signing off…" : "Sign off & lock"}
              </button>
            </div>
          </form>
        </div>
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
