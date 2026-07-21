import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { formatCents } from "../../lib/money";
import {
  CATEGORY_LABELS, CATEGORY_ORDER,
  type CountLine, type InventoryCategory,
} from "./_data/inventoryData";
import { useInventoryItems, useInventoryMutation, setOnHand } from "./_data/useInventory";

/**
 * Inventory · Physical Count — V2 of Manus InventoryCount / InventoryCountSheet.
 * Enter a counted quantity per item; the sheet shows expected (system on-hand)
 * vs counted, the unit + dollar variance, and roll-up totals. Submitting posts
 * the counted quantities as the new on-hand and shows a confirmation.
 */

type Counts = Record<string, string>;

export function InventoryCount() {
  const { actor } = useRole();
  const { data: items, isLoading } = useInventoryItems();
  const [counts, setCounts] = useState<Counts>({});
  const [filterCat, setFilterCat] = useState<InventoryCategory | "all">("all");
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const submitMut = useInventoryMutation(async (lines: CountLine[]) => {
    await setOnHand(lines.map(l => ({ itemId: l.itemId, onHand: l.counted })), actor);
  });

  const rows = items ?? [];

  const lines = useMemo<CountLine[]>(() => rows.map(it => {
    const raw = counts[it.id];
    const counted = raw === undefined || raw === "" ? it.onHand : Number(raw) || 0;
    return {
      itemId: it.id, itemName: it.name, category: it.category, unit: it.unit,
      expected: it.onHand, counted, unitCostCents: it.unitCostCents,
    };
  }), [rows, counts]);

  const touched = lines.filter(l => counts[l.itemId] !== undefined && counts[l.itemId] !== "");
  const variances = touched.filter(l => l.counted !== l.expected);
  const dollarVarianceCents = touched.reduce((s, l) => s + Math.round((l.counted - l.expected) * l.unitCostCents), 0);

  const grouped = useMemo(() => {
    const map = new Map<InventoryCategory, CountLine[]>();
    for (const l of lines) {
      if (filterCat !== "all" && l.category !== filterCat) continue;
      const list = map.get(l.category) ?? [];
      list.push(l);
      map.set(l.category, list);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [lines, filterCat]);

  const sameAsLast = () => {
    const filled: Counts = {};
    for (const it of rows) filled[it.id] = String(it.onHand);
    setCounts(filled);
  };

  const submit = () => {
    submitMut.mutate(touched, {
      onSuccess: () => {
        setSubmittedAt(currentTime().toISOString());
        setCounts({});
      },
    });
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading count sheet…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Physical Count</h1>
          <p className="text-sm text-zinc-500">Enter what you counted · variance vs system on-hand · submit to reconcile</p>
        </div>
        <button onClick={sameAsLast} className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200">
          Pre-fill from on-hand
        </button>
      </header>

      {submittedAt && (
        <div className="mt-4 rounded-xl border border-green-700/50 bg-green-950/30 px-4 py-3 text-sm text-green-300">
          Count posted at {new Date(submittedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. On-hand quantities updated.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-3xl font-black text-zinc-100">{touched.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Counted</p>
        </div>
        <div className={`rounded-xl border p-4 ${variances.length > 0 ? "border-amber-700/50 bg-amber-950/30" : "border-ink-700 bg-ink-900"}`}>
          <p className={`text-3xl font-black ${variances.length > 0 ? "text-amber-400" : "text-green-400"}`}>{variances.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Variances</p>
        </div>
        <div className={`rounded-xl border p-4 ${dollarVarianceCents !== 0 ? (dollarVarianceCents < 0 ? "border-red-700/50 bg-red-950/30" : "border-green-700/50 bg-green-950/30") : "border-ink-700 bg-ink-900"}`}>
          <p className={`text-3xl font-black ${dollarVarianceCents < 0 ? "text-red-400" : dollarVarianceCents > 0 ? "text-green-400" : "text-zinc-100"}`}>
            {dollarVarianceCents >= 0 ? "+" : "−"}{formatCents(Math.abs(dollarVarianceCents))}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">$ variance</p>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-3xl font-black text-zinc-100">{rows.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Items on sheet</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        <Chip active={filterCat === "all"} onClick={() => setFilterCat("all")}>All</Chip>
        {CATEGORY_ORDER.map(c => (
          <Chip key={c} active={filterCat === c} onClick={() => setFilterCat(c)}>{CATEGORY_LABELS[c]}</Chip>
        ))}
      </div>

      {grouped.map(([cat, catLines]) => (
        <section key={cat} className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-fire-light">{CATEGORY_LABELS[cat]}</span>
            <div className="h-px flex-1 bg-ink-700" />
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr_1.2fr] gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Item</span>
            <span className="text-center">Expected</span>
            <span className="text-center">Counted</span>
            <span className="text-center">Variance</span>
          </div>
          <ul className="space-y-1.5">
            {catLines.map(l => {
              const isTouched = counts[l.itemId] !== undefined && counts[l.itemId] !== "";
              const diff = l.counted - l.expected;
              const diffCents = Math.round(diff * l.unitCostCents);
              const show = isTouched && diff !== 0;
              return (
                <li key={l.itemId}
                  className={`grid grid-cols-[2fr_1fr_1fr_1.2fr] items-center gap-2 rounded-xl border px-3 py-2 ${show ? (diff < 0 ? "border-red-700/40 bg-red-950/20" : "border-green-700/40 bg-green-950/20") : "border-ink-700 bg-ink-900"}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-100">{l.itemName}</p>
                    <p className="text-xs text-zinc-500">{l.unit} · {formatCents(l.unitCostCents)}/{l.unit}</p>
                  </div>
                  <div className="text-center text-sm text-zinc-400">{l.expected}</div>
                  <input value={counts[l.itemId] ?? ""} onChange={e => setCounts(prev => ({ ...prev, [l.itemId]: e.target.value }))}
                    inputMode="decimal" placeholder={String(l.expected)}
                    aria-label={`Counted quantity for ${l.itemName}`}
                    className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-center text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-fire focus:outline-none" />
                  <div className={`rounded-lg px-2 py-1 text-center text-xs font-bold ${show ? (diff < 0 ? "text-red-400" : "text-green-400") : "text-zinc-600"}`}>
                    {show ? (
                      <>{diff > 0 ? "+" : ""}{Math.round(diff * 100) / 100} <span className="text-zinc-500">({diffCents >= 0 ? "+" : "−"}{formatCents(Math.abs(diffCents))})</span></>
                    ) : "—"}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t border-ink-700 bg-ink-950/90 py-4 backdrop-blur">
        <p className="text-sm text-zinc-400">
          {touched.length} counted · {variances.length} variance{variances.length === 1 ? "" : "s"}
        </p>
        <button onClick={submit} disabled={submitMut.isPending || touched.length === 0}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {submitMut.isPending ? "Posting…" : `Submit count (${touched.length})`}
        </button>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${active ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
      {children}
    </button>
  );
}
