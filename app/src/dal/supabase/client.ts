/**
 * Supabase browser client — singleton, anon key only.
 *
 * The anon key is a publishable value; every row it can touch is gated by
 * deny-by-default RLS (supabase/migrations/0001_phase1_foundation.sql).
 * Service-role keys must NEVER appear anywhere in the frontend.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    throw new Error(
      "Supabase client requested but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env.local and fill in the project values (anon key only).",
    );
  }
  client = createClient(url, key);
  return client;
}

export interface ConnectionCheck {
  ok: boolean;
  authenticated: boolean;
  error: string | null;
}

/**
 * Lightweight reachability ping: HEAD-style count query against products.
 * Any PostgREST error (network, DNS, paused project, RLS/permission denial
 * for an unauthenticated session) is surfaced verbatim — the app NEVER
 * silently falls back to demo data in supabase mode.
 */
export async function checkConnection(): Promise<ConnectionCheck> {
  try {
    const sb = getSupabase();
    const { data: sessionData } = await sb.auth.getSession();
    const authenticated = Boolean(sessionData?.session);
    const { error } = await sb
      .from("products")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) {
      return { ok: false, authenticated, error: `${error.code ?? "unknown"}: ${error.message}` };
    }
    return { ok: true, authenticated, error: null };
  } catch (e) {
    return { ok: false, authenticated: false, error: e instanceof Error ? e.message : String(e) };
  }
}
