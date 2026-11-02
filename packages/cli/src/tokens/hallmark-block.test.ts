import { describe, it, expect } from "vitest";
import { applyBlock, renderBlock, START, END, type BlockRow, type BlockTotals } from "./hallmark-block.ts";

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
    expect(START).toBe("--- Hallmark (dg clickup ticket-total) ---");
    expect(END).toBe("--- end Hallmark ---");
    expect(b).toContain("Total: in 10, out 20, cache read 30, cache write 5 = $1.5000 list price");
    expect(b).toContain("Agent time: 2 min 44 s over 2 tasks (sum of task windows)");
    expect(b).toContain("Reviews: 0 rounds, 0 findings, 0 fix rounds");
    expect(b).toContain("| Task | Agent time | Cost | Findings | Fix rounds |\n| --- | --- | --- | --- | --- |\n| 1 | 1 min 44 s | $0.4635 | 0 | 0 |\n| 2 (not stamped) | 1 min | cost not priced | not recorded | not recorded |");
    expect(b).toContain("Updated 2026-11-02 17:00 UTC+7");
    // blank line between the non-table lines
    expect(b).toContain(`${START}\n\nTotal:`);
    expect(b).toMatch(/\n\nAgent time:.*\n\nReviews:.*\n\n\| Task/);
    expect(b).toMatch(/\n\nUpdated .*\n\n--- end Hallmark ---$/);
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
  it("throws on a lone or reversed sentinel", () => {
    expect(() => applyBlock(`a\n${START}\nb`, block)).toThrow("sentinel");
    expect(() => applyBlock(`${END}\n${START}`, block)).toThrow("sentinel");
  });
});
