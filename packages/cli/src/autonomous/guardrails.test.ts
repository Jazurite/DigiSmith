import { describe, expect, it } from "vitest";
import { parseConfig } from "../../../../scripts/config-parse.ts";
import { readGuardrails, readMainConfig } from "./guardrails.ts";
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
    expect(readGuardrails("profile: x\n")).toEqual({ protectedPaths: null, budgets: {}, problems: [] });
  });
  it.each([
    ["inline value for protected_paths", "nightwatch:\n  protected_paths: hooks/\n"],
    ["flow list", "nightwatch:\n  protected_paths: [hooks/]\n"],
    ["empty list", "nightwatch:\n  protected_paths:\n"],
    ["tab indent", "nightwatch:\n\tbudgets:\n"],
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
