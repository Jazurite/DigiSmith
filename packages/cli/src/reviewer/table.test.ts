import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildRows, renderMarkdown, runTable } from "./table.ts";
import type { Review } from "./findings.ts";
import { parseVerdictLines } from "./verdicts.ts";

const f = (id: string, over: Record<string, unknown> = {}) => ({
  id, path: "src/a.ts", line: 42 as number | null, severity: "Important" as const,
  what: "fileNames leak a path", scenario: "run the build", ...over,
});
const review = (kind: "task" | "ticket", id: string, round: number, findings: ReturnType<typeof f>[]): Review =>
  ({ kind, id, round, file: `/x/${kind}-${id}-r${round}/report.md`, findings });

describe("buildRows", () => {
  it("makes one row per finding with its verdict, in a stable order", () => {
    const reviews = [
      review("ticket", "final", 1, [f("F1")]),
      review("task", "10", 1, [f("F1", { severity: "Minor", path: "b.ts", line: null })]),
      review("task", "7", 2, []),
    ];
    const j = parseVerdictLines(
      "Review ticket final r1: F1 -> fixed (commit a7f3c2d)\nReview task 10 r1: F1 -> parked (deferred minor)\n",
    );
    const rows = buildRows(reviews, j);
    expect(rows.map((r) => r.type)).toEqual(["task 7", "task 10", "ticket"]);
    expect(rows[0]).toMatchObject({ round: 2, where: "-", what: "approved, no findings", verdict: "-" });
    expect(rows[1]).toMatchObject({ where: "b.ts", verdict: "parked (deferred minor)" });
    expect(rows[2]).toMatchObject({ where: "src/a.ts:42", severity: "Important", verdict: "fixed (commit a7f3c2d)" });
  });
  it("fails and names every finding that has no verdict", () => {
    const reviews = [review("task", "1", 1, [f("F1"), f("F2")])];
    const j = parseVerdictLines("Review task 1 r1: F1 -> fixed\n");
    expect(() => buildRows(reviews, j)).toThrow(/task 1 r1 F2/);
  });
  it("fails on a verdict line that names no finding", () => {
    const j = parseVerdictLines("Review task 9 r1: F1 -> fixed\n");
    expect(() => buildRows([review("task", "1", 1, [])], j)).toThrow(/names no finding.*task 9 r1 F1/);
  });
});

describe("renderMarkdown", () => {
  it("renders the header, escapes pipes and fills empty cells", () => {
    const md = renderMarkdown([
      { type: "ticket", round: 1, where: "a.ts:1", severity: "Minor", what: "a | b", scenario: "", verdict: "fixed" },
    ]);
    expect(md).toContain("| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |");
    expect(md).toContain("| ticket | 1 | a.ts:1 | Minor | a \\| b | - | fixed |");
  });
});

describe("runTable", () => {
  let ws: string;
  let out: string;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "table-"));
    out = path.join(ws, "findings.md");
  });
  afterEach(() => { fs.rmSync(ws, { recursive: true, force: true }); });

  it("says no reviews found and writes nothing when there is no reviews folder (hand mode)", () => {
    fs.writeFileSync(path.join(ws, "progress.md"), "# SDD ledger\n");
    const r = runTable({ workspace: ws, out });
    expect(r).toEqual({ written: false, message: "no reviews found" });
    expect(fs.existsSync(out)).toBe(false);
  });
  it("writes findings.md from packs and the ledger", () => {
    fs.mkdirSync(path.join(ws, "reviews", "task-1-r1"), { recursive: true });
    fs.writeFileSync(path.join(ws, "reviews", "task-1-r1", "report.md"), "```json findings\n[]\n```\n");
    fs.writeFileSync(path.join(ws, "progress.md"), "# SDD ledger\n");
    const r = runTable({ workspace: ws, out });
    expect(r.written).toBe(true);
    expect(fs.readFileSync(out, "utf8")).toContain("approved, no findings");
  });
  it("writes findings.md from a role-mode ledger that starts with Review mode", () => {
    fs.mkdirSync(path.join(ws, "reviews", "task-1-r1"), { recursive: true });
    fs.writeFileSync(path.join(ws, "reviews", "task-1-r1", "report.md"), "```json findings\n[]\n```\n");
    fs.writeFileSync(path.join(ws, "progress.md"), "Review mode: role\n# SDD ledger\n");
    expect(runTable({ workspace: ws, out }).written).toBe(true);
    expect(fs.existsSync(out)).toBe(true);
  });
  it("fails when the workspace folder is gone", () => {
    expect(() => runTable({ workspace: path.join(ws, "nope"), out })).toThrow(/workspace: no such folder/);
  });
  it("fails when reviews exist but the ledger is missing", () => {
    fs.mkdirSync(path.join(ws, "reviews", "task-1-r1"), { recursive: true });
    fs.writeFileSync(path.join(ws, "reviews", "task-1-r1", "report.md"), "```json findings\n[]\n```\n");
    expect(() => runTable({ workspace: ws, out })).toThrow(/ledger: no such file/);
  });
});
