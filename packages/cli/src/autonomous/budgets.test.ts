import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
    expect(r.budgets).toEqual({ building: 45, review: 60, merge: 30 });
    expect(r.problems).toEqual([]);
  });
  it("a bad value gives one problem and the default", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    building: abc\n    review: -5\n    merge: 15\n"));
    expect(r.budgets).toEqual({ building: 45, review: 60, merge: 15 });
    expect(r.problems).toHaveLength(2);
  });
  it("a key that is not building, review or merge is a problem", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    deploy: 5\n"));
    expect(r.budgets).toEqual(DEFAULT_BUDGETS);
    expect(r.problems).toHaveLength(1);
  });
  it("a config that cannot be read gives the defaults", () => {
    expect(readBudgets("/no/such/dir")).toEqual({ budgets: DEFAULT_BUDGETS, problems: [] });
  });
});
