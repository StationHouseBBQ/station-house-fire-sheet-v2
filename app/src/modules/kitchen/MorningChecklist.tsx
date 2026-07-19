import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ChecklistItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { usePersistentState, type TempReading } from "./_data/localState";

/**
 * Kitchen · Morning Checklist — V2 implementation of the Manus
 * KitchenChecklist, folding in the food-safety temperature capture from
 * FoodTempLog / HACCPLog.
 *
 * Parity additions over the lean version:
 *  - Collapsible sections (Manus collapsedSections) with per-section progress
 *  - Manager-name entry dialog on sign-off (Manus managerName)
 *  - Per-item notes (module-local, persist across refresh)
 *  - A Food Temperature Log panel: hot/cold/ambient items with required
 *    ranges, pass/fail, corrective action, timestamp & taker — a HACCP-style
 *    record the manager reviews before signing off.
 */

type Sync = "idle" | "saving" | "saved" | "error";
const TEMPLATE_ID = "kitchen-morning";

interface TempSpec { name: string; icon: string; type: "hot" | "cold" | "ambient"; min: number | null; max: number | null; }
const TEMP_ITEMS: TempSpec[] = [
  { name: "Brisket", icon: "🥩", type: "hot", min: 135, max: null },
  { name: "Pulled Pork", icon: "🐷", type: "hot", min: 135, max: null },
  { name: "Chicken", icon: "🍗", type: "hot", min: 135, max: null },
  { name: "Ribs", icon: "🍖", type: "hot", min: 135, max: null },
  { name: "Sausage", icon: "🌭", type: "hot", min: 135, max: null },
  { name: "Mac & Cheese", icon: "🧀", type: "hot", min: 135, max: null },
  { name: "Baked Beans", icon: "🫘", type: "hot", min: 135, max: null },
  { name: "Coleslaw", icon: "🥗", type: "cold", min: null, max: 41 },
  { name: "Potato Salad", icon: "🥔", type: "cold", min: null, max: 41 },
  { name: "Sauces (ambient)", icon: "🫙", type: "ambient", min: 50, max: 70 },
];

function passFail(spec: TempSpec, temp: number): "pass" | "fail" {
  if (spec.type === "hot") return temp >= (spec.min ?? 135) ? "pass" : "fail";
  if (spec.type === "cold") return temp <= (spec.max ?? 41) ? "pass" : "fail";
  return temp >= (spec.min ?? 50) && temp <= (spec.max ?? 70) ? "pass" : "fail";
}
function requiredLabel(spec: TempSpec): string {
  if (spec.type === "hot") return `≥ ${spec.min}°F`;
  if (spec.type === "cold") return `≤ ${spec.max}°F`;
  return `${spec.min}–${spec.max}°F`;
}

export function MorningChecklist() {
  const { actor, role } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [signOpen, setSignOpen] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [notesFor, setNotesFor] = useState<string | null>(null);

  const { data: run, isLoading } = useQuery({
    queryKey: ["checklist", TEMPLATE_ID],
    queryFn: () => dal.checklists.getTodayRun(TEMPLATE_ID),
    refetchInterval: 30_000,
  });

  const runDate = run?.runDate ?? "today";
  const [itemNotes, setItemNotes] = usePersistentState<Record<string, string>>(`checklist.notes.${runDate}.v1`, {});
  const [temps, setTemps] = usePersistentState<Record<string, TempReading>>(`checklist.temps.${runDate}.v1`, {});

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
    onSuccess: () => { invalidate(); setSignOpen(false); },
  });

  const sections = useMemo(() => {
    if (!run) return [];
    const m = new Map<string, ChecklistItem[]>();
    for (const it of run.items) (m.get(it.section) ?? m.set(it.section, []).get(it.section)!).push(it);
    return [...m.entries()].map(([section, items]) => ({ section, items }));
  }, [run]);

  if (isLoading || !run) return <p className="py-20 text-center text-zinc-500">Loading checklist…</p>;

  const total = run.items.length;
  const done = run.items.filter(i => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const signedOff = !!run.signedOffBy;
  const canSignOff = role === "owner_admin" || role === "kitchen";

  const tempEntered = Object.keys(temps).filter(k => temps[k]?.tempF != null).length;
  const tempFails = TEMP_ITEMS.filter(s => temps[s.name] && passFail(s, temps[s.name].tempF) === "fail").length;

  const toggleSection = (s: string) =>
    setCollapsed(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  const setTemp = (name: string, tempStr: string) => {
    const t = Number(tempStr);
    setTemps(prev => {
      if (tempStr === "" || Number.isNaN(t)) { const n = { ...prev }; delete n[name]; return n; }
      return { ...prev, [name]: { tempF: t, correctiveAction: prev[name]?.correctiveAction ?? "", takenAt: currentTime().toISOString(), takenBy: actor } };
    });
  };
  const setCorrective = (name: string, text: string) =>
    setTemps(prev => prev[name] ? { ...prev, [name]: { ...prev[name], correctiveAction: text } } : prev);

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
            {run.signedOffAt && <span className="font-normal text-green-500/80"> · {new Date(run.signedOffAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
            <span className="block text-xs font-normal text-green-500/70">Checklist locked — kitchen ready for service.</span>
          </p>
        </div>
      )}

      {/* Overall progress */}
      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-center justify-between">
          <span className="font-bold text-zinc-100">
            {signedOff ? "Complete & signed off" : allDone ? "All items complete — awaiting sign-off" : `${done} / ${total} items`}
          </span>
          <span className={`text-sm font-black ${pct === 100 ? "text-green-400" : "text-fire-light"}`}>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-gradient-to-r from-fire to-fire-light"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Sections */}
      {sections.map(({ section, items }) => {
        const secDone = items.filter(i => i.done).length;
        const secPct = items.length ? Math.round((secDone / items.length) * 100) : 0;
        const isCollapsed = collapsed.has(section);
        return (
          <section key={section} className={`mt-4 overflow-hidden rounded-xl border bg-ink-900 ${secPct === 100 ? "border-green-700/40" : "border-ink-700"}`}>
            <button onClick={() => toggleSection(section)} className="w-full px-4 pt-3 pb-3 text-left" aria-expanded={!isCollapsed}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                  {section} {secPct === 100 && <span className="text-green-400">✓</span>}
                </h2>
                <span className="flex items-center gap-2 text-xs text-zinc-500">{secDone}/{items.length} <span>{isCollapsed ? "▾" : "▴"}</span></span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full transition-all ${secPct === 100 ? "bg-green-500" : "bg-fire"}`} style={{ width: `${secPct}%` }} />
              </div>
            </button>
            {!isCollapsed && (
              <ul className="divide-y divide-ink-800">
                {items.map(it => (
                  <li key={it.id}>
                    <div className={`flex items-center gap-3 px-4 py-3 ${it.done ? "bg-green-500/5" : ""}`}>
                      <button onClick={() => !signedOff && toggleMut.mutate(it.id)} disabled={signedOff} aria-pressed={it.done}
                        className={`flex min-h-[44px] flex-1 items-center gap-3 text-left ${signedOff ? "cursor-default opacity-80" : ""}`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-black ${it.done ? "border-green-500 bg-green-600 text-white" : "border-zinc-600 text-transparent"}`}>✓</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-semibold ${it.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{it.label}</span>
                          {it.done && it.doneBy && <span className="block text-xs text-zinc-600">{it.doneBy}{it.doneAt && ` · ${new Date(it.doneAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}</span>}
                          {itemNotes[it.id] && <span className="mt-0.5 block text-xs text-amber-300/80">📝 {itemNotes[it.id]}</span>}
                        </span>
                      </button>
                      <button onClick={() => setNotesFor(it.id)} aria-label={`Note for ${it.label}`}
                        className="min-h-[40px] min-w-[40px] shrink-0 rounded-lg border border-ink-700 text-zinc-500 hover:text-zinc-300">📝</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Food temperature log */}
      <section className="mt-6 overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
        <header className="border-b border-ink-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">🌡️ Food Temperature Log</h2>
            <span className="text-xs text-zinc-500">{tempEntered}/{TEMP_ITEMS.length} logged{tempFails > 0 && <span className="ml-1 font-bold text-red-400">· {tempFails} fail</span>}</span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">HACCP holding temps — recorded before sign-off.</p>
        </header>
        <ul className="divide-y divide-ink-800">
          {TEMP_ITEMS.map(spec => {
            const reading = temps[spec.name];
            const pf = reading ? passFail(spec, reading.tempF) : null;
            return (
              <li key={spec.name} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg" aria-hidden>{spec.icon}</span>
                  <div className="min-w-0 flex-1 basis-32">
                    <p className="truncate text-sm font-semibold text-zinc-100">{spec.name}</p>
                    <p className="text-xs text-zinc-500">Target {requiredLabel(spec)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input inputMode="decimal" value={reading?.tempF != null ? String(reading.tempF) : ""}
                      onChange={e => setTemp(spec.name, e.target.value)} placeholder="—"
                      aria-label={`${spec.name} temperature`}
                      className="w-20 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-center text-sm font-bold text-zinc-100 placeholder:text-zinc-600" />
                    <span className="text-sm text-zinc-500">°F</span>
                  </div>
                  {pf && (
                    <span className={`rounded px-2 py-1 text-xs font-black uppercase ${pf === "pass" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                      {pf === "pass" ? "Pass" : "Fail"}
                    </span>
                  )}
                </div>
                {pf === "fail" && (
                  <input value={reading?.correctiveAction ?? ""} onChange={e => setCorrective(spec.name, e.target.value)}
                    placeholder="Corrective action (e.g. reheat to 165°F, discard)…" aria-label={`Corrective action for ${spec.name}`}
                    className="mt-2 w-full rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
                )}
                {reading && (
                  <p className="mt-1 text-[11px] text-zinc-600">{reading.takenBy} · {new Date(reading.takenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Sign-off footer */}
      {!signedOff && canSignOff && (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button onClick={() => setSignOpen(true)} disabled={!allDone}
              className="min-h-[52px] w-full rounded-xl bg-green-600 px-4 py-3 text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
              {allDone ? "🛡️ Manager Sign-Off" : `Manager Sign-Off — ${total - done} item${total - done !== 1 ? "s" : ""} left`}
            </button>
          </div>
        </footer>
      )}

      {/* Sign-off dialog */}
      {signOpen && (
        <div role="dialog" aria-modal="true" aria-label="Manager sign-off"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
            onSubmit={e => { e.preventDefault(); signOffMut.mutate(); }}>
            <h3 className="text-lg font-bold text-zinc-100">🛡️ Manager Sign-Off</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Confirms all {total} tasks complete{tempEntered > 0 && ` and ${tempEntered} temps logged`}.
              {tempFails > 0 && <span className="text-red-400"> {tempFails} temp fail(s) recorded — verify corrective actions.</span>}
            </p>
            <label className="mt-4 block text-sm font-semibold text-zinc-400">Manager name (optional)
              <input value={managerName} onChange={e => setManagerName(e.target.value)} autoFocus
                placeholder="Your name"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSignOpen(false)}
                className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
              <button type="submit" disabled={signOffMut.isPending}
                className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {signOffMut.isPending ? "Signing off…" : "Confirm sign-off"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Item note dialog */}
      {notesFor && (
        <NoteDialog initial={itemNotes[notesFor] ?? ""}
          label={run.items.find(i => i.id === notesFor)?.label ?? "Item"}
          onSave={text => { setItemNotes(prev => { const n = { ...prev }; if (text.trim()) n[notesFor] = text.trim(); else delete n[notesFor]; return n; }); setNotesFor(null); }}
          onCancel={() => setNotesFor(null)} />
      )}
    </div>
  );
}

function NoteDialog({ initial, label, onSave, onCancel }: { initial: string; label: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Note for ${label}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5" onSubmit={e => { e.preventDefault(); onSave(text); }}>
        <h3 className="text-base font-bold text-zinc-100">Note — {label}</h3>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
          placeholder="e.g. walk-in reading a bit high, monitoring"
          className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">Save note</button>
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
