import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildCli } from "../index.ts";

let ws: string;
let logs: string[];
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "cmd-"));
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(ws, { recursive: true, force: true });
  process.exitCode = undefined;
});

const run = async (argv: string[]) => {
  await buildCli(argv).parseAsync(argv);
};

describe("dg reviewer", () => {
  it("is registered, with its two commands", async () => {
    expect.assertions(4);
    await expect(buildCli([]).getHelp()).resolves.toMatch(/reviewer/);
    const argv = ["reviewer", "--help"];
    buildCli(argv).parse(argv, {}, (err, _argv, output) => {
      expect(err).toBeFalsy();
      expect(output).toMatch(/\btable\b/);
      expect(output).toMatch(/\bpack\b/);
    });
  });
  it("table says no reviews found and exits 0 for a workspace without reviews (hand mode)", async () => {
    await run(["reviewer", "table", "--workspace", ws, "--out", path.join(ws, "findings.md")]);
    expect(logs).toContain("no reviews found");
    expect(process.exitCode).toBeUndefined();
    expect(fs.existsSync(path.join(ws, "findings.md"))).toBe(false);
  });
  it("table writes the file and exits 0 when the reviews are judged", async () => {
    fs.mkdirSync(path.join(ws, "reviews", "task-1-r1"), { recursive: true });
    fs.writeFileSync(path.join(ws, "reviews", "task-1-r1", "report.md"), "```json findings\n[]\n```\n");
    fs.writeFileSync(path.join(ws, "progress.md"), "# SDD ledger\n");
    await run(["reviewer", "table", "--workspace", ws, "--out", path.join(ws, "findings.md")]);
    expect(fs.existsSync(path.join(ws, "findings.md"))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });
  it("table exits 1 with the finding id when a finding has no verdict", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fs.mkdirSync(path.join(ws, "reviews", "task-1-r1"), { recursive: true });
    const block = JSON.stringify([{ id: "F1", path: "a.ts", line: 1, severity: "Minor", what: "x", scenario: "" }]);
    fs.writeFileSync(path.join(ws, "reviews", "task-1-r1", "report.md"), "```json findings\n" + block + "\n```\n");
    fs.writeFileSync(path.join(ws, "progress.md"), "# SDD ledger\n");
    await run(["reviewer", "table", "--workspace", ws, "--out", path.join(ws, "findings.md")]);
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls.flat().join(" ")).toMatch(/task 1 r1 F1/);
  });
  it("pack prints the pack folder and the model", async () => {
    const w = (n: string, t = "x\n") => { const p = path.join(ws, n); fs.writeFileSync(p, t); return p; };
    const diff = w("d.diff", "# Review package: a1b2c3d..e4f5a6b\n\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n");
    await run([
      "reviewer", "pack", "--type", "task", "--task", "3", "--workspace", path.join(ws, "wk"),
      "--base", "a1b2c3d", "--head", "e4f5a6b", "--diff", diff, "--plan", w("plan.md"),
      "--brief", w("brief.md"), "--report", w("rep.md"),
    ]);
    expect(logs[0]).toBe(`pack: ${path.join(ws, "wk", "reviews", "task-3-r1")}`);
    expect(logs[1]).toBe("model: claude-sonnet-5-5");
  });
  it("pack exits 1 and names the problem on bad input", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run([
      "reviewer", "pack", "--type", "task", "--task", "3", "--workspace", ws,
      "--base", "a1b2c3d", "--head", "e4f5a6b", "--diff", path.join(ws, "none.diff"), "--plan", path.join(ws, "p.md"),
    ]);
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls.flat().join(" ")).toMatch(/diff: no such file/);
  });
});
