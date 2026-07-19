import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { TempCheck } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import {
  FOOD_ITEMS, TEMP_STATIONS, WASTE_REASONS, WASTE_UNITS, passFailFor, requiredLabel,
  loadTempSessions, saveTempSession, loadWaste, addWaste, removeWaste, todayEt,
  type FoodItemDef, type PassFail, type TempPeriod, type TempCheckSession,
  type TempReadingRow, type WasteEntry,
} from "./_data/foh";

/**
 * Seminole · Food Temp & Waste Log — V2 counterpart of the Manus FoodTempLog
 * (+ HACCPLog / FoodWasteLog). Three tabs:
 *   • Log Temps — 3×-daily HACCP food-temp checks (Morning/Midday/Evening)
 *     with per-item pass/FAIL verdicts and required corrective actions on any
 *     fail, plus the walk-in / hot-hold equipment station quick-checks (DAL).
 *   • History — grouped temp-check sessions, newest first, with a fail banner.
 *   • Waste — food waste entries with reason, quantity, and est. cost totals.
 * Item-level readings + waste live in module-local demo state (_data/foh.ts);
 * equipment station checks still flow through the shared DAL tempLog repo.
 */

type Tab = "log" | "history" | "waste";
const PERIODS: TempPeriod[] = ["morning", "midday", "evening"];

function autoPeriod(): TempPeriod {
  const h = new Date().getHours();
  return h < 11 ? "morning" : h < 15 ? "midday" : "evening";
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TempLogView() {
  const { actor } = useRole();
  const [tab, setTab] = useState<Tab>("log");
  const [sessions, setSessions] = useState<TempCheckSession[]>(() => loadTempSessions());
  const today = todayEt();

  const todaySessions = sessions.filter(s => s.date === today);

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <header className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>🌡️</span>
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Food Temp &amp; Waste Log</h1>
          <p className="text-sm text-zinc-500">HACCP temp checks 3× daily — Morning · Midday · Evening</p>
        </div>
      </header>

      {/* Period status pills */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map(p => {
          const done = todaySessions.some(s => s.period === p);
          const hasFail = todaySessions.some(s => s.period === p && s.readings.some(r => r.passFail === "fail"));
          return (
            <span key={p}
              className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold ${
                done
                  ? hasFail ? "border-red-700 bg-red-950/50 text-red-300" : "border-green-700 bg-green-950/50 text-green-300"
                  : "border-ink-700 bg-ink-900 text-zinc-500"}`}>
              {done ? (hasFail ? "⚠️" : "✅") : "○"} {cap(p)}
            </span>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-lg bg-ink-900 p-1">
        {([["log", "📝 Log Temps"], ["history", "📊 History"], ["waste", "🗑️ Waste"]] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t ? "bg-fire text-white" : "text-zinc-400 hover:text-zinc-100"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "log" && (
          <LogTab actor={actor} today={today} todaySessions={todaySessions}
            onSubmitted={s => setSessions(saveTempSession(s))} />
        )}
        {tab === "history" && <HistoryTab sessions={sessions} />}
        {tab === "waste" && <WasteTab actor={actor} today={today} />}
      </div>
    </div>
  );
}

// ── Log tab ────────────────────────────────────────────────────────────────
type Reading = { temp: string; corrective: string };

function LogTab({ actor, today, todaySessions, onSubmitted }: {
  actor: string; today: string; todaySessions: TempCheckSession[];
  onSubmitted: (s: TempCheckSession) => void;
}) {
  const [employee, setEmployee] = useState(actor.replace(/^demo:/, ""));
  const [period, setPeriod] = useState<TempPeriod>(autoPeriod());
  const [station, setStation] = useState(TEMP_STATIONS[0]);
  const [readings, setReadings] = useState<Record<string, Reading>>(() =>
    Object.fromEntries(FOOD_ITEMS.map(i => [i.name, { temp: "", corrective: "" }])));
  const [justSubmitted, setJustSubmitted] = useState<TempCheckSession | null>(null);

  const parsed = FOOD_ITEMS.map(item => {
    const r = readings[item.name];
    const t = parseFloat(r.temp);
    const has = r.temp !== "" && !Number.isNaN(t);
    return { item, temp: r.temp, parsedTemp: has ? t : null, pf: has ? passFailFor(t, item) : null, corrective: r.corrective };
  });
  const filled = parsed.filter(p => p.parsedTemp !== null).length;
  const failCount = parsed.filter(p => p.pf === "fail").length;
  const allPass = filled === FOOD_ITEMS.length && failCount === 0;
  const missingCorrective = parsed.some(p => p.pf === "fail" && p.corrective.trim() === "");

  const setReading = (name: string, field: keyof Reading, val: string) =>
    setReadings(r => ({ ...r, [name]: { ...r[name], [field]: val } }));

  const submit = () => {
    const rows: TempReadingRow[] = parsed
      .filter(p => p.parsedTemp !== null)
      .map(p => ({ itemName: p.item.name, tempF: p.parsedTemp!, passFail: p.pf!, correctiveAction: p.corrective.trim() || null }));
    const s: TempCheckSession = {
      id: `t_${Date.now()}`, date: today, period, station,
      employee: employee.trim() || "FOH", readings: rows, at: new Date().toISOString(),
    };
    onSubmitted(s);
    setJustSubmitted(s);
  };

  const reset = () => {
    setJustSubmitted(null);
    setReadings(Object.fromEntries(FOOD_ITEMS.map(i => [i.name, { temp: "", corrective: "" }])));
  };

  if (justSubmitted) {
    return (
      <div className="space-y-4 py-8 text-center">
        <div className="text-6xl">{failCount === 0 ? "✅" : "⚠️"}</div>
        <p className="text-2xl font-black text-zinc-100">
          {failCount === 0 ? "All Temps Passed!" : `${failCount} Item${failCount > 1 ? "s" : ""} Need Attention`}
        </p>
        <p className="text-zinc-500">{justSubmitted.readings.length} items logged · {cap(period)} check complete</p>
        <button onClick={reset} className="rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-200">
          Log Another Check
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session info */}
      <div className="space-y-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Employee name *
          <input value={employee} onChange={e => setEmployee(e.target.value)} placeholder="Your name"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Check period
            <select value={period} onChange={e => setPeriod(e.target.value as TempPeriod)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 capitalize text-zinc-100">
              {PERIODS.map(p => <option key={p} value={p}>{cap(p)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Station
            <select value={station} onChange={e => setStation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {TEMP_STATIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {todaySessions.some(s => s.period === period) && (
          <p className="rounded-lg bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-400">
            A {period} check was already logged today — this adds another.
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-fire transition-all" style={{ width: `${(filled / FOOD_ITEMS.length) * 100}%` }} />
        </div>
        <span className="text-sm text-zinc-400">{filled}/{FOOD_ITEMS.length}</span>
        {failCount > 0 && <span className="text-sm font-bold text-red-400">{failCount} FAIL</span>}
        {allPass && <span className="text-sm font-bold text-green-400">ALL PASS ✓</span>}
      </div>

      {/* Food items */}
      <div className="space-y-2">
        {parsed.map(({ item, temp, pf, corrective }) => (
          <FoodRow key={item.name} item={item} temp={temp} pf={pf} corrective={corrective}
            onTemp={v => setReading(item.name, "temp", v)}
            onCorrective={v => setReading(item.name, "corrective", v)} />
        ))}
      </div>

      <EquipmentStations actor={actor} />

      <button onClick={submit} disabled={filled === 0 || !employee.trim() || missingCorrective}
        className="min-h-[52px] w-full rounded-xl bg-fire px-4 py-3 text-base font-black text-white disabled:bg-ink-800 disabled:text-zinc-500">
        {missingCorrective
          ? "Add corrective action for every FAIL"
          : `🌡️ Submit ${cap(period)} Temp Check (${filled} item${filled !== 1 ? "s" : ""})`}
      </button>
    </div>
  );
}

function FoodRow({ item, temp, pf, corrective, onTemp, onCorrective }: {
  item: FoodItemDef; temp: string; pf: PassFail | null; corrective: string;
  onTemp: (v: string) => void; onCorrective: (v: string) => void;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      pf === "pass" ? "border-green-800 bg-green-950/10" : pf === "fail" ? "border-red-700 bg-red-950/30" : "border-ink-700 bg-ink-900"}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>{item.icon}</span>
        <div className="flex-1">
          <p className="font-semibold text-zinc-100">{item.name}</p>
          <p className="text-xs text-zinc-500">Required: {requiredLabel(item)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input value={temp} inputMode="decimal" placeholder="°F" onChange={e => onTemp(e.target.value)}
              className="h-12 w-24 rounded-lg border border-ink-700 bg-ink-800 px-2 pr-7 text-center text-lg font-bold text-zinc-100"
              aria-label={`Temperature for ${item.name}`} />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">°F</span>
          </div>
          {pf && <span className={`text-xl font-black ${pf === "pass" ? "text-green-400" : "text-red-400"}`}>{pf === "pass" ? "✓" : "✗"}</span>}
        </div>
      </div>
      {pf === "fail" && (
        <textarea value={corrective} onChange={e => onCorrective(e.target.value)} rows={2}
          placeholder="⚠️ Corrective action taken (required)…"
          className="mt-3 w-full rounded-lg border border-red-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100"
          aria-label={`Corrective action for ${item.name}`} />
      )}
    </div>
  );
}

/** Equipment station quick-checks — flows through the shared DAL tempLog repo. */
function EquipmentStations({ actor }: { actor: string }) {
  const dal = getDal();
  const qc = useQueryClient();
  const stations = dal.tempLog.stations();
  const [temps, setTemps] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, TempCheck | undefined>>({});

  const submitMut = useMutation({
    mutationFn: ({ station, tempF }: { station: string; tempF: number }) => dal.tempLog.submitCheck(station, tempF, actor),
    onSuccess: check => {
      setResults(r => ({ ...r, [check.station]: check }));
      setTemps(t => ({ ...t, [check.station]: "" }));
      qc.invalidateQueries({ queryKey: ["tempLog", "todayChecks"] });
    },
  });
  const log = (station: string) => {
    const n = Number(temps[station] ?? "");
    if (!Number.isFinite(n) || (temps[station] ?? "") === "") return;
    submitMut.mutate({ station, tempF: n });
  };

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Equipment stations</h3>
      <p className="text-xs text-zinc-500">Walk-in / hot-hold holding temps — logged separately to the daily equipment log.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {stations.map(st => {
          const result = results[st.name];
          const val = temps[st.name] ?? "";
          return (
            <div key={st.name}
              className={`rounded-lg border p-3 ${result ? (result.withinRange ? "border-green-700/50 bg-green-950/20" : "border-red-700 bg-red-950/30") : "border-ink-700 bg-ink-800"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-100">{st.name}</p>
                <span className="text-xs text-zinc-500">{st.note}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input value={val} inputMode="decimal" placeholder="°F"
                  onChange={e => setTemps(t => ({ ...t, [st.name]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") log(st.name); }}
                  className="min-h-[40px] flex-1 rounded-lg border border-ink-700 bg-ink-900 px-2 text-center font-bold text-zinc-100"
                  aria-label={`Temperature for ${st.name}`} />
                <button onClick={() => log(st.name)} disabled={val.trim() === "" || submitMut.isPending}
                  className="min-h-[40px] rounded-lg bg-fire px-3 text-xs font-bold text-white disabled:opacity-40">Log</button>
              </div>
              {result && (
                <p className={`mt-2 text-xs font-bold ${result.withinRange ? "text-green-400" : "text-red-400"}`}>
                  {result.withinRange ? `✓ ${result.tempF}°F — Pass` : `✗ ${result.tempF}°F — FAIL · corrective action`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────
function HistoryTab({ sessions }: { sessions: TempCheckSession[] }) {
  const sorted = [...sessions].sort((a, b) => b.at.localeCompare(a.at));
  if (sorted.length === 0) {
    return <p className="py-12 text-center text-zinc-500">No temp checks logged yet. Start from the Log Temps tab.</p>;
  }
  return (
    <div className="space-y-4">
      {sorted.map(s => {
        const fails = s.readings.filter(r => r.passFail === "fail");
        return (
          <div key={s.id} className={`overflow-hidden rounded-xl border ${fails.length > 0 ? "border-red-800" : "border-green-800"}`}>
            <div className={`flex items-center justify-between px-4 py-3 ${fails.length > 0 ? "bg-red-950/50" : "bg-green-950/40"}`}>
              <div>
                <p className="font-bold capitalize text-zinc-100">{s.period} Check — {s.date}</p>
                <p className="text-xs text-zinc-500">{s.employee} · {s.station} · {fmtTime(s.at)}</p>
              </div>
              <span className={`text-sm font-bold ${fails.length > 0 ? "text-red-400" : "text-green-400"}`}>
                {fails.length > 0 ? `${fails.length} FAIL` : "ALL PASS ✓"}
              </span>
            </div>
            <div className="divide-y divide-ink-800 bg-ink-900">
              {s.readings.map((r, i) => (
                <div key={i} className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-5 text-center font-bold ${r.passFail === "pass" ? "text-green-400" : "text-red-400"}`}>
                      {r.passFail === "pass" ? "✓" : "✗"}
                    </span>
                    <span className="flex-1 text-sm text-zinc-300">{r.itemName}</span>
                    <span className="font-mono text-sm text-zinc-100">{r.tempF}°F</span>
                  </div>
                  {r.correctiveAction && (
                    <p className="ml-8 mt-1 text-xs text-amber-400">⚠️ {r.correctiveAction}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Waste tab ────────────────────────────────────────────────────────────────
function WasteTab({ actor, today }: { actor: string; today: string }) {
  const [entries, setEntries] = useState<WasteEntry[]>(() => loadWaste());
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState(WASTE_UNITS[0]);
  const [reason, setReason] = useState(WASTE_REASONS[0]);
  const [cost, setCost] = useState("");

  const todayEntries = useMemo(
    () => entries.filter(e => e.date === today).sort((a, b) => b.at.localeCompare(a.at)),
    [entries, today]);
  const todayCostCents = todayEntries.reduce((s, e) => s + e.estCostCents, 0);
  const allCostCents = entries.reduce((s, e) => s + e.estCostCents, 0);

  const canAdd = item.trim() !== "" && Number(qty) > 0;
  const add = () => {
    if (!canAdd) return;
    const cents = cost.trim() === "" ? 0 : Math.max(0, Math.round(Number(cost) * 100));
    setEntries(addWaste({
      date: today, item: item.trim(), qty: Number(qty), unit, reason,
      estCostCents: Number.isFinite(cents) ? cents : 0, loggedBy: actor.replace(/^demo:/, ""),
    }));
    setItem(""); setQty("1"); setCost("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Waste today</p>
          <p className="mt-1 text-2xl font-black text-zinc-100">{todayEntries.length}</p>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Est. cost today</p>
          <p className="mt-1 text-2xl font-black text-red-400">{formatCents(todayCostCents)}</p>
        </div>
      </div>

      <form className="space-y-3 rounded-xl border border-ink-700 bg-ink-900 p-4"
        onSubmit={e => { e.preventDefault(); add(); }}>
        <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">Log waste</h3>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Item
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Brisket ends"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Qty
            <input value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Unit
            <select value={unit} onChange={e => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {WASTE_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Reason
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {WASTE_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Est. cost ($)
            <input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <button type="submit" disabled={!canAdd}
          className="min-h-[44px] w-full rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          + Log waste entry
        </button>
      </form>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">Today's waste ({todayEntries.length})</h3>
          {entries.length > 0 && <span className="text-xs text-zinc-500">All-time est. {formatCents(allCostCents)}</span>}
        </div>
        {todayEntries.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">No waste logged today.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todayEntries.map(e => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-zinc-100">{e.qty} {e.unit} · {e.item}</p>
                  <p className="text-xs text-zinc-500">{e.reason} · {e.loggedBy} · {fmtTime(e.at)}</p>
                </div>
                {e.estCostCents > 0 && <span className="text-sm font-bold text-red-400">{formatCents(e.estCostCents)}</span>}
                <button onClick={() => setEntries(removeWaste(e.id))}
                  className="min-h-[40px] rounded-lg border border-ink-700 px-2 text-xs font-semibold text-zinc-500 hover:text-red-400"
                  aria-label={`Remove ${e.item} waste entry`}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
