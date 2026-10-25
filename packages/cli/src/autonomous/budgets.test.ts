import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBudgets } from "./budgets.ts";
import { DEFAULT_BUDGETS } from "./watchdog.ts";

function repo(config: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "nw-budgets-"));
  mkdirSync(join(dir, ".digismith"));
  if (config !== null) writeFileSync(join(dir, ".digismith", "config.yml"), config);
  return dir;
}

describe("readBudgets", () => {
  it("no file, no block: the defaults and no problem", () => {
    expect(readBudgets(repo(null))).toEqual({ budgets: DEFAULT_BUDGETS, problems: [] });
    expect(readBudgets(repo("profile: x\n"))).toEqual({ budgets: DEFAULT_BUDGETS, problems: [] });
  });
  it("overrides one value", () => {
    const r = readBudgets(repo("profile: x\nnightwatch:\n  budgets:\n    merge: 30\n"));
    expect(r.budgets).toEqual({ building: 180, review: 60, merge: 30 });
    expect(r.problems).toEqual([]);
  });
  it("a bad value gives one problem and the default", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    building: abc\n    review: -5\n    merge: 15\n"));
    expect(r.budgets).toEqual({ building: 180, review: 60, merge: 15 });
    expect(r.problems).toHaveLength(2);
  });
  it("a key that is not building, review or merge is a problem", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    deploy: 5\n"));
    expect(r.budgets).toEqual(DEFAULT_BUDGETS);
    expect(r.problems).toHaveLength(1);
  });
  it("a config path that is a directory is one problem and the defaults", () => {
    const dir = repo(null);
    mkdirSync(join(dir, ".digismith", "config.yml"));
    const r = readBudgets(dir);
    expect(r.budgets).toEqual(DEFAULT_BUDGETS);
    expect(r.problems).toHaveLength(1);
  });
  it.skipIf(process.getuid?.() === 0)("an unreadable config (mode 000) is one problem and the defaults", () => {
    const dir = repo("nightwatch:\n  budgets:\n    merge: 5\n");
    const path = join(dir, ".digismith", "config.yml");
    chmodSync(path, 0o000);
    try {
      const r = readBudgets(dir);
      expect(r.budgets).toEqual(DEFAULT_BUDGETS);
      expect(r.problems).toHaveLength(1);
    } finally {
      chmodSync(path, 0o644);
    }
  });
  it("a malformed line (no colon) is one problem and the defaults", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    building\n"));
    expect(r.budgets).toEqual(DEFAULT_BUDGETS);
    expect(r.problems).toHaveLength(1);
  });
  it("a trailing comment after the value is ignored", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    merge: 30 # min\n"));
    expect(r.budgets).toEqual({ building: 180, review: 60, merge: 30 });
    expect(r.problems).toEqual([]);
  });
  it("CRLF line endings read the same as LF", () => {
    const r = readBudgets(repo("nightwatch:\r\n  budgets:\r\n    review: 90\r\n    merge: 25\r\n"));
    expect(r.budgets).toEqual({ building: 180, review: 90, merge: 25 });
    expect(r.problems).toEqual([]);
  });
  it("a duplicate key: the last value wins and it is one problem", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    merge: 30\n    merge: 40\n"));
    expect(r.budgets).toEqual({ building: 180, review: 60, merge: 40 });
    expect(r.problems).toHaveLength(1);
  });
  it("children may use any indent deeper than the budgets line", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n   merge: 5\n"));
    expect(r.budgets).toEqual({ building: 180, review: 60, merge: 5 });
    expect(r.problems).toEqual([]);
  });
  it("a budgets key nested under another key is not read", () => {
    const r = readBudgets(repo("nightwatch:\n  other:\n    budgets:\n      merge: 5\n"));
    expect(r.budgets).toEqual(DEFAULT_BUDGETS);
    expect(r.problems).toEqual([]);
  });
  it("a column-0 comment between nightwatch and budgets is skipped", () => {
    const r = readBudgets(repo("nightwatch:\n# note\n  budgets:\n    merge: 5\n"));
    expect(r.budgets).toEqual({ building: 180, review: 60, merge: 5 });
    expect(r.problems).toEqual([]);
  });
  it("a column-0 comment between budgets children is skipped", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    merge: 5\n# note\n    building: 50\n"));
    expect(r.budgets).toEqual({ building: 50, review: 60, merge: 5 });
    expect(r.problems).toEqual([]);
  });
});
