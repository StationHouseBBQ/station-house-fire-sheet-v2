import { useCallback, useEffect, useRef, useState } from "react";
import { getDal } from "../../../dal";
import { useRole } from "../../../app/RoleContext";

/**
 * Shared helpers for the food-safety / ops kitchen tabs (HACCP, Waste,
 * Fire Log, Task Board, Seasoning Library). These tabs persist through the
 * DAL SettingsRepository under stable "kitchen.*" keys so the demo data
 * survives refresh and is shared across devices in supabase mode.
 *
 * Everything here is local to src/modules/kitchen/ and touches nothing
 * outside it. TS strict clean.
 */

export type Sync = "idle" | "saving" | "saved" | "error";

/**
 * DAL-settings-backed state with the same ergonomics as usePersistentState.
 * Loads once via dal.settings.get(key, seed); writes are debounced and go
 * through dal.settings.set(key, value, actor). Exposes a Sync flag so the
 * UI can show a save badge identical to the other kitchen tabs.
 */
export function useSettingsState<T>(
  key: string,
  seed: T,
): {
  value: T;
  set: (v: T | ((prev: T) => T)) => void;
  loading: boolean;
  sync: Sync;
} {
  const dal = getDal();
  const { actor } = useRole();
  const [value, setValue] = useState<T>(seed);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<Sync>("idle");
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    dal.settings
      .get<T>(key, seed)
      .then(v => {
        if (!alive) return;
        setValue(v);
      })
      .catch(() => {
        /* fall back to seed */
      })
      .finally(() => {
        if (!alive) return;
        loaded.current = true;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // key is stable per tab; seed is a constant literal — intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(
    (next: T) => {
      setSync("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        dal.settings
          .set<T>(key, next, actor)
          .then(() => setSync("saved"))
          .catch(() => setSync("error"));
      }, 250);
    },
    [dal, key, actor],
  );

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue(prev => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        if (loaded.current) persist(next);
        return next;
      });
    },
    [persist],
  );

  return { value, set, loading, sync };
}

export function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return (
    <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>
      {meta[sync].label}
    </span>
  );
}

export function uid(): string {
  return crypto.randomUUID();
}

/** YYYY-MM-DD in local time from an ISO string (or now). */
export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function dateLabel(dayIso: string): string {
  return new Date(dayIso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
