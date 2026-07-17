/**
 * SupabaseAdapter — same repository interfaces backed by supabase-js.
 * Wiring lands with the Supabase project provisioning step; until then this
 * adapter refuses loudly rather than pretending to work. The demo adapter is
 * the supported mode for this checkpoint.
 */
import type { Dal } from "../types";

export function createSupabaseDal(): Dal {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    throw new Error(
      "VITE_DATA_MODE=supabase requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. " +
      "Provisioning is gated on owner approval — use demo mode meanwhile.",
    );
  }
  throw new Error("SupabaseAdapter lands with the provisioning checkpoint (see docs/ARCHITECTURE.md §3).");
}
