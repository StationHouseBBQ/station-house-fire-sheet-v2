import { Link } from "wouter";
import { WORKSPACES, findWorkspace, type TabDef, type WorkspaceDef } from "../config/nav";
import { ROLES } from "../config/roles";
import { useRole } from "./RoleContext";
import { LoginGate } from "./LoginGate";
import { Suspense } from "react";
import { ParityPending } from "../modules/shared/ParityPending";
import { IMPLEMENTED } from "./registry";
import { NavControls } from "./NavControls";
import { DemoControls } from "./DemoControls";

function TabView({ ws, tab }: { ws: WorkspaceDef; tab: TabDef }) {
  const Impl = IMPLEMENTED[`${ws.id}/${tab.id}`];
  if (!Impl) return <ParityPending tab={tab} workspace={ws.label} />;
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-600">Loading {tab.label}…</p>}>
      <Impl />
    </Suspense>
  );
}

export function WorkspacePage({ wsId, tabId }: { wsId: string; tabId?: string }) {
  // Workspace content sits behind LoginGate: pass-through in demo mode,
  // sign-in card in supabase mode until a staff session exists.
  return (
    <LoginGate>
      <WorkspacePageInner wsId={wsId} tabId={tabId} />
    </LoginGate>
  );
}

function WorkspacePageInner({ wsId, tabId }: { wsId: string; tabId?: string }) {
  const { role } = useRole();
  const ws = findWorkspace(wsId);
  if (!ws) return <NotFound />;
  const allowed = ws.roles.includes(role);
  const tab = ws.tabs.find(t => t.id === (tabId ?? ws.tabs[0].id)) ?? ws.tabs[0];
  return (
    <div className="flex min-h-full flex-col">
      <nav aria-label={`${ws.label} tabs`} className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-ink-700 bg-ink-950/95 px-3 py-2 backdrop-blur">
        <NavControls compact />
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-ink-700" />
        {ws.tabs.map(t => (
          <Link key={t.id} href={`${ws.base}/${t.id}`}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${t.id === tab.id ? "bg-fire/20 text-fire-light border border-fire/40" : "text-zinc-400 hover:text-zinc-200 hover:bg-ink-800"}`}>
            {t.label}
            {!t.implemented && <span className="ml-1.5 align-middle text-[10px] text-zinc-600" title={`Parity row ${t.parityRow} pending`}>◌</span>}
          </Link>
        ))}
        <SignedInBadge />
      </nav>
      <main className="flex-1 px-4 pb-16">
        {allowed ? <TabView ws={ws} tab={tab} /> : <RoleDenied wsLabel={ws.label} />}
      </main>
    </div>
  );
}

/**
 * Signed-in identity + sign out for the workspace nav bar.
 * Renders ONLY in supabase mode with an authenticated session.
 */
function SignedInBadge() {
  const { authState, fullName, staffRole, signOut } = useRole();
  if (authState !== "signed_in") return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 pl-3">
      <span className="hidden text-xs text-zinc-500 sm:inline" title={`Staff role: ${staffRole ?? ""}`}>
        {fullName || "Staff"}{staffRole ? ` (${staffRole})` : ""}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-zinc-400 hover:text-fire-light"
      >
        Sign out
      </button>
    </span>
  );
}

function RoleDenied({ wsLabel }: { wsLabel: string }) {
  const { role } = useRole();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center">
      <h2 className="text-lg font-bold text-zinc-100">No access to {wsLabel}</h2>
      <p className="mt-2 text-sm text-zinc-400">
        The <span className="font-semibold">{ROLES.find(r => r.id === role)?.label}</span> role doesn't include this
        workspace. UI gating is cosmetic — Supabase RLS enforces this server-side.
      </p>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <p className="text-6xl font-black text-fire">404</p>
      <p className="mt-3 text-zinc-400">That route isn't part of Fire Sheet V2.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-fire px-5 py-2.5 font-semibold text-white">Back to Hub</Link>
    </div>
  );
}

export function Hub() {
  // Hub lists workspaces, so it sits behind the same gate as workspace pages.
  return (
    <LoginGate>
      <HubInner />
    </LoginGate>
  );
}

function HubInner() {
  const { role, setRole, authState, fullName, staffRole, signOut } = useRole();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <header className="pt-12 pb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-fire">Station House Command Center</p>
        <h1 className="mt-3 text-4xl font-black uppercase text-zinc-100 sm:text-5xl">Where do you want <span className="text-fire">to go?</span></h1>
        {authState === "demo" ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
            <label htmlFor="role" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Demo role</label>
            <select id="role" value={role} onChange={e => setRole(e.target.value as typeof role)}
              className="rounded-md bg-ink-800 px-2 py-1.5 text-sm font-semibold text-zinc-200">
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        ) : (
          /* Supabase mode: role derives from the signed-in profile — no switcher. */
          <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-2">
            <span className="text-sm text-zinc-400">
              Signed in as <span className="font-semibold text-zinc-200">{fullName || "Staff"}</span>
              {staffRole ? <span className="text-zinc-500"> ({staffRole})</span> : null}
            </span>
            <button type="button" onClick={() => void signOut()}
              className="min-h-[44px] px-2 text-xs font-semibold text-zinc-400 hover:text-fire-light">
              Sign out
            </button>
          </div>
        )}
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WORKSPACES.map(ws => {
          const allowed = ws.roles.includes(role);
          const done = ws.tabs.filter(t => t.implemented).length;
          return (
            <Link key={ws.id} href={allowed ? `${ws.base}/${ws.tabs[0].id}` : "#"} aria-disabled={!allowed}
              className={`rounded-2xl border p-5 transition ${allowed ? "border-ink-700 bg-ink-900 hover:border-fire/50" : "cursor-not-allowed border-ink-800 bg-ink-900/40 opacity-50"}`}>
              <h2 className="text-xl font-extrabold uppercase text-zinc-100">{ws.label}</h2>
              <p className="mt-1 text-sm text-zinc-500">{ws.tabs.length} tabs · {done} implemented · {ws.tabs.length - done} parity-pending</p>
              {!allowed && <p className="mt-2 text-xs font-semibold text-zinc-600">Not available to current role</p>}
            </Link>
          );
        })}
      </div>
      <div className="mt-10 rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Public pages (no login)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[["/fire-drop","🔥 Weekend Pre-Order"],["/cuban-thursday","🥪 Cuban Thursday"],["/catering","🎉 Catering"],["/express","🚚 Express Catering"],["/catering-request","📋 Catering Request"],["/track","📦 Order Tracker"],["/portal","🏢 Client Portal"]].map(([href,label]) => (
            <Link key={href} href={href} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:border-fire/50">{label}</Link>
          ))}
        </div>
      </div>
      <DemoControls />
      <p className="mt-6 text-center text-xs text-zinc-600">
        Fire Sheet V2 foundation · demo data only · parity tracked in docs/PARITY_MATRIX.md
      </p>
    </div>
  );
}
