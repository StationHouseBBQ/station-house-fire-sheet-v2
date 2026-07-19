/**
 * Guards the exact crash class the owner hit: clicking a catering order
 * (incl. the empty-lines Inquiry order "Luis Ramirez") must render the
 * command context and all three documents without throwing — even for
 * records missing later-added fields.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CateringDocument, documentPlainText } from "./CateringDocuments";
import { createDemoDal } from "../../dal/demo/adapter";
import type { CateringOrder } from "../../dal/types";

vi.mock("../../app/RoleContext", () => ({ useRole: () => ({ role: "owner_admin", actor: "test" }) }));

beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear(); cleanup();
});

describe("catering documents render for every order incl. empty + legacy", () => {
  it("renders quote/invoice/beo for all seeded orders (Luis Ramirez has no lines)", async () => {
    const dal = createDemoDal();
    const orders = await dal.cateringLifecycle.list();
    expect(orders.some(o => o.lines.length === 0)).toBe(true); // the inquiry order
    for (const o of orders) {
      for (const kind of ["quote", "invoice", "beo"] as const) {
        const { unmount } = render(<CateringDocument order={o} kind={kind} />);
        unmount();
        expect(documentPlainText(o, kind).length).toBeGreaterThan(20);
      }
    }
  });

  it("survives a legacy record missing staff/equipment/fulfillment fields", async () => {
    const dal = createDemoDal();
    const [o] = await dal.cateringLifecycle.list();
    // Simulate a pre-field record.
    const legacy = { ...o } as CateringOrder;
    delete (legacy as unknown as Record<string, unknown>).staff;
    delete (legacy as unknown as Record<string, unknown>).equipment;
    delete (legacy as unknown as Record<string, unknown>).fulfillment;
    delete (legacy as unknown as Record<string, unknown>).deliveryFeeCents;
    for (const kind of ["quote", "invoice", "beo"] as const) {
      const { unmount } = render(<CateringDocument order={legacy} kind={kind} />);
      unmount();
      expect(() => documentPlainText(legacy, kind)).not.toThrow();
    }
  });
});
