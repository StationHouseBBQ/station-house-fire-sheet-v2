import type React from "react";
import { lazy } from "react";

/**
 * lazy() wrapper that survives deploys. New builds change hashed chunk
 * filenames; a browser holding the old page can fail to fetch a now-deleted
 * chunk ("Failed to fetch dynamically imported module"). We reload ONCE to
 * pick up the new index, guarded per-chunk in sessionStorage so a genuinely
 * broken chunk surfaces the error (ErrorBoundary) instead of looping.
 *
 * The guard is cleared only when the chunk LOADS SUCCESSFULLY — never blanket
 * on mount — so a stuck chunk cannot trigger an infinite reload loop, while a
 * healthy chunk resets so the next deploy can self-heal again.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>( // eslint-disable-line @typescript-eslint/no-explicit-any
  factory: () => Promise<{ default: T }>,
  key: string,
): React.LazyExoticComponent<T> {
  const flag = `shbbq.chunkReload.${key}`;
  return lazy(() =>
    factory()
      .then((mod) => {
        try { sessionStorage.removeItem(flag); } catch { /* ignore */ }
        return mod;
      })
      .catch((err: unknown) => {
        const isChunkError = err instanceof Error &&
          /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(err.message);
        let alreadyTried = false;
        try { alreadyTried = !!sessionStorage.getItem(flag); } catch { /* ignore */ }
        if (isChunkError && !alreadyTried) {
          try { sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
          window.location.reload();
          return new Promise<{ default: T }>(() => {}); // reload takes over
        }
        throw err; // second failure → ErrorBoundary recover card
      }),
  );
}
