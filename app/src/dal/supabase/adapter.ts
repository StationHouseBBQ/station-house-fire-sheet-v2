/**
 * SupabaseAdapter — Phase 1 (staging).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ HOW PHASE 1 WORKS — READ THIS BEFORE TOUCHING ANYTHING                  │
 * │                                                                         │
 * │ In supabase mode the returned Dal is the DEMO Dal used as the base:     │
 * │ all 72 workspace tabs keep operating against the in-memory demo         │
 * │ collections exactly as in demo mode. Only the `phase1` field talks to   │
 * │ the real database (products, customers, orders, order_items,            │
 * │ catering_leads, audit_log). Phase 2+ migrates the repository            │
 * │ implementations one domain at a time onto Supabase.                     │
 * │                                                                         │
 * │ NO SILENT FALLBACK: if Supabase is misconfigured this adapter throws    │
 * │ at startup; if it is unreachable at runtime, phase1 methods throw and   │
 * │ ConnectionStatus shows a persistent red banner. The demo base is a      │
 * │ deliberate, documented Phase-1 scope decision — not an error handler.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { Dal } from "../types";
import { createDemoDal } from "../demo/adapter";
import { Phase1Repos } from "./phase1-repos";
import { checkConnection, getSupabase } from "./client";

export function createSupabaseDal(): Dal {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    throw new Error(
      "VITE_DATA_MODE=supabase requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. " +
      "Provisioning is gated on owner approval — use demo mode meanwhile.",
    );
  }

  // Construct the client eagerly so a malformed URL/key fails at boot,
  // not on the first query.
  getSupabase();

  const base = createDemoDal(); // Phase-1 base: demo collections keep every tab alive.
  return {
    ...base,
    mode: "supabase",
    phase1: {
      repos: new Phase1Repos(),
      checkConnection,
    },
  };
}
