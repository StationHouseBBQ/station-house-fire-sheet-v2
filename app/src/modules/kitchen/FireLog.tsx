import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { SyncBadge, timeLabel, uid, useSettingsState } from "./_ext/opsState";
import { seedCooks } from "./_ext/opsSeeds";

/**
 * Kitchen · Fire Log — smoker pit-temp log across a cook.
 * Start a cook (smoker, protein, target temp), then log readings over time
 * (pit temp, internal/actual temp, wood added, note). Each active cook shows
 * a simple vertical timeline of readings; finished cooks fold into history.
 * Persists via dal.settings key "kitchen.firelog".
 */

export interface Reading {
  id: string;
  pitTempF: number;
  actualTempF: number | null;
  woodAdded: string;
  note: string;
  takenBy: string;
  takenAt: string;
}

export interface Cook {
  id: string;
  smoker: string;
  protein: string;
  targetTempF: number;
  startedAt: string;
  finishedAt: string | null;
  readings: Reading[];
}

const SMOKERS = ["Offset #1", "Offset #2", "Pellet #1", "Pellet #2", "Rotisserie"];
const PROTEINS = ["Brisket", "Pork Butt", "Ribs", "Chicken", "Turkey", "Sausage"];

function elapsed(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function FireLog() {
  const { actor } = useRole();
  const { value: cooks, set: setCooks, loading, sync } = useSettingsState<Cook[]>("kitchen.firelog", seedCooks());
  const [startOpen, setStartOpen] = useState(false);
  const [readingFor, setReadingFor] = useState<string | null>(null);

  const nowIso = currentTime().toISOString();
  const { active, finished } = useMemo(() => {
    const sorted = [...cooks].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return {
      active: sorted.filter(c => !c.finishedAt),
      finished: sorted.filter(c => c.finishedAt),
    };
  }, [cooks]);

  if (loading) return <p className="py-20 text-center text-zinc-500">Loading fire log…</p>;

  const startCook = (smoker: string, protein: string, target: number) => {
    const cook: Cook = {
      id: uid(),
      smoker,
      protein,
      targetTempF: target,
      startedAt: currentTime().toISOString(),
      finishedAt: null,
      readings: [],
    };
    setCooks(prev => [cook, ...prev]);
    setStartOpen(false);
  };

  const addReading = (cookId: string, r: Omit<Reading, "id" | "takenBy" | "takenAt">) => {
    setCooks(prev => prev.map(c => c.id === cookId
      ? { ...c, readings: [...c.readings, { ...r, id: uid(), takenBy: actor, takenAt: currentTime().toISOString() }] }
      : c));
    setReadingFor(null);
  };

  const finishCook = (cookId: string) => {
    setCooks(prev => prev.map(c => c.id === cookId ? { ...c, finishedAt: currentTime().toISOString() } : c));
  };

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🔥 Fire Log</h1>
          <p className="text-sm text-zinc-500">Smoker pit-temp tracking across the cook</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setStartOpen(true)} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Start cook</button>
        </div>
      </header>

      <h2 className="mt-6 text-xs font-black uppercase tracking-wider text-fire-light">Active cooks ({active.length})</h2>
      {active.length === 0 && (
        <p className="mt-2 rounded-xl border border-ink-700 bg-ink-900 py-10 text-center text-sm text-zinc-500">
          No cooks on the pit — start one to begin logging.
        </p>
      )}
      <div className="mt-2 space-y-4">
        {active.map(c => {
          const last = c.readings[c.readings.length - 1] ?? null;
          return (
            <article key={c.id} className="overflow-hidden rounded-xl border border-fire/40 bg-ink-900">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
                <div>
                  <p className="font-black text-zinc-100">{c.protein} <span className="text-sm font-normal text-zinc-500">· {c.smoker}</span></p>
                  <p className="text-xs text-zinc-500">
                    Target {c.targetTempF}°F · on pit {elapsed(c.startedAt, nowIso)}
                    {last?.actualTempF != null && <span className="text-amber-400"> · internal {last.actualTempF}°F</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setReadingFor(c.id)} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-200">+ Reading</button>
                  <button onClick={() => finishCook(c.id)} className="rounded-lg border border-green-700/60 bg-green-950/40 px-3 py-1.5 text-xs font-bold text-green-300">✓ Finish</button>
                </div>
              </header>
              <Timeline cook={c} />
            </article>
          );
        })}
      </div>

      {finished.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-black uppercase tracking-wider text-zinc-400">History ({finished.length})</h2>
          <div className="mt-2 space-y-4">
            {finished.map(c => (
              <article key={c.id} className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
                <header className="border-b border-ink-700 px-4 py-3">
                  <p className="font-bold text-zinc-100">{c.protein} <span className="text-sm font-normal text-zinc-500">· {c.smoker}</span></p>
                  <p className="text-xs text-zinc-500">
                    Target {c.targetTempF}°F · total {c.finishedAt ? elapsed(c.startedAt, c.finishedAt) : "—"} · {c.readings.length} reading{c.readings.length !== 1 ? "s" : ""}
                  </p>
                </header>
                <Timeline cook={c} />
              </article>
            ))}
          </div>
        </>
      )}

      {startOpen && <StartDialog onStart={startCook} onCancel={() => setStartOpen(false)} />}
      {readingFor && <ReadingDialog onAdd={r => addReading(readingFor, r)} onCancel={() => setReadingFor(null)} />}
    </div>
  );
}

function Timeline({ cook }: { cook: Cook }) {
  if (cook.readings.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-zinc-600">No readings logged yet.</p>;
  }
  const ordered = [...cook.readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  return (
    <ol className="relative ml-6 mr-4 my-3 border-l border-ink-700">
      {ordered.map(r => {
        const drift = r.pitTempF - cook.targetTempF;
        const tone = Math.abs(drift) <= 10 ? "text-green-400" : Math.abs(drift) <= 25 ? "text-amber-400" : "text-red-400";
        return (
          <li key={r.id} className="mb-4 ml-4 last:mb-2">
            <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-fire bg-ink-900" aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-sm font-black text-zinc-100">Pit {r.pitTempF}°F</span>
              <span className={`text-xs font-bold ${tone}`}>{drift >= 0 ? "+" : ""}{drift}°F vs target</span>
              {r.actualTempF != null && <span className="text-xs text-amber-300">internal {r.actualTempF}°F</span>}
              <span className="text-[11px] text-zinc-600">{timeLabel(r.takenAt)} · {r.takenBy}</span>
            </div>
            {r.woodAdded && <p className="text-xs text-zinc-400">🪵 {r.woodAdded}</p>}
            {r.note && <p className="text-xs italic text-zinc-500">{r.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function StartDialog({ onStart, onCancel }: { onStart: (smoker: string, protein: string, target: number) => void; onCancel: () => void }) {
  const [smoker, setSmoker] = useState(SMOKERS[0]);
  const [protein, setProtein] = useState(PROTEINS[0]);
  const [targetStr, setTargetStr] = useState("225");
  const target = Number(targetStr);
  const valid = Number.isFinite(target) && target > 0;
  return (
    <div role="dialog" aria-modal="true" aria-label="Start cook" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (valid) onStart(smoker, protein, target); }}>
        <h3 className="text-lg font-bold text-zinc-100">🔥 Start cook</h3>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Smoker
          <select value={smoker} onChange={e => setSmoker(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
            {SMOKERS.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Protein
          <select value={protein} onChange={e => setProtein(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
            {PROTEINS.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Target pit temp (°F)
          <input inputMode="decimal" value={targetStr} onChange={e => setTargetStr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={!valid} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Start cook</button>
        </div>
      </form>
    </div>
  );
}

function ReadingDialog({ onAdd, onCancel }: { onAdd: (r: Omit<Reading, "id" | "takenBy" | "takenAt">) => void; onCancel: () => void }) {
  const [pitStr, setPitStr] = useState("");
  const [actualStr, setActualStr] = useState("");
  const [wood, setWood] = useState("");
  const [note, setNote] = useState("");
  const pit = Number(pitStr);
  const pitValid = pitStr.trim() !== "" && Number.isFinite(pit);
  const actualValid = actualStr.trim() === "" || Number.isFinite(Number(actualStr));
  return (
    <div role="dialog" aria-modal="true" aria-label="Log reading" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          if (!pitValid || !actualValid) return;
          onAdd({ pitTempF: pit, actualTempF: actualStr.trim() === "" ? null : Number(actualStr), woodAdded: wood.trim(), note: note.trim() });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">Log reading</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Pit temp (°F)
            <input inputMode="decimal" autoFocus value={pitStr} onChange={e => setPitStr(e.target.value)} placeholder="225"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-center text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Internal (°F)
            <input inputMode="decimal" value={actualStr} onChange={e => setActualStr(e.target.value)} placeholder="optional"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-center text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Wood added (optional)
          <input value={wood} onChange={e => setWood(e.target.value)} placeholder="e.g. Post oak split"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Note (optional)
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Wrapped, stall, spritzed"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={!pitValid || !actualValid} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add reading</button>
        </div>
      </form>
    </div>
  );
}
