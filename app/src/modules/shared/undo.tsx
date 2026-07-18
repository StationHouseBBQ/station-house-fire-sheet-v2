import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * Universal action undo. Any view can register an undoable action:
 *   const undo = useUndo();
 *   undo.offer("Marked picked up", async () => revertIt());
 * A snackbar appears for 12 seconds with an Undo button that runs the
 * revert. New offers replace the previous one.
 */
interface UndoCtx {
  offer: (label: string, revert: () => Promise<void> | void) => void;
}

const Ctx = createContext<UndoCtx | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ label: string; revert: () => Promise<void> | void } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCurrent(null);
    setBusy(false);
  }, []);

  const offer = useCallback((label: string, revert: () => Promise<void> | void) => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent({ label, revert });
    setBusy(false);
    timer.current = setTimeout(() => { setCurrent(null); timer.current = null; }, 12000);
  }, []);

  return (
    <Ctx.Provider value={{ offer }}>
      {children}
      {current && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[9500] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-ink-700 bg-ink-800 px-4 py-3 shadow-2xl shadow-black/60">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-200">{current.label}</p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await current.revert(); } finally { clear(); }
            }}
            className="min-h-[44px] shrink-0 rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Undoing…" : "↩ Undo"}
          </button>
          <button onClick={clear} aria-label="Dismiss" className="shrink-0 px-1 text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useUndo(): UndoCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUndo outside UndoProvider");
  return v;
}
