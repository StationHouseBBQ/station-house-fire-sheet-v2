import { Link } from "wouter";
import { WORKSPACES, findWorkspace, type TabDef, type WorkspaceDef } from "../config/nav";
import { ROLES } from "../config/roles";
import { useRole } from "./RoleContext";
import { ParityPending } from "../modules/shared/ParityPending";
import { PrepBoard } from "../modules/kitchen/PrepBoard";
import { WeeklyBoard } from "../modules/kitchen/WeeklyBoard";
import { FireSheets } from "../modules/kitchen/FireSheets";
import { KitchenCalendar } from "../modules/kitchen/KitchenCalendar";
import { ExpoKds } from "../modules/kitchen/ExpoKds";
import { MeatCalc } from "../modules/kitchen/MeatCalc";
import { OrderHistoryView } from "../modules/kitchen/OrderHistory";
import { MorningChecklist } from "../modules/kitchen/MorningChecklist";
import { PrepRecipesView } from "../modules/kitchen/PrepRecipes";
import { PitDashboard } from "../modules/pit/PitDashboard";
import { SmokedInventoryView } from "../modules/pit/SmokedInventoryView";
import { SmokerForecastView } from "../modules/pit/SmokerForecastView";
import { PitmasterGuideView } from "../modules/pit/PitmasterGuideView";
import { MeatCostGuide } from "../modules/pit/MeatCostGuide";
import type { ComponentType } from "react";

/** Registry of implemented tab views. Grows as parity rows land. */
const IMPLEMENTED: Record<string, ComponentType> = {
  "kitchen/weekly": WeeklyBoard,
  "kitchen/fire-sheets": FireSheets,
  "kitchen/calendar": KitchenCalendar,
  "kitchen/expo": ExpoKds,
  "kitchen/calculator": MeatCalc,
  "kitchen/prep": PrepBoard,
  "kitchen/order-history": OrderHistoryView,
  "kitchen/morning-checklist": MorningChecklist,
  "kitchen/prep-recipes": PrepRecipesView,
  "pit/dashboard": PitDashboard,
  "pit/inventory": SmokedInventoryView,
  "pit/forecast": SmokerForecastView,
  "pit/guide": PitmasterGuideView,
  "pit/cost": MeatCostGuide,
};

function TabView({ ws, tab }: { ws: WorkspaceDef; tab: TabDef }) {
  const Impl = IMPLEMENTED[`${ws.id}/${tab.id}`];
  return Impl ? <Impl /> : <ParityPending tab={tab} workspace={ws.label} />;
}

export function WorkspacePage({ wsId, tabId }: { wsId: string; tabId?: string }) {
  const { role } = useRole();
  const ws = findWorkspace(wsId);
  if (!ws) return <NotFound />;
  const allowed = ws.roles.includes(role);
  const tab = ws.tabs.find(t => t.id === (tabId ?? ws.tabs[0].id)) ?? ws.tabs[0];
  return (
    <div className="flex min-h-full flex-col">
      <nav aria-label={`${ws.label} tabs`} className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-ink-700 bg-ink-950/95 px-3 py-2 backdrop-blur">
        {ws.tabs.map(t => (
          <Link key={t.id} href={`${ws.base}/${t.id}`}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${t.id === tab.id ? "bg-fire/20 text-fire-light border border-fire/40" : "text-zinc-400 hover:text-zinc-200 hover:bg-ink-800"}`}>
            {t.label}
            {!t.implemented && <span className="ml-1.5 align-middle text-[10px] text-zinc-600" title={`Parity row ${t.parityRow} pending`}>◌</span>}
          </Link>
        ))}
      </nav>
      <main className="flex-1 px-4 pb-16">
        {allowed ? <TabView ws={ws} tab={tab} /> : <RoleDenied wsLabel={ws.label} />}
      </main>
    </div>
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
  const { role, setRole } = useRole();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <header className="pt-12 pb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-fire">Station House Command Center</p>
        <h1 className="mt-3 text-4xl font-black uppercase text-zinc-100 sm:text-5xl">Where do you want <span className="text-fire">to go?</span></h1>
        <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
          <label htmlFor="role" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Demo role</label>
          <select id="role" value={role} onChange={e => setRole(e.target.value as typeof role)}
            className="rounded-md bg-ink-800 px-2 py-1.5 text-sm font-semibold text-zinc-200">
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
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
      <p className="mt-10 text-center text-xs text-zinc-600">
        Fire Sheet V2 foundation · demo data only · parity tracked in docs/PARITY_MATRIX.md
      </p>
    </div>
  );
}
