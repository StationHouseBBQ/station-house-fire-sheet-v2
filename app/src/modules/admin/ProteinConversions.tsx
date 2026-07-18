import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";

/**
 * Admin · Protein Conversions — V2 counterpart of Manus ProteinConversionTable
 * (parity row 62). Read-only yield reference plus a worked-example calculator:
 * raw qty → cooked lbs → portions for a selected protein.
 */

export function ProteinConversionsView() {
  const dal = getDal();
  const { data: proteins, isLoading } = useQuery({ queryKey: ["proteins"], queryFn: () => dal.proteins.list() });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawQty, setRawQty] = useState("10");

  if (isLoading || !proteins) return <p className="py-20 text-center text-zinc-500">Loading conversions…</p>;

  const selected = proteins.find(p => p.id === selectedId) ?? proteins[0] ?? null;
  const qty = Number(rawQty);
  const validQty = Number.isFinite(qty) && qty >= 0;
  const cookedLbs = selected && validQty ? qty * selected.cookedYieldLbsPerUnit : null;
  const portions = selected && cookedLbs != null ? cookedLbs * selected.portionsPerCookedLb : null;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Protein Conversions</h1>
        <p className="text-sm text-zinc-500">Read-only yield reference — raw → cooked → portions</p>
      </header>

      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Protein</th>
              <th className="px-3 py-2.5">Raw unit</th>
              <th className="px-3 py-2.5 text-right">Cooked yield (lbs/unit)</th>
              <th className="px-3 py-2.5 text-right">Portions / cooked lb</th>
              <th className="px-3 py-2.5">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {proteins.map(p => (
              <tr key={p.id} className={selected?.id === p.id ? "bg-ink-800/60" : ""}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{p.protein}</td>
                <td className="px-3 py-2.5 text-zinc-400">{p.rawUnit}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{p.cookedYieldLbsPerUnit}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{p.portionsPerCookedLb}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{p.notes || "—"}</td>
              </tr>
            ))}
            {proteins.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No conversion data.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Worked example calculator */}
      {selected && (
        <section className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Yield calculator">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Worked example</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-sm font-semibold text-zinc-400">Protein
              <select value={selected.id} onChange={e => setSelectedId(e.target.value)}
                className="mt-1 block min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
                {proteins.map(p => <option key={p.id} value={p.id}>{p.protein}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-zinc-400">Raw qty ({selected.rawUnit})
              <input value={rawQty} onChange={e => setRawQty(e.target.value)} inputMode="decimal"
                className="mt-1 block w-28 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-right font-mono text-zinc-100" />
            </label>
          </div>
          {validQty && cookedLbs != null && portions != null ? (
            <p className="mt-4 rounded-lg border border-fire/40 bg-ink-800 px-4 py-3 text-sm text-zinc-200">
              <span className="font-mono font-bold">{qty}</span> {selected.rawUnit} of {selected.protein} →{" "}
              <span className="font-mono font-bold text-fire-light">{cookedLbs.toFixed(1)} lbs cooked</span> →{" "}
              <span className="font-mono font-bold text-green-400">≈ {Math.floor(portions)} portions</span>
              <span className="ml-2 text-xs text-zinc-500">({selected.cookedYieldLbsPerUnit} lbs/unit yield × {selected.portionsPerCookedLb} portions/lb)</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-red-400">Enter a non-negative raw quantity.</p>
          )}
        </section>
      )}
    </div>
  );
}
