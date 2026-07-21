import { Link } from "wouter";

/**
 * Global navigation controls: Home is always one tap away, and Back steps
 * one spot in history (works with hash routing on the Pages preview).
 */
export function NavControls({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => window.history.back()}
        aria-label="Go back"
        className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 font-bold text-zinc-300 hover:border-fire/50 hover:text-fire-light ${compact ? "px-3 text-sm" : "px-3.5 text-sm"}`}>
        ← <span className={compact ? "sr-only" : ""}>Back</span>
      </button>
      <button
        onClick={() => window.history.forward()}
        aria-label="Go forward"
        className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 font-bold text-zinc-300 hover:border-fire/50 hover:text-fire-light ${compact ? "px-3 text-sm" : "px-3.5 text-sm"}`}>
        → <span className={compact ? "sr-only" : ""}>Forward</span>
      </button>
      <Link href="/" aria-label="Go home"
        className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 font-bold text-zinc-300 hover:border-fire/50 hover:text-fire-light ${compact ? "px-3 text-sm" : "px-3.5 text-sm"}`}>
        ⌂ <span className={compact ? "sr-only" : ""}>Home</span>
      </Link>
    </div>
  );
}
