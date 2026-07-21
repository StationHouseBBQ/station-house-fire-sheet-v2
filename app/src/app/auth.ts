/**
 * Supabase auth service — thin, typed wrapper over the singleton client.
 *
 * Used ONLY in supabase mode (demo mode never touches this module). Auth
 * identifies the staff member; authorization stays in Postgres RLS
 * (supabase/migrations/0001_phase1_foundation.sql). The UI role derived
 * from the profile is cosmetic navigation gating — see roleMap.ts.
 */
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../dal/supabase/client";

/** Mirrors the `public.staff_role` Postgres enum exactly. */
export type StaffRole = "owner" | "manager" | "counter" | "kitchen" | "catering" | "marketing";

export const STAFF_ROLES: readonly StaffRole[] = [
  "owner", "manager", "counter", "kitchen", "catering", "marketing",
] as const;

/** Row shape of `public.profiles`, camel-cased for the UI. */
export interface StaffProfile {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  active: boolean;
}

/** Thrown when an authenticated user has no row in `profiles`. */
export class ProfileMissingError extends Error {
  constructor(userId: string) {
    super(
      `No staff profile exists for this account (user ${userId}). ` +
      "Ask an owner to add you in Admin before signing in.",
    );
    this.name = "ProfileMissingError";
  }
}

/** Sign in with email + password. Resolves to the new session or throws. */
export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Sign-in succeeded but no session was returned.");
  return data.session;
}

/** Sign out the current session (no-op if already signed out). */
export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(error.message);
}

/** Current session, if any. */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

/**
 * Subscribe to auth state changes. Returns an unsubscribe function.
 * The callback also fires for token refreshes; consumers should be
 * idempotent for repeated sessions of the same user.
 */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/**
 * Fetch the staff profile for a user id. Throws ProfileMissingError when the
 * row doesn't exist (RLS lets every user read their own row, so a miss means
 * the profile genuinely hasn't been provisioned). `active` is returned as-is;
 * the caller decides how to treat deactivated accounts.
 */
export async function fetchProfile(userId: string): Promise<StaffProfile> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, full_name, email, role, active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`[supabase:fetchProfile] ${error.message}`);
  if (!data) throw new ProfileMissingError(userId);
  return {
    id: data.id as string,
    fullName: (data.full_name as string | null) ?? "",
    email: (data.email as string | null) ?? "",
    role: data.role as StaffRole,
    active: Boolean(data.active),
  };
}
