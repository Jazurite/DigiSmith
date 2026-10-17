// packages/cli/src/reviewer/both-paths.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPack } from "./pack.ts";
import { runTable } from "./table.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SDD_SCRIPTS = path.join(ROOT, "skills", "subagent-driven-development", "scripts");

let repo: string;
const sh = (cmd: string, args: string[], cwd = repo) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "bp-"));
  sh("git", ["init", "-q", "-b", "main"]);
  sh("git", ["config", "user.email", "t@example.com"]);
  sh("git", ["config", "user.name", "T"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  sh("git", ["add", "."]);
  sh("git", ["commit", "-q", "-m", "chore: base"]);
});
afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }); });

describe("the old path (hand mode)", () => {
  it("review-package still writes a package for a plain range, with no reviewer pack involved", () => {
    const base = sh("git", ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
    sh("git", ["commit", "-q", "-am", "feat: change"]);
    const head = sh("git", ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "plan.md"), "# plan\n");
    const out = path.join(repo, "pkg.diff");
    sh("bash", [path.join(SDD_SCRIPTS, "review-package"), "plan.md", base, head, out]);
    expect(fs.readFileSync(out, "utf8")).toMatch(/^# Review package: /);
  });
  it("the table command finds no reviews in a hand-mode workspace and writes nothing", () => {
    const ws = path.join(repo, "ws");
    fs.mkdirSync(ws);
    fs.writeFileSync(path.join(ws, "progress.md"), "# SDD ledger — plan: plan.md\nReview mode: hand\nTask 1: complete (commits a..b, review clean)\n");
    const r = runTable({ workspace: ws, out: path.join(repo, "findings.md") });
    expect(r).toEqual({ written: false, message: "no reviews found" });
    expect(fs.existsSync(path.join(repo, "findings.md"))).toBe(false);
  });
});

describe("the new path (role mode)", () => {
  it("review-package, then a pack, then a report and verdict lines, then the table", () => {
    const base = sh("git", ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
    sh("git", ["commit", "-q", "-am", "feat: change"]);
    const head = sh("git", ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "plan.md"), "# plan\n");
    fs.writeFileSync(path.join(repo, "brief.md"), "task 1\n");
    fs.writeFileSync(path.join(repo, "impl-report.md"), "done\n");
    const diff = path.join(repo, "pkg.diff");
    sh("bash", [path.join(SDD_SCRIPTS, "review-package"), "plan.md", base, head, diff]);

    const ws = path.join(repo, "ws");
    const { dir, model } = buildPack({
      type: "task", id: "1", round: 1, ticket: "DGS-566", workspace: ws, base: base.slice(0, 7), head: head.slice(0, 7),
      diff, plan: path.join(repo, "plan.md"), brief: path.join(repo, "brief.md"),
      report: path.join(repo, "impl-report.md"), standards: [],
    });
    expect(model).toBe("claude-sonnet-5-5");
    expect(fs.readFileSync(path.join(dir, "pack.md"), "utf8")).toMatch(/^ticket: DGS-566$/m);

    // what the Reviewer worker writes
    const finding = { id: "F1", path: "a.txt", line: 1, severity: "Minor", what: "a nit", scenario: "none" };
    fs.writeFileSync(path.join(dir, "report.md"), "Approved.\n\n```json findings\n" + JSON.stringify([finding]) + "\n```\n");
    // what the Builder's controller writes
    fs.writeFileSync(path.join(ws, "progress.md"), "# SDD ledger — plan: plan.md\nReview mode: role\nReview task 1 r1: F1 -> parked (deferred minor)\n");

    const out = path.join(repo, "findings.md");
    expect(runTable({ workspace: ws, out }).written).toBe(true);
    const md = fs.readFileSync(out, "utf8");
    expect(md).toContain("| task 1 | 1 | a.txt:1 | Minor | a nit | none | parked (deferred minor) |");
  });
});
