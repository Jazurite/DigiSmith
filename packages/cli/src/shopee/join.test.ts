import { describe, it, expect } from "vitest";
import { joinOrders } from "./join.ts";
import { item, bundleItem, card, block, listBody, detailBody, LIST_URL, DETAIL_URL } from "./test-fixtures.ts";

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

  it("builds an order from a detail that is in no list", () => {
    const r = joinOrders(block(2, DETAIL_URL(8), detailBody({ sn: "SN8" })));
    expect(r.orders.map((o) => [o.orderId, o.orderSn, o.captured])).toEqual([["8", "SN8", true]]);
    expect(r.missing).toBe(0);
  });

  it("uses the union of list ids and detail ids", () => {
    const r = joinOrders([block(1, LIST_URL(), listBody([5])), block(2, DETAIL_URL(8), detailBody())].join("\n"));
    expect(r.orders.map((o) => o.orderId)).toEqual(["5", "8"]);
    expect(r.missing).toBe(1);
  });

  it("counts list entries with no order_list_detail and carries block errors", () => {
    const body = listBody([1]);
    body.new_data.order_or_checkout_data.push({} as never);
    const r = joinOrders([block(1, LIST_URL(), body), block(9, DETAIL_URL(1), "bad")].join("\n"));
    expect(r.skippedEntries).toBe(1);
    expect(r.errors).toEqual(["block 9: body is not JSON"]);
  });

  it("collects list pages and the next offset not captured", () => {
    const r = joinOrders(
      [
        block(1, LIST_URL(0), listBody([1], { nextOffset: 5 })),
        block(2, LIST_URL(5), listBody([2], { nextOffset: 10 })),
      ].join("\n")
    );
    expect(r.listOffsets).toEqual([0, 5]);
    expect(r.nextOffsetsNotCaptured).toEqual([10]);
  });

  it("fills lines, bundle and total from the list when the detail is missing, date stays null", () => {
    const cards = [card([[bundleItem()], [item({ name: "Second group" })]])];
    const r = joinOrders(block(1, LIST_URL(), listBody([4], { cards })));
    expect(r.orders[0]).toMatchObject({ captured: false, purchasedAt: null, total: 1 });
    expect(r.orders[0].lines.map((l) => [l.name, l.unitPrice])).toEqual([["Part A + Part B", 277338], ["Second group", 10000]]);
  });

  it("sums skipped refund lines", () => {
    const cards = [card([[item({ name: "Refund x" }), item()]])];
    expect(joinOrders(block(1, LIST_URL(), listBody([4], { cards }))).refundSkipped).toBe(1);
  });
});
