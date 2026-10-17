# Reviewer Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Reviewer one role: a card, a pack command, a table command, a role mode for SDD, a brief template and a model policy, with the by-hand path of SDD and `requesting-code-review` left intact.

**Architecture:** New `dg reviewer` command family in `packages/cli/src/reviewer/` (pure functions, file in, file out, no network). New skill `skills/reviewer/` (the card and the brief template). Additive edits to three vendored primitive prompts, to SDD's `SKILL.md` and to `report-implementation`. A one-line shell script reads the mode. Spec: `design.html` in this folder (approved at checkpoint 1, decisions in its section 14).

**Tech Stack:** TypeScript on Node 24 (`--experimental-strip-types`), yargs, Vitest, bash. pnpm only, never npm.

## Global Constraints

- Reviewer types are exactly `task` and `ticket`. One constant, `REVIEWER_TYPES`, in `packages/cli/src/reviewer/types.ts`.
- Severities are exactly `Critical`, `Important`, `Minor`.
- Model ids: `claude-sonnet-5-5` and `claude-opus-5-5`. `task` gets Sonnet 5.5, and Opus 5.5 when the diff has more than `TASK_ESCALATE_LINES = 800` changed lines. `ticket` always gets Opus 5.5. Ids and limit live in `types.ts` only. The role picks the model. The conductor and the Builder never pick it.
- The marker lines are exactly `STOP: task-review-ready <pack path>` and `STOP: ticket-review-ready <pack path>`. The ledger lines are exactly `Task N: review requested` and `Task final: review requested`.
- The mode switch: environment variable `DIGISMITH_REVIEW_MODE`. Only the exact value `role` means role mode. Anything else, and unset, means hand mode. The ledger line is `Review mode: role` or `Review mode: hand`.
- Pack folder: `<sdd workspace>/reviews/<type>-<id>-r<round>/`. `<id>` is the task number, or `final` for `ticket`. Files in it: `pack.md` (the manifest), and, written later by the Reviewer, `report.md`.
- The findings block is one fenced block with the info string `json findings`, at the end of `report.md`. It holds a JSON array of `{ "id": "F1", "path": "...", "line": 42, "severity": "Important", "what": "...", "scenario": "..." }`. `line` is an integer of 1 or more, or `null`. An approved review with no findings writes `[]`.
- Verdict lines in the SDD ledger have exactly this form: `Review <task|ticket> <id> r<round>: F<n> -> <fixed|parked|rejected> (<reason>)`. A reason is required for `parked` and `rejected`, optional for `fixed`.
- The table columns, in order: `Reviewer type`, `Round`, `Path:line`, `Severity`, `What is wrong`, `Failing scenario`, `Verdict`. The file is `findings.md` in the board folder.
- Edits to the three primitive prompts and to SDD's `SKILL.md` are additive: no existing line is deleted or rewritten. Old dispatch text stays for hand mode.
- The owner header text on the three primitive files is exactly: `Used by the Reviewer role (DGS-529). In role mode a conductor or a Maestro starts this review, never a Builder. Outside role mode it runs as before.`
- A Builder never starts or runs a review in role mode. The reviewer card's legal parents are `conductor` and `maestro` only.
- Commits: title only, conventional style, no AI attribution lines. Tests: `pnpm exec vitest run <path>` from the repo root. Build check: `pnpm --filter @digismith/cli build`.
- Code style: double quotes, semicolons, 2-space indent, `.ts` import extensions (see `packages/cli/src/sessions/cleanup.ts`). Code under `packages/cli/src` must not import from `scripts/` (outside the build's `rootDir`). Tests may.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/cli/src/reviewer/types.ts` | Constants, `modelFor`, `countChangedLines` |
| `packages/cli/src/reviewer/findings.ts` | Parse the findings block out of a report; read all reviews of a workspace |
| `packages/cli/src/reviewer/verdicts.ts` | Parse verdict lines out of the ledger |
| `packages/cli/src/reviewer/table.ts` | Join findings and verdicts into rows; render markdown; `runTable` |
| `packages/cli/src/reviewer/pack.ts` | Build a review pack folder and its manifest; pick the model |
| `packages/cli/src/reviewer/index.ts` | The `dg reviewer` command group: `table`, `pack` |
| `packages/cli/src/index.ts` | Register `reviewerCommand` |
| `scripts/session-card.ts` | Card fields `reviewer_type`, `seat`; reviewer parents |
| `skills/subagent-driven-development/scripts/review-mode` | Prints `role` or `hand` |
| `skills/reviewer/SKILL.md`, `skills/reviewer/brief.md` | The card and the brief template |
| three primitive prompts, SDD `SKILL.md`, `report-implementation/SKILL.md`, `vendored/PROVENANCE.md` | Additive edits |

Tests sit next to their files (`*.test.ts`).

---

### Task 1: Constants, model policy and diff line count

**Files:**
- Create: `packages/cli/src/reviewer/types.ts`
- Test: `packages/cli/src/reviewer/types.test.ts`

**Interfaces:**
- Produces: `REVIEWER_TYPES`, `ReviewerType`, `SEVERITIES`, `Severity`, `SONNET`, `OPUS`, `TASK_ESCALATE_LINES`, `modelFor(type: ReviewerType, changedLines: number): string`, `countChangedLines(diff: string): number`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/types.test.ts
import { describe, it, expect } from "vitest";
import { REVIEWER_TYPES, SEVERITIES, SONNET, OPUS, TASK_ESCALATE_LINES, modelFor, countChangedLines } from "./types.ts";

describe("constants", () => {
  it("has exactly the two types and three severities", () => {
    expect([...REVIEWER_TYPES]).toEqual(["task", "ticket"]);
    expect([...SEVERITIES]).toEqual(["Critical", "Important", "Minor"]);
  });
  it("holds the model ids and the limit", () => {
    expect(SONNET).toBe("claude-sonnet-5-5");
    expect(OPUS).toBe("claude-opus-5-5");
    expect(TASK_ESCALATE_LINES).toBe(800);
  });
});

describe("modelFor", () => {
  it("gives Sonnet to a task at or under the limit", () => {
    expect(modelFor("task", 0)).toBe(SONNET);
    expect(modelFor("task", 800)).toBe(SONNET);
  });
  it("gives Opus to a task over the limit", () => {
    expect(modelFor("task", 801)).toBe(OPUS);
  });
  it("always gives Opus to a ticket", () => {
    expect(modelFor("ticket", 0)).toBe(OPUS);
    expect(modelFor("ticket", 5000)).toBe(OPUS);
  });
});

describe("countChangedLines", () => {
  const diff = [
    "# Review package: a1b2c3d..e4f5a6b",
    "",
    "- e4f5a6b fix: something",
    "",
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1,2 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "+added",
  ].join("\n");
  it("counts added and removed lines, not file headers", () => {
    expect(countChangedLines(diff)).toBe(3);
  });
  it("counts nothing before the first diff header", () => {
    expect(countChangedLines("- a commit line\n+ not a diff line\n")).toBe(0);
  });
  it("counts across two files", () => {
    const two = `${diff}\ndiff --git a/y.ts b/y.ts\n--- a/y.ts\n+++ b/y.ts\n@@ -1 +1 @@\n-a\n+b\n`;
    expect(countChangedLines(two)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/types.test.ts`
Expected: FAIL (cannot find module `./types.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/reviewer/types.ts
export const REVIEWER_TYPES = ["task", "ticket"] as const;
export type ReviewerType = (typeof REVIEWER_TYPES)[number];

export const SEVERITIES = ["Critical", "Important", "Minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

// The model policy lives here and nowhere else. The role picks the model for a review.
export const SONNET = "claude-sonnet-5-5";
export const OPUS = "claude-opus-5-5";
export const TASK_ESCALATE_LINES = 800;

export function modelFor(type: ReviewerType, changedLines: number): string {
  if (type === "ticket") return OPUS;
  return changedLines > TASK_ESCALATE_LINES ? OPUS : SONNET;
}

const FILE_HEADER_RE = /^(?:\+\+\+|---) (?:a\/|b\/|\/dev\/null)/;

// Counts + and - lines of the diff part of a review package. The part before the first
// "diff --git" line is the commit list and the stat summary, so it is skipped.
export function countChangedLines(diff: string): number {
  let inDiff = false;
  let n = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) { inDiff = true; continue; }
    if (!inDiff || FILE_HEADER_RE.test(line)) continue;
    if (line.startsWith("+") || line.startsWith("-")) n++;
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/types.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/types.ts packages/cli/src/reviewer/types.test.ts
git commit -m "feat(dgs-529): add the reviewer constants and model policy"
```

---

### Task 2: Findings block parser

**Files:**
- Create: `packages/cli/src/reviewer/findings.ts`
- Test: `packages/cli/src/reviewer/findings.test.ts`

**Interfaces:**
- Consumes: `REVIEWER_TYPES`, `SEVERITIES`, `ReviewerType`, `Severity` from `./types.ts`.
- Produces: `type Finding = { id: string; path: string; line: number | null; severity: Severity; what: string; scenario: string }`, `type Review = { kind: ReviewerType; id: string; round: number; file: string; findings: Finding[] }`, `parseFindings(json: string, source: string): Finding[]`, `extractFindings(report: string, source: string): Finding[]`, `readReviews(workspace: string): Review[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/findings.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseFindings, extractFindings, readReviews } from "./findings.ts";

const good = {
  id: "F1", path: "src/a.ts", line: 42, severity: "Important",
  what: "leaks a path", scenario: "run the build",
};

describe("parseFindings", () => {
  it("accepts a good array and an empty array", () => {
    expect(parseFindings(JSON.stringify([good]), "r")).toEqual([good]);
    expect(parseFindings("[]", "r")).toEqual([]);
  });
  it("accepts a null line", () => {
    expect(parseFindings(JSON.stringify([{ ...good, line: null }]), "r")[0].line).toBeNull();
  });
  it("names the source on invalid JSON", () => {
    expect(() => parseFindings("{", "report.md")).toThrow(/report\.md: .*JSON/);
  });
  it("rejects a non-array", () => {
    expect(() => parseFindings("{}", "r")).toThrow(/array/);
  });
  it("rejects a bad id, severity, line, empty what, duplicate id", () => {
    expect(() => parseFindings(JSON.stringify([{ ...good, id: "1" }]), "r")).toThrow(/id/);
    expect(() => parseFindings(JSON.stringify([{ ...good, severity: "High" }]), "r")).toThrow(/severity/);
    expect(() => parseFindings(JSON.stringify([{ ...good, line: 0 }]), "r")).toThrow(/line/);
    expect(() => parseFindings(JSON.stringify([{ ...good, what: "" }]), "r")).toThrow(/what/);
    expect(() => parseFindings(JSON.stringify([good, good]), "r")).toThrow(/duplicate/);
  });
});

describe("extractFindings", () => {
  const block = (json: string) => "```json findings\n" + json + "\n```";
  it("reads the last findings block of a report", () => {
    const report = `text\n${block("[]")}\nmore\n${block(JSON.stringify([good]))}\n`;
    expect(extractFindings(report, "r")).toEqual([good]);
  });
  it("ignores a plain json block", () => {
    expect(() => extractFindings("```json\n[]\n```\n", "r")).toThrow(/no "json findings" block/);
  });
  it("fails when there is no block", () => {
    expect(() => extractFindings("no block here", "report.md")).toThrow(/report\.md: no "json findings" block/);
  });
});

describe("readReviews", () => {
  let ws: string;
  beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), "reviews-")); });
  afterEach(() => { fs.rmSync(ws, { recursive: true, force: true }); });
  const put = (dir: string, report?: string) => {
    fs.mkdirSync(path.join(ws, "reviews", dir), { recursive: true });
    if (report !== undefined) fs.writeFileSync(path.join(ws, "reviews", dir, "report.md"), report);
  };
  it("returns nothing when there is no reviews folder", () => {
    expect(readReviews(ws)).toEqual([]);
  });
  it("reads every pack folder with its kind, id and round", () => {
    put("task-7-r2", "```json findings\n[]\n```\n");
    put("ticket-final-r1", "```json findings\n" + JSON.stringify([good]) + "\n```\n");
    const r = readReviews(ws);
    expect(r.map((x) => [x.kind, x.id, x.round])).toEqual([["task", "7", 2], ["ticket", "final", 1]]);
    expect(r[1].findings).toEqual([good]);
  });
  it("ignores folders and files that are not packs", () => {
    put("notes");
    fs.writeFileSync(path.join(ws, "reviews", "stray.txt"), "x");
    expect(readReviews(ws)).toEqual([]);
  });
  it("fails on a pack with no report", () => {
    put("task-3-r1");
    expect(() => readReviews(ws)).toThrow(/task-3-r1: no report\.md/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/findings.test.ts`
Expected: FAIL (cannot find module `./findings.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/reviewer/findings.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { REVIEWER_TYPES, SEVERITIES, type ReviewerType, type Severity } from "./types.ts";

export type Finding = {
  id: string;
  path: string;
  line: number | null;
  severity: Severity;
  what: string;
  scenario: string;
};

export type Review = { kind: ReviewerType; id: string; round: number; file: string; findings: Finding[] };

const FENCE_RE = /^```json findings[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
const PACK_DIR_RE = new RegExp(`^(${REVIEWER_TYPES.join("|")})-(\\d+|final)-r(\\d+)$`);

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

export function parseFindings(json: string, source: string): Finding[] {
  let data: unknown;
  try { data = JSON.parse(json); } catch (e) { throw new Error(`${source}: findings block is not valid JSON (${(e as Error).message})`); }
  if (!Array.isArray(data)) throw new Error(`${source}: findings block must be a JSON array`);
  const seen = new Set<string>();
  return data.map((raw, i) => {
    const f = raw as Record<string, unknown>;
    const at = `${source}: finding ${i + 1}`;
    if (typeof f !== "object" || f === null) throw new Error(`${at}: must be an object`);
    if (typeof f.id !== "string" || !/^F\d+$/.test(f.id)) throw new Error(`${at}: id must look like F1`);
    if (seen.has(f.id)) throw new Error(`${at}: duplicate id ${f.id}`);
    seen.add(f.id);
    if (!nonEmpty(f.path)) throw new Error(`${at}: path must not be empty`);
    if (f.line !== null && !(Number.isInteger(f.line) && (f.line as number) >= 1)) throw new Error(`${at}: line must be an integer of 1 or more, or null`);
    if (!(SEVERITIES as readonly unknown[]).includes(f.severity)) throw new Error(`${at}: severity must be one of ${SEVERITIES.join(", ")}`);
    if (!nonEmpty(f.what)) throw new Error(`${at}: what must not be empty`);
    if (typeof f.scenario !== "string") throw new Error(`${at}: scenario must be a string`);
    return { id: f.id, path: f.path, line: f.line as number | null, severity: f.severity as Severity, what: f.what, scenario: f.scenario };
  });
}

// The last "json findings" block wins: a report may quote an earlier block.
export function extractFindings(report: string, source: string): Finding[] {
  const blocks = [...report.matchAll(FENCE_RE)];
  if (blocks.length === 0) throw new Error(`${source}: no "json findings" block`);
  return parseFindings(blocks[blocks.length - 1][1], source);
}

export function readReviews(workspace: string): Review[] {
  const root = path.join(workspace, "reviews");
  if (!fs.existsSync(root)) return [];
  const reviews: Review[] = [];
  for (const name of fs.readdirSync(root).sort()) {
    const m = PACK_DIR_RE.exec(name);
    if (!m || !fs.statSync(path.join(root, name)).isDirectory()) continue;
    const file = path.join(root, name, "report.md");
    if (!fs.existsSync(file)) throw new Error(`${name}: no report.md`);
    reviews.push({
      kind: m[1] as ReviewerType, id: m[2], round: Number(m[3]), file,
      findings: extractFindings(fs.readFileSync(file, "utf8"), file),
    });
  }
  return reviews;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/findings.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/findings.ts packages/cli/src/reviewer/findings.test.ts
git commit -m "feat(dgs-529): parse the findings block of a review report"
```

---

### Task 3: Verdict line parser

**Files:**
- Create: `packages/cli/src/reviewer/verdicts.ts`
- Test: `packages/cli/src/reviewer/verdicts.test.ts`

**Interfaces:**
- Produces: `VERDICTS`, `type Verdict`, `type Judgement = { verdict: Verdict; reason: string }`, `judgementKey(kind: string, id: string, round: number, findingId: string): string`, `parseVerdictLines(ledger: string): Map<string, Judgement>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/verdicts.test.ts
import { describe, it, expect } from "vitest";
import { parseVerdictLines, judgementKey } from "./verdicts.ts";

describe("parseVerdictLines", () => {
  const ledger = [
    "# SDD ledger — plan: plan.md",
    "Task 1: complete (commits a..b, review clean)",
    "Review ticket final r1: F1 -> fixed (commit a7f3c2d)",
    "Review task 7 r2: F2 -> parked (reviewer wrong: the test asserts the cap)",
    "- Review task 3 r1: F1 -> rejected (out of scope per plan line 40)",
    "Review task 4 r1: F1 -> fixed",
  ].join("\n");

  it("reads every verdict line and ignores other ledger lines", () => {
    const m = parseVerdictLines(ledger);
    expect(m.size).toBe(4);
    expect(m.get(judgementKey("ticket", "final", 1, "F1"))).toEqual({ verdict: "fixed", reason: "commit a7f3c2d" });
    expect(m.get(judgementKey("task", "7", 2, "F2"))).toEqual({ verdict: "parked", reason: "reviewer wrong: the test asserts the cap" });
    expect(m.get(judgementKey("task", "3", 1, "F1"))?.verdict).toBe("rejected");
    expect(m.get(judgementKey("task", "4", 1, "F1"))).toEqual({ verdict: "fixed", reason: "" });
  });
  it("lets a later line replace an earlier one for the same finding", () => {
    const m = parseVerdictLines("Review task 1 r1: F1 -> parked (later)\nReview task 1 r1: F1 -> fixed (commit abc1234)\n");
    expect(m.get(judgementKey("task", "1", 1, "F1"))?.verdict).toBe("fixed");
  });
  it("fails on a Review line that is not a verdict line, with its line number", () => {
    expect(() => parseVerdictLines("ok\nReview task 1 r1: F1 -> maybe (x)\n")).toThrow(/ledger line 2/);
  });
  it("requires a reason for parked and rejected", () => {
    expect(() => parseVerdictLines("Review task 1 r1: F1 -> parked\n")).toThrow(/reason/);
    expect(() => parseVerdictLines("Review task 1 r1: F1 -> rejected ()\n")).toThrow(/ledger line 1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/verdicts.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/reviewer/verdicts.ts
export const VERDICTS = ["fixed", "parked", "rejected"] as const;
export type Verdict = (typeof VERDICTS)[number];
export type Judgement = { verdict: Verdict; reason: string };

const LINE_RE = /^Review (task|ticket) (\d+|final) r(\d+): (F\d+) -> (fixed|parked|rejected)(?: \((.+)\))?$/;

export function judgementKey(kind: string, id: string, round: number, findingId: string): string {
  return `${kind} ${id} r${round} ${findingId}`;
}

export function parseVerdictLines(ledger: string): Map<string, Judgement> {
  const out = new Map<string, Judgement>();
  ledger.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^- /, "");
    if (!line.startsWith("Review ")) return;
    const m = LINE_RE.exec(line);
    if (!m) throw new Error(`ledger line ${i + 1}: not a verdict line: ${line}`);
    const verdict = m[5] as Verdict;
    const reason = m[6] ?? "";
    if (verdict !== "fixed" && reason === "") throw new Error(`ledger line ${i + 1}: a reason is required for ${verdict}`);
    out.set(judgementKey(m[1], m[2], Number(m[3]), m[4]), { verdict, reason });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/verdicts.test.ts`
Expected: PASS. (The test `rejected ()` fails the regex because `.+` needs one character inside the parentheses, so the line-number error is the right one.)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/verdicts.ts packages/cli/src/reviewer/verdicts.test.ts
git commit -m "feat(dgs-529): parse review verdict lines from the SDD ledger"
```

---

### Task 4: Table rows, markdown and `runTable`

**Files:**
- Create: `packages/cli/src/reviewer/table.ts`
- Test: `packages/cli/src/reviewer/table.test.ts`

**Interfaces:**
- Consumes: `Review` (Task 2), `Judgement`, `judgementKey`, `parseVerdictLines` (Task 3), `readReviews` (Task 2), `REVIEWER_TYPES`.
- Produces: `type Row`, `buildRows(reviews: Review[], judgements: Map<string, Judgement>): Row[]`, `renderMarkdown(rows: Row[]): string`, `runTable(opts: { workspace: string; ledger?: string; out: string }): { written: boolean; message: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/table.test.ts
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
  it("fails when the workspace folder is gone", () => {
    expect(() => runTable({ workspace: path.join(ws, "nope"), out })).toThrow(/workspace: no such folder/);
  });
  it("fails when reviews exist but the ledger is missing", () => {
    fs.mkdirSync(path.join(ws, "reviews", "task-1-r1"), { recursive: true });
    fs.writeFileSync(path.join(ws, "reviews", "task-1-r1", "report.md"), "```json findings\n[]\n```\n");
    expect(() => runTable({ workspace: ws, out })).toThrow(/ledger: no such file/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/table.test.ts`
Expected: FAIL (cannot find module `./table.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/reviewer/table.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { readReviews, type Review } from "./findings.ts";
import { judgementKey, parseVerdictLines, type Judgement } from "./verdicts.ts";
import { REVIEWER_TYPES } from "./types.ts";

export type Row = {
  type: string;
  round: number;
  where: string;
  severity: string;
  what: string;
  scenario: string;
  verdict: string;
};

const HEADER = ["Reviewer type", "Round", "Path:line", "Severity", "What is wrong", "Failing scenario", "Verdict"];

function orderKey(r: Review): [number, number, number] {
  const id = r.id === "final" ? Number.MAX_SAFE_INTEGER : Number(r.id);
  return [REVIEWER_TYPES.indexOf(r.kind), id, r.round];
}

function typeLabel(r: Review): string {
  return r.kind === "task" ? `task ${r.id}` : "ticket";
}

export function buildRows(reviews: Review[], judgements: Map<string, Judgement>): Row[] {
  const sorted = [...reviews].sort((a, b) => {
    const [ak, bk] = [orderKey(a), orderKey(b)];
    return ak[0] - bk[0] || ak[1] - bk[1] || ak[2] - bk[2];
  });
  const used = new Set<string>();
  const unjudged: string[] = [];
  const rows: Row[] = [];
  for (const r of sorted) {
    if (r.findings.length === 0) {
      rows.push({ type: typeLabel(r), round: r.round, where: "-", severity: "-", what: "approved, no findings", scenario: "-", verdict: "-" });
      continue;
    }
    for (const f of [...r.findings].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
      const key = judgementKey(r.kind, r.id, r.round, f.id);
      const j = judgements.get(key);
      if (!j) { unjudged.push(key); continue; }
      used.add(key);
      rows.push({
        type: typeLabel(r), round: r.round,
        where: f.line === null ? f.path : `${f.path}:${f.line}`,
        severity: f.severity, what: f.what, scenario: f.scenario,
        verdict: j.reason === "" ? j.verdict : `${j.verdict} (${j.reason})`,
      });
    }
  }
  if (unjudged.length > 0) throw new Error(`findings with no verdict line: ${unjudged.join(", ")}`);
  const orphans = [...judgements.keys()].filter((k) => !used.has(k));
  if (orphans.length > 0) throw new Error(`verdict line names no finding: ${orphans.join(", ")}`);
  return rows;
}

const cell = (v: string | number): string => {
  const s = String(v).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  return s === "" ? "-" : s;
};

export function renderMarkdown(rows: Row[]): string {
  const lines = [
    "# Review findings",
    "",
    `| ${HEADER.join(" | ")} |`,
    `| ${HEADER.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${[r.type, r.round, r.where, r.severity, r.what, r.scenario, r.verdict].map(cell).join(" | ")} |`),
    "",
  ];
  return lines.join("\n");
}

export function runTable(opts: { workspace: string; ledger?: string; out: string }): { written: boolean; message: string } {
  if (!fs.existsSync(opts.workspace) || !fs.statSync(opts.workspace).isDirectory()) {
    throw new Error(`workspace: no such folder: ${opts.workspace}`);
  }
  const reviews = readReviews(opts.workspace);
  if (reviews.length === 0) return { written: false, message: "no reviews found" };
  const ledger = opts.ledger ?? path.join(opts.workspace, "progress.md");
  if (!fs.existsSync(ledger)) throw new Error(`ledger: no such file: ${ledger}`);
  const rows = buildRows(reviews, parseVerdictLines(fs.readFileSync(ledger, "utf8")));
  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  fs.writeFileSync(opts.out, renderMarkdown(rows));
  return { written: true, message: `wrote ${opts.out} (${rows.length} row(s))` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/table.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/table.ts packages/cli/src/reviewer/table.test.ts
git commit -m "feat(dgs-529): build the review findings table"
```

---

### Task 5: The review pack and its manifest

**Files:**
- Create: `packages/cli/src/reviewer/pack.ts`
- Test: `packages/cli/src/reviewer/pack.test.ts`

**Interfaces:**
- Consumes: `REVIEWER_TYPES`, `ReviewerType`, `countChangedLines`, `modelFor` from `./types.ts`.
- Produces: `type PackInput`, `buildPack(input: PackInput): { dir: string; model: string }`.

`PackInput` (all paths may be relative; they are resolved to absolute):
```ts
export type PackInput = {
  type: ReviewerType;
  id: string;            // task number, or "final" for ticket
  round: number;         // 1 = first review, 2+ = re-review
  workspace: string;     // the SDD workspace folder
  base: string;          // commit before the work under review
  head: string;
  diff: string;          // output of review-package (it starts with "# Review package: ")
  plan: string;
  brief?: string;        // task round 1: task-brief output
  report?: string;       // task: the implementer's report (fix reports are appended to it)
  constraints?: string;  // task round 1, optional: the global constraints, as a file
  ticketFile?: string;   // ticket round 1
  spec?: string;         // ticket round 1
  ledger?: string;       // ticket round 1: source of carry-over.md
  findingsIn?: string;   // round 2+: the open findings, as a file
  fixBase?: string;      // round 2+: the head the previous review saw
  standards: string[];   // paths the brief names
};
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/pack.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/pack.test.ts`
Expected: FAIL (cannot find module `./pack.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/reviewer/pack.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { REVIEWER_TYPES, countChangedLines, modelFor, type ReviewerType } from "./types.ts";

export type PackInput = {
  type: ReviewerType;
  id: string;
  round: number;
  workspace: string;
  base: string;
  head: string;
  diff: string;
  plan: string;
  brief?: string;
  report?: string;
  constraints?: string;
  ticketFile?: string;
  spec?: string;
  ledger?: string;
  findingsIn?: string;
  fixBase?: string;
  standards: string[];
};

const PRIMITIVE: Record<ReviewerType, string> = { task: "task-reviewer-prompt.md", ticket: "code-reviewer.md" };
const RE_REVIEW = "re-review-prompt.md";
const SHA_RE = /^[0-9a-f]{7,40}$/;
const CARRY_RE = /^Task (?:\d+|final): (?:minor \(deferred\)|parked)\b/;

function file(label: string, p: string | undefined): string {
  if (p === undefined || p === "") throw new Error(`${label}: required`);
  const abs = path.resolve(p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error(`${label}: no such file: ${abs}`);
  return abs;
}

function sha(label: string, v: string): string {
  if (!SHA_RE.test(v)) throw new Error(`${label}: must be a commit hash of 7 to 40 hex characters`);
  return v;
}

export function buildPack(input: PackInput): { dir: string; model: string } {
  if (!(REVIEWER_TYPES as readonly string[]).includes(input.type)) throw new Error(`type: must be one of ${REVIEWER_TYPES.join(", ")}`);
  if (input.type === "task" && !/^\d+$/.test(input.id)) throw new Error("id: a task review needs the task number");
  if (input.type === "ticket" && input.id !== "final") throw new Error("id: a ticket review has the id final");
  if (!Number.isInteger(input.round) || input.round < 1) throw new Error("round: must be an integer of 1 or more");
  const base = sha("base", input.base);
  const head = sha("head", input.head);

  const diff = file("diff", input.diff);
  const diffText = fs.readFileSync(diff, "utf8");
  if (!/^# Review package: /.test(diffText)) throw new Error("diff: not a review package (run review-package first)");

  const files: Array<[string, string]> = [["diff", diff]];
  let carry: string | undefined;
  let fixBase: string | undefined;
  if (input.round === 1) {
    if (input.type === "task") {
      files.push(["brief", file("brief", input.brief)], ["report", file("report", input.report)]);
      if (input.constraints !== undefined) files.push(["constraints", file("constraints", input.constraints)]);
    } else {
      files.push(["ticket", file("ticket-file", input.ticketFile)], ["spec", file("spec", input.spec)], ["plan", file("plan", input.plan)]);
      const ledger = fs.readFileSync(file("ledger", input.ledger), "utf8");
      carry = ledger.split(/\r?\n/).filter((l) => CARRY_RE.test(l)).join("\n");
    }
  } else {
    files.push(["findings", file("findings-in", input.findingsIn)]);
    if (input.fixBase === undefined || input.fixBase === "") throw new Error("fix-base: required for a re-review");
    fixBase = sha("fix-base", input.fixBase);
    if (input.type === "task") files.push(["brief", file("brief", input.brief)], ["report", file("report", input.report)]);
  }
  const standards = input.standards.map((s, i) => file(`standards[${i}]`, s));

  const dir = path.join(path.resolve(input.workspace), "reviews", `${input.type}-${input.id}-r${input.round}`);
  if (fs.existsSync(dir)) throw new Error(`pack exists: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  if (carry !== undefined) {
    const carryFile = path.join(dir, "carry-over.md");
    fs.writeFileSync(carryFile, carry === "" ? "none\n" : `${carry}\n`);
    files.push(["carry-over", carryFile]);
  }

  const model = modelFor(input.type, countChangedLines(diffText));
  const label = input.type === "task" ? `task ${input.id}` : "ticket";
  const manifest = [
    `# Review pack: ${label} round ${input.round}`,
    "",
    `type: ${input.type}`,
    `id: ${input.id}`,
    `round: ${input.round}`,
    `model: ${model}`,
    `base: ${base}`,
    `head: ${head}`,
    ...(fixBase !== undefined ? [`fix_base: ${fixBase}`] : []),
    `primitive: ${input.round === 1 ? PRIMITIVE[input.type] : RE_REVIEW}`,
    `report_out: ${path.join(dir, "report.md")}`,
    "",
    "## Files",
    ...files.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Standards",
    ...(standards.length > 0 ? standards.map((s) => `- ${s}`) : ["- none"]),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "pack.md"), manifest);
  return { dir, model };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/pack.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/pack.ts packages/cli/src/reviewer/pack.test.ts
git commit -m "feat(dgs-529): build the review pack and pick the model"
```

---

### Task 6: The `dg reviewer` command group

**Files:**
- Create: `packages/cli/src/reviewer/index.ts`
- Modify: `packages/cli/src/index.ts` (import and `.command(reviewerCommand)`)
- Test: `packages/cli/src/reviewer/index.test.ts`

**Interfaces:**
- Consumes: `buildPack`, `PackInput` (Task 5); `runTable` (Task 4).
- Produces: default export `reviewerCommand: CommandModule`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/index.test.ts
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
  it("is registered, with its two commands", () => {
    expect.assertions(4);
    expect(buildCli([]).getHelp()).resolves.toMatch(/reviewer/);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/index.test.ts`
Expected: FAIL (reviewer command is not registered; `getHelp` lacks "reviewer table").

- [ ] **Step 3: Write the implementation**

```ts
// packages/cli/src/reviewer/index.ts
import type { CommandModule } from "yargs";
import { buildPack } from "./pack.ts";
import { runTable } from "./table.ts";
import { REVIEWER_TYPES, type ReviewerType } from "./types.ts";

interface TableArgs { workspace: string; ledger?: string; out: string }
interface PackArgs {
  type: ReviewerType; task?: number; round: number; workspace: string; base: string; head: string;
  diff: string; plan?: string; brief?: string; report?: string; constraints?: string;
  "ticket-file"?: string; spec?: string; ledger?: string; "findings-in"?: string; "fix-base"?: string;
  standards?: string[];
}

function fail(e: unknown): void {
  console.error(`error: ${(e as Error).message}`);
  process.exitCode = 1;
}

const tableCommand: CommandModule<object, TableArgs> = {
  command: "table",
  describe: "build findings.md from the reviews and verdict lines of an SDD workspace",
  builder: (y) =>
    y
      .option("workspace", { type: "string", demandOption: true, describe: "the SDD workspace folder (skills/subagent-driven-development/scripts/sdd-workspace PLAN prints it)" })
      .option("ledger", { type: "string", describe: "the ledger file (default: <workspace>/progress.md)" })
      .option("out", { type: "string", demandOption: true, describe: "the findings.md file to write" }),
  handler: (args) => {
    try {
      console.log(runTable({ workspace: args.workspace, ledger: args.ledger, out: args.out }).message);
    } catch (e) {
      fail(e);
    }
  },
};

const packCommand: CommandModule<object, PackArgs> = {
  command: "pack",
  describe: "build the input folder (pack.md and files) of one review and print its model",
  builder: (y) =>
    y
      .option("type", { type: "string", choices: [...REVIEWER_TYPES], demandOption: true })
      .option("task", { type: "number", describe: "the task number (type task)" })
      .option("round", { type: "number", default: 1, describe: "1 = first review, 2 or more = re-review" })
      .option("workspace", { type: "string", demandOption: true })
      .option("base", { type: "string", demandOption: true })
      .option("head", { type: "string", demandOption: true })
      .option("diff", { type: "string", demandOption: true, describe: "the file review-package wrote" })
      .option("plan", { type: "string" })
      .option("brief", { type: "string" })
      .option("report", { type: "string" })
      .option("constraints", { type: "string" })
      .option("ticket-file", { type: "string" })
      .option("spec", { type: "string" })
      .option("ledger", { type: "string" })
      .option("findings-in", { type: "string" })
      .option("fix-base", { type: "string" })
      .option("standards", { type: "string", array: true, default: [] }),
  handler: (args) => {
    try {
      const id = args.type === "ticket" ? "final" : String(args.task ?? "");
      const { dir, model } = buildPack({
        type: args.type, id, round: args.round, workspace: args.workspace, base: args.base, head: args.head,
        diff: args.diff, plan: args.plan ?? "", brief: args.brief, report: args.report, constraints: args.constraints,
        ticketFile: args["ticket-file"], spec: args.spec, ledger: args.ledger,
        findingsIn: args["findings-in"], fixBase: args["fix-base"], standards: args.standards ?? [],
      });
      console.log(`pack: ${dir}`);
      console.log(`model: ${model}`);
    } catch (e) {
      fail(e);
    }
  },
};

const reviewerCommand: CommandModule = {
  command: "reviewer",
  describe: "the Reviewer role: review packs and the findings table",
  builder: (y) => y.command(tableCommand).command(packCommand).demandCommand(1, ""),
  handler: () => {},
};

export default reviewerCommand;
```

Then edit `packages/cli/src/index.ts`: after `import sessionsCommand from "./sessions/index.ts";` add `import reviewerCommand from "./reviewer/index.ts";`, and after `.command(sessionsCommand)` add `.command(reviewerCommand)`. (If the Steward merge already added `stewardCommand` lines nearby, keep them; add these beside.)

Note on `plan`: `PackInput.plan` is a required string. For `task` packs the plan file is not used; the command passes `""` when not given, and `buildPack` only validates `plan` for ticket round 1. Do not add a file check for task packs.

- [ ] **Step 4: Run test and the build to verify**

Run: `pnpm exec vitest run packages/cli/src/reviewer/index.test.ts && pnpm --filter @digismith/cli build`
Expected: tests PASS; `tsc` build exits 0. If `tsc` reports a yargs typing error in `index.ts`, fix the types in this file only (for example cast the `choices` option to `ReviewerType`).

- [ ] **Step 5: Run the whole reviewer folder and the cli e2e help test, then commit**

Run: `pnpm exec vitest run packages/cli/src/reviewer packages/cli/src/index.test.ts`
Expected: PASS.

```bash
git add packages/cli/src/reviewer/index.ts packages/cli/src/reviewer/index.test.ts packages/cli/src/index.ts
git commit -m "feat(dgs-529): add dg reviewer pack and table"
```

---

### Task 7: Session card fields and the reviewer's legal parents

**Files:**
- Modify: `scripts/session-card.ts` (`FIELDS`, `SessionCard`, `validateCard`, `LEGAL_PARENT_ROLES`)
- Test: `scripts/session-card.test.ts` (add cases), `packages/cli/src/reviewer/types.test.ts` (add one cross-check)

**Interfaces:**
- Produces: optional card fields `reviewer_type: "task" | "ticket"` (only on `role: reviewer`) and `seat: string` (only on `role` `worker` or `reviewer`); `LEGAL_PARENT_ROLES.reviewer` is `["conductor", "maestro"]`.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/session-card.test.ts`, inside `describe("validateCard", ...)` or as a new `describe`:

```ts
describe("reviewer card fields (DGS-529)", () => {
  const reviewer = (): SessionCard => ({ ...worker(), role: "reviewer", id: "dgs-529-rev", under: "dsm-conductor-01" });
  it("accepts reviewer_type task or ticket and a seat on a reviewer", () => {
    expect(errs({ ...reviewer(), reviewer_type: "ticket", seat: "dev0" })).toEqual([]);
    expect(errs({ ...reviewer(), reviewer_type: "task" })).toEqual([]);
  });
  it("refuses an unknown reviewer_type and a reviewer_type on another role", () => {
    expect(errs({ ...reviewer(), reviewer_type: "design" }).join(" ")).toMatch(/reviewer_type: must be one of task, ticket/);
    expect(errs({ ...worker(), reviewer_type: "task" }).join(" ")).toMatch(/reviewer_type: only a reviewer/);
  });
  it("accepts a seat on a worker, refuses it on a conductor or a bad seat name", () => {
    expect(errs({ ...worker(), seat: "jack" })).toEqual([]);
    expect(errs({ ...conductor(), seat: "dev0" }).join(" ")).toMatch(/seat: only a worker or a reviewer/);
    expect(errs({ ...worker(), seat: "Dev 0" }).join(" ")).toMatch(/seat: /);
  });
  it("round-trips the new fields through format and parse", () => {
    const card = { ...reviewer(), reviewer_type: "ticket" as const, seat: "dev0" };
    expect(parseCard(formatCard(card))).toEqual(card);
  });
  it("a reviewer's legal parents are a conductor or a Maestro, never a worker", () => {
    expect([...LEGAL_PARENT_ROLES.reviewer]).toEqual(["conductor", "maestro"]);
  });
});
```

Add to `packages/cli/src/reviewer/types.test.ts`:

```ts
import { REVIEWER_TYPES as TYPES } from "./types.ts";
import { validateCard } from "../../../../scripts/session-card.ts";

describe("card and constants agree", () => {
  it("the card accepts every reviewer type the code knows", () => {
    for (const t of TYPES) {
      const r = validateCard({
        name: "x", role: "reviewer", id: "x-rev", session: "s1", under: "c1", domain: "DGS-1", mandate: "m",
        runs_on: "herdr w1:p1", created_by: "c1", started: "2026-10-17T20:00+07:00", last_seen: "2026-10-17T20:00+07:00",
        status: "open", reviewer_type: t,
      });
      expect(r.ok).toBe(true);
    }
  });
});
```

Before editing, run `grep -rn "LEGAL_PARENT_ROLES\|reviewer" scripts/session-card.test.ts scripts/session-cards scripts/conductor | head -20` and note every test or sweep that treats a worker as a legal parent of a reviewer. Update those tests to the new rule.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-card.test.ts packages/cli/src/reviewer/types.test.ts`
Expected: FAIL (unknown field `reviewer_type`).

- [ ] **Step 3: Implement**

In `scripts/session-card.ts`:

1. Add the two fields to the type: `reviewer_type?: "task" | "ticket"; seat?: string;`.
2. Add `"reviewer_type", "seat"` to `FIELDS`, after `"mandate", "state"` and before `"runs_on"` is wrong for file order only in appearance; place them right after `"state"`: `"name", "role", "id", "session", "under", "domain", "mandate", "state", "reviewer_type", "seat", "runs_on", ...`.
3. Add constants near `ID_RE`:

```ts
const REVIEWER_TYPES = ["task", "ticket"] as const; // keep equal to packages/cli/src/reviewer/types.ts (a test checks it)
const SEAT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
```

4. In `validateCard`, after the role block (inside `if (role !== undefined && ...)`), add:

```ts
    if (present("reviewer_type")) {
      if (role !== "reviewer") errors.push("reviewer_type: only a reviewer has a reviewer_type");
      else if (!(REVIEWER_TYPES as readonly string[]).includes(v.reviewer_type ?? "")) errors.push(`reviewer_type: must be one of ${REVIEWER_TYPES.join(", ")}`);
    }
    if (present("seat")) {
      if (role !== "worker" && role !== "reviewer") errors.push("seat: only a worker or a reviewer has a seat");
      else if (v.seat !== undefined && !SEAT_RE.test(v.seat)) errors.push("seat: must be a short account name, like dev0 or jack");
    }
```

5. Change `LEGAL_PARENT_ROLES.reviewer` to `["conductor", "maestro"]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-card.test.ts packages/cli/src/reviewer/types.test.ts`
Expected: PASS. Then run `pnpm exec vitest run scripts` and fix any test in `scripts/` that still assumes a worker is a legal parent of a reviewer.

- [ ] **Step 5: Commit**

```bash
git add scripts/session-card.ts scripts/session-card.test.ts packages/cli/src/reviewer/types.test.ts
git commit -m "feat(dgs-529): add reviewer_type and seat to the session card"
```

---

### Task 8: The review-mode script

**Files:**
- Create: `skills/subagent-driven-development/scripts/review-mode`
- Test: `scripts/review-mode.test.ts`

**Interfaces:**
- Produces: a script that prints `role` when `DIGISMITH_REVIEW_MODE` is exactly `role`, otherwise `hand`. Exit code 0.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/review-mode.test.ts
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "subagent-driven-development", "scripts", "review-mode");

function mode(value: string | undefined): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DIGISMITH_REVIEW_MODE;
  if (value !== undefined) env.DIGISMITH_REVIEW_MODE = value;
  const r = spawnSync("bash", [SCRIPT], { encoding: "utf8", env });
  expect(r.status).toBe(0);
  return r.stdout.trim();
}

describe("review-mode", () => {
  it("is role only for the exact value role", () => {
    expect(mode("role")).toBe("role");
  });
  it("is hand when unset, empty or anything else", () => {
    for (const v of [undefined, "", "Role", "ROLE", "1", "role ", " role", "hand", "true"]) {
      expect(mode(v)).toBe("hand");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/review-mode.test.ts`
Expected: FAIL (the script does not exist; bash exits 127).

- [ ] **Step 3: Write the script**

```bash
#!/usr/bin/env bash
# Prints the review mode of this session: "role" only when DIGISMITH_REVIEW_MODE is exactly
# "role" (a herdr Builder that a conductor started), otherwise "hand" (the old path).
# This is the one place that reads the variable.
set -euo pipefail

if [ "${DIGISMITH_REVIEW_MODE-}" = "role" ]; then
  echo role
else
  echo hand
fi
```

Make it executable like its siblings: `chmod +x skills/subagent-driven-development/scripts/review-mode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/review-mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/review-mode scripts/review-mode.test.ts
git commit -m "feat(dgs-529): add the review-mode script"
```

---

### Task 9: Owner headers and the findings section on the three primitives

**Files:**
- Modify: `skills/requesting-code-review/code-reviewer.md`
- Modify: `skills/subagent-driven-development/task-reviewer-prompt.md`
- Modify: `skills/subagent-driven-development/re-review-prompt.md`
- Modify: `vendored/PROVENANCE.md`
- Test: `packages/cli/src/reviewer/primitives.test.ts`

**Interfaces:**
- Consumes: `extractFindings` (Task 2) to prove the example block parses.
- Produces: in each of the three files, the owner header line right after the title, and one new section "Findings block" at the end of the prompt text (inside the existing code fence, before its closing fence). No existing line changes.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/primitives.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFindings } from "./findings.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const FILES = [
  "skills/requesting-code-review/code-reviewer.md",
  "skills/subagent-driven-development/task-reviewer-prompt.md",
  "skills/subagent-driven-development/re-review-prompt.md",
];
const HEADER = "Used by the Reviewer role (DGS-529). In role mode a conductor or a Maestro starts this review, never a Builder. Outside role mode it runs as before.";
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("the three primitive prompts", () => {
  for (const rel of FILES) {
    describe(rel, () => {
      const text = read(rel);
      it("has the owner header on the line after the title", () => {
        const lines = text.split("\n");
        expect(lines[0]).toMatch(/^# /);
        expect(lines[1]).toBe("");
        expect(lines[2]).toBe(HEADER);
      });
      it("has a Findings Block section", () => {
        expect(text).toContain("## Findings Block");
        expect(text).toContain("```json findings");
      });
      it("keeps its example block parseable by the table's own parser", () => {
        const m = /([ ]*)```json findings\n([\s\S]*?)\n[ ]*```/.exec(text);
        expect(m).not.toBeNull();
        const example = "```json findings\n" + m![2].split("\n").map((l) => l.slice(m![1].length)).join("\n") + "\n```\n";
        expect(extractFindings(example, rel)).toHaveLength(1);
      });
    });
  }
  it("keeps the original placeholders of each prompt", () => {
    expect(read(FILES[0])).toContain("[CHECK_ATTRIBUTION_PATH]");
    expect(read(FILES[1])).toContain("[BRIEF_FILE]");
    expect(read(FILES[1])).toContain("[DIFF_FILE]");
    expect(read(FILES[2])).toContain("[FINDINGS]");
    expect(read(FILES[2])).toContain("[FIX_BASE_SHA]");
  });
  it("PROVENANCE records the divergence", () => {
    expect(read("vendored/PROVENANCE.md")).toContain("Further diverged by DGS-529");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/primitives.test.ts`
Expected: FAIL (no header, no section).

- [ ] **Step 3: Make the additive edits**

Header: in each file, insert after the first line (the `# ... Template` title) and its blank line the header line and a blank line, so lines 1-3 are title, blank, header. Use Edit with the title line as `old_string` and the title plus `\n\n<HEADER>` as `new_string`:
- `skills/requesting-code-review/code-reviewer.md`: title `# Code Reviewer Prompt Template`.
- `skills/subagent-driven-development/task-reviewer-prompt.md`: title `# Task Reviewer Prompt Template`.
- `skills/subagent-driven-development/re-review-prompt.md`: title `# Scoped Re-Review Prompt Template`.

Findings section (identical text in all three; the text sits inside the code fence of each prompt, indented 4 spaces like the other sections). Insert it just before the closing fence of the prompt text, after these exact last lines:
- `code-reviewer.md`: after `    - Avoid giving a clear verdict` (line 131).
- `task-reviewer-prompt.md`: after `    **Reasoning:** [1-2 sentence technical assessment]` (line 169).
- `re-review-prompt.md`: after `    breakage | Findings remain open] — list the open ones.` (line 91).

Text to insert (with a blank line before it):

````text
    ## Findings Block

    End your report with one fenced block whose info string is exactly
    `json findings`. It holds a JSON array with one object for each
    Critical, Important or Minor finding in this report; a ⚠️ item you
    could not verify is not a finding. Use `[]` when you found nothing.
    The ids are F1, F2, and so on. In a re-review, number only the new
    findings in the fix diff, after the ids you were given. `line` is an
    integer of 1 or more, or `null` when no line applies.

    ```json findings
    [
      {
        "id": "F1",
        "path": "src/example.ts",
        "line": 42,
        "severity": "Important",
        "what": "what is wrong, in one sentence",
        "scenario": "the input or state that makes it fail"
      }
    ]
    ```
````

For `re-review-prompt.md`, the sentence "In a re-review, number only..." stays as written (it is true for that file and harmless in the others).

PROVENANCE: in `vendored/PROVENANCE.md`, append to the `requesting-code-review` entry (after "...See the frozen letter map (DGS-356), map item W." of that entry) the sentence ` **Further diverged by DGS-529** (2026-10-17): an owner header line and a "Findings Block" section on \`code-reviewer.md\`.` and to the `subagent-driven-development` entry ` **Further diverged by DGS-529** (2026-10-17): an owner header line and a "Findings Block" section on \`task-reviewer-prompt.md\` and \`re-review-prompt.md\`; a Role Mode section and a \`scripts/review-mode\` script in SDD itself (see the DGS-529 spec, section 15).` Keep each entry's existing text unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/primitives.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/requesting-code-review/code-reviewer.md skills/subagent-driven-development/task-reviewer-prompt.md skills/subagent-driven-development/re-review-prompt.md vendored/PROVENANCE.md packages/cli/src/reviewer/primitives.test.ts
git commit -m "feat(dgs-529): add owner headers and the findings block to the review prompts"
```

---

### Task 10: SDD role mode (additive)

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md`
- Test: `packages/cli/src/reviewer/sdd.test.ts`

**Interfaces:**
- Consumes: the markers and ledger lines from Global Constraints; `scripts/review-mode` (Task 8); `dg reviewer pack` (Task 6).
- Produces: a setup bullet that records the mode, and one new section `## Role Mode (a herdr Builder)` placed immediately before `## Final Review`. No existing line is deleted or rewritten.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/sdd.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const sdd = fs.readFileSync(path.join(ROOT, "skills/subagent-driven-development/SKILL.md"), "utf8");

describe("SDD keeps the old path (hand mode)", () => {
  const anchors = [
    "Generate review package, dispatch task reviewer (./task-reviewer-prompt.md)",
    "Dispatch final code reviewer (../requesting-code-review/code-reviewer.md)",
    "Never dispatch a task reviewer without a diff file.",
    "Never fix findings yourself in the controller session",
    "dispatch ONE fix subagent",
    "Do not pause to check in with your human partner between tasks.",
    "`final-reviewer`",
  ];
  for (const a of anchors) it(`still contains: ${a}`, () => expect(sdd).toContain(a));
});

describe("SDD has the role-mode path (new)", () => {
  it("records the mode at setup with the script", () => {
    expect(sdd).toContain("scripts/review-mode");
    expect(sdd).toContain("Review mode: role");
    expect(sdd).toContain("Review mode: hand");
  });
  it("has a Role Mode section before the Final Review section", () => {
    const role = sdd.indexOf("## Role Mode (a herdr Builder)");
    expect(role).toBeGreaterThan(-1);
    expect(role).toBeLessThan(sdd.indexOf("## Final Review"));
  });
  it("names both markers, both ledger lines and the pack command", () => {
    for (const s of [
      "STOP: task-review-ready", "STOP: ticket-review-ready",
      "Task <N>: review requested", "Task final: review requested",
      "dg reviewer pack", "Review ticket final r<R>: F<n> ->",
    ]) expect(sdd).toContain(s);
  });
  it("says a Builder never starts or runs a review in role mode", () => {
    expect(sdd).toMatch(/never (starts|dispatches) or runs a review|never starts a review/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/sdd.test.ts`
Expected: the "old path" tests PASS (they prove the baseline); the "role-mode path" tests FAIL.

If an "old path" anchor does not match the current text exactly, fix the anchor in the test (not the skill) so it names text that exists today, and keep that test passing before any edit. The test must pass for the old path on the unedited file first.

- [ ] **Step 3: Make the additive edits**

(a) In the Setup section, directly after the bullet that ends with ``` `# SDD ledger — plan: <plan file path>`. ```, add this new bullet:

```text
- Run `scripts/review-mode` once. Append `Review mode: role` or `Review mode: hand`
  to the ledger as its second line, from its output. A resumed session reads
  that line and does not run the script again. `hand` is the default and
  means this skill runs exactly as described everywhere outside "Role Mode".
```

(b) Insert this section immediately before `## Final Review`:

````text
## Role Mode (a herdr Builder)

This section applies only when the ledger says `Review mode: role`: a conductor
started this session as a Builder and set `DIGISMITH_REVIEW_MODE=role`. In `hand`
mode ignore this section; every other part of this skill applies unchanged.

In role mode a Builder never starts a review and never runs one (DGS-529). A
conductor or a Maestro starts every review. This section replaces three steps:
"Review the task" in the Task Loop (step 3), the re-review dispatch in the
fix loop (step 4), and the final reviewer dispatch in "Final Review". Everything
else stays: the implementer, the fix rounds (up to five), the breaker, the
ledger and the deferred-minor lines.

**After each task**, instead of dispatching a task reviewer:

1. Run `scripts/review-package PLAN_FILE BASE HEAD` as step 3 says (the
   attribution check runs inside it), then
   `dg reviewer pack --type task --task <N> --workspace <workspace> --plan PLAN_FILE --base BASE --head HEAD --diff <review package path> --brief <brief path> --report <report path> --standards <each standards file the brief names>`.
   It prints `pack: <folder>` and `model: <id>`. The model is the role's, not yours.
2. Append `Task <N>: review requested` to the ledger.
3. Report one line, `STOP: task-review-ready <pack folder>`, and wait. Do not
   start another task and do not review the diff yourself.
4. Your parent sends the report path and a verdict. Read the report. On
   `Needs fixes`, run the fix loop of step 4 with the findings as written
   (verify ⚠️ items yourself, as that step says). For each fix round, build
   the scoped re-review package, run
   `dg reviewer pack --type task --task <N> --round <R+1> --fix-base <previous head> --findings-in <open findings file> ...`
   and report `STOP: task-review-ready <pack folder>` again. Never dispatch the re-reviewer.
5. When your parent says "task <N> review clean", complete the task as step 5 says.

**After the last task**, instead of dispatching the final reviewer: build the
package with `scripts/review-package PLAN_FILE MERGE_BASE HEAD`, run
`dg reviewer pack --type ticket --workspace <workspace> --plan PLAN_FILE --base MERGE_BASE --head HEAD --diff <path> --ticket-file <ticket.md> --spec <design.html> --ledger <workspace>/progress.md --standards ...`,
append `Task final: review requested`, report `STOP: ticket-review-ready <pack folder>`
and wait. The ONE fix wave, the one scoped re-review (another pack and another STOP) and the
adjudication of residuals work as "Final Review" describes, with your parent
starting each review.

**Verdict lines.** When a finding is decided, append one ledger line for it:
`Review task <N> r<R>: F<n> -> fixed (<commit>)`, `... -> parked (<ruling>)` or
`... -> rejected (<reason>)`; for the final review
`Review ticket final r<R>: F<n> -> <verdict> (<reason>)`. A ruling that comes
from the Maestro reaches you in your parent's message; append it as written.
`parked` and `rejected` need a reason. Never leave a finding without a line:
`dg reviewer table` fails on it.

**Waiting is the rule here.** "Continuous execution" above has one exception in
role mode: you wait at each `STOP: ...-review-ready` until your parent answers.
If `dg reviewer pack` fails, report the error to your parent and wait. Never fall
back to reviewing yourself.

````

(c) Do not edit any other line.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/sdd.test.ts`
Expected: PASS (old-path anchors and role-mode tests).

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md packages/cli/src/reviewer/sdd.test.ts
git commit -m "feat(dgs-529): add role mode to subagent-driven-development"
```

---

### Task 11: The findings table in `report-implementation`

**Files:**
- Modify: `skills/report-implementation/SKILL.md`
- Test: `packages/cli/src/reviewer/report-skill.test.ts`

**Interfaces:**
- Consumes: `dg reviewer table` (Task 6).
- Produces: a new `### Step 4a: Findings table` after Step 4 and before Step 5. Additive. By hand (no `reviews/` folder) it changes nothing.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/report-skill.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const text = fs.readFileSync(path.join(ROOT, "skills/report-implementation/SKILL.md"), "utf8");

describe("report-implementation", () => {
  it("keeps its old steps", () => {
    for (const s of ["### Step 4: Write and Commit", "### Step 5: Hand Back", "git check-ignore -q <target folder>/report.html"]) {
      expect(text).toContain(s);
    }
  });
  it("has the findings table step between Step 4 and Step 5", () => {
    const a = text.indexOf("### Step 4a: Findings table");
    expect(a).toBeGreaterThan(text.indexOf("### Step 4: Write and Commit"));
    expect(a).toBeLessThan(text.indexOf("### Step 5: Hand Back"));
  });
  it("runs the command only when reviews exist and says what to do on failure", () => {
    expect(text).toContain("dg reviewer table --workspace");
    expect(text).toContain("findings.md");
    expect(text).toMatch(/no `reviews\/` folder|nothing to do/);
    expect(text).toMatch(/stop and report/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/report-skill.test.ts`
Expected: first test PASSES, others FAIL.

- [ ] **Step 3: Insert the section**

Insert immediately before the line `### Step 5: Hand Back`:

````text
### Step 4a: Findings table (role mode only)

The review reports live in the plan's workspace, which the Finish step deletes,
so build the table now. Let `<workspace>` be the directory
`skills/subagent-driven-development/scripts/sdd-workspace PLAN_FILE` prints.

- **No `reviews/` folder in `<workspace>`** (a by-hand run, or an inline
  `executing-plans` run): nothing to do. Skip this step silently.
- **Otherwise** run
  `dg reviewer table --workspace <workspace> --out <target folder>/findings.md`.
  - It prints `wrote <file> (<n> row(s))`: add `<target folder>/findings.md` to the
    same `git add` as the report in Step 4 (unless the folder is gitignored, as
    Step 4 checks), and link the table from `report.html` with one line in the
    report's reviews section.
  - It exits 1 (a finding with no verdict line, a report without a findings
    block, a missing ledger): stop and report the message to the human partner.
    Do not write the report as if the reviews were complete. The Builder fixes the
    ledger lines, then runs this step again.
- Attaching `findings.md` to the ClickUp ticket is the conductor's job
  (`dg clickup upload-attachment`). A worker has no ClickUp write. Mention the
  file path in the hand-back (Step 5).

````

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/report-skill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/report-implementation/SKILL.md packages/cli/src/reviewer/report-skill.test.ts
git commit -m "feat(dgs-529): build the findings table in report-implementation"
```

---

### Task 12: The Reviewer card and the brief template

**Files:**
- Create: `skills/reviewer/SKILL.md`
- Create: `skills/reviewer/brief.md`
- Test: `packages/cli/src/reviewer/card.test.ts`

**Interfaces:**
- Consumes: `REVIEWER_TYPES`, `SONNET`, `OPUS`, `TASK_ESCALATE_LINES` (Task 1).
- Produces: the card (`digismith:reviewer`) and a brief template with exactly these placeholders: `{{TYPE}}`, `{{KEY}}`, `{{AGENT}}`, `{{PACK}}`, `{{PLUGIN_ROOT}}`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/reviewer/card.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEWER_TYPES, SONNET, OPUS, TASK_ESCALATE_LINES } from "./types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const card = fs.readFileSync(path.join(ROOT, "skills/reviewer/SKILL.md"), "utf8");
const brief = fs.readFileSync(path.join(ROOT, "skills/reviewer/brief.md"), "utf8");

describe("skills/reviewer/SKILL.md", () => {
  it("has frontmatter with name reviewer", () => {
    const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(card);
    expect(fm?.[1]).toBe("reviewer");
    expect(fm?.[2]).toMatch(/Reviewer role/);
  });
  it("has a type table row for each reviewer type, from the constant", () => {
    for (const t of REVIEWER_TYPES) expect(card).toMatch(new RegExp(`^\\| \`${t}\` \\|`, "m"));
  });
  it("states the model policy with the constants", () => {
    expect(card).toContain(SONNET);
    expect(card).toContain(OPUS);
    expect(card).toContain(String(TASK_ESCALATE_LINES));
    expect(card).toMatch(/never pick(s)? the model|do not pick the model/i);
  });
  it("names each primitive file that exists on disk", () => {
    for (const rel of [
      "skills/requesting-code-review/code-reviewer.md",
      "skills/subagent-driven-development/task-reviewer-prompt.md",
      "skills/subagent-driven-development/re-review-prompt.md",
    ]) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
      expect(card).toContain(path.basename(rel));
    }
  });
  it("states the rules: judge only, no Builder starts a review, hand mode stays", () => {
    expect(card).toMatch(/never fix(es)?, never merge/i);
    expect(card).toMatch(/Builder never starts or runs a review/);
    expect(card).toMatch(/hand mode/i);
    expect(card).toContain("DIGISMITH_REVIEW_MODE");
  });
  it("names the markers, the findings block and the table command", () => {
    for (const s of ["STOP: task-review-ready", "STOP: ticket-review-ready", "json findings", "dg reviewer table", "dg reviewer pack"]) {
      expect(card).toContain(s);
    }
  });
});

describe("skills/reviewer/brief.md", () => {
  it("uses exactly the five placeholders", () => {
    const found = new Set([...brief.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]));
    expect([...found].sort()).toEqual(["AGENT", "KEY", "PACK", "PLUGIN_ROOT", "TYPE"]);
  });
  it("tells the Reviewer to judge only, write one report and register its session", () => {
    expect(brief).toMatch(/never edit/i);
    expect(brief).toContain("report.md");
    expect(brief).toContain("entry.ts session --ticket {{KEY}} --role reviewer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/reviewer/card.test.ts`
Expected: FAIL (files do not exist).

- [ ] **Step 3: Write the card and the brief**

`skills/reviewer/SKILL.md`:

````markdown
---
name: reviewer
description: Use when starting, briefing or judging a review in role mode (a conductor or Maestro handling a Builder's STOP: task-review-ready or STOP: ticket-review-ready), when you are a Reviewer worker told to follow the Reviewer card, or when asked what the Reviewer role is. Not for a by-hand review: use digismith:requesting-code-review for that.
---

# Reviewer

The Reviewer judges. The Builder fixes. The Reviewer re-checks. The Reviewer never fixes, never merges, never changes anything, and never reviews its own work. Spec: `.digismith/board/DGS-529—reviewer-role/design.html`.

**A Builder never starts or runs a review.** In role mode a conductor or a Maestro starts every review. The Builder reports `STOP: ...-review-ready` and waits.

## Two modes

- **Hand mode** (the default, `DIGISMITH_REVIEW_MODE` unset or not `role`): SDD and `requesting-code-review` run as they always did. A Builder or a person dispatches the reviewers. Nothing in this card applies.
- **Role mode** (`DIGISMITH_REVIEW_MODE=role`, set by the conductor when it starts a herdr Builder): the rest of this card.

## The two types

| Type | Judges | Primitive | Started by | Model |
|---|---|---|---|---|
| `task` | One task's diff against the task text | `task-reviewer-prompt.md`; re-review: `re-review-prompt.md` | A conductor or Maestro, after `STOP: task-review-ready` | Sonnet 5.5 |
| `ticket` | The whole ticket against its spec and plan | `code-reviewer.md`; re-review: `re-review-prompt.md` | A conductor or Maestro, after `STOP: ticket-review-ready` | Opus 5.5 |

The primitives live in `skills/subagent-driven-development/` and `skills/requesting-code-review/`. They stay the source of truth for severity, what to check, the fix loop and the report format. This card does not copy them.

## Model policy (the role picks the model)

`dg reviewer pack` applies the policy and writes `model:` into `pack.md`. The conductor and the Builder do not pick the model. Pass on what `pack.md` says.

- `task`: `claude-sonnet-5-5`. A diff above 800 changed lines gets `claude-opus-5-5`.
- `ticket`: `claude-opus-5-5`.

## Seat

The conductor picks the seat with the Workbox runbook's rule, inside Jack's seat order in force. For a `ticket` Reviewer it excludes the Builder's seat first when the other seat has headroom. The card of a Reviewer worker has `role: reviewer`, `reviewer_type`, `seat`, and `under` = the conductor or Maestro that started it.

## Flow (role mode)

1. The Builder runs `dg reviewer pack ...` and reports `STOP: task-review-ready <pack>` (or `STOP: ticket-review-ready <pack>`). The pack folder holds `pack.md` and the input files.
2. The conductor starts the Reviewer worker (Workbox runbook, "Start of a ticket", S0 to S6) from `skills/reviewer/brief.md`, with the model from `pack.md`. A `ticket` Reviewer is one worker per review. A `task` Reviewer is one worker per ticket: for each new pack the conductor sends `/clear`, then `/model <model>` if it differs, then `Read <pack>/pack.md and follow the Reviewer card.`
3. The Reviewer reads `pack.md`, follows the primitive it names, and writes `<pack>/report.md`. The report ends with the findings block (one fenced block, info string `json findings`). The Reviewer ends with one pane line: `done: <pack> verdict: <...>`.
4. The conductor relays the result to the Builder. For `task` it relays without filtering. For `ticket` it verifies each finding first (`digismith:receiving-code-review`); a finding it cannot verify goes to the Maestro.
5. The fix loop is the primitive's: up to five rounds for `task`; one fix wave and one scoped re-review for `ticket`. The Builder fixes. The Reviewer re-checks against a new pack.
6. The human partner decides what blocks and what is parked: the Builder's SDD controller for `task`, the Maestro for `ticket`. The Maestro sends taste questions to Jack. The Reviewer cannot clear its own finding.

A Critical or Important finding, a confirmed ⚠️ item or a spec ❌ blocks (the next task for `task`, the merge for `ticket`). Minor findings are deferred in the ledger and never block.

## Report and table

- The findings block: a JSON array of `{ id, path, line, severity, what, scenario }`. `[]` when there are none.
- The human partner writes one ledger verdict line per finding: `Review <task|ticket> <id> r<round>: F<n> -> <fixed|parked|rejected> (<reason>)`.
- `report-implementation` runs `dg reviewer table --workspace <workspace> --out <board folder>/findings.md`. The conductor attaches `findings.md` to the ticket (`dg clickup upload-attachment`).

## Steward moments

`review-started`: the conductor sends it when it starts the `ticket` Reviewer. `merged`: the merge hook sends it. The Reviewer never merges. A `task` review sends no event. The wiring is DGS-551.

## Rules for the Reviewer

- Read only on the checkout. Write only `<pack>/report.md`.
- The report is the primitive's own output plus the findings block.
- Report a need to change something as a finding. Never edit.
- Never print or read a token, a key or a `.env` file.
- Never answer a "keep allowing reads" prompt.
````

`skills/reviewer/brief.md`:

````markdown
# Brief: {{KEY}} Reviewer ({{TYPE}})

You are the Reviewer worker `{{AGENT}}` for {{KEY}}, reviewer type `{{TYPE}}`. A conductor or Maestro started you.

## Read first
1. The Reviewer card: `{{PLUGIN_ROOT}}/skills/reviewer/SKILL.md`.
2. Your pack manifest: `{{PACK}}/pack.md`. It names the primitive to follow, the files to read and the model.
3. The primitive named in the manifest, in `{{PLUGIN_ROOT}}/skills/` (`subagent-driven-development/` for `task-reviewer-prompt.md` and `re-review-prompt.md`; `requesting-code-review/` for `code-reviewer.md`).

## What to do
Judge the work in the pack, as the primitive says. Write your report to the `report_out` path in the manifest (`report.md` in the pack folder). End the report with the findings block: one fenced block, info string `json findings`. End with one pane line: `done: {{PACK}} verdict: <the primitive's own verdict>`. Then stop and wait: the conductor may send another pack.

## Rules
- Judge only. Never edit a file, never run a build or a fix, never merge, never push. You may write only `report.md`.
- Read only what the manifest lists. Do not read the Builder's conversation, the task reviewers' reports or the rest of the ledger.
- The Builder's report is claims, not facts. Verify against the diff.
- Register your session so your tokens count with the ticket, once, first:
  `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket {{KEY}} --role reviewer`
- Never read or print a token, an SSH key or a `.env` file. No `sudo`. pnpm only, never npm.
- Never answer a "keep allowing reads" prompt. Times UTC+7 first, UTC in brackets. No AI attribution. Short plain sentences.
- You hold no state across reviews. When the conductor sends `/clear`, the next pack is a new review.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/reviewer/card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/reviewer/SKILL.md skills/reviewer/brief.md packages/cli/src/reviewer/card.test.ts
git commit -m "feat(dgs-529): add the Reviewer card and the brief template"
```

---

### Task 13: Handoff texts for the Maestro (runbook, ClickUp rows)

The Workbox runbook (`.digismith/sessions/workbox.md`) is git-excluded on purpose, and ClickUp descriptions are the Maestro's to write. A worker writes the exact texts into the board folder. The Maestro pastes them.

**Files:**
- Create: `.digismith/board/DGS-529—reviewer-role/handoff.md`

- [ ] **Step 1: Write the file with these three sections** (exact text, no placeholders)

````markdown
# DGS-529 handoff: texts for the Maestro

## 1. Runbook section (paste into .digismith/sessions/workbox.md, after "Start of a ticket")

#### Start of a Reviewer (owner: conductor; DGS-529)

A Builder reports `STOP: task-review-ready <pack>` or `STOP: ticket-review-ready <pack>`. Never answer it by starting a review in the Builder's pane.

- **Model.** Read `model:` from `<pack>/pack.md`. Never pick it yourself.
- **Seat.** Use "The rule" inside the seat order in force. For a ticket Reviewer, exclude the Builder's seat first when the other seat has headroom.
- **Ticket Reviewer.** Run S0 to S6 with brief `skills/reviewer/brief.md` (TYPE=ticket, PACK=the pack folder), agent `<key>-rev`, label `<KEY> ⚚ Review`, `--model <model>`. Write the card with `role: reviewer`, `reviewer_type: ticket`, `seat`, `under: <your id>`. Send `review-started` to the Steward at S4. Close the worker after the verdict.
- **Task Reviewer.** One worker per ticket: agent `<key>-rev-task`, label `<KEY> ⚚ Review task`. At the first pack run S0 to S6. For each later pack: read the pane with `--format ansi`, send `/clear`, then `/model <model>` if it differs from the worker's, then `Read <pack>/pack.md and follow the Reviewer card.` Close the worker after the last task review is clean.
- **Relay.** Task findings go to the Builder without filtering. Ticket findings: verify each one (`digismith:receiving-code-review`), then relay. A finding you cannot verify goes to the Maestro.
- **Builder start.** When you start a Builder, set `DIGISMITH_REVIEW_MODE=role` in its pane before `agent start` (S3). A Builder without it runs the old hand mode.
- **After the build.** Attach `<board folder>/findings.md` to the ticket with `dg clickup upload-attachment`.

## 2. DGS-488 (statuses and roles): row changes

- Status table, `review` row: "whole-branch review, fixes, merge" becomes "Reviewer judges; Builder fixes; Reviewer re-checks; then merge". Skills and roles column: "Reviewer (digismith:reviewer)".
- Role table, Reviewer row: Does: "review, re-check findings". Never: "fixes, merges, builds". (The preview for Jack tickets: see section 3 of the DGS-529 spec.)
- Open points: delete "Reviewer and Releaser as one role or two". Decided: two roles.

## 3. DGS-404 (role architecture): row changes

- Authority ladder, Reviewer row: Alone: "Read the target. Write findings, a verdict and one report file in scratch. Run the profile's preview recipe for a Sign-off: Jack ticket after an approved verdict, to the preview target only." Needs the role above: "A wider read scope." Always needs Jack: "Anything that changes something else."
- Session card: new optional fields `reviewer_type` (task | ticket; reviewer only) and `seat` (an account name; worker or reviewer). A reviewer's legal parents are a conductor or a Maestro.
- Roles table, Reviewer row, "Who starts it": "A conductor or a Maestro. Never a Builder."
````

- [ ] **Step 2: Check that the file has no placeholder text**

Run: `grep -n -i "tbd\|todo\|fill in" ".digismith/board/DGS-529—reviewer-role/handoff.md" || echo clean`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add ".digismith/board/DGS-529—reviewer-role/handoff.md"
git commit -m "docs(dgs-529): add the runbook and ClickUp row texts for the Maestro"
```

---

### Task 14: Both paths, end to end, and the vendored check

**Files:**
- Create: `packages/cli/src/reviewer/both-paths.test.ts`

This task proves the requirement: the old path still works and the new path works, with a real git repo and the real scripts.

- [ ] **Step 1: Write the test**

```ts
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
      type: "task", id: "1", round: 1, workspace: ws, base: base.slice(0, 7), head: head.slice(0, 7),
      diff, plan: path.join(repo, "plan.md"), brief: path.join(repo, "brief.md"),
      report: path.join(repo, "impl-report.md"), standards: [],
    });
    expect(model).toBe("claude-sonnet-5-5");

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
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run packages/cli/src/reviewer/both-paths.test.ts`
Expected: PASS. A failure in "the old path" test means an edit broke hand mode. Fix the edit, not the test.

- [ ] **Step 3: Run the whole suite and the build**

Run: `pnpm exec vitest run && pnpm --filter @digismith/cli build`
Expected: all tests PASS and the build exits 0.

- [ ] **Step 4: Run the vendored check and read its output**

Run: `node --experimental-strip-types scripts/check_vendored_skills.ts`
Expected: it reports the three primitive files and SDD's `SKILL.md` as "locally diverged". It reports no new upstream drift caused by this branch. Paste the relevant lines into `.digismith/board/DGS-529—reviewer-role/vendored-check.txt` as the evidence for the Compatibility requirement. If the command cannot clone upstream (no network), say so in that file and in the final report; do not claim the check passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/both-paths.test.ts ".digismith/board/DGS-529—reviewer-role/vendored-check.txt"
git commit -m "test(dgs-529): prove the old path and the role path"
```

---

## Plan notes (not tasks)

- **Merge order.** Task 6 edits `packages/cli/src/index.ts`. DGS-549 (the Steward) also edits it. The build branch starts from main after DGS-549's merge, so the two lines sit next to the Steward's lines. Keep both.
- **The first live use** is read only: after the merge, run `dg reviewer pack` and `dg reviewer table` on a finished SDD workspace and one real ticket Reviewer on a finished branch. No ticket is written to by a test.
- **Not in this plan:** the Lights-Out engine starting Reviewers by itself (DGS-129), the preview step's recipe field in the profile (spec section 8 says "a new optional field `preview`"; it is needed only when the first Sign-off: Jack ticket reaches review, so it is a separate build ticket in the Refiner's output), more reviewer types, DGS-554's rename.
