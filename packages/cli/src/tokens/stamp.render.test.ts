import { describe, expect, it } from "vitest";
import { ANTHROPIC_PRICES_VERSION } from "./prices/anthropic.ts";
import type { ReviewData } from "./review-data.ts";
import { formatDuration, renderStamp, utc7 } from "./stamp.ts";
import type { TaskUsage } from "./stamp.ts";

const usage = (): TaskUsage => ({
  models: {
    "claude-sonnet-5-5": { input: 24, output: 5348, cache_read: 2766374, cache_write_5m: 32937, cache_write_1h: 8816, responses: 10, cost_usd: 0.4478 },
    "claude-haiku-5-5": { input: 18, output: 5594, cache_read: 474505, cache_write_5m: 65254, cache_write_1h: 0, responses: 9, cost_usd: 0.0157 },
  },
  total: { counts: { input: 42, output: 10942, cache_read: 3240879, cache_write_5m: 98191, cache_write_1h: 8816, responses: 19 }, cost_usd: 0.4635, priced: true },
  windows: [{ start: "2026-10-27T09:50:59.499Z", end: "2026-10-27T09:52:43.207Z" }],
  agentSeconds: 103.708,
});
const noReview: ReviewData = { rounds: null, findings: null, fixed: null, parked: null, rejected: null, open: null, fixRounds: null, source: "none" };
const src = `Source: registry window + transcripts, per-response list prices (list prices version ${ANTHROPIC_PRICES_VERSION}); agent time = sum of closed windows`;

describe("renderStamp", () => {
  it("renders the DGS-679 task 1 comment", () => {
    expect(renderStamp({ key: "DGS-679", task: "1", usage: usage(), review: noReview })).toBe(
      [
        "Hallmark task 1 of DGS-679",
        "Window: 2026-10-27 16:50:59 to 16:52:43 UTC+7 (agent time 1 min 44 s)",
        "claude-sonnet-5-5: in 24, out 5348, cache read 2766374, cache write 41753 (10 responses) = $0.4478",
        "claude-haiku-5-5: in 18, out 5594, cache read 474505, cache write 65254 (9 responses) = $0.0157",
        "Task total: in 42, out 10942, cache read 3240879, cache write 107007 = $0.4635 (list price)",
        "Reviews: not recorded | Findings: not recorded | Fix rounds: not recorded",
        src,
      ].join("\n"),
    );
  });
  it("final heading", () => {
    expect(renderStamp({ key: "DGS-679", task: "final", usage: usage(), review: noReview }).split("\n")[0]).toBe("Hallmark final review of DGS-679");
  });
  it("shows the end date when the window crosses midnight UTC+7", () => {
    const u = usage();
    u.windows = [{ start: "2026-10-27T16:50:00Z", end: "2026-10-27T17:10:00Z" }];
    u.agentSeconds = 1200;
    expect(renderStamp({ key: "K-1", task: "2", usage: u, review: noReview })).toContain("Window: 2026-10-27 23:50:00 to 2026-10-28 00:10:00 UTC+7 (agent time 20 min)");
  });
  it("uses the earliest start over unsorted windows and plural responses", () => {
    const u = usage();
    u.windows = [{ start: "2026-10-27T10:00:00Z", end: "2026-10-27T10:05:00Z" }, { start: "2026-10-27T09:00:00Z", end: "2026-10-27T09:10:00Z" }];
    const t = renderStamp({ key: "K-1", task: "1", usage: u, review: noReview });
    expect(t).toContain("Window: 2026-10-27 16:00:00 to 17:05:00 UTC+7");
    expect(t).toContain("(10 responses) = $0.4478");
  });
  it("marks unpriced model and partly priced total", () => {
    const u = usage();
    u.models["mystery"] = { input: 1, output: 2, cache_read: 3, cache_write_5m: 4, cache_write_1h: 0, responses: 1, cost_usd: null };
    u.total = { ...u.total, cost_usd: null, priced: false };
    const t = renderStamp({ key: "K-1", task: "1", usage: u, review: noReview }).split("\n");
    expect(t.find((l) => l.startsWith("mystery:"))).toBe("mystery: in 1, out 2, cache read 3, cache write 4 (1 response) cost not priced");
    expect(t.find((l) => l.startsWith("Task total:"))).toContain("= $0.4635 (partly priced)");
  });
  it("adds the partial line after the total line", () => {
    const t = renderStamp({ key: "K-1", task: "1", usage: usage(), review: noReview, missingSessions: ["a", "b"] }).split("\n");
    const i = t.findIndex((l) => l.startsWith("Task total:"));
    expect(t[i + 1]).toBe("Partial: 2 session(s) without transcript");
    expect(renderStamp({ key: "K-1", task: "1", usage: usage(), review: noReview, missingSessions: [] })).not.toContain("Partial");
  });
  it("renders review fields", () => {
    const r: ReviewData = { rounds: 1, findings: 2, fixed: 1, parked: 1, rejected: 0, open: 0, fixRounds: 1, source: "ledger" };
    expect(renderStamp({ key: "K-1", task: "1", usage: usage(), review: r })).toContain("Reviews: 1 round | Findings: 2 (1 fixed, 1 parked, 0 open) | Fix rounds: 1");
    const r2: ReviewData = { ...r, rounds: 2, findings: 4, fixed: 1, parked: 1, rejected: 1, open: 1, fixRounds: 2 };
    expect(renderStamp({ key: "K-1", task: "1", usage: usage(), review: r2 })).toContain("Reviews: 2 rounds | Findings: 4 (1 fixed, 1 parked, 1 open, 1 rejected) | Fix rounds: 2");
  });
});

describe("helpers", () => {
  it("formatDuration", () => {
    expect(formatDuration(103.7)).toBe("1 min 44 s");
    expect(formatDuration(7500)).toBe("2 h 5 min");
    expect(formatDuration(12)).toBe("12 s");
  });
  it("utc7", () => {
    expect(utc7("2026-10-27T09:50:59.499Z")).toBe("2026-10-27 16:50:59");
    expect(utc7("2026-12-31T20:00:00Z")).toBe("2027-01-01 03:00:00");
  });
});
