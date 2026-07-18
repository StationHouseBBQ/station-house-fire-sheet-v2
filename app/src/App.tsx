import { Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { RoleProvider } from "./app/RoleContext";
import { ConnectionStatus } from "./app/ConnectionStatus";
import { UndoProvider } from "./modules/shared/undo";
import { Hub, NotFound, WorkspacePage } from "./app/Shell";
import { WORKSPACES } from "./config/nav";

import { FireDropLanding } from "./modules/public/FireDropLanding";
import { OrderConfirmation } from "./modules/public/OrderConfirmation";
import { CubanThursdayLanding } from "./modules/public/CubanThursdayLanding";
import { CateringLanding } from "./modules/public/CateringLanding";
import { CateringRequest } from "./modules/public/CateringRequest";
import { OrderTrackerView } from "./modules/public/OrderTracker";
import { EventLanding } from "./modules/public/EventLanding";
import { PortalApp } from "./modules/portal/PortalApp";
import { QuoteAccept } from "./modules/public/QuoteAccept";
import { ROUTE_ALIASES } from "./config/aliases";
import { useEffect } from "react";
import { useLocation } from "wouter";

function Redirect({ to }: { to: string }) {
  const [, nav] = useLocation();
  useEffect(() => { nav(to, { replace: true }); }, [to, nav]);
  return null;
}

const qc = new QueryClient();

const pub = (C: () => JSX.Element) => C; // public components self-wrap in PublicLayout

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
        </Router>
        </UndoProvider>
      </RoleProvider>
    </QueryClientProvider>
  );
}
