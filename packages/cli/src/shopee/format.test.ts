import { describe, it, expect } from "vitest";
import { formatTime, formatTable, formatJson, formatCsv, pagesNote, MISSING, type Summary } from "./format.ts";
import { parseOrderDetail, type Order } from "./detail.ts";
import { detailBody } from "./test-fixtures.ts";

const good = parseOrderDetail("1", detailBody())!;
const sum: Summary = { missing: 1, skipped: 0, skippedEntries: 0, refundSkipped: 2, skippedCancelled: 1, skippedByUser: 3, skippedUndated: 5, listOffsets: [0, 5], nextOffsetsNotCaptured: [10] };
const gone: Order = { orderId: "2", captured: false, orderSn: null, purchasedAt: null, lines: [], total: null, currency: null, statusLabel: null, refundSkipped: 0, cancelled: false };

describe("formatTime", () => {
  it("prints UTC+7 first, UTC in brackets", () => {
    expect(formatTime(new Date(1791338198 * 1000))).toBe("2026-10-07 08:56:38 UTC+7 [01:56:38Z]");
  });
  it("adds the UTC date when it differs", () => {
    expect(formatTime(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-07 03:00:00 UTC+7 [2026-10-06 20:00:00Z]");
  });
});

describe("formatTable", () => {
  const out = formatTable([good, gone], sum);
  it("shows one row per line item and the missing marker", () => {
    expect(out).toContain("Widget, large");
    expect(out).toContain("Gadget");
    expect(out).toContain(MISSING);
  });
  it("prints the counts footer and the money note", () => {
    expect(out).toContain("orders: 2, rows: 3, missing detail: 1, skipped blocks: 0, skipped list entries: 0, skipped refund lines: 2, cancelled orders skipped: 1, skipped by --skip: 3, skipped undated: 5");
    expect(out).toContain("x100000");
  });
});

describe("pagesNote", () => {
  it("names captured pages and the next page not captured", () => {
    expect(pagesNote(sum)).toBe("captured list pages: offsets 0 and 5; next offset 10 not captured");
    expect(formatTable([good], sum)).toContain("captured list pages: offsets 0 and 5; next offset 10 not captured");
  });
  it("handles one page, three pages, none", () => {
    expect(pagesNote({ ...sum, listOffsets: [0], nextOffsetsNotCaptured: [] })).toBe("captured list pages: offsets 0");
    expect(pagesNote({ ...sum, listOffsets: [0, 5, 10], nextOffsetsNotCaptured: [] })).toBe("captured list pages: offsets 0, 5 and 10");
    expect(pagesNote({ ...sum, listOffsets: [] })).toBe("captured list pages: none");
  });
});

describe("formatJson", () => {
  it("has ISO times and null for a missing date", () => {
    const j = JSON.parse(formatJson([good, gone], sum));
    expect(j.orders[0].purchasedAt).toEqual({ utc7: "2026-10-07T08:56:38+07:00", utc: "2026-10-07T01:56:38.000Z" });
    expect(j.orders[1].purchasedAt).toBeNull();
    expect(j.orders[1].purchaseDateMissing).toBe(true);
    expect(j.summary.missingDetail).toBe(1);
    expect(j.summary.skippedCancelledOrders).toBe(1);
    expect(j.summary.skippedByUser).toBe(3);
    expect(j.summary.skippedUndated).toBe(5);
    expect(j.summary.nextOffsetsNotCaptured).toEqual([10]);
  });
});

describe("formatCsv", () => {
  const lines = formatCsv([good, gone]).split("\n");
  it("has a header and one row per line item", () => {
    expect(lines[0]).toContain("order id");
    expect(lines).toHaveLength(4);
  });
  it("quotes commas and quotes", () => {
    expect(lines[1]).toContain('"Widget, large"');
    expect(lines[1]).toContain('"Blue ""XL"""');
  });
});
