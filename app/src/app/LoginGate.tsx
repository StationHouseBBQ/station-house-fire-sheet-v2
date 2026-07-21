/**
 * LoginGate — wraps WORKSPACE + HUB content only (never public routes).
 *
 * demo mode:      passes children straight through (authState "demo").
 * supabase mode:  loading → spinner; signed_out → Station House sign-in
 *                 card (with profile-missing / deactivated-account errors
 *                 surfaced from RoleContext); signed_in → children.
 *
 * Public pages (/fire-drop, /cuban-thursday, /catering, /track, /portal,
 * /quote/:token, …) are mounted OUTSIDE this gate in App.tsx and never
 * require a login.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { signIn } from "./auth";
import { useRole } from "./RoleContext";

export function LoginGate({ children }: { children: ReactNode }) {
  const { authState } = useRole();
  if (authState === "demo" || authState === "signed_in") return <>{children}</>;
  if (authState === "loading") return <AuthLoading />;
  return <SignInCard />;
}

function AuthLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Checking session">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink-700 border-t-fire" aria-hidden />
      <span className="sr-only">Checking session…</span>
    </div>
  );
}

function SignInCard() {
  const { authError } = useRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // A failed credential check is local; profile-missing / deactivated
  // errors arrive via RoleContext after the auth layer force-signs-out.
  const error = localError ?? authError;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      await signIn(email.trim(), password);
      // Success: RoleContext's onAuthChange listener flips authState.
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-8">
        <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-fire">Station House Command Center</p>
        <h1 className="mt-3 text-center text-2xl font-black uppercase text-zinc-100">Staff <span className="text-fire">sign in</span></h1>
        <p className="mt-2 text-center text-sm text-zinc-500">Supabase mode — workspaces require a staff account.</p>

        <form onSubmit={e => void onSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Email</label>
            <input
              id="login-email" type="email" required autoComplete="email" autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-zinc-100 placeholder-zinc-600 focus:border-fire/60 focus:outline-none"
              placeholder="you@stationhousebbq.com"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Password</label>
            <input
              id="login-password" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-zinc-100 placeholder-zinc-600 focus:border-fire/60 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit" disabled={busy}
            className="w-full min-h-[44px] rounded-lg bg-fire px-5 font-bold uppercase tracking-wide text-white transition hover:bg-fire/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-600">
          No account or deactivated? Ask an owner — access is provisioned in Admin, and RLS enforces permissions server-side.
        </p>
      </div>
    </div>
  );
}
