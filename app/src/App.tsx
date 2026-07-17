import { Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { RoleProvider } from "./app/RoleContext";
import { Hub, NotFound, WorkspacePage } from "./app/Shell";
import { WORKSPACES } from "./config/nav";

const qc = new QueryClient();

/**
 * Hash routing keeps deep links working on GitHub Pages previews without
 * server rewrites; the Supabase-hosted production build switches to browser
 * history routing behind the same route table.
 */
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <RoleProvider>
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={Hub} />
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
      </RoleProvider>
    </QueryClientProvider>
  );
}
