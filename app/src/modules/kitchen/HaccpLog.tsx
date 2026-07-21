import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { SyncBadge, dayKey, dateLabel, timeLabel, uid, useSettingsState } from "./_ext/opsState";
import { seedHaccp } from "./_ext/opsSeeds";

/**
 * Kitchen · HACCP Log — temperature / food-safety record.
 * Log an item's temp against a required-range preset (hot-hold, cold-hold,
 * cooling, cooking), auto pass/fail, capture a corrective action on fail,
 * stamp taker + time. Entries group by day with a running history and a
 * today summary. Persists via dal.settings key "kitchen.haccp".
 */

export type HaccpPreset = "hot_hold" | "cold_hold" | "cooling" | "cooking";

export interface HaccpEntry {
  id: string;
  preset: HaccpPreset;
  item: string;
  tempF: number;
  requiredMin: number | null;
  requiredMax: number | null;
  result: "pass" | "fail";
  correctiveAction: string;
  takenBy: string;
  takenAt: string;
}

interface PresetSpec {
  label: string;
  icon: string;
  min: number | null;
  max: number | null;
  hint: string;
}

const PRESETS: Record<HaccpPreset, PresetSpec> = {
  hot_hold: { label: "Hot Holding", icon: "♨️", min: 135, max: null, hint: "Must hold ≥ 135°F" },
  cold_hold: { label: "Cold Holding", icon: "❄️", min: null, max: 41, hint: "Must hold ≤ 41°F" },
  cooling: { label: "Cooling", icon: "🧊", min: null, max: 70, hint: "≤ 70°F within 2 hrs, ≤ 41°F within 6 hrs" },
  cooking: { label: "Cooking Temp", icon: "🔥", min: 165, max: null, hint: "Reach safe internal temp (poultry 165°F)" },
};

function evaluate(min: number | null, max: number | null, temp: number): "pass" | "fail" {
  if (min != null && temp < min) return "fail";
  if (max != null && temp > max) return "fail";
  return "pass";
}

function rangeLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max}°F`;
  if (min != null) return `≥ ${min}°F`;
  if (max != null) return `≤ ${max}°F`;
  return "—";
}

export function HaccpLog() {
  const { actor } = useRole();
  const { value: entries, set: setEntries, loading, sync } = useSettingsState<HaccpEntry[]>("kitchen.haccp", seedHaccp());
  const [tab, setTab] = useState<"log" | "history">("log");

  const [preset, setPreset] = useState<HaccpPreset>("hot_hold");
  const [item, setItem] = useState("");
  const [tempStr, setTempStr] = useState("");
  const [corrective, setCorrective] = useState("");

  const spec = PRESETS[preset];
  const tempNum = Number(tempStr);
  const tempValid = tempStr.trim() !== "" && Number.isFinite(tempNum);
  const liveResult = tempValid ? evaluate(spec.min, spec.max, tempNum) : null;

  const todayKey = dayKey(currentTime().toISOString());
  const grouped = useMemo(() => {
    const map = new Map<string, HaccpEntry[]>();
    for (const e of [...entries].sort((a, b) => b.takenAt.localeCompare(a.takenAt))) {
      const k = dayKey(e.takenAt);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  const todayEntries = entries.filter(e => dayKey(e.takenAt) === todayKey);
  const todayPass = todayEntries.filter(e => e.result === "pass").length;
  const todayFail = todayEntries.filter(e => e.result === "fail").length;

  if (loading) return <p className="py-20 text-center text-zinc-500">Loading HACCP log…</p>;

  const submit = () => {
    if (!item.trim() || !tempValid || liveResult == null) return;
    if (liveResult === "fail" && !corrective.trim()) return;
    const entry: HaccpEntry = {
      id: uid(),
      preset,
      item: item.trim(),
      tempF: tempNum,
      requiredMin: spec.min,
      requiredMax: spec.max,
      result: liveResult,
      correctiveAction: liveResult === "fail" ? corrective.trim() : "",
      takenBy: actor,
      takenAt: currentTime().toISOString(),
    };
    setEntries(prev => [entry, ...prev]);
    setItem("");
    setTempStr("");
    setCorrective("");
  };

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">📋 HACCP Log</h1>
          <p className="text-sm text-zinc-500">Temperature &amp; food-safety records</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Checks today" value={todayEntries.length} tone="neutral" />
        <Stat label="Passed" value={todayPass} tone="green" />
        <Stat label="Failed" value={todayFail} tone="red" />
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-ink-900 p-1">
        {(["log", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-2 text-sm font-bold ${tab === t ? "bg-fire text-white" : "text-zinc-400"}`}>
            {t === "log" ? "📝 Log Entry" : "📊 History"}
          </button>
        ))}
      </div>

      {tab === "log" && (
        <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Control point</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(PRESETS) as HaccpPreset[]).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className={`rounded-lg border p-3 text-left ${preset === p ? "border-fire bg-fire/10" : "border-ink-700 bg-ink-800"}`}>
                <span className="text-lg" aria-hidden>{PRESETS[p].icon}</span>
                <span className="mt-1 block text-sm font-semibold text-zinc-100">{PRESETS[p].label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            📏 {spec.hint} · required {rangeLabel(spec.min, spec.max)}
          </div>

          <label className="mt-4 block text-sm font-semibold text-zinc-400">Item
            <input value={item} onChange={e => setItem(e.target.value)}
              placeholder="e.g. Brisket (steam table), Walk-In Cooler"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>

          <label className="mt-3 block text-sm font-semibold text-zinc-400">Temperature (°F)
            <input inputMode="decimal" value={tempStr} onChange={e => setTempStr(e.target.value)}
              placeholder="Enter temp…"
              className="mt-1 h-14 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 text-xl font-bold text-zinc-100 placeholder:text-zinc-600" />
          </label>

          {liveResult && (
            <div className={`mt-3 flex items-center gap-3 rounded-lg border p-3 ${liveResult === "pass" ? "border-green-700 bg-green-950/40" : "border-red-700 bg-red-950/40"}`}>
              <span className="text-2xl" aria-hidden>{liveResult === "pass" ? "✅" : "❌"}</span>
              <div>
                <p className={`text-lg font-black ${liveResult === "pass" ? "text-green-400" : "text-red-400"}`}>{liveResult === "pass" ? "PASS" : "FAIL"}</p>
                <p className="text-xs text-zinc-400">{tempNum}°F vs required {rangeLabel(spec.min, spec.max)}</p>
              </div>
            </div>
          )}

          {liveResult === "fail" && (
            <label className="mt-3 block text-sm font-semibold text-red-400">⚠️ Corrective action (required)
              <textarea value={corrective} onChange={e => setCorrective(e.target.value)} rows={2}
                placeholder="e.g. Reheated to 165°F, adjusted thermostat, discarded product…"
                className="mt-1 w-full rounded-lg border border-red-700/60 bg-red-950/20 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
            </label>
          )}

          <button onClick={submit}
            disabled={!item.trim() || !tempValid || (liveResult === "fail" && !corrective.trim())}
            className="mt-4 h-12 w-full rounded-xl bg-fire text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
            Log entry
          </button>
        </section>
      )}

      {tab === "history" && (
        <section className="mt-4 space-y-5">
          {grouped.length === 0 && (
            <p className="rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">No entries yet.</p>
          )}
          {grouped.map(([day, dayEntries]) => (
            <div key={day}>
              <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                {day === todayKey ? "Today" : dateLabel(day)} · {dayEntries.length} check{dayEntries.length !== 1 ? "s" : ""}
              </h2>
              <ul className="space-y-2">
                {dayEntries.map(e => (
                  <li key={e.id} className={`rounded-lg border bg-ink-900 p-3 ${e.result === "pass" ? "border-green-800/60" : "border-red-800/60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-100">
                          {PRESETS[e.preset].icon} {e.item}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {e.tempF}°F · required {rangeLabel(e.requiredMin, e.requiredMax)} · {PRESETS[e.preset].label}
                        </p>
                        {e.correctiveAction && <p className="mt-1 text-xs text-red-400">⚠️ {e.correctiveAction}</p>}
                        <p className="mt-1 text-[11px] text-zinc-600">{e.takenBy} · {timeLabel(e.takenAt)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${e.result === "pass" ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                        {e.result === "pass" ? "✓ PASS" : "✗ FAIL"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "green" | "red" }) {
  const cls =
    tone === "green" ? "border-green-800 bg-green-950/40 text-green-400"
    : tone === "red" ? "border-red-800 bg-red-950/40 text-red-400"
    : "border-ink-700 bg-ink-900 text-zinc-100";
  return (
    <div className={`rounded-xl border p-4 text-center ${cls}`}>
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
