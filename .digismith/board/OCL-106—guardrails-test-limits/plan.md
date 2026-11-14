# guardrails.test stops pinning the worker limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ticket:** OCL-106 (task id `14zcebryb8u`). **Spec:** `spec.md` in this folder.

**Goal:** The `packages/cli` suite passes with the day limits 2/2/1, the night limits 1/1/1 and any limits the parser accepts. The repo config file is read and never edited.

**Architecture:** Two test files change. `guardrails.test.ts`: the real-file test checks shape, a new `it.each` proves 2/2/1 and 1/1/1 on in-memory text. `index.test.ts`: the scan tests read limits from an empty temp checkout. `run/index.test.ts` and `run/start-other.test.ts`: `process.cwd()` is pinned to an empty temp dir. No product code.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), vitest 2, pnpm.

## Global Constraints

- Docs-free, test-only. No product code, no change to the repo's config file, no new service, no sudo, no delete.
- Test-first in every task: see the test fail for the stated reason, then pass.
- Commits: title-only conventional commits, scope `autonomous` (never `ocl-106`); no AI attribution; never on main unless the conductor says merge; push only when the conductor says so.
- Run tests on changed files only, fork pool of 2: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 <files>` from `packages/cli`. Check `uptime` first: load under 4. The whole `packages/cli` suite runs once, in Task 5.

## Protected paths this plan touches (the Maestro approves the merge)

- `packages/cli/src/autonomous/`: `guardrails.test.ts` (Task 1), `index.test.ts` (Task 2). Test files only.
- `packages/cli/src/run/`: `index.test.ts`, `start-other.test.ts` (Task 3). Test files only; this folder is not one of the paths named above, so it adds no approval.
- No other authority path is touched.

## Findings the build must fix

| ID | Finding | Task |
|---|---|---|
| F1 | Real-file test pins `limits` 2/1/1 (fails on 2/2/1) and `staleAfterMinutes` 120 | 1 |
| F2 | No proof that the parser reads the day and night limits clean | 1 |
| F3 | Scan tests read the limits of the real checkout (fails on 1/1/1) | 2 |
| F4 | `dg run start` tests read the limits through `process.cwd()` (`run/index.test.ts`, `run/start-other.test.ts`; "list hides runs idle for more than 7 days" fails on 1/1/1) | 3 |

---

### Task 1: guardrails.test.ts checks shape and proves both limit sets

**Files:** Modify `packages/cli/src/autonomous/guardrails.test.ts` (describe "this repo's own config.yml", line 130).

- [ ] **Step 1: Confirm the red.** From `packages/cli` run the file. Expect one failure: `g.limits` reviewer expected 1, got 2. Note the output in the report.
- [ ] **Step 2: Write the new tests.** In the describe, replace the two pin lines (`g.limits` toEqual, `g.staleAfterMinutes` toBe 120) with:

```ts
for (const kind of ["builder", "reviewer", "role"] as const) {
  expect(Number.isInteger(g.limits[kind])).toBe(true);
  expect(g.limits[kind]).toBeGreaterThanOrEqual(0);
  expect(g.limits[kind]).toBeLessThanOrEqual(9);
}
expect(Number.isInteger(g.staleAfterMinutes)).toBe(true);
expect(g.staleAfterMinutes).toBeGreaterThanOrEqual(1);
expect(g.staleAfterMinutes).toBeLessThanOrEqual(1440);
```

  Keep the lines for `problems`, `scanProblems`, `scanEveryMinutes` 15, the `scan_every_minutes: 15` regex, the scheduler path in `protectedPaths`, and `limitProblems` empty.
- [ ] **Step 3: Add the both-sets proof** in the same describe:

```ts
it.each([
  ["day", { builder: 2, reviewer: 2, role: 1 }],
  ["night", { builder: 1, reviewer: 1, role: 1 }],
])("reads clean with the %s limits", (_name, want) => {
  const text = readFileSync(new URL("../../../../.digismith/config.yml", import.meta.url), "utf-8");
  const block = `  limits:\n    builder: ${want.builder}\n    reviewer: ${want.reviewer}\n    role: ${want.role}\n`;
  const swapped = text.replace(/^  limits:\n(?:    .*\n)+/m, block);
  expect(swapped).toContain(block); // fails loudly if the file loses its limits block
  const g = readGuardrails(swapped);
  expect(g.problems).toEqual([]);
  expect(g.limitProblems).toEqual([]);
  expect(g.limits).toEqual(want);
});
```

- [ ] **Step 4: Run the file.** All tests pass with the config at 2/2/1.
- [ ] **Step 5: Prove the test still guards its purpose.** Run once with the scan line broken in memory: a throwaway local check (not committed) that `readGuardrails(text.replace("scan_every_minutes: 15", "scan_every_minutes: 4"))` gives a `scanProblems` entry, so the real-file test would fail. Note the result in the report.
- [ ] **Step 6: Commit.** `test(autonomous): guardrails config test checks the limits shape, not the numbers`

---

### Task 2: scan tests read limits from an empty checkout

**Files:** Modify `packages/cli/src/autonomous/index.test.ts` (describe "dg autonomous scan", line 177).

- [ ] **Step 1: Check what the describe's tests need.** Read lines 177-300 and `parse`/`deps`. Find every test in the describe that goes through the scan claim or busy path, and the test "tick without --repo fetches in the main checkout, with --repo in that repo" (line 288, describe "dg autonomous tick, journal and the Phase line", line 274, expects `MAIN_CHECKOUT` at line 306). It is outside the scan describe and stays untouched; do not change `deps()` for the whole file.
- [ ] **Step 2: Make a red.** Make a scratch checkout with a 1/1/1 config. From `packages/cli`:

```sh
S=$(mktemp -d "$TMPDIR/ocl106-main-XXXX"); mkdir -p "$S/.digismith"
printf 'nightwatch:\n  scan_every_minutes: 15\n  limits:\n    builder: 1\n    reviewer: 1\n    role: 1\n' > "$S/.digismith/config.yml"
DIGISMITH_MAIN_CHECKOUT="$S" pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/autonomous/index.test.ts
```

  Expect: "one busy hand builder leaves a slot" fails (`scan: busy`, no claim). List every failing test in the report. Do not edit the repo config.
  Second red: write the scratch config with `builder: 0` and run again. Every scan test that claims a ticket fails (limit 0 blocks the kind). List them: this list is the set Step 3 must switch, so none is missed.
- [ ] **Step 3: Fix.** In the describe, add a `let emptyMain: string` made in `beforeEach` with `mkdtempSync(join(root, "main-"))` (no config inside), and give the scan tests that claim or count builders a parse helper `parseScan = (args) => yargs(args).exitProcess(false).command(createAutonomousCommand(() => ({ ...deps(), mainRepo: emptyMain }))).strict().parseAsync()`. Switch those tests (the ones listed in Step 1) to it. Leave the line 288 test on `parse`.
- [ ] **Step 4: Green with both.** Run the file twice: once without the env var, once with `DIGISMITH_MAIN_CHECKOUT="$S"` (1/1/1). Both pass. Then edit only the scratch config to 2/2/1 and run again: pass. Then with `builder: 0` in the scratch config: the scan tests that claim now pass too, which proves all of them were switched (any failure is a test Step 3 missed).
- [ ] **Step 5: Commit.** `test(autonomous): scan tests do not read the real worker limits`

---

### Task 3: `dg run` tests do not read the real limits through process.cwd()

**Files:** Modify `packages/cli/src/run/index.test.ts` and `packages/cli/src/run/start-other.test.ts`.

Why: `dg run start` calls `startRefusal(process.env, process.cwd(), ...)`, which reads the main checkout's config (`run/limit-check.ts:38`, `mainCheckout(cwd)`). Only the describe "dg run limit (DGS-665)" (`run/index.test.ts:173`) pins `process.cwd()`. Readers at `run/index.test.ts` lines 57, 83, 156, 280-298 and `run/start-other.test.ts:33` run in the real checkout, so they see Jack's limits. At 1/1/1 "list hides runs idle for more than 7 days" fails.

- [ ] **Step 1: Make the red.** Build the scratch copy as Task 5 Step 3 describes (do it here first) (git archive, `git init -q`, linked `node_modules`, changed files copied, limits 1/1/1, `dg run limit` check) and run both files from `<copy>/packages/cli` with `DIGISMITH_MAIN_CHECKOUT` set to the copy. Expect failures in both files; list every failing test in the report. Repeat with `builder: 0` in the copy's config for a second list. The repo config is never edited. Task 5 reuses this copy.
- [ ] **Step 2: Pin the cwd.** In each file, `tmp` (the temp depot dir, made in the top-level `beforeEach`) holds no `.digismith`, so it reads as an empty checkout. Pin to it: in `run/index.test.ts` add `vi.spyOn(process, "cwd").mockReturnValue(tmp)` in the top-level `beforeEach`, and add the same spy again at the end of `capture()`, right after its `vi.restoreAllMocks()`. `capture()` restores all mocks, so the second pin keeps the next call in the same test pinned. Do not pin at the start of `capture()`: the describe "dg run limit (DGS-665)" sets its `dgc` spy before it calls `capture()`, and a pin at the start would override it (`run/index.test.ts:183-187`). With the pin at the end, `dgc`'s later spy wins for its call. In `start-other.test.ts` add the same spy in the test body before the `parseAsync` call, or in a `beforeEach` plus after each restore if the file restores mocks between calls. The describe "dg run limit (DGS-665)" keeps its own `dgc` pin (it uses its own `cwdDir` with a written config); its pin overrides the new one.
- [ ] **Step 3: Green with all three.** The copy was built in Step 1, before Step 2's edits. Copy the two edited files (`run/index.test.ts`, `run/start-other.test.ts`) into the copy again. Then run both files from the copy with 1/1/1, with 2/2/1 and with `builder: 0`: pass. Run them once from the real checkout: pass.
- [ ] **Step 4: Commit.** `test(run): run tests do not read the real worker limits`

---

### Task 4: Find any other limit pin

- [ ] **Step 1: Grep.** From the repo root: `grep -rnE "limits\)?\.toEqual|builder: [0-9]|reviewer: [0-9]" packages scripts --include='*.test.ts'` and `grep -rln "\.digismith/config.yml" packages scripts --include='*.test.ts'`. For each file that reads the real config (not a temp one), say in the report whether it checks limits or the stale window.
- [ ] **Step 2: Fix or report.** A file that pins the real limits gets the Task 1, 2 or 3 treatment (test-first, same commit style). A file that only reads other keys stays. If there is a pin in a path outside `packages/cli/src/autonomous/`, fix it and name the path in the report.

---

### Task 5: Full suite with both limit sets

- [ ] **Step 1: Load.** `uptime`: load under 4.
- [ ] **Step 2: Day.** From `packages/cli`: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2`. Expect all pass with the real config (2/2/1). Report the count.
- [ ] **Step 3: Night.** Make a scratch copy and edit only the copy. `git archive` writes no `.git`, so without a git root `mainCheckout(cwd)` returns the cwd and finds no config. Steps: `git archive HEAD | tar -x -C "$X"` into a new directory under `$TMPDIR`; `git init -q` in `$X` (the copy root is now a git root); link the installed `node_modules` (root and `packages/cli`); set the copy's limits to 1/1/1; copy over every changed file of the branch (`git diff --name-only main...HEAD`, plus uncommitted changes from `git status --short`), not only the two or three test files; set `DIGISMITH_MAIN_CHECKOUT="$X"`.
  **Check the copy before the run:** from `$X/packages/cli`, `dg run limit` (or `node --experimental-strip-types src/index.ts run limit`) must print `builder x/1`, `reviewer x/1`, `role x/1`. Any kind shown with a limit other than 1 means the copy reads the wrong config: stop and fix the copy.
  Then run the same suite command from `$X/packages/cli`. Expect all pass. Report the count. Leave the copy in place (no delete); name its path in the report.
- [ ] **Step 4: Also run** `scripts/own-repo-config.test.ts` and `scripts/config*.test.ts` from the repo root with the same pool flags. Expect pass.
- [ ] **Step 5: Report.** `report.md` in the board folder: the red outputs of Task 1 and Task 2, the green runs, the counts, anything Task 4 found.

## Self-review against the spec

- D1 and D2: Task 1 Step 2. D3: Task 1 Step 3-4. D4: Task 2. `dg run` tests: Task 3. D5: red steps first in Tasks 1, 2 and 3.
- Done-when: Task 5 Steps 2-3. "Still checks 15 and clean": Task 1 Step 2 keeps those lines, Step 5 proves it.
