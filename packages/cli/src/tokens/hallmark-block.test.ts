import { describe, it, expect } from "vitest";
import { applyBlock, renderBlock, sentinelCounts, START, END, type BlockRow, type BlockTotals } from "./hallmark-block.ts";

const totals: BlockTotals = { counts: { input: 10, output: 20, cache_read: 30, cache_write_5m: 4, cache_write_1h: 1, responses: 3 }, cost_usd: 1.5, unpriced: false };
const rows: BlockRow[] = [
  { task: "1", agentSeconds: 104, cost_usd: 0.4635, rounds: 0, findings: 0, fixRounds: 0, stamped: true },
  { task: "2", agentSeconds: 60, cost_usd: null, rounds: null, findings: null, fixRounds: null, stamped: false },
];
const NOW = "2026-11-02T10:00:00Z";

describe("renderBlock", () => {
  it("renders sentinels, lines with blank lines between, and a table with a separator row", () => {
    const b = renderBlock(rows, totals, { now: NOW });
    const lines = b.split("\n");
    expect(lines[0]).toBe(START);
    expect(lines[lines.length - 1]).toBe(END);
    expect(START).toBe("Hallmark totals begin (dg clickup ticket-total)");
    expect(END).toBe("Hallmark totals end");
    expect(b).toContain("Total: in 10, out 20, cache read 30, cache write 5 = $1.5000 list price");
    expect(b).toContain("Agent time: 2 min 44 s over 2 tasks (active time, gaps over 10 min dropped)");
    expect(b).toContain("Reviews: 0 rounds, 0 findings, 0 fix rounds");
    expect(b).toContain("| Task | Agent time | Cost | Findings | Fix rounds |\n| --- | --- | --- | --- | --- |\n| 1 | 1 min 44 s | $0.4635 | 0 | 0 |\n| 2 (not stamped) | 1 min | cost not priced | not recorded | not recorded |");
    expect(b).toContain("Updated 2026-11-02 17:00 UTC+7");
    // blank line between the non-table lines
    expect(b).toContain(`${START}\n\nTotal:`);
    expect(b).toMatch(/\n\nAgent time:.*\n\nReviews:.*\n\n\| Task/);
    expect(b).toMatch(/\n\nUpdated .*\n\nHallmark totals end$/);
  });
  it("stall case: 186 h window with 1 h active shows both lines", () => {
    const stall: BlockRow = { ...rows[0], agentSeconds: 3600, windowStart: "2026-11-02T03:00:00Z", windowEnd: "2026-11-09T21:00:00Z" };
    const b = renderBlock([stall], totals, { now: NOW });
    expect(b).toContain("Agent time: 1 h over 1 task (active time, gaps over 10 min dropped)");
    expect(b).toContain("\n\nWindow: 2026-11-02 10:00:00 to 2026-11-10 04:00:00 UTC+7\n\n");
  });
  it("Window spans earliest start to latest end; no window, no line", () => {
    const two = [{ ...rows[0], windowStart: "2026-11-02T05:00:00Z", windowEnd: "2026-11-02T06:00:00Z" }, { ...rows[1], windowStart: "2026-11-02T03:00:00Z", windowEnd: "2026-11-02T04:00:00Z" }];
    expect(renderBlock(two, totals, { now: NOW })).toContain("Window: 2026-11-02 10:00:00 to 2026-11-02 13:00:00 UTC+7");
    expect(renderBlock(rows, totals, { now: NOW })).not.toContain("Window:");
  });
  it("Window spans only the rows that have one in a mix", () => {
    const mix = [{ ...rows[0], windowStart: "2026-11-02T05:00:00Z", windowEnd: "2026-11-02T06:00:00Z" }, rows[1]];
    const b = renderBlock(mix, totals, { now: NOW });
    expect(b).toContain("Window: 2026-11-02 12:00:00 to 2026-11-02 13:00:00 UTC+7");
  });
  it("says task or tasks by count", () => {
    expect(renderBlock([rows[0]], totals, { now: NOW })).toContain("over 1 task (active");
    expect(renderBlock(rows, totals, { now: NOW })).toContain("over 2 tasks (active");
  });
  it("adds a Partial line for partial stamps, alone and with missing sessions", () => {
    const p = [{ ...rows[0], partial: true }, { ...rows[0], task: "3", partial: true }, rows[1]];
    const only = renderBlock(p, totals, { now: NOW });
    expect(only).toContain("Partial: 2 task stamp(s) were posted with partial data");
    expect(only).not.toContain("session(s) without transcript");
    const both = renderBlock(p, totals, { now: NOW, missing: 1 });
    expect(both).toContain("Partial: 1 session(s) without transcript\n\nPartial: 2 task stamp(s) were posted with partial data");
    expect(renderBlock(rows, totals, { now: NOW })).not.toContain("task stamp(s)");
  });
  it("matches sentinels as whole lines only", () => {
    const prose = `We say ${START} in prose, and ${END} too, and \\--- end Hallmark --- inline.`;
    expect(sentinelCounts(prose)).toEqual({ start: 0, end: 0, legacy: 0 });
    const block = renderBlock(rows, totals, { now: NOW });
    expect(applyBlock(prose, block)).toBe(`${prose}\n\n${block}`);
    expect(sentinelCounts(`a\r\n${START}\r\n${END}`)).toEqual({ start: 1, end: 1, legacy: 0 });
  });
  it("adds a Partial line", () => {
    expect(renderBlock(rows, totals, { now: NOW, missing: 2 })).toContain("Partial: 2 session(s) without transcript");
    expect(renderBlock(rows, totals, { now: NOW })).not.toContain("Partial:");
  });
  it("marks partly priced and not priced totals", () => {
    expect(renderBlock(rows, { ...totals, unpriced: true }, { now: NOW })).toContain("= $1.5000 (partly priced)");
    expect(renderBlock(rows, { ...totals, cost_usd: 0, unpriced: true }, { now: NOW })).toContain("cache write 5 cost not priced");
  });
});

describe("applyBlock", () => {
  const block = renderBlock(rows, totals, { now: NOW });
  it("appends after a blank line when absent", () => {
    expect(applyBlock("Intro text", block)).toBe(`Intro text\n\n${block}`);
    expect(applyBlock("Intro text\n", block)).toBe(`Intro text\n\n${block}`);
    expect(applyBlock("Intro text\n\n", block)).toBe(`Intro text\n\n${block}`);
    expect(applyBlock("", block)).toBe(block);
  });
  it("replaces in place and keeps outside text byte for byte", () => {
    const before = "Top  \n\n* item\r\n";
    const after = "\n\nTail\t \n";
    const old = applyBlock("x", renderBlock([], totals, { now: NOW })).replace(/^x\n\n/, "");
    const next = applyBlock(`${before}${old}${after}`, block);
    expect(next).toBe(`${before}${block}${after}`);
  });
  it("a second apply of the same data changes only the Updated line", () => {
    const first = applyBlock("Intro", renderBlock(rows, totals, { now: "2026-11-02T10:00:00Z" }));
    const second = applyBlock(first, renderBlock(rows, totals, { now: "2026-11-02T11:30:00Z" }));
    const strip = (s: string) => s.split("\n").filter((l) => !l.startsWith("Updated "));
    expect(strip(second)).toEqual(strip(first));
    expect(second).not.toBe(first);
    expect(second.match(/Updated /g)).toHaveLength(1);
  });
  it("replaces the legacy block, escaped as ClickUp returns it, with no stray backslash", () => {
    const legacy = "\\--- Hallmark (dg clickup ticket-total) ---\n\nTotal: x\n\n| Task |\n| ---|\n\n\\--- end Hallmark ---";
    const plain = legacy.replaceAll("\\---", "---");
    for (const old of [legacy, plain]) {
      const next = applyBlock(`Top\n\n${old}\n\nTail`, block);
      expect(next).toBe(`Top\n\n${block}\n\nTail`);
      expect(sentinelCounts(next)).toEqual({ start: 1, end: 1, legacy: 0 });
    }
  });
  it("re-applies the new block idempotently", () => {
    const once = applyBlock("Intro", block);
    expect(applyBlock(once, block)).toBe(once);
  });
  it("throws when the new and the legacy form are both present", () => {
    expect(() => applyBlock(`${block}\n\n--- Hallmark (dg clickup ticket-total) ---\nx\n--- end Hallmark ---`, block)).toThrow("Hallmark sentinel");
  });
  it("throws on a lone or reversed sentinel", () => {
    expect(() => applyBlock(`a\n${START}\nb`, block)).toThrow("sentinel");
    expect(() => applyBlock(`${END}\n${START}`, block)).toThrow("sentinel");
  });
});
