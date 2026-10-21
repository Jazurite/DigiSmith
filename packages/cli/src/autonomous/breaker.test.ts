import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closeBreaker, isOpen, readBreaker, recordRelease } from "./breaker.ts";

const dir = () => mkdtempSync(join(tmpdir(), "nw-brk-"));
const now = new Date("2026-10-21T10:00:00Z");
const fail = (d: string, t: string) => recordRelease(d, { ticket: t, result: "failed" }, now);

describe("breaker", () => {
  it("no file: closed", () => expect(readBreaker(dir())).toEqual({ open: false, streak: 0, failed: [], openedAt: null }));
  it("two failures in sequence open it and say so once", () => {
    const d = dir();
    expect(fail(d, "DGS-1").opened).toBe(false);
    const r = fail(d, "DGS-2");
    expect(r.opened).toBe(true);
    expect(isOpen(d)).toBe(true);
    expect(readBreaker(d).failed).toEqual(["DGS-1", "DGS-2"]);
    expect(fail(d, "DGS-3").opened).toBe(false);   // already open: not announced again
  });
  it("a merged release resets the streak", () => {
    const d = dir();
    fail(d, "DGS-1");
    recordRelease(d, { ticket: "DGS-2", result: "merged" }, now);
    fail(d, "DGS-3");
    expect(isOpen(d)).toBe(false);
  });
  it("stopped and awaiting-jack change nothing", () => {
    const d = dir();
    fail(d, "DGS-1");
    recordRelease(d, { ticket: "DGS-2", result: "stopped" }, now);
    recordRelease(d, { ticket: "DGS-3", result: "awaiting-jack" }, now);
    expect(readBreaker(d).streak).toBe(1);
  });
  it("a file that does not parse is open (fail closed)", () => {
    const d = dir();
    writeFileSync(join(d, "breaker.json"), "{oops");
    expect(isOpen(d)).toBe(true);
  });
  it("closeBreaker closes it and clears the streak", () => {
    const d = dir();
    fail(d, "DGS-1"); fail(d, "DGS-2");
    closeBreaker(d);
    expect(readBreaker(d)).toEqual({ open: false, streak: 0, failed: [], openedAt: null });
  });
});
