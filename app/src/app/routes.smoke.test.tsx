/**
 * Route smoke test: every workspace tab and public route must render
 * without throwing. First layer of the parity QA evidence.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import App from "../App";
import { WORKSPACES } from "../config/nav";

beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = "";
  cleanup();
});

const PUBLIC_ROUTES = [
  "/", "/fire-drop", "/cuban-thursday", "/catering", "/catering-request",
  "/track", "/portal", "/fathers-day", "/july4", "/football-sunday",
];

const TAB_ROUTES = WORKSPACES.flatMap(ws => ws.tabs.map(t => `${ws.base}/${t.id}`));

describe("route smoke: all views render without crashing", () => {
  it.each([...PUBLIC_ROUTES, ...TAB_ROUTES])("%s renders", async (route) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      window.location.hash = `#${route}`;
      const { container, unmount } = render(<App />);
      await waitFor(() => {
        expect(container.textContent && container.textContent.length).toBeGreaterThan(10);
      }, { timeout: 4000 });
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
