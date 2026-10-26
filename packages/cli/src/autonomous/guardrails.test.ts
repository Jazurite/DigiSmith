import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseConfig } from "../../../../scripts/config-parse.ts";
import { DEFAULT_SCAN_EVERY_MINUTES, parseScanInterval, readGuardrails, readLimitsFile, readMainConfig } from "./guardrails.ts";
import type { Git } from "./gitx.ts";

const ok = `profile: digismith
nightwatch:
  protected_paths:
    - hooks/
    - "skills/finishing-*/"
  budgets:
    building: 45
    review: 60
`;

describe("readGuardrails", () => {
  it("reads paths and budgets", () => {
    const g = readGuardrails(ok);
    expect(g.problems).toEqual([]);
    expect(g.protectedPaths).toEqual(["hooks/", "skills/finishing-*/"]);
    expect(g.budgets).toEqual({ building: 45, review: 60 });
  });
  it("no nightwatch block: no problems, defaults apply", () => {
    expect(readGuardrails("profile: x\n")).toEqual({ protectedPaths: null, budgets: {}, problems: [], scanEveryMinutes: 30, scanProblems: [], limits: { builder: 2, reviewer: 1, role: 1 }, staleAfterMinutes: 120, limitProblems: [] });
  });
  it.each([
    ["inline value for protected_paths", "nightwatch:\n  protected_paths: hooks/\n"],
    ["flow list", "nightwatch:\n  protected_paths: [hooks/]\n"],
    ["empty list", "nightwatch:\n  protected_paths:\n"],
    ["tab indent", "nightwatch:\n\tbudgets:\n"],
    ["empty budgets block", "nightwatch:\n  budgets:\n"],
    ["budgets with only comment lines under it", "nightwatch:\n  budgets:\n    # none yet\n"],
    ["budget not a number", "nightwatch:\n  budgets:\n    building: soon\n"],
    ["budget zero", "nightwatch:\n  budgets:\n    merge: 0\n"],
    ["unknown budget key", "nightwatch:\n  budgets:\n    deploy: 5\n"],
    ["duplicate budget key", "nightwatch:\n  budgets:\n    merge: 5\n    merge: 6\n"],
    ["unknown nightwatch key (a typo must not drop the guardrail)", "nightwatch:\n  protected_path:\n    - hooks/\n"],
    ["a line indented less than the first key under nightwatch", "nightwatch:\n    budgets:\n  protected_paths:\n    - x\n"],
  ])("reports a problem: %s", (_name, text) => {
    expect(readGuardrails(text).problems.length).toBeGreaterThan(0);
  });
  it("reports a line indented less than the first key under nightwatch", () => {
    expect(readGuardrails("nightwatch:\n    budgets:\n      merge: 5\n  protected_paths:\n").problems).toEqual([
      'nightwatch: line "protected_paths:" is indented less than the first key under nightwatch:',
    ]);
  });
  it.each(["nightwatch: {}\n", "nightwatch: off\n", "nightwatch: {}\nprofile: x\n"])("reports an inline nightwatch value %j", (t) => {
    expect(readGuardrails(t).problems).toEqual(["nightwatch: must be a block with indented lines under it, not an inline value"]);
  });
  it("nightwatch: with a trailing comment and indented lines stays fine", () => {
    expect(readGuardrails("nightwatch: # note\n  budgets:\n    merge: 5\n").problems).toEqual([]);
  });
  it("ignores an error outside the nightwatch block", () => {
    expect(readGuardrails("profile: x\nbroken line without colon\nnightwatch:\n  budgets:\n    merge: 5\n").problems).toEqual([]);
  });
  it("parseConfig skips the nightwatch block: the strict reader alone judges it", () => {
    for (const text of [ok, "nightwatch:\n  budgets:\n    merge: 5 # note\n"]) {
      expect(() => parseConfig(text)).not.toThrow();
      expect(readGuardrails(text).problems).toEqual([]);
    }
    expect(readGuardrails(ok).budgets).toEqual({ building: 45, review: 60 });
    for (const text of ["nightwatch:\n  budgets: {a: 1}\n", "nightwatch:\n\tx: 1\n", "nightwatch:\n  budgets:\n    merge 5\n"]) {
      expect(() => parseConfig(text)).not.toThrow();
      expect(readGuardrails(text).problems.length).toBeGreaterThan(0);
    }
  });
});

describe("readMainConfig", () => {
  it("reads main, never the working tree", () => {
    const calls: string[][] = [];
    const git: Git = (_cwd, args) => { calls.push(args); return ok; };
    const r = readMainConfig(git, "/repo");
    expect(calls).toEqual([["show", "main:.digismith/config.yml"]]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.guardrails.protectedPaths).toEqual(["hooks/", "skills/finishing-*/"]);
    expect(r.guardrails.budgets).toEqual({ building: 45, review: 60 });
    expect(r.guardrails.problems).toEqual([]);
  });
  it("fails closed when main has no config", () => {
    const git: Git = () => { throw new Error("fatal: path does not exist"); };
    const r = readMainConfig(git, "/repo");
    expect(r.ok).toBe(false);
  });
});

const withScan = (v: string): string => `nightwatch:\n  scan_every_minutes: ${v}\n  budgets:\n    review: 60\n`;

describe("scan_every_minutes", () => {
  it("the default is 30", () => { expect(DEFAULT_SCAN_EVERY_MINUTES).toBe(30); });
  it.each([["30", 30], ["5", 5], ["720", 720], ["15   # quarter hour", 15]])("good value %s", (v, n) => {
    expect(parseScanInterval(withScan(v))).toEqual({ minutes: n, problems: [] });
    expect(readGuardrails(withScan(v)).problems).toEqual([]);
  });
  it("a missing key is 30 with no problem", () => {
    expect(parseScanInterval(ok)).toEqual({ minutes: 30, problems: [] });
    expect(parseScanInterval("profile: x\n")).toEqual({ minutes: 30, problems: [] });
  });
  it.each(["4", "721", "x", "7.5", "0", "-5", "030x", "", '"30"'])("bad value %j falls back to 30 with a scan problem and no guardrail problem", (v) => {
    const r = parseScanInterval(withScan(v));
    expect(r.minutes).toBe(30);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/scan_every_minutes/);
    const g = readGuardrails(withScan(v));
    expect(g.problems).toEqual([]);
    expect(g.budgets).toEqual({ review: 60 });
  });
  it("a duplicate falls back to 30 with one scan problem", () => {
    const r = parseScanInterval("nightwatch:\n  scan_every_minutes: 10\n  scan_every_minutes: 20\n");
    expect(r.minutes).toBe(30);
    expect(r.problems).toHaveLength(1);
    expect(readGuardrails("nightwatch:\n  scan_every_minutes: 10\n  scan_every_minutes: 20\n").problems).toEqual([]);
  });
  it("an indented child line under the key is a scan problem and 30 is used", () => {
    const t = "nightwatch:\n  scan_every_minutes: 10\n    foo: bar\n";
    const r = parseScanInterval(t);
    expect(r.minutes).toBe(30);
    expect(r.problems).toHaveLength(1);
    expect(readGuardrails(t).problems).toEqual([]);
  });
  it("an unknown key still fails the guardrails", () => {
    expect(readGuardrails("nightwatch:\n  scan_every_minutes: 30\n  nope: 1\n").problems).toHaveLength(1);
  });
});

describe("this repo's own config.yml", () => {
  it("sets scan_every_minutes to 15 and reads clean", () => {
    const text = readFileSync(new URL("../../../../.digismith/config.yml", import.meta.url), "utf-8");
    const g = readGuardrails(text);
    expect(g.problems).toEqual([]);
    expect(g.scanProblems).toEqual([]);
    expect(g.scanEveryMinutes).toBe(15);
    expect(/^  scan_every_minutes: 15\b/m.test(text)).toBe(true);
    expect(g.protectedPaths).toContain("scripts/nexus-api/src/scheduler/");
  });
});

describe("limits (DGS-665)", () => {
  const base = "nightwatch:\n  scan_every_minutes: 15\n";
  it("defaults to 2, 1, 1 and 120 with no keys", () => {
    const g = readGuardrails(base);
    expect(g.limits).toEqual({ builder: 2, reviewer: 1, role: 1 });
    expect(g.staleAfterMinutes).toBe(120);
    expect(g.limitProblems).toEqual([]);
    expect(g.problems).toEqual([]);
  });
  it("reads a limits block and the stale window", () => {
    const g = readGuardrails(`${base}  limits:\n    builder: 3\n    reviewer: 0\n    role: 2\n  stale_after_minutes: 60\n`);
    expect(g.limits).toEqual({ builder: 3, reviewer: 0, role: 2 });
    expect(g.staleAfterMinutes).toBe(60);
    expect(g.problems).toEqual([]);
  });
  it("falls back per kind on a bad value, as a limit problem and not a guardrail problem", () => {
    const g = readGuardrails(`${base}  limits:\n    builder: many\n    reviewer: 10\n    role: 2\n  stale_after_minutes: 0\n`);
    expect(g.limits).toEqual({ builder: 2, reviewer: 1, role: 2 });
    expect(g.staleAfterMinutes).toBe(120);
    expect(g.limitProblems).toHaveLength(3);
    expect(g.problems).toEqual([]);
  });
  it("reports an unknown kind and a duplicate key as limit problems", () => {
    const g = readGuardrails(`${base}  limits:\n    builders: 2\n    role: 1\n    role: 2\n`);
    expect(g.limitProblems.join(" ")).toMatch(/builders/);
    expect(g.limitProblems.join(" ")).toMatch(/more than once/);
    expect(g.problems).toEqual([]);
  });
  it("still fails an unknown key under nightwatch", () => {
    expect(readGuardrails(`${base}  nonsense: 1\n`).problems[0]).toMatch(/unknown guardrail key "nonsense"/);
  });
  it("readLimitsFile gives defaults without a file", () => {
    expect(readLimitsFile("/nonexistent-dir-dgs665")).toEqual({ limits: { builder: 2, reviewer: 1, role: 1 }, staleAfterMinutes: 120, problems: [] });
  });
});
