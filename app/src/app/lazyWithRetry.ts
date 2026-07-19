import type React from "react";
import { lazy } from "react";

/**
 * lazy() wrapper that survives deploys. When a new build ships, hashed chunk
 * filenames change; a browser holding the old page can fail to fetch a
 * now-deleted chunk ("Failed to fetch dynamically imported module"). We
 * reload ONCE to pick up the new index, guarding against reload loops with a
 * sessionStorage flag so a genuinely-broken chunk still surfaces its error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key: string,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const flag = `shbbq.chunkReload.${key}`;
      const isChunkError = err instanceof Error &&
        /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(err.message);
      if (isChunkError && !sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, "1");
        window.location.reload();
        // Return a never-resolving promise; the reload takes over.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}

/** Clear reload guards once the app has mounted successfully. */
export function clearChunkReloadGuards(): void {
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith("shbbq.chunkReload.")) sessionStorage.removeItem(k);
  }
}
