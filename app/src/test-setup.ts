import "@testing-library/jest-dom";
// idb-keyval needs indexedDB; jsdom lacks it. Tests that touch the DAL use
// an in-memory shim.
import { vi } from "vitest";
const mem = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => mem.get(k),
  set: async (k: string, v: unknown) => { mem.set(k, v); },
  __mem: mem,
}));
