/**
 * Demo-mode regression: the RoleProvider must keep the classic localStorage
 * switcher behavior when VITE_DATA_MODE is unset (demo), with authState
 * "demo" so LoginGate passes straight through.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { RoleProvider, useRole } from "./RoleContext";
import { LoginGate } from "./LoginGate";

function Probe() {
  const { role, actor, authState, setRole, staffRole, fullName } = useRole();
  return (
    <div>
      <span data-testid="role">{role}</span>
      <span data-testid="actor">{actor}</span>
      <span data-testid="authState">{authState}</span>
      <span data-testid="staffRole">{String(staffRole)}</span>
      <span data-testid="fullName">{String(fullName)}</span>
      <button onClick={() => setRole("kitchen")}>switch</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe("RoleProvider (demo mode)", () => {
  it("defaults to owner_admin with authState demo and demo actor", () => {
    render(<RoleProvider><Probe /></RoleProvider>);
    expect(screen.getByTestId("role").textContent).toBe("owner_admin");
    expect(screen.getByTestId("actor").textContent).toBe("demo:owner_admin");
    expect(screen.getByTestId("authState").textContent).toBe("demo");
    expect(screen.getByTestId("staffRole").textContent).toBe("null");
    expect(screen.getByTestId("fullName").textContent).toBe("null");
  });

  it("setRole still switches roles and persists to localStorage", () => {
    render(<RoleProvider><Probe /></RoleProvider>);
    fireEvent.click(screen.getByText("switch"));
    expect(screen.getByTestId("role").textContent).toBe("kitchen");
    expect(screen.getByTestId("actor").textContent).toBe("demo:kitchen");
    expect(localStorage.getItem("shbbq.demo.role.v1")).toBe("kitchen");
  });

  it("restores the persisted role on mount", () => {
    localStorage.setItem("shbbq.demo.role.v1", "counter_foh");
    render(<RoleProvider><Probe /></RoleProvider>);
    expect(screen.getByTestId("role").textContent).toBe("counter_foh");
  });

  it("LoginGate passes children straight through in demo mode", () => {
    render(
      <RoleProvider>
        <LoginGate><p>workspace content</p></LoginGate>
      </RoleProvider>,
    );
    expect(screen.getByText("workspace content")).toBeInTheDocument();
    expect(screen.queryByText(/Staff sign in/i)).toBeNull();
  });
});
