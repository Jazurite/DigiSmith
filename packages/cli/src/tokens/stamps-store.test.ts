import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendStamp, readStamps, stampOf, type StampLine } from "./stamps-store.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stamps-"));
  process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir;
});
afterEach(() => {
  delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
  rmSync(dir, { recursive: true, force: true });
});

function stamp(task: string, commentId: string): StampLine {
  return {
    task,
    comment_id: commentId,
    window_start: "2026-11-02T01:00:00Z",
    window_end: "2026-11-02T01:05:00Z",
    agent_seconds: 300,
    models: { "claude-sonnet-5-5": { input: 1, output: 2, cache_read: 3, cache_write_5m: 4, cache_write_1h: 5, responses: 6, cost_usd: null } },
    reviews: { rounds: 1, findings: 2, fixed: 1, parked: 1, rejected: 0, open: 0, fix_rounds: 1, source: "ledger" },
    partial: false,
    stamped_at: "2026-11-02T01:06:00Z",
  };
}

describe("stamps store", () => {
  it("round-trips and names the file <Key>.stamps.jsonl", () => {
    appendStamp("DGS-1", stamp("1", "c1"));
    expect(existsSync(join(dir, "DGS-1.stamps.jsonl"))).toBe(true);
    expect(readStamps("DGS-1")).toEqual([stamp("1", "c1")]);
  });
  it("returns [] when no file exists", () => {
    expect(readStamps("DGS-9")).toEqual([]);
  });
  it("ignores a torn last line and starts a whole line after it", () => {
    appendStamp("DGS-1", stamp("1", "c1"));
    appendFileSync(join(dir, "DGS-1.stamps.jsonl"), '{"task":"2","comm');
    expect(readStamps("DGS-1")).toHaveLength(1);
    appendStamp("DGS-1", stamp("2", "c2"));
    expect(readStamps("DGS-1").map((s) => s.comment_id)).toEqual(["c1", "c2"]);
  });
  it("keeps both lines for a repeated task; stampOf returns the latest", () => {
    appendStamp("DGS-1", stamp("1", "old"));
    appendStamp("DGS-1", stamp("1", "new"));
    appendStamp("DGS-1", stamp("2", "other"));
    expect(readStamps("DGS-1")).toHaveLength(3);
    expect(stampOf("DGS-1", "1")?.comment_id).toBe("new");
    expect(stampOf("DGS-1", "3")).toBeUndefined();
  });
  it("refuses a ticket key with a path character", () => {
    expect(() => appendStamp("../x", stamp("1", "c"))).toThrow(/invalid ticket key/);
    expect(() => readStamps("a/b")).toThrow(/invalid ticket key/);
  });
  it("stores no message text field", () => {
    appendStamp("DGS-1", stamp("1", "c1"));
    const line = JSON.parse(readFileSync(join(dir, "DGS-1.stamps.jsonl"), "utf-8").trim());
    expect(Object.keys(line).sort()).toEqual(["agent_seconds", "comment_id", "models", "partial", "reviews", "stamped_at", "task", "window_end", "window_start"]);
  });
});
