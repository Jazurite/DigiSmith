import { describe, it, expect } from "vitest";
import { joinOrders } from "./join.ts";
import { block, listBody, detailBody, LIST_URL, DETAIL_URL } from "./test-fixtures.ts";

describe("joinOrders", () => {
  it("joins details to list ids by order_id", () => {
    const text = [
      block(1, LIST_URL(0), listBody([5, 6])),
      block(2, DETAIL_URL(6), detailBody({ sn: "SN6" })),
      block(3, DETAIL_URL(5), detailBody({ sn: "SN5" })),
    ].join("\n");
    const r = joinOrders(text);
    expect(r.orders.map((o) => [o.orderId, o.orderSn])).toEqual([["5", "SN5"], ["6", "SN6"]]);
    expect(r.missing).toBe(0);
  });

  it("marks an order with no detail and counts it", () => {
    const r = joinOrders([block(1, LIST_URL(), listBody([5, 6])), block(2, DETAIL_URL(5), detailBody())].join("\n"));
    expect(r.missing).toBe(1);
    expect(r.orders[1]).toMatchObject({ orderId: "6", captured: false, purchasedAt: null });
  });

  it("merges list pages and lets the later detail win", () => {
    const r = joinOrders(
      [
        block(1, LIST_URL(0), listBody([5])),
        block(2, LIST_URL(5), listBody([5, 6])),
        block(3, DETAIL_URL(5), detailBody({ sn: "OLD" })),
        block(4, DETAIL_URL(5), detailBody({ sn: "NEW" })),
      ].join("\n")
    );
    expect(r.orders.map((o) => o.orderId)).toEqual(["5", "6"]);
    expect(r.orders[0].orderSn).toBe("NEW");
  });

  it("reports hasList false and carries block errors", () => {
    const r = joinOrders(block(9, DETAIL_URL(1), "bad"));
    expect(r.hasList).toBe(false);
    expect(r.errors).toEqual(["block 9: body is not JSON"]);
  });
});
