import { Component, type ReactNode } from "react";

interface State { error: Error | null; }

/**
 * App-wide safety net. A render/chunk error shows a recover card instead of a
 * blank screen — critical for a restaurant-floor tool that must never look
 * dead mid-service.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { console.error("Fire Sheet error boundary:", error); }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunk = /dynamically imported module|module script failed|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center">
        <p className="text-5xl">🔧</p>
        <h1 className="mt-4 text-2xl font-black uppercase text-zinc-100">
          {isChunk ? "Update available" : "Something hiccuped"}
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          {isChunk
            ? "A newer version just shipped. Reload to pick it up — your saved work is safe."
            : "This screen hit an error. Reloading usually clears it; your saved work is safe."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => window.location.reload()}
            className="min-h-[44px] rounded-lg bg-fire px-6 font-bold text-white">Reload</button>
          <a href="#/" onClick={() => setTimeout(() => window.location.reload(), 0)}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-6 font-bold leading-[44px] text-zinc-300">Home</a>
        </div>
        {import.meta.env.DEV && <pre className="mt-6 overflow-auto rounded-lg bg-ink-900 p-3 text-left text-xs text-red-400">{this.state.error.message}</pre>}
      </div>
    );
  }
}
