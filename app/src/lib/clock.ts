/**
 * Demo clock. In demo mode the clock can be overridden so ordering windows,
 * weekend dates, and Thursday-only rules can be demonstrated on any real
 * day. The override NEVER applies in supabase mode — business time there is
 * always real and server-validated.
 */
const KEY = "shbbq.demo.clock.v1";

export function getClockOverride(): Date | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

export function setClockOverride(d: Date | null): void {
  if (d) localStorage.setItem(KEY, d.toISOString());
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("shbbq-clock-change"));
}

/** The moment "now" — override-aware in demo mode. */
export function currentTime(): Date {
  const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? "demo";
  if (mode !== "demo") return new Date();
  return getClockOverride() ?? new Date();
}
