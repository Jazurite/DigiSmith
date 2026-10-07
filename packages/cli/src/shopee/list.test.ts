import { describe, it, expect } from "vitest";
import { parseOrderList } from "./list.ts";
import { listBody } from "./test-fixtures.ts";

describe("parseOrderList", () => {
  it("returns order ids from new_data.order_or_checkout_data", () =>
    expect(parseOrderList(listBody([1, 245037397296642]))).toEqual({ ids: ["1", "245037397296642"], skipped: 0 }));
  it("de-duplicates", () => expect(parseOrderList(listBody([1, 1, 2])).ids).toEqual(["1", "2"]));
  it("counts an entry with no order_list_detail as skipped", () => {
    const body = listBody([1]);
    body.new_data.order_or_checkout_data.push({ checkout: {} } as never);
    expect(parseOrderList(body)).toEqual({ ids: ["1"], skipped: 1 });
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
    expect(parseOrderList(null)).toEqual({ ids: [], skipped: 0 });
    expect(parseOrderList({ data: 3 })).toEqual({ ids: [], skipped: 0 });
  });
});
