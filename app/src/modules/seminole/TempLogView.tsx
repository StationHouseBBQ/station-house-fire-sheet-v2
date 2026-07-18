import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { TempCheck } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Seminole · Food Temp Log — V2 counterpart of the Manus FoodTempLog.
 * One card per station with its required range, a quick temp entry, and an
 * inline pass/FAIL verdict from the DAL. Today's checks stream below,
 * newest first, refreshing every 30s.
 */

export function TempLogView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const stations = dal.tempLog.stations();

  const [temps, setTemps] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, TempCheck | undefined>>({});

  const { data: checks = [], isLoading } = useQuery({
    queryKey: ["tempLog", "todayChecks"],
    queryFn: () => dal.tempLog.todayChecks(),
    refetchInterval: 30_000,
  });

  const submitMut = useMutation({
    mutationFn: ({ station, tempF }: { station: string; tempF: number }) =>
      dal.tempLog.submitCheck(station, tempF, actor),
    onSuccess: check => {
      setResults(r => ({ ...r, [check.station]: check }));
      setTemps(t => ({ ...t, [check.station]: "" }));
      qc.invalidateQueries({ queryKey: ["tempLog", "todayChecks"] });
    },
  });

  const log = (station: string) => {
    const n = Number(temps[station] ?? "");
    if (!Number.isFinite(n) || temps[station] === "" || temps[station] === undefined) return;
    submitMut.mutate({ station, tempF: n });
  };

  const sorted = [...checks].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const failCount = sorted.filter(c => !c.withinRange).length;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">🌡️ Food Temp Log</h1>
        <p className="text-sm text-zinc-500">Log each station; out-of-range temps flag immediately.</p>
      </header>

      {/* Station cards */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {stations.map(st => {
          const result = results[st.name];
          const val = temps[st.name] ?? "";
          return (
            <div key={st.name}
              className={`rounded-xl border p-4 ${
                result ? (result.withinRange ? "border-green-700/50 bg-green-950/20" : "border-red-700 bg-red-950/30") : "border-ink-700 bg-ink-900"}`}>
              <p className="font-bold text-zinc-100">{st.name}</p>
              <p className="text-xs text-zinc-500">{st.note}</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <input value={val} inputMode="decimal" placeholder="Temp"
                    onChange={e => setTemps(t => ({ ...t, [st.name]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") log(st.name); }}
                    className="min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 pr-9 text-center text-lg font-bold text-zinc-100"
                    aria-label={`Temperature for ${st.name}`} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">°F</span>
                </div>
                <button onClick={() => log(st.name)} disabled={submitMut.isPending || val.trim() === ""}
                  className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                  Log
                </button>
              </div>
              {result && (
                result.withinRange ? (
                  <p className="mt-2 text-sm font-bold text-green-400">✓ {result.tempF}°F — Pass</p>
                ) : (
                  <p className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-black uppercase text-white">
                    ✗ {result.tempF}°F — FAIL · take corrective action
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Today's checks */}
      <section className="mt-8" aria-label="Today's temp checks">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Today's checks ({sorted.length})</h2>
          {failCount > 0 && <span className="text-sm font-black text-red-400">{failCount} FAIL</span>}
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-zinc-500">Loading checks…</p>
        ) : sorted.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">No checks logged yet today.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-3 py-2.5">Time</th>
                  <th className="px-3 py-2.5">Station</th>
                  <th className="px-3 py-2.5 text-right">Temp</th>
                  <th className="px-3 py-2.5">Result</th>
                  <th className="px-3 py-2.5">Taken by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800 bg-ink-900">
                {sorted.map(c => (
                  <tr key={c.id} className={c.withinRange ? "" : "bg-red-950/30"}>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {new Date(c.takenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-200">
                      {c.station} <span className="block text-[11px] font-normal text-zinc-600">{c.rangeNote}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-100">{c.tempF}°F</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-black ${
                        c.withinRange ? "bg-green-600/20 text-green-400" : "bg-red-600 text-white"}`}>
                        {c.withinRange ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{c.takenBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
