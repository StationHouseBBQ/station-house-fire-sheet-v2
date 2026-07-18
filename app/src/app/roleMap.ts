/**
 * Staff role (Postgres `staff_role` enum) → UI role (navigation RoleId).
 *
 * The database has six staff roles; the UI shell was built with five
 * navigation roles. This mapping is intentionally lossy — it only decides
 * which workspaces/tabs the shell SHOWS. Row-level security remains the
 * real authorization boundary regardless of what the UI displays.
 */
import type { RoleId } from "../config/nav";
import type { StaffRole } from "./auth";

export function mapStaffRoleToUiRole(staff: StaffRole): RoleId {
  switch (staff) {
    // owner → full UI.
    case "owner":
      return "owner_admin";
    // manager → full operational UI. Profile/role management is still
    // blocked server-side: RLS gives managers read-only access to profiles.
    case "manager":
      return "owner_admin";
    // counter → Seminole Heights FOH surfaces.
    case "counter":
      return "counter_foh";
    // kitchen → prep / pit / expo / packing surfaces.
    case "kitchen":
      return "kitchen";
    // catering → catering director workspace.
    case "catering":
      return "catering_director";
    // marketing → the marketing workspace is currently gated behind the
    // catering UI role, so marketing staff get that shell. NOTE: RLS still
    // blocks marketing from orders/customers regardless of what the UI
    // renders — they will see permission errors on those tabs by design.
    case "marketing":
      return "catering_director";
    default: {
      // Exhaustiveness guard: adding a staff_role enum value without
      // extending this switch is a compile error.
      const exhaustive: never = staff;
      throw new Error(`Unmapped staff role: ${String(exhaustive)}`);
    }
  }
}
