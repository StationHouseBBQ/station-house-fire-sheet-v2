import type { Dal } from "./types";
import { createDemoDal } from "./demo/adapter";
import { createSupabaseDal } from "./supabase/adapter";

let dal: Dal | null = null;

export function getDal(): Dal {
  if (dal) return dal;
  const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? "demo";
  dal = mode === "supabase" ? createSupabaseDal() : createDemoDal();
  return dal;
}

export type { Dal } from "./types";
