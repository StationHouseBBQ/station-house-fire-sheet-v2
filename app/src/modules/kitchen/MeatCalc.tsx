import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";

/**
 * Kitchen · Meat Calculator — V2 implementation of the Manus MeatCalculator,
 * adapted to the canonical protein_conversions table (dal.proteins.list()).
 * Guest count × appetite (lbs cooked/guest) × per-protein mix % →
 * cooked lbs, raw units to order (ceil), and portion counts.
 * Pure client calculation — no mutations.
 */

const APPETITES = [
  { id: "light", label: "Light", lbs: 0.33, hint: "⅓ lb / guest" },
  { id: "regular", label: "Regular", lbs: 0.5, hint: "½ lb / guest" },
  { id: "hearty", label: "Hearty", lbs: 0.75, hint: "¾ lb / guest" },
] as const;

const GUEST_PRESETS = [25, 50, 75, 100, 150, 200, 300];

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

  // Default even split across the conversion table rows once loaded.
  useEffect(() => {
    if (proteins.length > 0 && Object.keys(mix).length === 0) {
      const even = Math.floor(100 / proteins.length);
      const next: Record<string, number> = {};
      proteins.forEach((p, i) => { next[p.id] = i === 0 ? 100 - even * (proteins.length - 1) : even; });
      setMix(next);
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
        const portions = Math.floor(cookedLbs * p.portionsPerCookedLb);
        return { p, pct, cookedLbs, rawUnits, portions };
      });
  }, [proteins, mix, guestCount, lbsPerGuest]);

  const totalCooked = rows.reduce((s, r) => s + r.cookedLbs, 0);

  const setPct = (id: string, v: number) =>
    setMix(m => ({ ...m, [id]: Math.max(0, Math.min(100, Math.round(v))) }));

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading protein table…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Meat Calculator</h1>
        <p className="text-sm text-zinc-500">Cooked-protein planning from the canonical conversion table</p>
      </header>

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
          <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
            pctOk ? "border-green-700/50 text-green-400" : "border-amber-600/60 bg-amber-950/40 text-amber-300"
          }`}>
            {pctOk ? "Mix = 100% ✓" : `⚠ Mix totals ${totalPct}% — adjust to 100%`}
          </span>
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
          <div className="border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-fire-light">
              Order plan — {guestCount} guests · {lbsPerGuest} lb cooked / guest
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs font-black uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2">Protein</th>
                  <th className="px-3 py-2 text-center">Mix</th>
                  <th className="px-3 py-2 text-right">Cooked lbs</th>
                  <th className="px-3 py-2 text-right">Raw to order</th>
                  <th className="px-3 py-2 text-right">Portions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, pct, cookedLbs, rawUnits, portions }) => (
                  <tr key={p.id} className="border-b border-ink-800">
                    <td className="px-4 py-3 font-semibold text-zinc-100">
                      {p.protein}
                      {p.notes && <span className="block text-xs font-normal text-zinc-500">{p.notes}</span>}
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-400">{pct}%</td>
                    <td className="px-3 py-3 text-right font-black text-fire-light">{cookedLbs.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-bold text-zinc-100">{rawUnits} <span className="text-xs font-normal text-zinc-500">{p.rawUnit}</span></td>
                    <td className="px-3 py-3 text-right text-zinc-300">{portions}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-800/60">
                  <td className="px-4 py-3 text-sm font-black uppercase text-zinc-100" colSpan={2}>Total cooked</td>
                  <td className="px-3 py-3 text-right text-lg font-black text-fire-light">{totalCooked.toFixed(1)} lbs</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900/60 p-3 text-xs text-zinc-500">
        <span className="font-semibold text-zinc-300">How this works: </span>
        cooked lbs = guests × appetite × mix%. Raw units = cooked ÷ yield per unit, rounded up to whole {""}
        units to smoke. Yields come from the canonical protein conversion table.
      </p>
    </div>
  );
}
