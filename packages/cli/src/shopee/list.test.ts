import { describe, it, expect } from "vitest";
import { parseOrderList } from "./list.ts";
import { listBody } from "./test-fixtures.ts";

describe("parseOrderList", () => {
  it("returns order ids from new_data.order_or_checkout_data", () =>
    expect(parseOrderList(listBody([1, 245037397296642]))).toMatchObject({ ids: ["1", "245037397296642"], skipped: 0 }));
  it("de-duplicates", () => expect(parseOrderList(listBody([1, 1, 2])).ids).toEqual(["1", "2"]));
  it("counts an entry with no order_list_detail as skipped", () => {
    const body = listBody([1]);
    body.new_data.order_or_checkout_data.push({ checkout: {} } as never);
    expect(parseOrderList(body)).toMatchObject({ ids: ["1"], skipped: 1 });
  });
  it("reads next_offset", () => {
    expect(parseOrderList(listBody([1], { nextOffset: 10 })).nextOffset).toBe(10);
    expect(parseOrderList(listBody([1])).nextOffset).toBeNull();
  });
  it("reads lines, total and status from the list entry", () => {
    const body = listBody([1], { cards: [{ shop_info: { shop_id: 7, shop_name: "S" }, product_info: { item_groups: [{ items: [{ name: "N", amount: 2, item_price: 100000 }] }] } }] });
    const e = parseOrderList(body).entries.get("1")!;
    expect(e.lines).toEqual([{ shopId: 7, shopName: "S", name: "N", modelName: "", quantity: 2, unitPrice: 1 }]);
    expect(e.total).toBe(1);
    expect(e.statusLabel).toBe("Completed");
  });
  it("accepts a string id", () =>
    expect(
      parseOrderList({ new_data: { order_or_checkout_data: [{ order_list_detail: { info_card: { order_id: "9" } } }] } }).ids
    ).toEqual(["9"]));
  it("falls back to the old data.order_id / index_list guess", () => {
    expect(parseOrderList({ data: { index_list: [7, 8] } }).ids).toEqual(["7", "8"]);
    expect(parseOrderList({ data: { details_list: [{ order_id: 3 }] } }).ids).toEqual(["3"]);
  });
  it("returns nothing for a bad shape", () => {
    expect(parseOrderList(null)).toMatchObject({ ids: [], skipped: 0, nextOffset: null });
    expect(parseOrderList({ data: 3 })).toMatchObject({ ids: [], skipped: 0, nextOffset: null });
  });
});
