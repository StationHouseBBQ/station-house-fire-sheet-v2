import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tempTone } from "./pitReference";
import {
  listSessions, startSession, addReading, deleteReading, endSession,
  type SmokeSession,
} from "./pitLocalStore";

/**
 * Live smoke temp-log panel (Manus SmokerTempLog). One active session per
 * protein; log pit + internal readings over time with target-relative color
 * coding, "N° to go", finish/abandon, and a collapsible session history.
 * Backed by pit-module-local IndexedDB state (pitLocalStore).
 */

function fmtDur(startIso: string, endIso: string | null): string {
  const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TempLogPanel({ proteinSlug, proteinName, defaultPitF, defaultInternalF, defaultWood }: {
  proteinSlug: string; proteinName: string; defaultPitF: number; defaultInternalF: number; defaultWood: string;
}) {
  const qc = useQueryClient();
  const [startOpen, setStartOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const sessionsQ = useQuery({
    queryKey: ["pit", "tempSessions"],
    queryFn: () => listSessions(),
    refetchInterval: 30_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pit", "tempSessions"] });

  const all = sessionsQ.data ?? [];
  const active = all.find(s => s.proteinSlug === proteinSlug && s.status === "active") ?? null;
  const past = all.filter(s => s.proteinSlug === proteinSlug && s.status !== "active");

  const startMut = useMutation({
    mutationFn: (input: Parameters<typeof startSession>[0]) => startSession(input),
    onSuccess: () => { invalidate(); setStartOpen(false); },
  });
  const readingMut = useMutation({
    mutationFn: (input: { sessionId: string; r: { pitTempF: number; internalTempF: number | null; note: string } }) =>
      addReading(input.sessionId, input.r),
    onSuccess: invalidate,
  });
  const delReadingMut = useMutation({
    mutationFn: (input: { sessionId: string; readingId: string }) => deleteReading(input.sessionId, input.readingId),
    onSuccess: invalidate,
  });
  const endMut = useMutation({
    mutationFn: (input: { sessionId: string; status: "completed" | "abandoned" }) => endSession(input.sessionId, input.status),
    onSuccess: invalidate,
  });

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Live temp log</h2>
        {!active && (
          <button onClick={() => { startMut.reset(); setStartOpen(true); }}
            className="min-h-[44px] rounded-lg border border-green-700/50 bg-ink-800 px-4 py-2 text-sm font-bold text-green-400">
            ▶ Start session
          </button>
        )}
      </div>

      {!active && (
        <p className="mt-3 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">
          No active smoke session for {proteinName}. Start one to log pit and internal temps.
        </p>
      )}

      {active && (
        <div className="mt-3 rounded-2xl border border-green-800/50 bg-green-950/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-black text-white">● LIVE</span>
            <span className="text-xs text-zinc-500">Started {fmtClock(active.startedAt)} · running {fmtDur(active.startedAt, null)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span>🎯 Pit {active.targetPitF}°F</span>
            <span>🌡 Internal {active.targetInternalF}°F</span>
            {active.woodChoice && <span>🪵 {active.woodChoice}</span>}
            {active.rawLbs !== null && <span>⚖️ {active.rawLbs} lbs raw</span>}
          </div>

          {(() => {
            const last = active.readings[active.readings.length - 1];
            if (!last) return null;
            const toGo = active.targetInternalF - (last.internalTempF ?? 0);
            return (
              <p className="mt-2 text-sm text-zinc-300">
                Last: <TempBadge temp={last.pitTempF} target={active.targetPitF} /> pit
                {last.internalTempF !== null && (
                  <> · <span className="font-bold text-zinc-100">{last.internalTempF}°F</span> internal
                    {" "}{toGo > 0 ? <span className="text-amber-300">({toGo}° to go)</span> : <span className="text-green-400">✓ at temp</span>}</>
                )}
              </p>
            );
          })()}

          <ReadingForm
            targetPit={active.targetPitF}
            busy={readingMut.isPending}
            onSubmit={r => readingMut.mutate({ sessionId: active.id, r })}
          />

          {active.readings.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 bg-ink-800 text-left text-[11px] font-bold uppercase text-zinc-500">
                    <th className="px-3 py-2">Time</th><th className="px-3 py-2">Pit</th><th className="px-3 py-2">Internal</th>
                    <th className="px-3 py-2">Note</th><th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...active.readings].reverse().map(r => (
                    <tr key={r.id} className="border-b border-ink-800 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{fmtClock(r.at)}</td>
                      <td className="px-3 py-2"><TempBadge temp={r.pitTempF} target={active.targetPitF} /></td>
                      <td className="px-3 py-2">
                        {r.internalTempF !== null
                          ? <span className={r.internalTempF >= active.targetInternalF ? "font-bold text-green-400" : "text-blue-400"}>{r.internalTempF}°F</span>
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">{r.note || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => delReadingMut.mutate({ sessionId: active.id, readingId: r.id })}
                          aria-label="Delete reading" className="text-zinc-600 hover:text-red-400">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button onClick={() => endMut.mutate({ sessionId: active.id, status: "completed" })}
              disabled={endMut.isPending}
              className="min-h-[44px] flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">✓ Done</button>
            <button onClick={() => endMut.mutate({ sessionId: active.id, status: "abandoned" })}
              disabled={endMut.isPending}
              className="min-h-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50">Abandon</button>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setHistoryOpen(o => !o)} aria-expanded={historyOpen}
            className="text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            {historyOpen ? "▾" : "▸"} Session history ({past.length})
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-2">
              {past.map(s => <HistoryRow key={s.id} s={s} />)}
            </ul>
          )}
        </div>
      )}

      {startOpen && (
        <StartDialog
          proteinName={proteinName}
          defaultPitF={defaultPitF} defaultInternalF={defaultInternalF} defaultWood={defaultWood}
          busy={startMut.isPending}
          error={startMut.error?.message ?? null}
          onCancel={() => setStartOpen(false)}
          onSubmit={input => startMut.mutate({ proteinSlug, proteinName, ...input })}
        />
      )}
    </section>
  );
}

function TempBadge({ temp, target }: { temp: number; target: number }) {
  const tone = tempTone(temp, target);
  const diff = Math.abs(temp - target);
  const cls = tone === "ok" ? "bg-green-600/20 text-green-400" : tone === "over" ? "bg-red-600/20 text-red-400" : "bg-orange-600/20 text-orange-400";
  const arrow = tone === "over" ? ` ↑${diff}` : tone === "under" ? ` ↓${diff}` : "";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>{temp}°F{arrow}</span>;
}

function ReadingForm({ targetPit, busy, onSubmit }: {
  targetPit: number; busy: boolean; onSubmit: (r: { pitTempF: number; internalTempF: number | null; note: string }) => void;
}) {
  const [pit, setPit] = useState("");
  const [internal, setInternal] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      onSubmit={e => {
        e.preventDefault();
        const p = Number(pit);
        if (!Number.isFinite(p)) return setErr("Pit temp required");
        setErr(null);
        onSubmit({ pitTempF: p, internalTempF: internal.trim() === "" ? null : Number(internal), note: note.trim() });
        setPit(""); setInternal(""); setNote("");
      }}>
      <input inputMode="numeric" value={pit} onChange={e => setPit(e.target.value)} placeholder={`Pit (${targetPit}°)`}
        aria-label="Pit temp" className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
      <input inputMode="numeric" value={internal} onChange={e => setInternal(e.target.value)} placeholder="Internal"
        aria-label="Internal temp" className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
        aria-label="Note" className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
      <button type="submit" disabled={busy}
        className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Log</button>
      {err && <p className="col-span-2 text-xs text-red-400 sm:col-span-4">{err}</p>}
    </form>
  );
}

function HistoryRow({ s }: { s: SmokeSession }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${s.status === "completed" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
          {s.status === "completed" ? "✓ Done" : "✗ Abandoned"}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{fmtClock(s.startedAt)} · {fmtDur(s.startedAt, s.endedAt)} · {s.readings.length} readings</span>
        <span className="text-zinc-600">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-ink-800 px-3 py-2 text-xs text-zinc-400">
          {s.readings.length === 0 ? <p>No readings logged.</p> : (
            <ul className="space-y-1">
              {s.readings.map(r => (
                <li key={r.id}>{fmtClock(r.at)} — pit {r.pitTempF}°F{r.internalTempF !== null ? ` · internal ${r.internalTempF}°F` : ""}{r.note ? ` · ${r.note}` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function StartDialog({ proteinName, defaultPitF, defaultInternalF, defaultWood, busy, error, onSubmit, onCancel }: {
  proteinName: string; defaultPitF: number; defaultInternalF: number; defaultWood: string;
  busy: boolean; error: string | null;
  onSubmit: (input: { targetPitF: number; targetInternalF: number; woodChoice: string; rawLbs: number | null; notes: string }) => void;
  onCancel: () => void;
}) {
  const [pit, setPit] = useState(String(defaultPitF));
  const [internal, setInternal] = useState(String(defaultInternalF));
  const [wood, setWood] = useState(defaultWood);
  const [rawLbs, setRawLbs] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const shown = err ?? error;
  return (
    <div role="dialog" aria-modal="true" aria-label="Start smoke session"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          const p = Number(pit), i = Number(internal);
          if (!Number.isFinite(p) || p <= 0) return setErr("Target pit temp required");
          if (!Number.isFinite(i) || i <= 0) return setErr("Target internal temp required");
          setErr(null);
          onSubmit({ targetPitF: p, targetInternalF: i, woodChoice: wood.trim(), rawLbs: rawLbs.trim() === "" ? null : Number(rawLbs), notes: notes.trim() });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">Start smoke session · {proteinName}</h3>
        {shown && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{shown}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Target pit °F
            <input inputMode="numeric" value={pit} onChange={e => setPit(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Target internal °F
            <input inputMode="numeric" value={internal} onChange={e => setInternal(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Wood
          <input value={wood} onChange={e => setWood(e.target.value)} placeholder="e.g. Post oak"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Raw lbs on smoker (optional)
          <input inputMode="decimal" value={rawLbs} onChange={e => setRawLbs(e.target.value)} placeholder="e.g. 40"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes (optional)
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Starting…" : "Start session"}
          </button>
        </div>
      </form>
    </div>
  );
}
