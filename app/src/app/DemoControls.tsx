import { useEffect, useState } from "react";
import { getClockOverride, setClockOverride } from "../lib/clock";
import { etParts } from "../lib/time";
import { mondayOfWeek, todayEt } from "../dal/demo/domains";

/**
 * Demo-mode-only controls: a simulated clock (so ordering windows and
 * Thursday-only rules can be demonstrated on any real day) and a demo-data
 * reset. Never rendered in supabase mode.
 */

function upcoming(dayOffsetFromMonday: number, hour: number, minute = 0): Date {
  const monday = mondayOfWeek(todayEt());
  const d = new Date(monday + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dayOffsetFromMonday);
  const iso = d.toISOString().slice(0, 10);
  // Construct an ET wall-clock moment (offset chosen by trial: use -04:00 EDT;
  // for demo purposes a one-hour winter drift is acceptable and labeled).
  return new Date(`${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`);
}

const PRESETS: Array<{ label: string; detail: string; make: () => Date }> = [
  { label: "Tue 10:00 AM", detail: "Friday ordering OPEN", make: () => upcoming(1, 10) },
  { label: "Thu 11:30 AM", detail: "Cuban Thursday service", make: () => upcoming(3, 11, 30) },
  { label: "Thu 6:00 PM", detail: "Saturday window OPEN", make: () => upcoming(3, 18) },
  { label: "Fri 2:00 PM", detail: "Saturday last call", make: () => upcoming(4, 14) },
  { label: "Fri 11:30 AM", detail: "Friday pickups live", make: () => upcoming(4, 11, 30) },
];

export function DemoControls() {
  const [override, setOverride] = useState<Date | null>(getClockOverride());
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    const h = () => setOverride(getClockOverride());
    window.addEventListener("shbbq-clock-change", h);
    return () => window.removeEventListener("shbbq-clock-change", h);
  }, []);

  const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? "demo";
  if (mode !== "demo") return null;

  const apply = (d: Date | null) => { setClockOverride(d); window.location.reload(); };
  const resetData = async () => {
    const dbs = await indexedDB.databases?.() ?? [];
    await Promise.all(dbs.filter(d => d.name).map(d => new Promise(res => {
      const req = indexedDB.deleteDatabase(d.name!);
      req.onsuccess = req.onerror = req.onblocked = () => res(null);
    })));
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  return (
    <section className="mt-10 rounded-2xl border border-amber-800/40 bg-amber-950/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">Demo controls</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Simulate a moment in the week to demo ordering windows any day. Demo mode only — real deployments always use the live clock.
          </p>
        </div>
        {override && (
          <span className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-300">
            ⏰ Simulating: {fmt(override)}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => apply(p.make())}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-left text-xs font-semibold text-zinc-300 hover:border-amber-600/60">
            <span className="block font-bold text-zinc-200">{p.label}</span>
            <span className="text-zinc-500">{p.detail}</span>
          </button>
        ))}
        <button onClick={() => apply(null)}
          className={`min-h-[44px] rounded-lg border px-3 text-xs font-bold ${override ? "border-amber-600 bg-amber-900/40 text-amber-200" : "border-ink-700 bg-ink-800 text-zinc-500"}`}>
          ● Live clock
        </button>
        <span className="mx-1 hidden w-px self-stretch bg-ink-700 sm:block" />
        {confirmReset ? (
          <button onClick={resetData}
            className="min-h-[44px] rounded-lg bg-red-700 px-3 text-xs font-bold text-white">
            Confirm: erase all demo data?
          </button>
        ) : (
          <button onClick={() => { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); }}
            className="min-h-[44px] rounded-lg border border-red-900/60 bg-red-950/30 px-3 text-xs font-bold text-red-400">
            ↺ Reset demo data
          </button>
        )}
      </div>
    </section>
  );
}

function fmt(d: Date): string {
  const p = etParts(d);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const h12 = ((p.hour + 11) % 12) + 1;
  return `${days[p.weekday]} ${h12}:${String(p.minute).padStart(2, "0")} ${p.hour >= 12 ? "PM" : "AM"} ET`;
}

/** Small fixed chip shown app-wide while the demo clock is overridden. */
export function DemoClockChip() {
  const [override, setOverride] = useState<Date | null>(getClockOverride());
  useEffect(() => {
    const h = () => setOverride(getClockOverride());
    window.addEventListener("shbbq-clock-change", h);
    return () => window.removeEventListener("shbbq-clock-change", h);
  }, []);
  const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? "demo";
  if (mode !== "demo" || !override) return null;
  return (
    <button onClick={() => { setClockOverride(null); window.location.reload(); }}
      title="Demo clock active — click to return to live time"
      className="fixed bottom-4 right-4 z-[9000] rounded-full border border-amber-700/60 bg-amber-950/90 px-4 py-2 text-xs font-bold text-amber-300 shadow-lg">
      ⏰ {fmt(override)} · tap for live
    </button>
  );
}
