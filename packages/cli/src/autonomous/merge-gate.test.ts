import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../../scripts/config-parse.ts";
import { attentionFile, readOpen } from "./attention.ts";
import { realGit } from "./gitx.ts";
import { readGuardrails } from "./guardrails.ts";
import { runMergeGate } from "./merge-gate.ts";
import { DEFAULT_PROTECTED } from "./protected-paths.ts";

let root: string;
let repo: string;
let dir: string;

const git = (...args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), text);
};
const commit = (rel: string, text = "x\n"): void => {
  put(rel, text);
  git("add", "-A");
  git("commit", "-q", "-m", `edit ${rel}`);
};
const gate = (ticket = "DGS-9") => runMergeGate({ git: realGit, repo, dir, now: () => new Date("2026-10-22T01:00:00.000Z") }, ticket);

function setup(config: string | null): void {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  put("README.md", "hi\n");
  if (config !== null) put(".digismith/config.yml", config);
  git("add", "-A");
  git("commit", "-q", "-m", "init");
}
const branch = (name = "DGS-9__x"): void => { git("checkout", "-q", "-b", name); };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "merge-gate-"));
  repo = join(root, "repo");
  dir = join(root, "attention");
  mkdirSync(repo);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("runMergeGate", () => {
  it("(a) a normal commit is go and writes nothing", () => {
    setup("profile: x\n");
    branch();
    commit("src/a.ts");
    expect(gate()).toEqual({ go: true });
    expect(existsSync(attentionFile(dir))).toBe(false);
  });

  it("(b) 0 commits ahead is no-commits", () => {
    setup("profile: x\n");
    branch();
    const r = gate();
    expect(r).toMatchObject({ go: false, code: "no-commits" });
    expect(readOpen(dir)).toHaveLength(1);
  });

  it("(c) a protected path is refused once, and a second call adds no item", () => {
    setup("profile: x\n");
    branch();
    commit("hooks/hooks.json");
    const r = gate();
    expect(r).toMatchObject({ go: false, code: "protected-path" });
    expect((r as { reason: string }).reason).toContain("hooks/hooks.json");
    gate();
    const open = readOpen(dir);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ run: "DGS-9", kind: "refused", causeClass: "durable", retryEligible: false });
    expect(open[0].cause).toContain("merge-refused:");
  });

  it("(d) the policy comes from main, not the branch", () => {
    setup("profile: x\n");
    branch();
    put(".digismith/config.yml", "profile: x\nnightwatch:\n  protected_paths:\n    - nothing/\n");
    commit("hooks/a");
    expect(gate()).toMatchObject({ go: false, code: "protected-path" });
  });

  it("(e) a config list on main replaces the defaults", () => {
    setup("profile: x\nnightwatch:\n  protected_paths:\n    - docs/\n");
    branch();
    commit("docs/a.md");
    expect(gate()).toMatchObject({ go: false, code: "protected-path" });
    git("checkout", "-q", "main");
    branch("DGS-8__y");
    commit("hooks/a");
    expect(gate("DGS-8")).toEqual({ go: true });
  });

  it("(f) a broken budgets line on main is a config refusal", () => {
    setup("profile: x\nnightwatch:\n  budgets:\n    building: abc\n");
    branch();
    commit("src/a.ts");
    expect(gate()).toMatchObject({ go: false, code: "config" });
    expect(readOpen(dir)).toHaveLength(1);
  });

  it("(g) no config on main is a config refusal", () => {
    setup(null);
    branch();
    commit("src/a.ts");
    expect(gate()).toMatchObject({ go: false, code: "config" });
  });

  it("(h) no branch, and two branches, are no-branch", () => {
    setup("profile: x\n");
    expect(gate()).toMatchObject({ go: false, code: "no-branch" });
    branch("DGS-9__a");
    commit("src/a.ts");
    git("checkout", "-q", "main");
    branch("DGS-9__b");
    commit("src/b.ts");
    expect(gate()).toMatchObject({ go: false, code: "no-branch" });
  });

  it.each([
    "packages/cli/src/autonomous/x.ts",
    "scripts/nexus-api/src/scheduler/x.ts",
    ".digismith/mandate.yml",
    ".digismith/profiles/p.yml",
  ])("(i) default path %s is refused", (p) => {
    setup("profile: x\n");
    branch();
    commit(p);
    expect(gate()).toMatchObject({ go: false, code: "protected-path" });
  });
});

describe("the repo's own config", () => {
  const text = readFileSync(join(__dirname, "../../../../.digismith/config.yml"), "utf8");
  it("has no guardrail problems and lists the defaults", () => {
    const g = readGuardrails(text);
    expect(g.problems).toEqual([]);
    expect(g.protectedPaths).toEqual([...DEFAULT_PROTECTED]);
  });
  it("still parses with parseConfig", () => {
    expect(() => parseConfig(text)).not.toThrow();
  });
});
