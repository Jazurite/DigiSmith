import { describe, it, expect } from "vitest";
import { parseOrderDetail } from "./detail.ts";
import { detailBody, FAKE_PRIVATE } from "./test-fixtures.ts";

describe("parseOrderDetail", () => {
  const order = parseOrderDetail("42", detailBody())!;

  it("takes the purchase date from create_time", () => {
    expect(order.purchasedAt?.toISOString()).toBe("2026-10-07T01:56:38.000Z");
  });

  it("reads lines, shop, total, currency and status", () => {
    expect(order.orderSn).toBe("SN0001");
    expect(order.lines).toEqual([
      { shopId: 111, shopName: "Fake Shop", name: "Widget, large", modelName: 'Blue "XL"', quantity: 2, unitPrice: 200000 },
      { shopId: 111, shopName: "Fake Shop", name: "Gadget", modelName: "", quantity: 1, unitPrice: 31417 },
    ]);
    expect(order.total).toBe(431417);
    expect(order.currency).toBe("VND");
    expect(order.statusLabel).toBe("Completed");
  });

  it("never carries shipping or payment data", () => {
    const dump = JSON.stringify(order);
    for (const s of FAKE_PRIVATE) expect(dump).not.toContain(s);
  });

  it("returns null for a bad shape", () => {
    expect(parseOrderDetail("1", { data: {} })).toBeNull();
    expect(parseOrderDetail("1", null)).toBeNull();
  });
});
