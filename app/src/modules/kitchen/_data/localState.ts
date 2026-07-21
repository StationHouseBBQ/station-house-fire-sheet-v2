/**
 * Kitchen module-local persisted state. Used only for features that have no
 * backing DAL repository (saved calculator builds, checklist temperature
 * readings, expo station preference, collapse prefs). Everything here is
 * demo-only convenience state scoped to this module — it never touches the
 * shared DAL or any file outside src/modules/kitchen/.
 *
 * Storage is synchronous localStorage (small, per-device) with a React hook
 * so components re-render on change and survive refresh.
 */
import { useCallback, useEffect, useState } from "react";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal for demo state */
  }
}

/** localStorage-backed state that survives refresh. */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const fullKey = `shbbq.kitchen.${key}`;
  const [state, setState] = useState<T>(() => read(fullKey, initial));

  useEffect(() => {
    write(fullKey, state);
  }, [fullKey, state]);

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setState(prev => (typeof v === "function" ? (v as (p: T) => T)(prev) : v));
  }, []);

  return [state, set];
}

// ── Saved Meat Calculator builds ──────────────────────────────────────────
export interface SavedMeatBuild {
  id: string;
  name: string;
  guests: number;
  appetiteId: string;
  mix: Record<string, number>;
  savedAt: string;
}

// ── Checklist temperature reading (module-local, keyed by run+item) ────────
export interface TempReading {
  tempF: number;
  correctiveAction: string;
  takenAt: string;
  takenBy: string;
}
