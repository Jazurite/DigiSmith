import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildRows, buildJson, renderMarkdown, runTable, linkRulings, isOpen } from "./table.ts";
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

describe("fixing lines", () => {
  const ledgerOf = (lines: string[]) => parseVerdictEntries(["Review mode: role", ...lines, ""].join("\n"));
  function realShape() {
    const reviews: Review[] = [];
    const lines: string[] = [];
    for (let t = 1; t <= 7; t++) {
      reviews.push(review("task", String(t), 1, [f("F1"), f("F2"), f("F3")]));
      lines.push(
        `Review task ${t} r1: F1 -> fixing (commit check before the push)`, `Review task ${t} r1: F3 -> fixing`,
        `Review task ${t} r1: F1 -> fixed (6310adc)`, `Review task ${t} r1: F2 -> fixing`,
        `Review task ${t} r1: F2 -> parked (Maestro's rule *token*/*secret*, Jack decides, 6310adc)`,
        `Review task ${t} r1: F3 -> fixed (6310adc)`, `Review task ${t} r1: F2 -> fixed (6310adc)`,
      );
    }
    reviews.push(review("task", "2", 2, [f("F5")]));
    lines.push("Review task 2 r2: F5 -> fixing (check every commit, add-then-delete)", "Review task 2 r2: F5 -> fixed (cfb1b2f)");
    reviews.push(review("ticket", "final", 1, [f("F1"), f("F2")]), review("ticket", "final", 2, [f("F4")]),
      review("ticket", "final", 3, [f("F7")]), review("ticket", "final", 4, [f("F8")]));
    lines.push(
      "Review ticket final r1: F1 -> fixing", "Review ticket final r1: F2 -> fixing", "Review ticket final r1: F1 -> fixed (aaaaaaa)",
      "Review ticket final r1: F2 -> fixed (aaaaaaa)", "Review ticket final r2: F4 -> fixing (x)", "Review ticket final r2: F4 -> fixed (bbbbbbb)",
      "Review ticket final r3: F7 -> fixing (order: ...)", "Review ticket final r3: F7 -> fixed (8faa0a5)",
      "Review ticket final r4: F7 -> fixed (8faa0a5)", "Review ticket final r4: F8 -> fixing", "Review ticket final r4: F8 -> fixed (ccccccc)",
    );
    return { reviews, lines };
  }
  it("builds the real shape: 27 fixing lines never show, verdict cells are the final rulings", () => {
    const { reviews, lines } = realShape();
    expect(lines.filter((l) => l.endsWith("-> fixing") || / -> fixing \(/.test(l))).toHaveLength(27);
    const rows = buildRows(reviews, ledgerOf(lines));
    expect(JSON.stringify(rows)).not.toContain("fixing");
    const t1 = rows.filter((r) => r.type === "task 1" && r.round === 1);
    expect(t1.map((r) => r.verdict)).toEqual(["fixed (6310adc)", "fixed (6310adc)", "fixed (6310adc)"]);
    expect(rows.find((r) => r.type === "ticket" && r.round === 3)?.verdict).toBe("fixed (8faa0a5) [r4]");
  });
  it("keeps fixing in the JSON history while latest is the final ruling", () => {
    const e = parseVerdictEntries("Review task 1 r1: F1 -> fixing (x)\nReview task 1 r1: F1 -> fixed (abc1234)\n");
    const j = buildJson([review("task", "1", 1, [f("F1")])], e).findings[0];
    expect(j.history).toEqual([{ round: 1, verdict: "fixing", reason: "x" }, { round: 1, verdict: "fixed", reason: "abc1234" }]);
    expect(j.latestRound).toBe(1);
    expect(j.latestRuling).toEqual({ verdict: "fixed", reason: "abc1234" });
  });
  it("fails on a lone fixing line", () => {
    const e = parseVerdictEntries("# x\nReview task 1 r1: F1 -> fixing (x)\n");
    expect(() => buildRows([review("task", "1", 1, [f("F1")])], e)).toThrow(
      "ledger line 2: Review task 1 r1: F1 -> fixing (x): fix not finished for task 1 r1 F1",
    );
  });
  it("fails when fixed is followed by a later fixing", () => {
    const e = parseVerdictEntries("# x\nReview task 1 r1: F1 -> fixed\nReview task 1 r1: F1 -> fixing\n");
    expect(() => buildJson([review("task", "1", 1, [f("F1")])], e)).toThrow(
      "ledger line 3: Review task 1 r1: F1 -> fixing: fix not finished for task 1 r1 F1",
    );
  });
  it("names every unfinished finding in one error", () => {
    const e = parseVerdictEntries("Review task 1 r1: F2 -> fixing\nReview task 1 r1: F1 -> fixing\n");
    expect(() => buildRows([review("task", "1", 1, [f("F1"), f("F2")])], e)).toThrow(
      /line 1: .*fix not finished for task 1 r1 F2; ledger line 2: .*fix not finished for task 1 r1 F1/,
    );
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
  it("writes findings.md from a ledger with fixing lines and leaves the ledger bytes alone", () => {
    packWithF1();
    const ledger = path.join(ws, "progress.md");
    fs.writeFileSync(ledger, "Review mode: role\nReview task 4 r1: F1 -> fixing\nReview task 4 r1: F1 -> fixed (abc1234)\n");
    const before = fs.readFileSync(ledger);
    expect(runTable({ workspace: ws, out }).written).toBe(true);
    const md = fs.readFileSync(out, "utf8");
    expect(md).toContain("fixed (abc1234)");
    expect(md).not.toContain("fixing");
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

describe("no-findings ledger line", () => {
  const NF = "Review task 1 r1: no findings\n";
  it('buildRows gives the approved row for a no-findings review whose ledger line is "no findings"', () => {
    const rows = buildRows([review("task", "1", 1, [])], parseVerdictEntries(NF));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "task 1", what: "approved, no findings" });
  });
  it("buildJson lists it under approvedReviews", () => {
    expect(buildJson([review("task", "1", 1, [])], parseVerdictEntries(NF)).approvedReviews).toEqual([{ kind: "task", id: "1", round: 1 }]);
  });
  describe("runTable", () => {
    let ws: string;
    let out: string;
    beforeEach(() => {
      ws = fs.mkdtempSync(path.join(os.tmpdir(), "table-nf-"));
      out = path.join(ws, "findings.md");
    });
    afterEach(() => { fs.rmSync(ws, { recursive: true, force: true }); });
    const pack = (name: string, block: string) => {
      fs.mkdirSync(path.join(ws, "reviews", name), { recursive: true });
      fs.writeFileSync(path.join(ws, "reviews", name, "report.md"), "```json findings\n" + block + "\n```\n");
    };
    it("writes the table from a ledger holding a no-findings line next to a finding line", () => {
      pack("task-1-r1", "[]");
      pack("task-2-r1", '[{"id":"F1","path":"a.ts","line":1,"severity":"Minor","what":"w","scenario":"s"}]');
      fs.writeFileSync(path.join(ws, "progress.md"), NF + "Review task 2 r1: F1 -> fixed (commit abc1234)\n");
      expect(runTable({ workspace: ws, out }).written).toBe(true);
      const md = fs.readFileSync(out, "utf8");
      expect(md).toContain("approved, no findings");
      expect(md).toContain("fixed (commit abc1234)");
    });
    it("still fails on a malformed Review line", () => {
      pack("task-1-r1", "[]");
      fs.writeFileSync(path.join(ws, "progress.md"), "Review task 1 r1: nothing found\n");
      expect(() => runTable({ workspace: ws, out })).toThrow(/not a verdict line/);
    });
  });
});

describe("linkRulings", () => {
  const ledgerOf = (lines: string[]) => parseVerdictEntries(["Review mode: role", ...lines, ""].join("\n"));
  it("links a later round's ruling to the earlier raise, sorted by round", () => {
    const r3 = review("task", "1", 3, [f("F1")]);
    const out = linkRulings([r3], ledgerOf(["Review task 1 r4: F1 -> fixed (abc1234)", "Review task 1 r3: F1 -> fixing"]));
    expect(out.get(r3.findings[0])?.history.map((h) => [h.round, h.verdict])).toEqual([[3, "fixing"], [4, "fixed"]]);
  });
  it("skips a line no pack raised without throwing", () => {
    const r1 = review("task", "1", 1, [f("F1")]);
    const out = linkRulings([r1], ledgerOf(["Review task 9 r1: F1 -> fixed (abc1234)"]));
    expect(out.get(r1.findings[0])?.history).toEqual([]);
  });
  it("does not throw for an unjudged finding or a last fixing", () => {
    const r1 = review("task", "1", 1, [f("F1"), f("F2")]);
    const out = linkRulings([r1], ledgerOf(["Review task 1 r1: F2 -> fixing"]));
    expect(out.get(r1.findings[0])?.history).toEqual([]);
    expect(out.get(r1.findings[1])?.history).toHaveLength(1);
  });
});

describe("isOpen", () => {
  it("is open when empty or the last verdict is fixing", () => {
    expect(isOpen([])).toBe(true);
    expect(isOpen([{ verdict: "fixing" }])).toBe(true);
    expect(isOpen([{ verdict: "fixing" }, { verdict: "fixed" }])).toBe(false);
    expect(isOpen([{ verdict: "fixed" }, { verdict: "fixing" }])).toBe(true);
  });
});
