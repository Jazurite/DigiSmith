import { describe, it, expect } from "vitest";
import { parseCards } from "./lines.ts";
import { parseOrderDetail } from "./detail.ts";
import { item, bundleItem, card, detailBody } from "./test-fixtures.ts";

describe("parseCards", () => {
  it("makes one line per item across several groups", () => {
    const r = parseCards([card([[item({ name: "A" })], [item({ name: "B" }), item({ name: "C" })]])]);
    expect(r.lines.map((l) => l.name)).toEqual(["A", "B", "C"]);
  });

  it("prints a bundle as one line at the bundle price, parts joined", () => {
    const r = parseCards([card([[bundleItem()]])]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ name: "Part A + Part B", unitPrice: 277338, quantity: 1 });
  });

  it("falls back to the item name when a bundle has no part names", () => {
    const b = item({ name: "Solo", ext_info: { bundle_order: { bundle_deal_items: [] } } });
    expect(parseCards([card([[b]])]).lines[0].name).toBe("Solo");
  });

  it("skips and counts refund lines: negative price, refund text, hoan tien, return", () => {
    const r = parseCards([
      card([[
        item({ name: "Keep" }),
        item({ name: "Adjust", item_price: -500000 }),
        item({ name: "Refund for order" }),
        item({ name: "Hoan tien van chuyen" }),
        item({ name: "x", model_name: "Return fee" }),
      ]]),
    ]);
    expect(r.lines.map((l) => l.name)).toEqual(["Keep"]);
    expect(r.refundSkipped).toBe(4);
  });

  it("does not treat is_refundable_sample or is_free_return as refunds", () => {
    const flagged = item({ ext_info: { is_refundable_sample: true, is_free_return: true } });
    const r = parseCards([card([[flagged]])]);
    expect(r.lines).toHaveLength(1);
    expect(r.refundSkipped).toBe(0);
  });

  it("skips a line named in an order-level refund list", () => {
    const r = parseCards([card([[item({ item_id: 5 }), item({ item_id: 6 })]])], new Set([6]));
    expect(r.lines).toHaveLength(1);
    expect(r.refundSkipped).toBe(1);
  });
});

describe("parseOrderDetail refund list", () => {
  it("reads an order-level refund array under data", () => {
    const body = detailBody() as { data: Record<string, unknown> };
    body.data.refund_list = [{ item_id: 3 }]; // the "Gadget" item
    const order = parseOrderDetail("1", body)!;
    expect(order.lines.map((l) => l.name)).toEqual(["Widget, large"]);
    expect(order.refundSkipped).toBe(1);
  });
});
