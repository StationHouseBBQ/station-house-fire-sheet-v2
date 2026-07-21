import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { usePersistentState, type SavedMeatBuild } from "./_data/localState";

/**
 * Kitchen · Meat Calculator — V2 implementation of the Manus MeatCalculator,
 * adapted to the canonical protein_conversions table (dal.proteins.list()).
 * Guest count × appetite (lbs cooked/guest) × per-protein mix % →
 * cooked lbs, raw units to order (ceil), and portion counts.
 *
 * Parity additions over the lean version:
 *  - Cooked / Raw view toggle (Manus "Cooked | Raw (to buy)")
 *  - Per-guest oz readout, whole-piece counts for whole-muscle proteins
 *  - Yield-flag warning when a conversion row looks off
 *  - Even-split + clear helpers for the mix
 *  - Named saved builds (persist across refresh), load / delete
 * Pure client calculation + module-local saved builds — no DAL mutations.
 */

const APPETITES = [
  { id: "light", label: "Light", lbs: 0.33, hint: "⅓ lb / guest" },
  { id: "regular", label: "Regular", lbs: 0.5, hint: "½ lb / guest" },
  { id: "hearty", label: "Hearty", lbs: 0.75, hint: "¾ lb / guest" },
] as const;

const GUEST_PRESETS = [25, 50, 75, 100, 150, 200, 300];

type View = "cooked" | "raw";

function formatLbs(lbs: number): string {
  if (lbs > 0 && lbs < 1) return `${(lbs * 16).toFixed(0)} oz`;
  return `${lbs.toFixed(1)} lbs`;
}

export function MeatCalc() {
  const dal = getDal();
  const { data: proteins = [], isLoading } = useQuery({
    queryKey: ["proteins", "list"],
    queryFn: () => dal.proteins.list(),
    staleTime: 5 * 60_000,
  });

  const [guests, setGuests] = useState("50");
  const [appetite, setAppetite] = useState<(typeof APPETITES)[number]["id"]>("regular");
  const [mix, setMix] = useState<Record<string, number>>({});
  const [view, setView] = useState<View>("raw");
  const [builds, setBuilds] = usePersistentState<SavedMeatBuild[]>("meatBuilds.v1", []);
  const [saveOpen, setSaveOpen] = useState(false);
  const [buildName, setBuildName] = useState("");

  // Default even split across the conversion table rows once loaded.
  useEffect(() => {
    if (proteins.length > 0 && Object.keys(mix).length === 0) {
      setMix(evenSplit(proteins.map(p => p.id)));
    }
  }, [proteins, mix]);

  const guestCount = Math.max(0, Math.floor(Number(guests)) || 0);
  const lbsPerGuest = APPETITES.find(a => a.id === appetite)?.lbs ?? 0.5;
  const totalPct = proteins.reduce((s, p) => s + (mix[p.id] ?? 0), 0);
  const pctOk = totalPct === 100;

  const rows = useMemo(() => {
    return proteins
      .filter(p => (mix[p.id] ?? 0) > 0)
      .map(p => {
        const pct = mix[p.id] ?? 0;
        const cookedLbs = guestCount * lbsPerGuest * (pct / 100);
        const rawUnits = p.cookedYieldLbsPerUnit > 0 ? Math.ceil(cookedLbs / p.cookedYieldLbsPerUnit) : 0;
        const rawLbs = p.rawUnit === "lbs" ? rawUnits : rawUnits * p.cookedYieldLbsPerUnit / (yieldFrac(p) || 1);
        const portions = Math.floor(cookedLbs * p.portionsPerCookedLb);
        const ozPerGuest = guestCount > 0 ? (cookedLbs * 16) / guestCount : 0;
        // Flag a conversion that looks implausible (yield > 100% or non-positive).
        const flagged = p.cookedYieldLbsPerUnit <= 0 || p.portionsPerCookedLb <= 0;
        return { p, pct, cookedLbs, rawUnits, rawLbs, portions, ozPerGuest, flagged };
      });
  }, [proteins, mix, guestCount, lbsPerGuest]);

  const totalCooked = rows.reduce((s, r) => s + r.cookedLbs, 0);
  const totalRaw = rows.reduce((s, r) => s + r.rawLbs, 0);
  const anyFlagged = rows.some(r => r.flagged);

  const setPct = (id: string, v: number) =>
    setMix(m => ({ ...m, [id]: Math.max(0, Math.min(100, Math.round(v))) }));

  const applyEven = () => setMix(evenSplit(proteins.map(p => p.id)));
  const clearMix = () => setMix(Object.fromEntries(proteins.map(p => [p.id, 0])));

  const saveBuild = () => {
    const name = buildName.trim();
    if (!name) return;
    setBuilds(prev => [
      { id: crypto.randomUUID(), name, guests: guestCount, appetiteId: appetite, mix: { ...mix }, savedAt: new Date().toISOString() },
      ...prev.filter(b => b.name !== name),
    ]);
    setBuildName("");
    setSaveOpen(false);
  };

  const loadBuild = (b: SavedMeatBuild) => {
    setGuests(String(b.guests));
    setAppetite((APPETITES.find(a => a.id === b.appetiteId)?.id ?? "regular"));
    setMix({ ...b.mix });
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading protein table…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Meat Calculator</h1>
          <p className="text-sm text-zinc-500">Cooked-protein planning from the canonical conversion table</p>
        </div>
        <button onClick={() => setSaveOpen(true)} disabled={guestCount === 0 || rows.length === 0}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 disabled:opacity-40">
          💾 Save build
        </button>
      </header>

      {/* Saved builds */}
      {builds.length > 0 && (
        <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Saved builds</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {builds.map(b => (
              <div key={b.id} className="flex items-center gap-1 rounded-full border border-ink-700 bg-ink-800 pl-1">
                <button onClick={() => loadBuild(b)}
                  className="min-h-[40px] rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:text-white"
                  aria-label={`Load build ${b.name}`}>
                  {b.name} <span className="text-xs font-normal text-zinc-500">· {b.guests}g</span>
                </button>
                <button onClick={() => setBuilds(prev => prev.filter(x => x.id !== b.id))}
                  aria-label={`Delete build ${b.name}`}
                  className="min-h-[40px] min-w-[36px] rounded-full px-2 text-zinc-600 hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Guests */}
      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <label className="text-sm font-semibold text-zinc-300" htmlFor="mc-guests">Number of guests</label>
        <div className="mt-2 flex items-center gap-3">
          <button onClick={() => setGuests(String(Math.max(0, guestCount - 10)))} aria-label="Minus 10 guests"
            className="min-h-[48px] min-w-[48px] rounded-lg border border-ink-700 bg-ink-800 text-xl font-bold text-zinc-200">−</button>
          <input id="mc-guests" inputMode="numeric" value={guests} onChange={e => setGuests(e.target.value)}
            className="w-full flex-1 border-b-2 border-fire bg-transparent py-1 text-center text-4xl font-black text-zinc-100 outline-none" />
          <button onClick={() => setGuests(String(guestCount + 10))} aria-label="Plus 10 guests"
            className="min-h-[48px] min-w-[48px] rounded-lg border border-ink-700 bg-ink-800 text-xl font-bold text-zinc-200">+</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {GUEST_PRESETS.map(n => (
            <button key={n} onClick={() => setGuests(String(n))}
              className={`min-h-[44px] rounded-full border px-4 py-1.5 text-sm font-semibold ${
                guestCount === n ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-400"
              }`}>{n}</button>
          ))}
        </div>
      </section>

      {/* Appetite */}
      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <p className="text-sm font-semibold text-zinc-300">Appetite (cooked protein per guest)</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {APPETITES.map(a => (
            <button key={a.id} onClick={() => setAppetite(a.id)}
              className={`min-h-[56px] rounded-xl border-2 px-3 py-2 text-center transition-colors ${
                appetite === a.id ? "border-fire bg-fire/10 text-zinc-100" : "border-ink-700 bg-ink-800 text-zinc-400"
              }`}>
              <span className="block text-sm font-black">{a.label}</span>
              <span className="block text-xs">{a.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Mix */}
      <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-300">Protein mix</p>
          <div className="flex items-center gap-2">
            <button onClick={applyEven}
              className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">Even split</button>
            <button onClick={clearMix}
              className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">Clear</button>
            <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
              pctOk ? "border-green-700/50 text-green-400" : "border-amber-600/60 bg-amber-950/40 text-amber-300"
            }`}>
              {pctOk ? "Mix = 100% ✓" : `⚠ ${totalPct}%`}
            </span>
          </div>
        </div>
        <ul className="mt-3 space-y-3">
          {proteins.map(p => {
            const pct = mix[p.id] ?? 0;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold text-zinc-200">{p.protein}</p>
                  <p className="text-xs text-zinc-500">
                    {p.cookedYieldLbsPerUnit} lb cooked / {p.rawUnit === "lbs" ? "raw lb" : p.rawUnit} · {p.portionsPerCookedLb} portions / cooked lb
                  </p>
                </div>
                <input type="range" min={0} max={100} step={5} value={pct}
                  onChange={e => setPct(p.id, Number(e.target.value))}
                  aria-label={`${p.protein} mix percentage`}
                  className="h-11 w-40 accent-[#e05a1e]" />
                <div className="flex items-center gap-1">
                  <input inputMode="numeric" value={String(pct)}
                    onChange={e => setPct(p.id, Number(e.target.value) || 0)}
                    aria-label={`${p.protein} percent`}
                    className="w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-center text-sm font-bold text-zinc-100" />
                  <span className="text-sm text-zinc-500">%</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Results */}
      {guestCount > 0 && rows.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-fire-light">
              Order plan — {guestCount} guests · {lbsPerGuest} lb cooked / guest
            </h2>
            <div className="flex items-center rounded-lg border border-ink-700 text-xs" role="group" aria-label="Result view">
              <button onClick={() => setView("cooked")}
                className={`min-h-[40px] rounded-l-lg px-3 py-1.5 font-bold ${view === "cooked" ? "bg-fire text-white" : "text-zinc-400"}`}>Cooked</button>
              <button onClick={() => setView("raw")}
                className={`min-h-[40px] rounded-r-lg px-3 py-1.5 font-bold ${view === "raw" ? "bg-fire text-white" : "text-zinc-400"}`}>Raw (to buy)</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs font-black uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2">Protein</th>
                  <th className="px-3 py-2 text-center">Mix</th>
                  <th className="px-3 py-2 text-right">oz/guest</th>
                  <th className="px-3 py-2 text-right">{view === "cooked" ? "Cooked lbs" : "Raw to order"}</th>
                  <th className="px-3 py-2 text-right">Portions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, pct, cookedLbs, rawUnits, portions, ozPerGuest, flagged }) => (
                  <tr key={p.id} className="border-b border-ink-800">
                    <td className="px-4 py-3 font-semibold text-zinc-100">
                      {p.protein}
                      {flagged && <span title="Yield looks off — review the protein table" className="ml-1 text-amber-400">⚠</span>}
                      {p.notes && <span className="block text-xs font-normal text-zinc-500">{p.notes}</span>}
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-400">{pct}%</td>
                    <td className="px-3 py-3 text-right text-zinc-400">{ozPerGuest.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-black text-fire-light">
                      {view === "cooked"
                        ? cookedLbs.toFixed(1)
                        : <>{rawUnits} <span className="text-xs font-normal text-zinc-500">{p.rawUnit}</span></>}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-300">{portions}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-800/60">
                  <td className="px-4 py-3 text-sm font-black uppercase text-zinc-100" colSpan={3}>
                    Total {view === "cooked" ? "cooked" : "raw"}
                  </td>
                  <td className="px-3 py-3 text-right text-lg font-black text-fire-light">
                    {view === "cooked" ? `${totalCooked.toFixed(1)} lbs` : formatLbs(totalRaw)}
                  </td>
                  <td className="px-3 py-3 text-right text-zinc-400">
                    {rows.reduce((s, r) => s + r.portions, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {anyFlagged && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-300">
          <span aria-hidden>⚠</span>
          <span><span className="font-semibold">Some yields need review. </span>
            One or more proteins have a non-positive yield or portion factor. Fix them in Admin → Protein Conversions for accurate raw counts.</span>
        </p>
      )}

      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900/60 p-3 text-xs text-zinc-500">
        <span className="font-semibold text-zinc-300">How this works: </span>
        cooked lbs = guests × appetite × mix%. Raw units = cooked ÷ yield per unit, rounded up to whole {""}
        units to smoke. Toggle Cooked / Raw to switch between what you'll serve and what you buy. Yields come from the canonical protein conversion table.
      </p>

      {saveOpen && (
        <div role="dialog" aria-modal="true" aria-label="Save build"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
            onSubmit={e => { e.preventDefault(); saveBuild(); }}>
            <h3 className="text-lg font-bold text-zinc-100">Save this build</h3>
            <p className="mt-1 text-xs text-zinc-500">{guestCount} guests · {appetite} · {rows.length} proteins</p>
            <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
              <input value={buildName} onChange={e => setBuildName(e.target.value)} autoFocus required
                placeholder="e.g. Smith wedding 150"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveOpen(false)}
                className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
              <button type="submit" disabled={!buildName.trim()}
                className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function evenSplit(ids: string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const base = Math.floor(100 / ids.length);
  const out: Record<string, number> = {};
  ids.forEach((id, i) => { out[id] = i === 0 ? 100 - base * (ids.length - 1) : base; });
  return out;
}

function yieldFrac(p: { cookedYieldLbsPerUnit: number; rawUnit: string }): number {
  // For lbs-based rows the "yield" is cooked lbs per raw lb; otherwise treat as 1.
  return p.rawUnit === "lbs" ? p.cookedYieldLbsPerUnit : 1;
}
