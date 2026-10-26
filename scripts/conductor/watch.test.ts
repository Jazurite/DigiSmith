import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { newestMtime } from "./watch.ts";

describe("newestMtime", () => {
  it("returns the newest mtime of a folder and undefined for a missing path", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "w577-"));
    try {
      fs.mkdirSync(path.join(d, "a/b"), { recursive: true });
      const f = path.join(d, "a/b/x.md");
      fs.writeFileSync(f, "x");
      const t = new Date("2026-10-20T00:00:00Z");
      fs.utimesSync(f, t, t);
      expect(newestMtime(d)?.time.toISOString()).toBe(t.toISOString());
      expect(newestMtime(f)?.time.toISOString()).toBe(t.toISOString());
      expect(newestMtime(path.join(d, "nope"))).toBeUndefined();
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
  it("does not walk deeper than 3 levels", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "w577-"));
    try {
      fs.mkdirSync(path.join(d, "a/b/c/d"), { recursive: true });
      const deep = path.join(d, "a/b/c/d/x.md");
      fs.writeFileSync(deep, "x");
      const t = new Date("2030-01-01T00:00:00Z");
      fs.utimesSync(deep, t, t);
      expect(newestMtime(d)!.time.getTime()).toBeLessThan(t.getTime());
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
