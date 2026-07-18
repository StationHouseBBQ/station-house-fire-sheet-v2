import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RoleId } from "../config/nav";
import {
  fetchProfile,
  getSession,
  onAuthChange,
  signOut as supabaseSignOut,
  type StaffProfile,
  type StaffRole,
} from "./auth";
import { mapStaffRoleToUiRole } from "./roleMap";

/**
 * Role context — two providers behind one hook.
 *
 * demo mode (default): the classic localStorage role switcher, unchanged.
 *   authState is always "demo" and LoginGate passes straight through.
 *
 * supabase mode: the role DERIVES from the authenticated profile via
 *   mapStaffRoleToUiRole — there is no manual switcher (setRole becomes a
 *   warning no-op). While signed out, authState is "signed_out" and
 *   LoginGate blocks workspace/Hub content. UI gating stays cosmetic;
 *   RLS is the authorization boundary (docs/ARCHITECTURE.md §5).
 */
export type AuthState = "demo" | "signed_out" | "loading" | "signed_in";

interface RoleCtx {
  role: RoleId;
  actor: string;
  setRole: (r: RoleId) => void;
  authState: AuthState;
  /** Database staff role (supabase mode, signed in) — null otherwise. */
  staffRole: StaffRole | null;
  /** Profile full name (supabase mode, signed in) — null otherwise. */
  fullName: string | null;
  /** Sign out (supabase mode). No-op in demo mode. */
  signOut: () => Promise<void>;
  /** Auth-layer error to surface on the sign-in card (profile missing/inactive). */
  authError: string | null;
}

const Ctx = createContext<RoleCtx | null>(null);
const KEY = "shbbq.demo.role.v1";

export function RoleProvider({ children }: { children: ReactNode }) {
  // VITE_DATA_MODE is fixed for the app's lifetime, so branching providers
  // here never changes hook order across renders.
  const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? "demo";
  if (mode === "supabase") return <SupabaseRoleProvider>{children}</SupabaseRoleProvider>;
  return <DemoRoleProvider>{children}</DemoRoleProvider>;
}

// ── Demo mode: exactly the original behavior ─────────────────────────────
function DemoRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleId>(() => (localStorage.getItem(KEY) as RoleId) || "owner_admin");
  const value = useMemo<RoleCtx>(() => ({
    role,
    actor: `demo:${role}`,
    setRole: (r: RoleId) => { localStorage.setItem(KEY, r); setRoleState(r); },
    authState: "demo",
    staffRole: null,
    fullName: null,
    signOut: async () => {},
    authError: null,
  }), [role]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Supabase mode: role derives from the authenticated profile ───────────
interface SupabaseAuth {
  state: Exclude<AuthState, "demo">;
  profile: StaffProfile | null;
  error: string | null;
}

function SupabaseRoleProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<SupabaseAuth>({ state: "loading", profile: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let resolving = 0;

    async function resolve(sessionUserId: string | null) {
      const token = ++resolving;
      if (!sessionUserId) {
        // Keep any prior profile error visible on the sign-in card (the
        // forced sign-out below re-triggers this branch).
        setAuth(prev => ({ state: "signed_out", profile: null, error: prev.error }));
        return;
      }
      try {
        const profile = await fetchProfile(sessionUserId);
        if (cancelled || token !== resolving) return;
        if (!profile.active) {
          setAuth({
            state: "signed_out",
            profile: null,
            error: `The account for ${profile.email || "this user"} is deactivated. Ask an owner to re-activate it.`,
          });
          await supabaseSignOut().catch(() => {});
          return;
        }
        setAuth({ state: "signed_in", profile, error: null });
      } catch (e) {
        if (cancelled || token !== resolving) return;
        setAuth({
          state: "signed_out",
          profile: null,
          error: e instanceof Error ? e.message : String(e),
        });
        await supabaseSignOut().catch(() => {});
      }
    }

    getSession()
      .then(s => { if (!cancelled) void resolve(s?.user.id ?? null); })
      .catch(e => {
        if (!cancelled) setAuth({ state: "signed_out", profile: null, error: e instanceof Error ? e.message : String(e) });
      });
    const unsubscribe = onAuthChange(session => {
      if (!cancelled) void resolve(session?.user.id ?? null);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const value = useMemo<RoleCtx>(() => {
    const profile = auth.profile;
    return {
      // While signed out/loading no workspace content renders (LoginGate),
      // so the placeholder role is the least-privileged one.
      role: profile ? mapStaffRoleToUiRole(profile.role) : "packing",
      actor: profile ? `staff:${profile.email}` : "staff:unauthenticated",
      setRole: () => {
        console.warn("setRole is a no-op in supabase mode — roles derive from the authenticated profile.");
      },
      authState: auth.state,
      staffRole: profile?.role ?? null,
      fullName: profile?.fullName ?? null,
      signOut: async () => { await supabaseSignOut(); },
      authError: auth.error,
    };
  }, [auth]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRole outside RoleProvider");
  return v;
}
