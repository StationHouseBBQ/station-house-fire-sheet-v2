import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { RoleId } from "../config/nav";

/**
 * Demo-mode role switcher. With Supabase auth this context is fed from the
 * session JWT instead; the switcher stays available to owner_admin only.
 * RLS remains the real authorization boundary (docs/ARCHITECTURE.md §5).
 */
interface RoleCtx {
  role: RoleId;
  actor: string;
  setRole: (r: RoleId) => void;
}

const Ctx = createContext<RoleCtx | null>(null);
const KEY = "shbbq.demo.role.v1";

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleId>(() => (localStorage.getItem(KEY) as RoleId) || "owner_admin");
  const value = useMemo<RoleCtx>(() => ({
    role,
    actor: `demo:${role}`,
    setRole: (r: RoleId) => { localStorage.setItem(KEY, r); setRoleState(r); },
  }), [role]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRole outside RoleProvider");
  return v;
}
