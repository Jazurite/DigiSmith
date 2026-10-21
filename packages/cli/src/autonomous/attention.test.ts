import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendOpen, appendResolved, attentionFile, formatOpen, readOpen } from "./attention.ts";

const dir = () => mkdtempSync(join(tmpdir(), "nw-att-"));
const base = { ticket: "DGS-1", run: "builder-a", kind: "blocked" as const, cause: "waiting-for-answer", since: "2026-10-21T10:00:00.000Z", ts: "2026-10-21T10:05:00.000Z" };

describe("attention", () => {
  it("opens one item per (run, kind): a second append returns null and writes nothing", () => {
    const d = dir();
    expect(appendOpen(d, base)?.id).toBe("builder-a.blocked.0");
    expect(appendOpen(d, base)).toBeNull();
    expect(readFileSync(attentionFile(d), "utf-8").trim().split("\n")).toHaveLength(1);
    expect(readOpen(d)).toHaveLength(1);
  });
  it("a resolved item is closed, and a reopened problem gets the next n", () => {
    const d = dir();
    const a = appendOpen(d, base)!;
    expect(appendResolved(d, a.id, "watchdog", "2026-10-21T10:10:00.000Z")).toBe(true);
    expect(readOpen(d)).toHaveLength(0);
    expect(appendOpen(d, { ...base, ts: "2026-10-21T11:00:00.000Z" })?.id).toBe("builder-a.blocked.1");
  });
  it("resolving an unknown or closed id returns false and writes nothing", () => {
    const d = dir();
    expect(appendResolved(d, "nope.lost.0", "jack", "2026-10-21T10:00:00.000Z")).toBe(false);
    const a = appendOpen(d, base)!;
    appendResolved(d, a.id, "jack", "2026-10-21T10:01:00.000Z");
    const before = readFileSync(attentionFile(d), "utf-8");
    expect(appendResolved(d, a.id, "jack", "2026-10-21T10:02:00.000Z")).toBe(false);
    expect(readFileSync(attentionFile(d), "utf-8")).toBe(before);
  });
  it("skips a line that does not parse and keeps the rest", () => {
    const d = dir();
    appendOpen(d, base);
    appendFileSync(attentionFile(d), "{not json\n");
    appendOpen(d, { ...base, run: "builder-b" });
    expect(readOpen(d).map((i) => i.run)).toEqual(["builder-a", "builder-b"]);
  });
  it("a ticket-less item is allowed", () => {
    const d = dir();
    expect(appendOpen(d, { ...base, ticket: null, run: "-", kind: "failed", cause: "bad-budget-config" })?.ticket).toBeNull();
  });
  it("formatOpen prints none, or one line per item with UTC+7 time", () => {
    const d = dir();
    expect(formatOpen([], Date.now())).toBe("none");
    appendOpen(d, base);
    const out = formatOpen(readOpen(d), Date.parse("2026-10-21T10:30:00Z"));
    expect(out).toContain("builder-a.blocked.0");
    expect(out).toContain("2026-10-21 17:00");  // 10:00 UTC is 17:00 UTC+7
    expect(out).toContain("30m");
  });
  it("optional fields are carried through and read back", () => {
    const d = dir();
    appendOpen(d, { ...base, causeClass: "transient", retryEligible: true });
    expect(readOpen(d)[0]).toMatchObject({ causeClass: "transient", retryEligible: true });
    const raw = JSON.parse(readFileSync(attentionFile(d), "utf-8").trim());
    expect(raw.since).toBe(base.since);
    appendOpen(d, { ...base, run: "builder-q" });
    expect("causeClass" in readOpen(d)[1]).toBe(false);
  });
  it("never rewrites the file: earlier bytes stay", () => {
    const d = dir();
    appendOpen(d, base);
    const first = readFileSync(attentionFile(d), "utf-8");
    appendOpen(d, { ...base, run: "builder-z" });
    expect(readFileSync(attentionFile(d), "utf-8").startsWith(first)).toBe(true);
  });
});
