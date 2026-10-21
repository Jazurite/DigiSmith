import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closeBreaker, isOpen, readBreaker, recordRelease } from "./breaker.ts";

const dir = () => mkdtempSync(join(tmpdir(), "nw-brk-"));
const now = new Date("2026-10-21T10:00:00Z");
const fail = (d: string, t: string) => recordRelease(d, { ticket: t, result: "failed" }, now);

describe("breaker", () => {
  it("no file: closed, no problem", () => expect(readBreaker(dir())).toEqual({ open: false, streak: 0, failed: [], openedAt: null, problem: null }));
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
    expect(readBreaker(d)).toEqual({ open: false, streak: 0, failed: [], openedAt: null, problem: null });
  });
  it("a file that parses but has the wrong shape is open, with a problem", () => {
    for (const body of ["[]", "null", "\"open\"", "{\"open\":\"yes\",\"streak\":0,\"failed\":[]}", "{\"open\":false,\"streak\":\"1\",\"failed\":[]}", "{\"open\":false,\"streak\":0}"]) {
      const d = dir();
      writeFileSync(join(d, "breaker.json"), body);
      const b = readBreaker(d);
      expect(b.open).toBe(true);
      expect(b.problem).toBe("breaker.json has the wrong shape");
    }
  });
  it("a directory named breaker.json is open, with a problem", () => {
    const d = dir();
    mkdirSync(join(d, "breaker.json"));
    const b = readBreaker(d);
    expect(b.open).toBe(true);
    expect(b.problem).toMatch(/^breaker\.json cannot be read: /);
  });
  it.skipIf(process.getuid?.() === 0)("a file that cannot be read (mode 000) is open, with a problem", () => {
    const d = dir();
    const f = join(d, "breaker.json");
    writeFileSync(f, JSON.stringify({ open: false, streak: 0, failed: [], openedAt: null }));
    chmodSync(f, 0);
    try {
      const b = readBreaker(d);
      expect(b.open).toBe(true);
      expect(b.problem).toMatch(/cannot be read: EACCES/);
    } finally {
      chmodSync(f, 0o644);
    }
  });
  it("a bad file stays open through a later failed release", () => {
    const d = dir();
    writeFileSync(join(d, "breaker.json"), "{oops");
    fail(d, "DGS-1");
    expect(isOpen(d)).toBe(true);
  });
  it("a merged release while open resets the streak and leaves it open", () => {
    const d = dir();
    fail(d, "DGS-1"); fail(d, "DGS-2");
    const r = recordRelease(d, { ticket: "DGS-3", result: "merged" }, now);
    expect(r.breaker.open).toBe(true);
    expect(readBreaker(d)).toEqual({ open: true, streak: 0, failed: [], openedAt: now.toISOString(), problem: null });
  });
  it("openedAt is the now passed in, not the wall clock", () => {
    const d = dir();
    const at = new Date("2030-01-02T03:04:05.000Z");
    recordRelease(d, { ticket: "DGS-1", result: "failed" }, at);
    recordRelease(d, { ticket: "DGS-2", result: "failed" }, at);
    expect(readBreaker(d).openedAt).toBe("2030-01-02T03:04:05.000Z");
  });
});
