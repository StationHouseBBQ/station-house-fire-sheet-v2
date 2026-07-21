import { describe, expect, it } from "vitest";
import { formatQty } from "./PrepBoard";

describe("formatQty (fraction display parity with Manus formatQty)", () => {
  it.each([
    [0.5, "1/2"], [1.5, "1 1/2"], [0.25, "1/4"], [2.75, "2 3/4"],
    [3, "3"], [0, "0"], [0.125, "1/8"],
  ])("%f → %s", (n, s) => expect(formatQty(n)).toBe(s));
});
