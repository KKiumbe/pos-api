import { describe, expect, it } from "vitest";

import { generateOrderNumber } from "../src/utils/order-number.js";

describe("generateOrderNumber", () => {
  it("pads dine-in sequences", () => {
    expect(generateOrderNumber(7, "DIN")).toBe("DIN-0007");
  });

  it("pads takeaway sequences", () => {
    expect(generateOrderNumber(42, "TKW")).toBe("TKW-0042");
  });
});
