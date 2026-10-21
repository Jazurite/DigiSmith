import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildRows, buildJson, renderMarkdown, runTable } from "./table.ts";
import type { Review } from "./findings.ts";
import { parseVerdictEntries } from "./verdicts.ts";

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
    const j = parseVerdictEntries(
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
    const j = parseVerdictEntries("Review task 1 r1: F1 -> fixed\n");
    expect(() => buildRows(reviews, j)).toThrow(/task 1 r1 F2/);
  });
  it("fails on a verdict line that names no finding, naming line, id and packs", () => {
    const e = parseVerdictEntries("# x\nReview task 9 r1: F1 -> fixed\n");
    expect(() => buildRows([review("task", "1", 1, [])], e)).toThrow(
      /ledger line 2: Review task 9 r1: F1 -> fixed: no pack raised task 9 F1; packs read: task-1-r1/,
    );
  });
  it("accepts an r2 line for an r1 finding and shows the latest ruling and its round", () => {
    const reviews = [review("task", "4", 1, [f("F1")]), review("task", "4", 2, [])];
    const e = parseVerdictEntries("Review task 4 r1: F1 -> parked (wait)\nReview task 4 r2: F1 -> fixed (commit abc1234)\n");
    const rows = buildRows(reviews, e);
    expect(rows[0]).toMatchObject({ round: 1, verdict: "fixed (commit abc1234) [r2]" });
    expect(rows[1]).toMatchObject({ what: "approved, no findings" });
  });
  it("accepts an r2 line when the r1 line is missing", () => {
    const e = parseVerdictEntries("Review task 4 r2: F1 -> fixed (commit abc1234)\n");
    expect(buildRows([review("task", "4", 1, [f("F1")])], e)[0].verdict).toBe("fixed (commit abc1234) [r2]");
  });
  it("prefers the pack of the same round: r2 F1 is the r2 pack's own finding", () => {
    const reviews = [review("task", "4", 1, [f("F1")]), review("task", "4", 2, [f("F1", { what: "new problem" })])];
    const e = parseVerdictEntries("Review task 4 r1: F1 -> fixed\nReview task 4 r2: F1 -> rejected (not a bug)\n");
    const rows = buildRows(reviews, e);
    expect(rows.map((r) => [r.round, r.verdict])).toEqual([[1, "fixed"], [2, "rejected (not a bug)"]]);
  });
  it("lets the later ledger line win inside one round", () => {
    const e = parseVerdictEntries("Review task 1 r1: F1 -> parked (a)\nReview task 1 r1: F1 -> fixed (commit abc1234)\n");
    expect(buildRows([review("task", "1", 1, [f("F1")])], e)[0].verdict).toBe("fixed (commit abc1234)");
  });
  it("rejects a line whose round is below the round that raised the finding", () => {
    const e = parseVerdictEntries("Review task 1 r1: F1 -> fixed\n");
    expect(() => buildRows([review("task", "1", 2, [f("F1")])], e)).toThrow(/no pack raised task 1 F1/);
  });
});

describe("buildJson", () => {
  it("gives the empty model for no reviews (DGS-572)", () => {
    expect(buildJson([], [])).toEqual({ schema: 1, findings: [], approvedReviews: [] });
  });
  it("lists the findings of one review in the same order as buildRows (DGS-572)", () => {
    const reviews = [review("task", "1", 1, [f("F10", { path: "ten.ts" }), f("F2", { path: "two.ts" })])];
    const e = parseVerdictEntries("Review task 1 r1: F2 -> fixed (commit abc1234)\nReview task 1 r1: F10 -> fixed (commit abc1234)\n");
    expect(buildJson(reviews, e).findings.map((x) => x.id)).toEqual(["task 1 r1 F2", "task 1 r1 F10"]);
    expect(buildRows(reviews, e).map((x) => x.where)).toEqual(["two.ts:42", "ten.ts:42"]);
  });
  it("gives schema 1 with id, severity, rounds, latest ruling and history", () => {
    const reviews = [review("task", "4", 1, [f("F1")]), review("task", "4", 2, []), review("task", "7", 1, [])];
    const e = parseVerdictEntries("Review task 4 r1: F1 -> parked (wait)\nReview task 4 r2: F1 -> fixed (commit abc1234)\n");
    expect(buildJson(reviews, e)).toEqual({
      schema: 1,
      findings: [{
        id: "task 4 r1 F1", review: { kind: "task", id: "4" }, finding: "F1", severity: "Important",
        raisedRound: 1, latestRound: 2,
        latestRuling: { verdict: "fixed", reason: "commit abc1234" },
        history: [
          { round: 1, verdict: "parked", reason: "wait" },
          { round: 2, verdict: "fixed", reason: "commit abc1234" },
        ],
      }],
      approvedReviews: [{ kind: "task", id: "4", round: 2 }, { kind: "task", id: "7", round: 1 }],
    });
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
  function packWithF1(): void {
    fs.mkdirSync(path.join(ws, "reviews", "task-4-r1"), { recursive: true });
    fs.writeFileSync(
      path.join(ws, "reviews", "task-4-r1", "report.md"),
      '```json findings\n[{"id":"F1","path":"a.ts","line":1,"severity":"Minor","what":"w","scenario":"s"}]\n```\n',
    );
  }
  it("builds the table from an r2 ledger and leaves the ledger bytes alone", () => {
    packWithF1();
    const ledger = path.join(ws, "progress.md");
    fs.writeFileSync(ledger, "Review task 4 r1: F1 -> parked (wait)\nReview task 4 r2: F1 -> fixed (commit abc1234)\n");
    const before = fs.readFileSync(ledger);
    expect(runTable({ workspace: ws, out }).written).toBe(true);
    expect(fs.readFileSync(out, "utf8")).toContain("fixed (commit abc1234) [r2]");
    expect(fs.readFileSync(ledger).equals(before)).toBe(true);
  });
  it("prints JSON with --json and no --out, and writes it with --out", () => {
    packWithF1();
    fs.writeFileSync(path.join(ws, "progress.md"), "Review task 4 r1: F1 -> fixed\n");
    const r = runTable({ workspace: ws, json: true });
    expect(r.written).toBe(false);
    expect(JSON.parse(r.json as string).schema).toBe(1);
    const j = path.join(ws, "findings.json");
    expect(runTable({ workspace: ws, json: true, out: j }).written).toBe(true);
    expect(JSON.parse(fs.readFileSync(j, "utf8")).findings[0].id).toBe("task 4 r1 F1");
  });
  it("gives an empty model with --json when there are no reviews", () => {
    expect(JSON.parse(runTable({ workspace: ws, json: true }).json as string)).toEqual({ schema: 1, findings: [], approvedReviews: [] });
  });
  it("needs --out without --json", () => {
    expect(() => runTable({ workspace: ws })).toThrow(/--out is required/);
  });
});
