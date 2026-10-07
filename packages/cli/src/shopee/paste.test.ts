import { describe, it, expect } from "vitest";
import { parsePaste } from "./paste.ts";
import { block, listBody, detailBody, LIST_URL, DETAIL_URL, DUMMY_SECRETS } from "./test-fixtures.ts";

describe("parsePaste", () => {
  it("parses list and detail blocks", () => {
    const text = [block(10, LIST_URL(0), listBody([5])), block(11, DETAIL_URL(5), detailBody())].join("\n");
    const { blocks, errors } = parsePaste(text);
    expect(errors).toEqual([]);
    expect(blocks.map((b) => [b.n, b.kind, b.orderId])).toEqual([
      [10, "list", undefined],
      [11, "detail", "5"],
    ]);
    expect(blocks[0].offset).toBe("0");
  });

  it("handles CRLF", () => {
    const text = block(1, DETAIL_URL(7), detailBody()).replace(/\n/g, "\r\n");
    expect(parsePaste(text).blocks).toHaveLength(1);
  });

  it("never returns Request text, including a JSON request body", () => {
    const text = [block(1, LIST_URL(), listBody([1])), block(2, DETAIL_URL(1), "not json")].join("\n");
    const result = parsePaste(text);
    const dump = JSON.stringify(result);
    for (const secret of DUMMY_SECRETS) expect(dump).not.toContain(secret);
  });

  it("reports a malformed block by number only and keeps the others", () => {
    const text = [block(1, DETAIL_URL(1), "oops"), block(2, DETAIL_URL(2), detailBody())].join("\n");
    const { blocks, errors } = parsePaste(text);
    expect(errors).toEqual(["block 1: body is not JSON"]);
    expect(blocks.map((b) => b.n)).toEqual([2]);
  });

  it("reports a block with no Response section", () => {
    const text = "[3] URL = https://shopee.vn/api/v4/order/get_order_detail?order_id=9\nRequest\nGET / HTTP/2\n";
    expect(parsePaste(text).errors).toEqual(["block 3: no Response section"]);
  });

  it("ignores calls to other endpoints", () => {
    const text = block(4, "https://shopee.vn/api/v4/other?x=1", "not json");
    expect(parsePaste(text)).toEqual({ blocks: [], errors: [] });
  });
});
