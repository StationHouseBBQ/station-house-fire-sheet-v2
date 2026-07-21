import type { TabDef } from "../../config/nav";

/**
 * Honest placeholder for parity rows not yet implemented in V2.
 * Shows exactly what the source does and where it is tracked — never a
 * dead control pretending to work. Removed as each row lands.
 */
export function ParityPending({ tab, workspace }: { tab: TabDef; workspace: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-ink-700 bg-ink-900 p-8 mt-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-fire">Parity row #{tab.parityRow} · Not started</p>
      <h2 className="mt-2 text-2xl font-bold text-zinc-100">{workspace} · {tab.label}</h2>
      <dl className="mt-6 space-y-3 text-sm">
        <div>
          <dt className="text-zinc-500">Source of truth (Manus snapshot)</dt>
          <dd className="font-mono text-zinc-300">{tab.sourceComponent}{tab.sourceFile ? ` — ${tab.sourceFile}` : ""}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Tracking</dt>
          <dd className="text-zinc-300">docs/PARITY_MATRIX.md row {tab.parityRow}: expected behaviors, data dependencies, and definition of done.</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-zinc-400">
        This tab is scheduled in the build order and will ship with full behavior — controls here are
        intentionally absent rather than non-functional.
      </p>
    </section>
  );
}
