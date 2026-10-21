import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, appendFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAttention } from "./attention-write.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "nw-att-"));
const T = new Date("2026-10-21T02:00:00.000Z");
const a = { ticket: "DGS-1", run: "builder-1", kind: "unknown" as const, cause: "obs-git-failed" };
const lines = (d: string) => readFileSync(join(d, "attention.jsonl"), "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));

describe("appendAttention", () => {
  it("writes the DGS-583 line shape", () => {
    const d = tmp();
    expect(appendAttention(d, T, a)).toBe("written");
    expect(lines(d)).toEqual([{ schema: "nightwatch-attention/v1", id: "builder-1.unknown.0", ts: T.toISOString(), ticket: "DGS-1", run: "builder-1", kind: "unknown", cause: "obs-git-failed", since: T.toISOString() }]);
  });
  it("one open item per run and kind", () => {
    const d = tmp();
    appendAttention(d, T, a);
    expect(appendAttention(d, T, { ...a, cause: "other" })).toBe("exists");
    expect(lines(d)).toHaveLength(1);
    expect(appendAttention(d, T, { ...a, kind: "failed" })).toBe("written");
  });
  it("a resolved item lets a new one open with n + 1", () => {
    const d = tmp();
    appendAttention(d, T, a);
    appendFileSync(join(d, "attention.jsonl"), `${JSON.stringify({ schema: "nightwatch-attention/v1", id: "builder-1.unknown.0", ts: T.toISOString(), resolved: true, by: "jack", note: "ok" })}\n`);
    expect(appendAttention(d, T, a)).toBe("written");
    expect(lines(d).at(-1).id).toBe("builder-1.unknown.1");
  });
  it("no run uses a dash, and a garbage line is skipped", () => {
    const d = tmp();
    appendFileSync(join(d, "attention.jsonl"), "garbage\n");
    appendAttention(d, T, { ...a, run: null });
    expect(readFileSync(join(d, "attention.jsonl"), "utf8")).toContain("\"id\":\"-.unknown.0\"");
  });
  it("a torn last line (no trailing newline) does not swallow the new line", () => {
    const d = tmp();
    appendFileSync(join(d, "attention.jsonl"), "{\"schema\":\"nightwatch-attention/v1\",\"id\":\"x.unknown.0\"");
    expect(appendAttention(d, T, a)).toBe("written");
    const raw = readFileSync(join(d, "attention.jsonl"), "utf8");
    const parsed = raw.split("\n").filter((l) => l !== "").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    expect(parsed.map((p) => p.id)).toEqual(["builder-1.unknown.0"]);
  });
  it("leaves no temp files behind in the directory", () => {
    const d = tmp();
    appendAttention(d, T, a);
    expect(readFileSync(join(d, "attention.jsonl"), "utf8").length).toBeGreaterThan(0);
    const entries = readdirSync(d);
    expect(entries).toEqual(["attention.jsonl"]);
  });
});
