import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { SmokeBatch } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import { formatCents } from "../../lib/money";
import { SMOKERS, STORAGE_LOCATIONS } from "./_data/pitReference";
import { listEvents, recordEvent } from "./_data/pitLocalStore";

/**
 * Pit · Smoked Inventory — deepened to Manus parity.
 * Net on-hand per protein (batches minus pulls + waste), hold-time / use-by
 * tracking (green fresh → amber use-first → red expired), pull & waste event
 * logging with reasons, "running low vs weekly demand" alerts driven off the
 * smoker forecast, and weekly waste totals/cost. Batches use the shared DAL;
 * pull/waste events use pit-module-local IndexedDB state.
 */

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOfWeek(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600_000;
}

const HOLD_HOURS = 96; // house policy: cooked protein good for 96h refrigerated
const ASSUMED_YIELD = 0.65;

interface ProteinRow {
  protein: string;
  cookedIn: number;      // total cooked logged
  pulledOut: number;     // pulls + waste
  onHand: number;        // net
  batches: SmokeBatch[];
  wasteLbs: number;
  lastLoggedAt: string | null;
  demandLbs: number;     // weekly demand estimate
}

type Sync = "idle" | "saving" | "saved" | "error";

export function SmokedInventoryView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [logOpen, setLogOpen] = useState(false);
  const [eventDialog, setEventDialog] = useState<{ protein: string; kind: "pull" | "waste" } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const today = useMemo(() => todayEt(), []);
  const weekStart = useMemo(() => mondayOfWeek(today), [today]);

  const batchesQ = useQuery({ queryKey: ["pit", "smokedInventory", "batches"], queryFn: () => dal.smokedInventory.batches(), refetchInterval: 30_000 });
  const eventsQ = useQuery({ queryKey: ["pit", "invEvents"], queryFn: () => listEvents() });
  const forecastQ = useQuery({ queryKey: ["pit", "forecast", weekStart], queryFn: () => dal.smokerForecast.week(weekStart) });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const logMut = useMutation({
    mutationFn: (b: Omit<SmokeBatch, "id" | "loggedAt">) => withSync(dal.smokedInventory.logBatch(b)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pit", "smokedInventory"] }); setLogOpen(false); },
  });
  const eventMut = useMutation({
    mutationFn: (e: Parameters<typeof recordEvent>[0]) => withSync(recordEvent(e)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pit", "invEvents"] }); setEventDialog(null); },
  });

  const batches = batchesQ.data ?? [];
  const events = eventsQ.data ?? [];

  // weekly demand per protein from the smoker forecast (cooked lbs = raw × yield)
  const demandByProtein = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of forecastQ.data ?? []) m.set(e.protein, (m.get(e.protein) ?? 0) + e.rawLbs * ASSUMED_YIELD);
    return m;
  }, [forecastQ.data]);

  const rows = useMemo<ProteinRow[]>(() => {
    const m = new Map<string, ProteinRow>();
    for (const b of batches) {
      const r = m.get(b.protein) ?? { protein: b.protein, cookedIn: 0, pulledOut: 0, onHand: 0, batches: [], wasteLbs: 0, lastLoggedAt: null, demandLbs: 0 };
      r.cookedIn += b.cookedLbs; r.batches.push(b);
      if (!r.lastLoggedAt || b.loggedAt > r.lastLoggedAt) r.lastLoggedAt = b.loggedAt;
      m.set(b.protein, r);
    }
    for (const e of events) {
      const r = m.get(e.protein) ?? { protein: e.protein, cookedIn: 0, pulledOut: 0, onHand: 0, batches: [], wasteLbs: 0, lastLoggedAt: null, demandLbs: 0 };
      r.pulledOut += e.lbs;
      if (e.kind === "waste") r.wasteLbs += e.lbs;
      m.set(e.protein, r);
    }
    for (const r of m.values()) {
      r.onHand = Math.max(0, r.cookedIn - r.pulledOut);
      r.batches.sort((a, b) => a.date.localeCompare(b.date)); // FIFO
      r.demandLbs = demandByProtein.get(r.protein) ?? 0;
    }
    return [...m.values()].sort((a, b) => b.onHand - a.onHand);
  }, [batches, events, demandByProtein]);

  const totalOnHand = rows.reduce((s, r) => s + r.onHand, 0);
  const lowRows = rows.filter(r => r.demandLbs > 0 && r.onHand < r.demandLbs);
  const useByWarnings = rows.filter(r => r.batches.some(b => b.date && hoursSince(`${b.date}T06:00:00Z`) >= HOLD_HOURS)).length;

  // weekly waste cost from meat costs
  const costsQ = useQuery({ queryKey: ["pit", "meatCosts"], queryFn: () => dal.meatCosts.list() });
  const wasteCostCents = useMemo(() => {
    const cooked = new Map<string, number>();
    for (const c of costsQ.data ?? []) cooked.set(c.protein, Math.round(c.costPerLbCents / (c.yieldPct / 100)));
    let total = 0;
    for (const r of rows) total += (cooked.get(r.protein) ?? 0) * r.wasteLbs;
    return total;
  }, [costsQ.data, rows]);

  if (batchesQ.isLoading) return <p className="py-20 text-center text-zinc-500">Loading smoked inventory…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Smoked Inventory</h1>
          <p className="text-sm text-zinc-500">{Math.round(totalOnHand)} lbs cooked on hand · {today}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => { logMut.reset(); setLogOpen(true); }}
            className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white">+ Log Smoke Batch</button>
        </div>
      </header>

      {/* ── Top metrics ───────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Metric label="Cooked on hand" value={`${Math.round(totalOnHand)} lbs`} />
        <Metric label="Running low" value={String(lowRows.length)} tone={lowRows.length > 0 ? "bad" : undefined} />
        <Metric label="Use-by warnings" value={String(useByWarnings)} tone={useByWarnings > 0 ? "warn" : undefined} />
        <Metric label="Waste cost / wk" value={formatCents(wasteCostCents)} tone={wasteCostCents > 0 ? "bad" : undefined} />
      </div>

      {rows.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-8 text-center text-sm text-zinc-500">
          No batches logged yet — tap "Log Smoke Batch" to record your first smoke.
        </p>
      )}

      {/* ── Running low ───────────────────────────────────────────────── */}
      {lowRows.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-red-400">Running low vs this week's demand</h2>
          <div className="mt-2 space-y-2">
            {lowRows.map(r => {
              const shortfall = Math.round(r.demandLbs - r.onHand);
              return (
                <div key={r.protein} className="rounded-xl border border-red-800/50 bg-red-950/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-zinc-100">{r.protein} <span className="ml-2 rounded bg-red-600/30 px-2 py-0.5 text-[10px] font-black text-red-300">LOW</span></p>
                    <p className="text-xs text-zinc-400">{Math.round(r.onHand)} on hand · need {Math.round(r.demandLbs)} lbs</p>
                  </div>
                  <p className="mt-1 text-sm text-red-300">
                    Short {shortfall} lbs cooked — smoke ~<span className="font-bold">{Math.round(shortfall / ASSUMED_YIELD)} raw lbs</span>. See Smoker Forecast.
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Per-protein cards ─────────────────────────────────────────── */}
      {rows.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">On hand by protein</h2>
          <div className="mt-2 space-y-2">
            {rows.map(r => {
              const open = expanded === r.protein;
              return (
                <div key={r.protein} className="rounded-xl border border-ink-700 bg-ink-900">
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <button onClick={() => setExpanded(open ? null : r.protein)} aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="text-zinc-600">{open ? "▾" : "▸"}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-zinc-100">{r.protein}</span>
                        <span className="text-xs text-zinc-500">{r.batches.length} {r.batches.length === 1 ? "batch" : "batches"}{r.wasteLbs > 0 && <> · {r.wasteLbs} lbs wasted</>}</span>
                      </span>
                    </button>
                    <span className="text-2xl font-black text-zinc-100">{Math.round(r.onHand)}<span className="ml-1 text-sm font-semibold text-zinc-500">lbs</span></span>
                    <span className="flex gap-1">
                      <button onClick={() => { eventMut.reset(); setEventDialog({ protein: r.protein, kind: "pull" }); }}
                        className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300">Pull</button>
                      <button onClick={() => { eventMut.reset(); setEventDialog({ protein: r.protein, kind: "waste" }); }}
                        className="min-h-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-3 py-2 text-xs font-semibold text-red-400">Waste</button>
                    </span>
                  </div>
                  {open && (
                    <div className="border-t border-ink-800 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">FIFO batches</p>
                      <ul className="mt-2 space-y-1">
                        {r.batches.map((b, i) => {
                          const age = hoursSince(`${b.date}T06:00:00Z`);
                          const status = age >= HOLD_HOURS ? "expired" : age >= HOLD_HOURS * 0.75 ? "use-soon" : "fresh";
                          return (
                            <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                              {i === 0 && <span className="rounded bg-amber-600/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">USE FIRST</span>}
                              <span className="text-zinc-300">{b.date} · {b.cookedLbs} lbs · {b.smoker}</span>
                              <HoldBadge status={status} hoursLeft={Math.max(0, HOLD_HOURS - age)} />
                            </li>
                          );
                        })}
                      </ul>
                      {r.demandLbs > 0 && <p className="mt-2 text-xs text-zinc-500">Weekly demand estimate: {Math.round(r.demandLbs)} lbs cooked.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Recent pull/waste log ─────────────────────────────────────── */}
      {events.length > 0 && (
        <section className="mt-8 pb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Recent pulls &amp; waste</h2>
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 bg-ink-800 text-left text-[11px] font-bold uppercase text-zinc-500">
                  <th className="px-4 py-2">When</th><th className="px-4 py-2">Protein</th><th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Lbs</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 20).map(e => (
                  <tr key={e.id} className="border-b border-ink-800 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500">{new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="px-4 py-2 font-semibold text-zinc-200">{e.protein}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${e.kind === "waste" ? "bg-red-600/20 text-red-400" : "bg-blue-600/20 text-blue-400"}`}>{e.kind.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-300">{e.lbs}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400">{e.reason || "—"}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{e.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {logOpen && (
        <LogBatchDialog proteins={rows.map(r => r.protein)} busy={logMut.isPending}
          dalError={logMut.error?.message ?? null}
          onCancel={() => setLogOpen(false)}
          onSubmit={b => logMut.mutate({ ...b, loggedBy: actor })} />
      )}
      {eventDialog && (
        <EventDialog protein={eventDialog.protein} kind={eventDialog.kind} busy={eventMut.isPending}
          error={eventMut.error?.message ?? null}
          onCancel={() => setEventDialog(null)}
          onSubmit={(lbs, reason) => eventMut.mutate({ protein: eventDialog.protein, kind: eventDialog.kind, lbs, reason, actor })} />
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  const border = tone === "bad" ? "border-red-700/60" : tone === "warn" ? "border-amber-700/60" : "border-ink-700";
  const num = tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-zinc-100";
  return (
    <div className={`rounded-xl border ${border} bg-ink-900 p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${num}`}>{value}</p>
    </div>
  );
}

function HoldBadge({ status, hoursLeft }: { status: "fresh" | "use-soon" | "expired"; hoursLeft: number }) {
  if (status === "expired") return <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">EXPIRED</span>;
  if (status === "use-soon") return <span className="rounded bg-amber-600/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">{Math.round(hoursLeft)}h left</span>;
  return <span className="rounded bg-green-600/20 px-1.5 py-0.5 text-[10px] font-bold text-green-400">Fresh · {Math.round(hoursLeft)}h</span>;
}

function EventDialog({ protein, kind, busy, error, onSubmit, onCancel }: {
  protein: string; kind: "pull" | "waste"; busy: boolean; error: string | null;
  onSubmit: (lbs: number, reason: string) => void; onCancel: () => void;
}) {
  const [lbs, setLbs] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const shown = err ?? error;
  const reasons = kind === "waste"
    ? ["Over hold time", "Dropped / contaminated", "Dried out", "Trim / unusable"]
    : ["Lunch line", "Dinner line", "Catering order", "Retail case"];
  return (
    <div role="dialog" aria-modal="true" aria-label={`${kind} ${protein}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          const n = Number(lbs);
          if (!Number.isFinite(n) || n <= 0) return setErr("Lbs must be a positive number");
          setErr(null); onSubmit(n, reason.trim());
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{kind === "waste" ? "Log waste" : "Record pull"} · {protein}</h3>
        {shown && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{shown}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Lbs
          <input inputMode="decimal" value={lbs} onChange={e => setLbs(e.target.value)} required placeholder="e.g. 12"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Reason
          <input list="event-reasons" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          <datalist id="event-reasons">{reasons.map(r => <option key={r} value={r} />)}</datalist>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${kind === "waste" ? "bg-red-600" : "bg-fire"}`}>
            {busy ? "Saving…" : kind === "waste" ? "Log waste" : "Record pull"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LogBatchDialog({ proteins, busy, dalError, onSubmit, onCancel }: {
  proteins: string[];
  busy: boolean;
  dalError: string | null;
  onSubmit: (b: { date: string; protein: string; rawLbs: number; cookedLbs: number; smoker: string }) => void;
  onCancel: () => void;
}) {
  const [protein, setProtein] = useState(proteins[0] ?? "");
  const [date, setDate] = useState(todayEt());
  const [rawLbs, setRawLbs] = useState("");
  const [cookedLbs, setCookedLbs] = useState("");
  const [smoker, setSmoker] = useState(SMOKERS[0]);
  const [location, setLocation] = useState(STORAGE_LOCATIONS[0]);
  const [clientError, setClientError] = useState<string | null>(null);

  const yieldPreview = useMemo(() => {
    const r = Number(rawLbs), c = Number(cookedLbs);
    return r > 0 && c > 0 ? ((c / r) * 100).toFixed(1) : null;
  }, [rawLbs, cookedLbs]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = Number(rawLbs), c = Number(cookedLbs);
    if (!protein.trim()) return setClientError("Protein is required");
    if (!date) return setClientError("Date is required");
    if (!Number.isFinite(r) || r <= 0) return setClientError("Raw lbs must be a positive number");
    if (!Number.isFinite(c) || c <= 0) return setClientError("Cooked lbs must be a positive number");
    if (c > r) return setClientError("Cooked lbs cannot exceed raw lbs");
    if (!smoker.trim()) return setClientError("Smoker is required");
    setClientError(null);
    onSubmit({ date, protein: protein.trim(), rawLbs: r, cookedLbs: c, smoker: smoker.trim() });
  };

  const error = clientError ?? dalError;

  return (
    <div role="dialog" aria-modal="true" aria-label="Log smoke batch"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">Log Smoke Batch</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Protein
          <input list="smoked-proteins" value={protein} onChange={e => setProtein(e.target.value)} required placeholder="e.g. Pork Butt"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          <datalist id="smoked-proteins">{proteins.map(p => <option key={p} value={p} />)}</datalist>
        </label>

        <label className="mt-3 block text-sm font-semibold text-zinc-400">Smoke date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Raw lbs in
            <input inputMode="decimal" value={rawLbs} onChange={e => setRawLbs(e.target.value)} placeholder="e.g. 100" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Cooked lbs out
            <input inputMode="decimal" value={cookedLbs} onChange={e => setCookedLbs(e.target.value)} placeholder="e.g. 65" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>

        {yieldPreview && (
          <p className="mt-3 rounded-lg bg-ink-800 px-3 py-2 text-sm text-zinc-400">
            Yield: <span className="font-bold text-fire-light">{yieldPreview}%</span>
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Smoker
            <input list="smoked-smokers" value={smoker} onChange={e => setSmoker(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
            <datalist id="smoked-smokers">{SMOKERS.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Storage
            <select value={location} onChange={e => setLocation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
              {STORAGE_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Logging…" : "Log Batch"}
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
