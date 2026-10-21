# DGS-572 reviewer table r2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dg reviewer table` accepts a verdict line of round r2+ for a finding an earlier pack raised, shows the latest ruling, and can print a stable JSON model.

**Architecture:** `verdicts.ts` keeps every verdict line as an entry (with its ledger line number). `table.ts` resolves each entry to the finding it rules on (exact round first, else the latest earlier raise), then builds the markdown rows and the JSON model from that one resolution. `index.ts` adds `--json`. Two skill texts show the r2 line format.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), yargs, vitest, pnpm. Spec: `.digismith/board/DGS-572—reviewer-table-r2/design.html`.

## Global Constraints

- Test first. Run tests with `pnpm --filter @digismith/cli exec vitest run src/reviewer` (check the package name in `packages/cli/package.json` first; the command is `vitest run` in `packages/cli`).
- No ledger line is ever deleted or rewritten by the code or the tests. Tests write a fresh ledger in a temp folder.
- JSON `schema` is `1`. A shape change needs a new number.
- Unknown finding id stays an error naming the line, the id and the packs read.
- No ClickUp write in tests. No sudo, no launchctl, no delete outside the worktree.
- Commits are title-only, conventional, no AI attribution. pnpm only.

---

### Task 1: Keep every verdict line as an entry

**Files:**
- Modify: `packages/cli/src/reviewer/verdicts.ts`
- Test: `packages/cli/src/reviewer/verdicts.test.ts`

**Interfaces:**
- Produces: `type VerdictEntry = { line: number; text: string; kind: string; id: string; round: number; finding: string; verdict: Verdict; reason: string }` and `parseVerdictEntries(ledger: string): VerdictEntry[]` (ledger order, one entry per verdict line, `line` is 1-based). `parseVerdictLines` keeps its signature and result.

- [ ] **Step 1: Write the failing test** (append inside `describe("parseVerdictLines"...)`'s file, as a new describe)

```ts
import { parseVerdictEntries } from "./verdicts.ts";

describe("parseVerdictEntries", () => {
  it("keeps every verdict line in ledger order with its line number", () => {
    const e = parseVerdictEntries(
      "# SDD ledger\nReview task 1 r1: F1 -> parked (wait)\nTask 1: complete\nReview task 1 r2: F1 -> fixed (commit abc1234)\n",
    );
    expect(e.map((x) => [x.line, x.kind, x.id, x.round, x.finding, x.verdict, x.reason])).toEqual([
      [2, "task", "1", 1, "F1", "parked", "wait"],
      [4, "task", "1", 2, "F1", "fixed", "commit abc1234"],
    ]);
    expect(e[1].text).toBe("Review task 1 r2: F1 -> fixed (commit abc1234)");
  });
  it("fails like parseVerdictLines on a bad Review line", () => {
    expect(() => parseVerdictEntries("Review task 1 r1: F1 -> maybe (x)\n")).toThrow(/ledger line 1/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (in `packages/cli`): `pnpm exec vitest run src/reviewer/verdicts.test.ts`
Expected: FAIL, `parseVerdictEntries` is not exported.

- [ ] **Step 3: Write the implementation** (replace `parseVerdictLines` in `verdicts.ts`)

```ts
export type VerdictEntry = {
  line: number; text: string; kind: string; id: string; round: number;
  finding: string; verdict: Verdict; reason: string;
};

export function parseVerdictEntries(ledger: string): VerdictEntry[] {
  const out: VerdictEntry[] = [];
  ledger.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.trim().replace(/^- /, "");
    if (!text.startsWith("Review task ") && !text.startsWith("Review ticket ")) return;
    const m = LINE_RE.exec(text);
    if (!m) throw new Error(`ledger line ${i + 1}: not a verdict line: ${text}`);
    const verdict = m[5] as Verdict;
    const reason = m[6] ?? "";
    if (verdict !== "fixed" && reason === "") throw new Error(`ledger line ${i + 1}: a reason is required for ${verdict}`);
    out.push({ line: i + 1, text, kind: m[1], id: m[2], round: Number(m[3]), finding: m[4], verdict, reason });
  });
  return out;
}

export function parseVerdictLines(ledger: string): Map<string, Judgement> {
  const out = new Map<string, Judgement>();
  for (const e of parseVerdictEntries(ledger)) {
    out.set(judgementKey(e.kind, e.id, e.round, e.finding), { verdict: e.verdict, reason: e.reason });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/reviewer/verdicts.test.ts`
Expected: PASS (old tests too).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/verdicts.ts packages/cli/src/reviewer/verdicts.test.ts
git commit -m "feat(reviewer): keep every verdict line as an entry"
```

---

### Task 2: Table resolves re-rulings and prints JSON

**Files:**
- Modify: `packages/cli/src/reviewer/table.ts`, `packages/cli/src/reviewer/index.ts`
- Test: `packages/cli/src/reviewer/table.test.ts`

**Interfaces:**
- Consumes: `VerdictEntry`, `parseVerdictEntries` from Task 1.
- Produces (in `table.ts`):
  - `buildRows(reviews: Review[], entries: VerdictEntry[]): Row[]` (second parameter changes from a Map to entries).
  - `buildJson(reviews: Review[], entries: VerdictEntry[]): TableJson`.
  - `type TableJson = { schema: 1; findings: JsonFinding[]; approvedReviews: { kind: string; id: string; round: number }[] }`; `type JsonFinding = { id: string; review: { kind: string; id: string }; finding: string; severity: string; raisedRound: number; latestRound: number; latestRuling: { verdict: string; reason: string }; history: { round: number; verdict: string; reason: string }[] }`. The JSON `id` is `"<kind> <id> r<raisedRound> <Fk>"`, for example `task 4 r1 F1`.
  - `runTable(opts: { workspace: string; ledger?: string; out?: string; json?: boolean }): { written: boolean; message: string; json?: string }`.

Rules (spec): exact round first; else the latest earlier raise of the same kind, id and finding id; a line with no match throws `ledger line <n>: <text>: no pack raised <kind> <id> <Fk>; packs read: <pack folders>`; a finding with no line at its own round or later throws `findings with no verdict line: <keys>` (key format `task 1 r1 F2`); latest ruling = highest round, later ledger line wins on a tie; the Verdict cell appends ` [r<N>]` when the latest ruling's round differs from the raised round.

- [ ] **Step 1: Write the failing tests**

In `table.test.ts` replace the import line and the two `buildRows` tests that use `parseVerdictLines`, so they call `parseVerdictEntries(...)` instead (the first test's expectations stay the same). Replace the "names no finding" test with the new message, then add the new tests:

```ts
import { parseVerdictEntries } from "./verdicts.ts";
import { buildJson } from "./table.ts";

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

describe("buildJson", () => {
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
```

Add to `describe("runTable")`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/reviewer/table.test.ts`
Expected: FAIL (`buildJson` missing, `buildRows` takes a Map).

- [ ] **Step 3: Write the implementation**

In `table.ts`: change the imports to `import { parseVerdictEntries, type VerdictEntry } from "./verdicts.ts";` and `import { readReviews, type Finding, type Review } from "./findings.ts";`. Remove the `judgementKey`/`Judgement` imports. Replace `buildRows` and `runTable`, and add the resolver and `buildJson`:

```ts
type Ruling = { round: number; verdict: string; reason: string };
type Resolved = { review: Review; finding: Finding; history: Ruling[] };

const sortReviews = (reviews: Review[]): Review[] =>
  [...reviews].sort((a, b) => {
    const [ak, bk] = [orderKey(a), orderKey(b)];
    return ak[0] - bk[0] || ak[1] - bk[1] || ak[2] - bk[2];
  });

const packName = (r: Review): string => `${r.kind}-${r.id}-r${r.round}`;

// One entry rules on the finding of the pack with the same round, else on the latest earlier raise.
function resolve(reviews: Review[], entries: VerdictEntry[]): Map<Finding, Resolved> {
  const raised = new Map<string, Resolved[]>();
  const all = new Map<Finding, Resolved>();
  for (const r of sortReviews(reviews)) {
    for (const f of r.findings) {
      const res: Resolved = { review: r, finding: f, history: [] };
      all.set(f, res);
      const key = `${r.kind} ${r.id} ${f.id}`;
      raised.set(key, [...(raised.get(key) ?? []), res]);
    }
  }
  for (const e of entries) {
    const candidates = raised.get(`${e.kind} ${e.id} ${e.finding}`) ?? [];
    const target = candidates.find((c) => c.review.round === e.round)
      ?? [...candidates].reverse().find((c) => c.review.round < e.round);
    if (!target) {
      const packs = sortReviews(reviews).map(packName).join(", ");
      throw new Error(`ledger line ${e.line}: ${e.text}: no pack raised ${e.kind} ${e.id} ${e.finding}; packs read: ${packs}`);
    }
    target.history.push({ round: e.round, verdict: e.verdict, reason: e.reason });
  }
  const unjudged = [...all.values()]
    .filter((r) => r.history.length === 0)
    .map((r) => judgementKeyOf(r));
  if (unjudged.length > 0) throw new Error(`findings with no verdict line: ${unjudged.join(", ")}`);
  for (const r of all.values()) r.history.sort((a, b) => a.round - b.round); // stable: ledger order inside a round
  return all;
}

const judgementKeyOf = (r: Resolved): string => `${r.review.kind} ${r.review.id} r${r.review.round} ${r.finding.id}`;
const latest = (r: Resolved): Ruling => r.history[r.history.length - 1];

export function buildRows(reviews: Review[], entries: VerdictEntry[]): Row[] {
  const resolved = resolve(reviews, entries);
  const rows: Row[] = [];
  for (const r of sortReviews(reviews)) {
    if (r.findings.length === 0) {
      rows.push({ type: typeLabel(r), round: r.round, where: "-", severity: "-", what: "approved, no findings", scenario: "-", verdict: "-" });
      continue;
    }
    for (const f of [...r.findings].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
      const l = latest(resolved.get(f) as Resolved);
      const text = l.reason === "" ? l.verdict : `${l.verdict} (${l.reason})`;
      rows.push({
        type: typeLabel(r), round: r.round,
        where: f.line === null ? f.path : `${f.path}:${f.line}`,
        severity: f.severity, what: f.what, scenario: f.scenario,
        verdict: l.round === r.round ? text : `${text} [r${l.round}]`,
      });
    }
  }
  return rows;
}

export type JsonFinding = {
  id: string; review: { kind: string; id: string }; finding: string; severity: string;
  raisedRound: number; latestRound: number; latestRuling: { verdict: string; reason: string };
  history: Ruling[];
};
export type TableJson = { schema: 1; findings: JsonFinding[]; approvedReviews: { kind: string; id: string; round: number }[] };

export function buildJson(reviews: Review[], entries: VerdictEntry[]): TableJson {
  const resolved = resolve(reviews, entries);
  const findings: JsonFinding[] = [];
  const approvedReviews: TableJson["approvedReviews"] = [];
  for (const r of sortReviews(reviews)) {
    if (r.findings.length === 0) { approvedReviews.push({ kind: r.kind, id: r.id, round: r.round }); continue; }
    for (const f of [...r.findings].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
      const res = resolved.get(f) as Resolved;
      const l = latest(res);
      findings.push({
        id: judgementKeyOf(res), review: { kind: r.kind, id: r.id }, finding: f.id, severity: f.severity,
        raisedRound: r.round, latestRound: l.round, latestRuling: { verdict: l.verdict, reason: l.reason },
        history: res.history.map((h) => ({ round: h.round, verdict: h.verdict, reason: h.reason })),
      });
    }
  }
  return { schema: 1, findings, approvedReviews };
}

export function runTable(opts: { workspace: string; ledger?: string; out?: string; json?: boolean }): { written: boolean; message: string; json?: string } {
  if (!opts.json && !opts.out) throw new Error("--out is required without --json");
  if (!fs.existsSync(opts.workspace) || !fs.statSync(opts.workspace).isDirectory()) {
    throw new Error(`workspace: no such folder: ${opts.workspace}`);
  }
  const reviews = readReviews(opts.workspace);
  if (reviews.length === 0) {
    if (!opts.json) return { written: false, message: "no reviews found" };
    const empty = `${JSON.stringify({ schema: 1, findings: [], approvedReviews: [] }, null, 2)}\n`;
    if (!opts.out) return { written: false, message: "no reviews found", json: empty };
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, empty);
    return { written: true, message: `wrote ${opts.out} (0 finding(s))` };
  }
  const ledger = opts.ledger ?? path.join(opts.workspace, "progress.md");
  if (!fs.existsSync(ledger)) throw new Error(`ledger: no such file: ${ledger}`);
  const entries = parseVerdictEntries(fs.readFileSync(ledger, "utf8"));
  if (opts.json) {
    const json = `${JSON.stringify(buildJson(reviews, entries), null, 2)}\n`;
    if (!opts.out) return { written: false, message: "json", json };
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json);
    return { written: true, message: `wrote ${opts.out}` };
  }
  const rows = buildRows(reviews, entries);
  fs.mkdirSync(path.dirname(path.resolve(opts.out as string)), { recursive: true });
  fs.writeFileSync(opts.out as string, renderMarkdown(rows));
  return { written: true, message: `wrote ${opts.out} (${rows.length} row(s))` };
}
```

Delete the old `buildRows`, the old `runTable` and the unused `Judgement`/`judgementKey` import. `orderKey`, `typeLabel`, `cell`, `renderMarkdown` stay.

In `index.ts`: `TableArgs` becomes `{ workspace: string; ledger?: string; out?: string; json?: boolean }`; the `--out` option loses `demandOption: true` and its describe reads `the findings.md file to write (required without --json)`; add `.option("json", { type: "boolean", default: false, describe: "print the findings model as JSON (schema 1) to stdout, or write it to --out" })`; the handler becomes:

```ts
const r = runTable({ workspace: args.workspace, ledger: args.ledger, out: args.out, json: args.json });
console.log(args.json && !args.out ? r.json : r.message);
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/reviewer` and `pnpm exec tsc --noEmit` if the package has a typecheck script (see `packages/cli/package.json`).
Expected: PASS, no type errors. `both-paths.test.ts` still passes (it calls `runTable` with `out`).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/reviewer/table.ts packages/cli/src/reviewer/index.ts packages/cli/src/reviewer/table.test.ts
git commit -m "feat(reviewer): table accepts r2+ verdict lines and prints json"
```

---

### Task 3: Skill text shows the r2 verdict line

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (the "Verdict lines" paragraph in Role Mode, around line 556-563), `skills/reviewer/SKILL.md` (the "Report and table" bullet, line 52)
- Test: `packages/cli/src/reviewer/sdd.test.ts`, `packages/cli/src/reviewer/card.test.ts`

**Interfaces:**
- Consumes: `parseVerdictEntries` (Task 1) for the example check.

- [ ] **Step 1: Write the failing tests**

In `sdd.test.ts` replace the "explains r<R> in a verdict line is the pack round (F5)" test:

```ts
import { parseVerdictEntries } from "./verdicts.ts";

it("shows the r2 re-ruling verdict line with one example that parses (DGS-572)", () => {
  expect(sdd).toMatch(/the raising round or a\s+later round/);
  expect(sdd).toContain("Review task 4 r2: F1 -> fixed (commit abc1234)");
  expect(parseVerdictEntries("Review task 4 r2: F1 -> fixed (commit abc1234)\n")).toHaveLength(1);
  expect(sdd).not.toMatch(/rejects a line whose key names no finding/);
});
```

In `card.test.ts`, in the file's card-related `describe` (use the existing `card` variable; add a new `it` next to the others there):

```ts
it("shows the r2 re-ruling verdict line with one example (DGS-572)", () => {
  expect(card).toContain("Review task 4 r2: F1 -> fixed (commit abc1234)");
  expect(card).toMatch(/later round/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/reviewer/sdd.test.ts src/reviewer/card.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the text**

In `skills/subagent-driven-development/SKILL.md`, replace the last two sentences of the "Verdict lines" paragraph (from `In a verdict line` to `names no finding.`) with:

```
In a verdict line `r<R>` is the raising round or a
later round: the round of the review pack that raised the finding (the `-r<R>`
of its pack folder), or the round of a re-review that rules on it again. Write
the ruling of a re-review the same way, naming the finding id the earlier pack
raised: `Review task 4 r2: F1 -> fixed (commit abc1234)`. `dg reviewer table`
shows the latest ruling per finding. A line that names a finding no pack
raised makes it fail. Never delete or edit an earlier verdict line; add a new one.
```

In `skills/reviewer/SKILL.md`, after the verdict-line bullet add a sub-sentence on the same bullet:

```
- The Builder appends one ledger verdict line per finding, with the human partner's ruling as written: `Review <task|ticket> <id> r<round>: F<n> -> <fixed|parked|rejected> (<reason>)`. `r<round>` is the raising round or a later round. A re-review ruling on an earlier finding is a new line, for example `Review task 4 r2: F1 -> fixed (commit abc1234)`. `dg reviewer table` shows the latest ruling per finding (`--json` gives the history, schema 1). No line is ever deleted.
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/reviewer`
Expected: PASS. Then run the whole package once: `pnpm exec vitest run`.

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md skills/reviewer/SKILL.md packages/cli/src/reviewer/sdd.test.ts packages/cli/src/reviewer/card.test.ts
git commit -m "docs(skills): show the r2 verdict line format"
```
