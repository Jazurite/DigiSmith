import { describe, expect, it } from "vitest";
import { countSlots, DEFAULT_LIMITS, kindOf, limitLine, refusal } from "./limit.ts";
import type { RunRow } from "./read.ts";
import type { RunRecord } from "./record.ts";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const min = (m: number): string => new Date(NOW - m * 60_000).toISOString();

function row(over: { run?: string; role?: RunRecord["role"]; role_from?: RunRecord["role_from"]; ticket?: string | null; last?: string; lastTs?: number; ended?: boolean }): RunRow {
  const record = { run: over.run ?? "r1", role: over.role ?? "builder", role_from: over.role_from ?? "start", ticket: over.ticket === undefined ? "DGS-1" : over.ticket, created_at: min(300) } as RunRecord;
  return { record, summary: { events: 5, first_ts: min(300), last_ts: min(over.lastTs ?? 1), last_type: over.last ?? "tool", ended: over.ended ?? false } };
}
const count = (rows: RunRow[], lock: { ticket: string } | null = null) => countSlots(rows, lock, NOW, DEFAULT_LIMITS, 120);

describe("kindOf", () => {
  it("maps roles to kinds", () => {
    expect(kindOf(row({ role: "builder" }).record)).toBe("builder");
    expect(kindOf(row({ role: "reviewer" }).record)).toBe("reviewer");
    expect(kindOf(row({ role: "scout" }).record)).toBe("role");
    expect(kindOf(row({ role: "other", role_from: "herdr" }).record)).toBe("role");
    expect(kindOf(row({ role: "other", role_from: "start" }).record)).toBe("role");
  });
  it("never counts maestro, conductor or an unlabelled other", () => {
    expect(kindOf(row({ role: "maestro" }).record)).toBeNull();
    expect(kindOf(row({ role: "conductor" }).record)).toBeNull();
    expect(kindOf(row({ role: "other", role_from: "none" }).record)).toBeNull();
    expect(kindOf(row({ role: "other", role_from: "pending" }).record)).toBeNull();
  });
});

describe("countSlots", () => {
  it("counts a busy run and skips ended, lost, idle and stale runs", () => {
    const c = count([
      row({ run: "busy" }),
      row({ run: "ended", ended: true, last: "ended" }),
      row({ run: "lost", last: "lost" }),
      row({ run: "wait-turn", last: "turn_end" }),
      row({ run: "wait-perm", last: "blocked" }),
      row({ run: "old", lastTs: 121 }),
    ]);
    expect(c.used.builder.map((s) => s.run)).toEqual(["busy"]);
    expect(c.stale.map((s) => s.run)).toEqual(["old"]);
  });
  it("counts a /clear run (ended then started) as busy through summary.ended false", () => {
    expect(count([row({ run: "cleared", last: "started" })]).used.builder).toHaveLength(1);
  });
  it("adds the factory lock as one builder and does not count its ticket twice", () => {
    expect(count([], { ticket: "DGS-9" }).used.builder.map((s) => s.factory)).toEqual([true]);
    const c = count([row({ ticket: "DGS-9" })], { ticket: "DGS-9" });
    expect(c.used.builder).toHaveLength(1);
  });
  it("keeps reviewer, scout and other runs in their own buckets", () => {
    const c = count([
      row({ run: "rev", role: "reviewer" }),
      row({ run: "sc", role: "scout" }),
      row({ run: "ot", role: "other", role_from: "herdr" }),
      row({ run: "b" }),
    ]);
    expect(c.used.reviewer.map((s) => s.run)).toEqual(["rev"]);
    expect(c.used.role.map((s) => s.run)).toEqual(["sc", "ot"]);
    expect(c.used.builder.map((s) => s.run)).toEqual(["b"]);
  });
  it("adds the factory slot when the lock ticket differs from the open builders", () => {
    const c = count([row({ run: "hand", ticket: "DGS-1" })], { ticket: "DGS-9" });
    expect(c.used.builder.map((s) => s.run)).toEqual(["hand", "factory lock"]);
  });
  it("treats exactly the stale window as busy and one minute past it as stale", () => {
    expect(count([row({ lastTs: 120 })]).used.builder).toHaveLength(1);
    expect(count([row({ lastTs: 121 })]).stale).toHaveLength(1);
  });
  it("counts an unreadable lock (ticket ?) as one builder", () => {
    expect(count([], { ticket: "?" }).used.builder).toHaveLength(1);
  });
});

describe("refusal and lines", () => {
  it("allows a second builder beside the factory and refuses a third", () => {
    const one = count([row({ run: "hand" })], { ticket: "DGS-9" });
    expect(refusal(one, "builder")).toMatch(/builder 2 of 2 in use/);
    const free = count([], { ticket: "DGS-9" });
    expect(refusal(free, "builder")).toBeNull();
  });
  it("names the open run and its age", () => {
    const c = count([row({ run: "b-1", ticket: "DGS-557" }), row({ run: "b-2", ticket: "DGS-2" })]);
    expect(refusal(c, "builder")).toBe("limit: builder 2 of 2 in use: b-1 (DGS-557, last event 1 min ago), b-2 (DGS-2, last event 1 min ago). Wait for one to finish.");
  });
  it("says 'Wait for it' with one open run", () => {
    const c = countSlots([row({ run: "only" })], null, NOW, { builder: 1, reviewer: 1, role: 1 }, 120);
    expect(refusal(c, "builder")).toBe("limit: builder 1 of 1 in use: only (DGS-1, last event 1 min ago). Wait for it to finish.");
  });
  it("refuses when the limit is 0", () => {
    const c = countSlots([], null, NOW, { builder: 0, reviewer: 1, role: 1 }, 120);
    expect(refusal(c, "builder")).toMatch(/builder 0 of 0/);
  });
  it("prints the status line", () => {
    expect(limitLine(count([row({}), row({ run: "s", role: "scout", last: "turn_end" })]))).toBe("limits: builder 1/2, reviewer 0/1, role 0/1");
  });
});
