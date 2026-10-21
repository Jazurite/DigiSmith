import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { autonomousSection } from "./autonomous-section.ts";

const NOW = new Date("2026-10-21T12:00:00Z");
const HOUR = 3600_000;
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dgs486-section-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function report(name: string, body: string, ageMs: number): void {
  fs.mkdirSync(path.join(dir, "reports"), { recursive: true });
  const f = path.join(dir, "reports", name);
  fs.writeFileSync(f, `# Autonomous Operation report, ${name}\n${body}`);
  const t = new Date(NOW.getTime() - ageMs);
  fs.utimesSync(f, t, t);
}

describe("autonomousSection", () => {
  it("is empty without a reports folder", () => {
    expect(autonomousSection(dir, NOW)).toBe("");
  });
  it("is empty for an empty reports folder", () => {
    fs.mkdirSync(path.join(dir, "reports"));
    expect(autonomousSection(dir, NOW)).toBe("");
  });
  it("shows a report from 2 h ago without its title line", () => {
    report("a.md", "\nBuilt\n- DGS-1 done\n", 2 * HOUR);
    const s = autonomousSection(dir, NOW);
    expect(s.startsWith("\n## Autonomous Operation, last report\n")).toBe(true);
    expect(s).toContain("- DGS-1 done");
    expect(s).not.toContain("# Autonomous Operation report");
  });
  it("is empty for a report 30 h old", () => {
    report("a.md", "Built\n- x\n", 30 * HOUR);
    expect(autonomousSection(dir, NOW)).toBe("");
  });
  it("uses the newer of two reports", () => {
    report("old.md", "- OLD\n", 5 * HOUR);
    report("new.md", "- NEW\n", 1 * HOUR);
    const s = autonomousSection(dir, NOW);
    expect(s).toContain("- NEW");
    expect(s).not.toContain("- OLD");
  });
  it("breaks an mtime tie by the later name", () => {
    report("r-2.md", "- SECOND\n", HOUR);
    report("r.md", "- FIRST\n", HOUR);
    expect(autonomousSection(dir, NOW)).toContain("- SECOND");
  });
  it("never throws: a read error gives an empty string", () => {
    fs.mkdirSync(path.join(dir, "reports"));
    fs.writeFileSync(path.join(dir, "reports", "a.md"), "x");
    fs.utimesSync(path.join(dir, "reports", "a.md"), new Date(NOW.getTime() - 3 * HOUR), new Date(NOW.getTime() - 3 * HOUR));
    fs.chmodSync(path.join(dir, "reports", "a.md"), 0o000); // unreadable report
    try {
      expect(autonomousSection(dir, NOW)).toBe("");
    } finally {
      fs.chmodSync(path.join(dir, "reports", "a.md"), 0o600);
    }
    fs.writeFileSync(path.join(dir, "notadir"), "x");
    expect(autonomousSection(path.join(dir, "notadir"), NOW)).toBe("");
  });
  it("ignores a newer .DS_Store and a newer subfolder", () => {
    report("a.md", "- REAL\n", 5 * HOUR);
    const r = path.join(dir, "reports");
    const t = new Date(NOW.getTime() - HOUR);
    fs.writeFileSync(path.join(r, ".DS_Store"), "junk");
    fs.mkdirSync(path.join(r, "sub.md"));
    fs.mkdirSync(path.join(r, "sub"));
    for (const n of [".DS_Store", "sub.md", "sub"]) fs.utimesSync(path.join(r, n), t, t);
    expect(autonomousSection(dir, NOW)).toContain("- REAL");
  });
});
