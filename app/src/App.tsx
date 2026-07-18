import React from "react";
import { Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { RoleProvider } from "./app/RoleContext";
import { ConnectionStatus } from "./app/ConnectionStatus";
import { UndoProvider } from "./modules/shared/undo";
import { DemoClockChip } from "./app/DemoControls";
import { Hub, NotFound, WorkspacePage } from "./app/Shell";
import { WORKSPACES } from "./config/nav";

import { ROUTE_ALIASES } from "./config/aliases";
import { lazy, Suspense } from "react";
const FireDropLanding = lazy(() => import("./modules/public/FireDropLanding").then(m => ({ default: m.FireDropLanding })));
const OrderConfirmation = lazy(() => import("./modules/public/OrderConfirmation").then(m => ({ default: m.OrderConfirmation })));
const CubanThursdayLanding = lazy(() => import("./modules/public/CubanThursdayLanding").then(m => ({ default: m.CubanThursdayLanding })));
const CateringLanding = lazy(() => import("./modules/public/CateringLanding").then(m => ({ default: m.CateringLanding })));
const ExpressCatering = lazy(() => import("./modules/public/ExpressCatering").then(m => ({ default: m.ExpressCatering })));
const CateringRequest = lazy(() => import("./modules/public/CateringRequest").then(m => ({ default: m.CateringRequest })));
const OrderTrackerView = lazy(() => import("./modules/public/OrderTracker").then(m => ({ default: m.OrderTrackerView })));
const EventLanding = lazy(() => import("./modules/public/EventLanding").then(m => ({ default: m.EventLanding })));
const PortalApp = lazy(() => import("./modules/portal/PortalApp").then(m => ({ default: m.PortalApp })));
const QuoteAccept = lazy(() => import("./modules/public/QuoteAccept").then(m => ({ default: m.QuoteAccept })));

import { useEffect } from "react";
import { useLocation } from "wouter";

function Redirect({ to }: { to: string }) {
  const [, nav] = useLocation();
  useEffect(() => { nav(to, { replace: true }); }, [to, nav]);
  return null;
}

const qc = new QueryClient();

const pub = (C: React.ComponentType) => () => (
  <Suspense fallback={<p className="py-24 text-center text-sm text-zinc-600">Loading…</p>}>
    <C />
  </Suspense>
); // public components self-wrap in PublicLayout

/** Hash routing keeps deep links working on GitHub Pages previews. */
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <RoleProvider>
        <UndoProvider>
        <Router hook={useHashLocation}>
          {/* Supabase-mode health banner; renders nothing in demo mode. */}
          <ConnectionStatus />
          <Switch>
            <Route path="/" component={Hub} />
            {/* Public routes — never require employee login */}
            <Route path="/fire-drop" component={pub(FireDropLanding)} />
            <Route path="/fire-drop/confirmation" component={pub(OrderConfirmation)} />
            <Route path="/cuban-thursday" component={pub(CubanThursdayLanding)} />
            <Route path="/cuban-thursday/confirmation" component={pub(OrderConfirmation)} />
            <Route path="/catering" component={pub(CateringLanding)} />
            <Route path="/express" component={pub(ExpressCatering)} />
            <Route path="/express/confirmation" component={pub(OrderConfirmation)} />
            <Route path="/catering-request" component={pub(CateringRequest)} />
            <Route path="/track" component={pub(OrderTrackerView)} />
            <Route path="/fathers-day" component={pub(() => <EventLanding slug="fathers-day" fallbackTitle="Father's Day" />)} />
            <Route path="/july4" component={pub(() => <EventLanding slug="july4" fallbackTitle="4th of July" />)} />
            <Route path="/football-sunday" component={pub(() => <EventLanding slug="football-sunday" fallbackTitle="Football Sunday" />)} />
            <Route path="/portal" component={pub(PortalApp)} />
            <Route path="/quote/:token" component={pub(QuoteAccept)} />
            <Route path="/sales-quote/:token" component={pub(QuoteAccept)} />
            {/* Manus route parity: legacy paths resolve to their V2 homes */}
            {Object.entries(ROUTE_ALIASES).filter(([from, to]) => from !== to).map(([from, to]) => (
              <Route key={from} path={from}>{() => <Redirect to={to} />}</Route>
            ))}
            {/* Workspaces */}
            {WORKSPACES.map(ws => (
              <Route key={ws.id} path={`${ws.base}/:tabId`}>
                {params => <WorkspacePage wsId={ws.id} tabId={params.tabId} />}
              </Route>
            ))}
            {WORKSPACES.map(ws => (
              <Route key={ws.id + "-root"} path={ws.base}>
                {() => <WorkspacePage wsId={ws.id} />}
              </Route>
            ))}
            <Route component={NotFound} />
          </Switch>
          <DemoClockChip />
        </Router>
        </UndoProvider>
      </RoleProvider>
    </QueryClientProvider>
  );
}
