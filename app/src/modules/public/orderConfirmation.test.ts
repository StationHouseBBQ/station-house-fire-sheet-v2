import { describe, expect, it, vi, afterEach } from "vitest";
import { refFromHash } from "./OrderConfirmation";

/** The confirmation ref must be found whether it lands after or before the hash. */
describe("refFromHash — reads ref from hash-query or search", () => {
  const orig = { hash: window.location.hash, search: window.location.search };
  afterEach(() => { vi.unstubAllGlobals(); Object.assign(window.location, orig); });

  it("reads ?ref= after the hash", () => {
    expect(refFromHash("#/fire-drop/confirmation?ref=FD-0717-1042")).toBe("FD-0717-1042");
  });
  it("falls back to the real query string (?ref=…#/…)", () => {
    vi.stubGlobal("location", { hash: "#/fire-drop/confirmation", search: "?ref=FD-0717-M723" } as Location);
    expect(refFromHash("#/fire-drop/confirmation")).toBe("FD-0717-M723");
  });
  it("returns null when no ref anywhere", () => {
    vi.stubGlobal("location", { hash: "#/fire-drop/confirmation", search: "" } as Location);
    expect(refFromHash("#/fire-drop/confirmation")).toBeNull();
  });
});
