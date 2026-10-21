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
  ])("reports a problem: %s", (_name, text) => {
    expect(readGuardrails(text).problems.length).toBeGreaterThan(0);
  });
  it("ignores an error outside the nightwatch block", () => {
    expect(readGuardrails("profile: x\nbroken line without colon\nnightwatch:\n  budgets:\n    merge: 5\n").problems).toEqual([]);
  });
  it("agrees with scripts/config-parse.ts on syntax inside the block", () => {
    for (const text of ["nightwatch:\n  budgets: {a: 1}\n", "nightwatch:\n\tx: 1\n", "nightwatch:\n  budgets:\n    merge 5\n"]) {
      expect(() => parseConfig(text)).toThrow();
      expect(readGuardrails(text).problems.length).toBeGreaterThan(0);
    }
    for (const text of ["nightwatch:\n  protected_paths:\n    - hooks/ # note\n    - \"skills/finishing-*/\"\n"]) {
      expect(() => parseConfig(text)).not.toThrow();
      expect(readGuardrails(text).problems).toEqual([]);
    }
  });
});

describe("readMainConfig", () => {
  it("reads main, never the working tree", () => {
    const calls: string[][] = [];
    const git: Git = (_cwd, args) => { calls.push(args); return ok; };
    const r = readMainConfig(git, "/repo");
    expect(calls).toEqual([["show", "main:.digismith/config.yml"]]);
    expect(r.ok && r.guardrails.protectedPaths).toEqual(["hooks/", "skills/finishing-*/"]);
  });
  it("fails closed when main has no config", () => {
    const git: Git = () => { throw new Error("fatal: path does not exist"); };
    const r = readMainConfig(git, "/repo");
    expect(r.ok).toBe(false);
  });
});
