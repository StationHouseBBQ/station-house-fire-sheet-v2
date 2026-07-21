import type { RoleId } from "./nav";

export interface RoleDef {
  id: RoleId;
  label: string;
  description: string;
}

/**
 * Role definitions mirror the Supabase `role` enum and the RLS policy matrix
 * (docs/ARCHITECTURE.md §5). UI gating with these roles is cosmetic; RLS is
 * the authorization boundary.
 */
export const ROLES: RoleDef[] = [
  { id: "owner_admin", label: "Owner / Admin", description: "Full access to every module." },
  { id: "catering_director", label: "Catering Director", description: "Catering, leads, quotes, events, client portal, operational views." },
  { id: "kitchen", label: "Kitchen", description: "Prep, Kitchen, Pit, Expo, packing views. No pricing or admin." },
  { id: "counter_foh", label: "Counter / FOH", description: "Seminole orders, KDS, pickups, checklist, temp log." },
  { id: "packing", label: "Packing", description: "Packing views and read-only order details." },
];
