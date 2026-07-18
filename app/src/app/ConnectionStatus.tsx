/**
 * ConnectionStatus — supabase-mode health banner. NO SILENT FALLBACK.
 *
 * demo mode: renders nothing.
 * supabase mode, by auth state:
 *   loading    → nothing (avoid a red flash before the session resolves).
 *   signed_out → persistent AMBER banner: "Supabase mode: sign in required".
 *                This is an expected state, not an error.
 *   signed_in  → pings checkConnection() on mount and every 60s.
 *     green → "Supabase connected · signed in as {fullName} ({staffRole})"
 *             — auto-hides after 5s.
 *     red   → persistent failure banner with the exact error + Retry button.
 *             Data operations are unavailable; the app does NOT fall back
 *             to demo data in supabase mode.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { checkConnection, type ConnectionCheck } from "../dal/supabase/client";
import { useRole } from "./RoleContext";

const POLL_MS = 60_000;
const GREEN_HIDE_MS = 5_000;

type BannerState =
  | { kind: "idle" }
  | { kind: "ok"; visible: boolean }
  | { kind: "error"; error: string };

export function ConnectionStatus() {
  const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? "demo";
  if (mode !== "supabase") return null; // demo mode: nothing, ever
  return <SupabaseConnectionBanner />;
}

function SupabaseConnectionBanner() {
  const { authState, fullName, staffRole } = useRole();
  const [state, setState] = useState<BannerState>({ kind: "idle" });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCheck = useCallback(async () => {
    let result: ConnectionCheck;
    try {
      result = await checkConnection();
    } catch (e) {
      result = { ok: false, authenticated: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (result.ok) {
      setState({ kind: "ok", visible: true });
      hideTimer.current = setTimeout(() => setState({ kind: "ok", visible: false }), GREEN_HIDE_MS);
    } else {
      setState({ kind: "error", error: result.error ?? "unknown error" });
    }
  }, []);

  useEffect(() => {
    // Only ping while a staff session exists — an unauthenticated ping just
    // reports the deny-by-default RLS wall, which the amber banner covers.
    if (authState !== "signed_in") {
      setState({ kind: "idle" });
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      return;
    }
    void runCheck();
    const interval = setInterval(() => void runCheck(), POLL_MS);
    return () => {
      clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [runCheck, authState]);

  if (authState === "loading" || authState === "demo") return null;

  if (authState === "signed_out") {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[100] bg-amber-600 px-4 py-1.5 text-center text-sm font-medium text-white shadow"
      >
        Supabase mode: sign in required
      </div>
    );
  }

  if (state.kind === "idle") return null;

  if (state.kind === "ok") {
    if (!state.visible) return null;
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[100] bg-green-700 px-4 py-1.5 text-center text-sm font-medium text-white shadow"
      >
        Supabase connected · signed in as {fullName || "Staff"} ({staffRole ?? "unknown"})
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-700 px-4 py-2 text-center text-sm font-medium text-white shadow"
    >
      <span>
        Supabase connection failed: {state.error} — data operations are unavailable. This app does
        NOT fall back to demo data in supabase mode.
      </span>
      <button
        type="button"
        onClick={() => void runCheck()}
        className="rounded border border-white/70 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide hover:bg-white/10"
      >
        Retry
      </button>
    </div>
  );
}
