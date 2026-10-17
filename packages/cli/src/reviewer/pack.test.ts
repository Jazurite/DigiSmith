import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildPack, type PackInput } from "./pack.ts";
import { OPUS, SONNET } from "./types.ts";

let ws: string;
const w = (name: string, text = "x\n") => {
  const p = path.join(ws, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
};
const smallDiff = "# Review package: a1b2c3d..e4f5a6b\n\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n";
const bigDiff = `# Review package: a1b2c3d..e4f5a6b\n\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n${"+line\n".repeat(801)}`;

const taskInput = (over: Partial<PackInput> = {}): PackInput => ({
  type: "task", id: "7", round: 1, workspace: path.join(ws, "wk"), base: "a1b2c3d", head: "e4f5a6b",
  diff: w("d.diff", smallDiff), plan: w("plan.md"), brief: w("brief.md"), report: w("report-in.md"),
  standards: [w("std/commit-style.md")], ...over,
});
const ticketInput = (over: Partial<PackInput> = {}): PackInput => ({
  type: "ticket", id: "final", round: 1, workspace: path.join(ws, "wk"), base: "a1b2c3d", head: "e4f5a6b",
  diff: w("d.diff", smallDiff), plan: w("plan.md"), ticketFile: w("ticket.md"), spec: w("design.html"),
  ledger: w("progress.md", [
    "# SDD ledger — plan: plan.md",
    "Task 1: complete (commits a..b, review clean)",
    "Task 2: minor (deferred): magic number",
    "Task 3: parked — F1 — ruling: the code stands",
    "Task 3: fix round 1/5 (1 addressed, 0 open)",
  ].join("\n")),
  standards: [], ...over,
});
const manifest = (dir: string) => fs.readFileSync(path.join(dir, "pack.md"), "utf8");

beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), "pack-")); });
afterEach(() => { fs.rmSync(ws, { recursive: true, force: true }); });

describe("buildPack, task round 1", () => {
  it("writes the folder and a manifest with the model, primitive and files", () => {
    const { dir, model } = buildPack(taskInput());
    expect(dir).toBe(path.join(ws, "wk", "reviews", "task-7-r1"));
    expect(model).toBe(SONNET);
    const m = manifest(dir);
    expect(m).toContain("# Review pack: task 7 round 1");
    expect(m).toMatch(/^type: task$/m);
    expect(m).toMatch(/^model: claude-sonnet-5-5$/m);
    expect(m).toMatch(/^primitive: task-reviewer-prompt\.md$/m);
    expect(m).toMatch(/^base: a1b2c3d$/m);
    expect(m).toContain(`report_out: ${path.join(dir, "report.md")}`);
    expect(m).toMatch(/^- brief: \//m);
    expect(m).toMatch(/^- report: \//m);
    expect(m).toContain("commit-style.md");
    expect(fs.existsSync(path.join(dir, "carry-over.md"))).toBe(false);
  });
  it("escalates the model for a big diff", () => {
    expect(buildPack(taskInput({ diff: w("big.diff", bigDiff) })).model).toBe(OPUS);
  });
  it("requires the brief and the implementer's report", () => {
    expect(() => buildPack(taskInput({ brief: undefined }))).toThrow(/brief: required/);
    expect(() => buildPack(taskInput({ report: undefined }))).toThrow(/report: required/);
  });
});

describe("buildPack, ticket round 1", () => {
  it("lists ticket, spec, plan and a carry-over file with only deferred and parked lines", () => {
    const { dir, model } = buildPack(ticketInput());
    expect(model).toBe(OPUS);
    const m = manifest(dir);
    expect(m).toMatch(/^primitive: code-reviewer\.md$/m);
    expect(m).toMatch(/^- ticket: \//m);
    expect(m).toMatch(/^- spec: \//m);
    expect(m).toMatch(/^- plan: \//m);
    const carry = fs.readFileSync(path.join(dir, "carry-over.md"), "utf8");
    expect(carry).toContain("Task 2: minor (deferred): magic number");
    expect(carry).toContain("Task 3: parked");
    expect(carry).not.toContain("fix round");
    expect(carry).not.toContain("review clean");
  });
  it("writes 'none' when the ledger has no deferred or parked lines", () => {
    const { dir } = buildPack(ticketInput({ ledger: w("clean.md", "# SDD ledger\nTask 1: complete\n") }));
    expect(fs.readFileSync(path.join(dir, "carry-over.md"), "utf8").trim()).toBe("none");
  });
});

describe("buildPack, re-review", () => {
  it("needs the open findings and the fix base, and names the re-review primitive", () => {
    const input = taskInput({ round: 2, findingsIn: w("open.md"), fixBase: "e4f5a6b", head: "9a8b7c6" });
    const { dir } = buildPack(input);
    expect(dir).toBe(path.join(ws, "wk", "reviews", "task-7-r2"));
    const m = manifest(dir);
    expect(m).toMatch(/^primitive: re-review-prompt\.md$/m);
    expect(m).toMatch(/^fix_base: e4f5a6b$/m);
    expect(m).toMatch(/^- findings: \//m);
  });
  it("fails without the fix base or the findings", () => {
    expect(() => buildPack(taskInput({ round: 2, findingsIn: w("o.md"), fixBase: undefined }))).toThrow(/fix-base: required/);
    expect(() => buildPack(taskInput({ round: 2, fixBase: "e4f5a6b" }))).toThrow(/findings-in: required/);
  });
});

describe("buildPack, refusals", () => {
  it("refuses a diff that review-package did not write", () => {
    expect(() => buildPack(taskInput({ diff: w("raw.diff", "diff --git a/x b/x\n") }))).toThrow(/not a review package/);
  });
  it("refuses a missing file and names it", () => {
    expect(() => buildPack(taskInput({ brief: path.join(ws, "missing.md") }))).toThrow(/brief: no such file/);
  });
  it("refuses an existing pack folder", () => {
    buildPack(taskInput());
    expect(() => buildPack(taskInput())).toThrow(/pack exists/);
  });
  it("refuses a bad id, round or commit", () => {
    expect(() => buildPack(taskInput({ id: "final" }))).toThrow(/id/);
    expect(() => buildPack(ticketInput({ id: "3" }))).toThrow(/id/);
    expect(() => buildPack(taskInput({ round: 0 }))).toThrow(/round/);
    expect(() => buildPack(taskInput({ head: "HEAD" }))).toThrow(/head/);
  });
});
