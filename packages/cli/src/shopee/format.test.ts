import { describe, it, expect } from "vitest";
import { formatTime, formatTable, formatJson, formatCsv, MISSING } from "./format.ts";
import { parseOrderDetail, type Order } from "./detail.ts";
import { detailBody } from "./test-fixtures.ts";

const good = parseOrderDetail("1", detailBody())!;
const gone: Order = { orderId: "2", captured: false, orderSn: null, purchasedAt: null, lines: [], total: null, currency: null, statusLabel: null };

describe("formatTime", () => {
  it("prints UTC+7 first, UTC in brackets", () => {
    expect(formatTime(new Date(1791338198 * 1000))).toBe("2026-10-07 08:56:38 UTC+7 [01:56:38Z]");
  });
  it("adds the UTC date when it differs", () => {
    expect(formatTime(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-07 03:00:00 UTC+7 [2026-10-06 20:00:00Z]");
  });
});

describe("formatTable", () => {
  const out = formatTable([good, gone], 1, 0);
  it("shows one row per line item and the missing marker", () => {
    expect(out).toContain("Widget, large");
    expect(out).toContain("Gadget");
    expect(out).toContain(MISSING);
  });
  it("prints the counts footer and the money note", () => {
    expect(out).toContain("orders: 2, rows: 3, missing detail: 1, skipped blocks: 0");
    expect(out).toContain("x100000");
  });
});

describe("formatJson", () => {
  it("has ISO times and null for a missing date", () => {
    const j = JSON.parse(formatJson([good, gone], 1, 0));
    expect(j.orders[0].purchasedAt).toEqual({ utc7: "2026-10-07T08:56:38+07:00", utc: "2026-10-07T01:56:38.000Z" });
    expect(j.orders[1].purchasedAt).toBeNull();
    expect(j.orders[1].purchaseDateMissing).toBe(true);
    expect(j.summary.missingDetail).toBe(1);
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
