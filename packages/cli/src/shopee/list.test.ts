import { describe, it, expect } from "vitest";
import { parseOrderList } from "./list.ts";
import { listBody } from "./test-fixtures.ts";

describe("parseOrderList", () => {
  it("returns order ids", () => expect(parseOrderList(listBody([1, 2]))).toEqual(["1", "2"]));
  it("de-duplicates", () => expect(parseOrderList(listBody([1, 1, 2]))).toEqual(["1", "2"]));
  it("reads index_list numbers", () =>
    expect(parseOrderList({ data: { index_list: [7, 8] } })).toEqual(["7", "8"]));
  it("returns [] for a bad shape", () => {
    expect(parseOrderList(null)).toEqual([]);
    expect(parseOrderList({ data: 3 })).toEqual([]);
  });
});
