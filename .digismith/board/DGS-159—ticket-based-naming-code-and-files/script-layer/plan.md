# DGS-159 Part 1+2: Shared Path Modules and the Script Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two shared path modules DGS-159 depends on (`scripts/board-path.ts`,
`scripts/session-path.ts`), close the real gap the maestro's checkpoint-3 review found in the
handoff script layer, and pull `update-history.ts` forward to recognize board-based reports —
per the design at `.digismith/board/DGS-159—ticket-based-naming-code-and-files/script-layer/design.html`.

**Architecture:** Four self-contained script changes, each with its own test file, landing in
dependency order: the two new modules first (nothing else depends on anything in this plan), then
the two existing scripts that import them.

**Tech Stack:** TypeScript (`--experimental-strip-types`, no build step), Vitest, real temp git
repos for every test that touches git plumbing — the existing convention every script in
`scripts/` and `.digismith/hooks/post-finish/scripts/` already follows.

**Process note — read before the task list.** This plan documents work already done. Implementing
`board-path.ts`'s `slugify` required resolving a real ambiguity in jira-intake's own documented
algorithm (Task 1, Step 1's note) that could only be settled by checking its worked example
against actual output — and implementing `update-history.ts`'s board-pathspec support (Task 4)
surfaced a live, independent bug (an em-dash path silently mis-parsed under git's default
`core.quotepath=true`) that a plan written before touching real code would not have caught. Every
task below is already implemented, tested, and committed; checkboxes are checked accordingly. This
plan is the record for checkpoint 4, not a to-do list — re-running Step "verify" commands
reproduces the real, current state of this worktree.

## Global Constraints

- No code in this unit may change `skills/handoff/SKILL.md`'s own text — section 8.1 of the
  design is explicit that this is a script-only fix (maestro's checkpoint-3 instruction).
- No `.git/info/exclude` change in this unit (design section 5, confirmed correct at checkpoint 3).
- Every script that shells out to `git` on a path containing a real em dash (U+2014) must use
  `-z`/NUL-terminated output, never newline-split plain `--name-only` (design section 9; the
  concrete failure mode is Task 4's own finding).
- Times written in UTC+7 first, UTC in brackets (standing repo rule).
- No AI attribution in any commit (repo rule).

---

### Task 1: `scripts/board-path.ts` — build/parse `<KEY>—<slug>` board folder names

**Files:**
- Create: `scripts/board-path.ts`
- Test: `scripts/board-path.test.ts`

**Interfaces:**
- Consumes: nothing in this plan — this is the first module.
- Produces: `slugify(title: string): string`, `buildFolderName(key: string, title: string): string`,
  `boardRelPath(key: string, title: string): string`, `parseFolderName(name: string): { key: string; slug: string }`,
  `BOARD_DIR_PATH` (`.digismith/board`). Task 4 does not import this module directly (it derives
  its own board-shaped regex independently, per the design's own scope note), but any later part
  of DGS-159 (Parts 3/4/6) does.

- [x] **Step 1: Write the failing tests**

jira-intake's own worked example (`skills/jira-intake/SKILL.md` Step 3.1 — "Fix cart drawer
padding on mobile checkout" → `fix-cart-drawer-padding-mobile`) only reproduces if the ~40-char
truncation budget is spent on the *original* word sequence (fillers included) and fillers are
dropped only from what survives truncation — the literal prose order ("drop filler words...
truncate") does not reproduce it, since "checkout" alone would still fit inside a filler-dropped
budget. `scripts/board-path.test.ts` locks in the order that actually matches the example:

```typescript
import { describe, it, expect } from "vitest";
import { BOARD_DIR_PATH, slugify, buildFolderName, boardRelPath, parseFolderName } from "./board-path.ts";

describe("slugify", () => {
  it("lowercases, drops filler words, and hyphenates", () => {
    expect(slugify("Fix Cart Drawer Padding")).toBe("fix-cart-drawer-padding");
  });

  it("spends the ~40-character budget on the original word sequence, fillers included, then drops fillers from what survives", () => {
    expect(slugify("Fix cart drawer padding on mobile checkout")).toBe("fix-cart-drawer-padding-mobile");
  });

  it("never leaves a trailing filler word when one would otherwise land at the truncation boundary", () => {
    const title = "alpha bravo charlie delta to fourteenchars12";
    expect(slugify(title)).toBe("alpha-bravo-charlie-delta");
  });
});

describe("parseFolderName", () => {
  it("fails loudly on a plain hyphen substituted for the em dash", () => {
    expect(() => parseFolderName("DGS-159-ticket-based-naming")).toThrow("no em dash (U+2014) found");
  });
});
```

(The full suite — 15 tests across `slugify`, `buildFolderName`, `boardRelPath`, `parseFolderName`
— is already in `scripts/board-path.test.ts`; the excerpt above is the part that would fail
against a naive first implementation.)

- [x] **Step 2: Run the tests to verify they fail against no implementation**

Run: `npx vitest run scripts/board-path.test.ts`
Result (verified live, against a stub file with empty exports): every test fails with "is not a
function" / "is not exported" — confirmed before writing the real implementation.

- [x] **Step 3: Implement `scripts/board-path.ts`**

```typescript
export const BOARD_DIR_PATH = ".digismith/board";
const EM_DASH = "—";
const KEY_PATTERN = /^[A-Z]+-\d+$/;
const FILLER_WORDS = new Set(["a", "an", "the", "on", "to", "of", "for", "in"]);

export function slugify(title: string): string {
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const next = kept.length === 0 ? word.length : length + 1 + word.length;
    if (next > 40) break;
    kept.push(word);
    length = next;
  }
  return kept.filter((word) => !FILLER_WORDS.has(word)).join("-");
}

export function buildFolderName(key: string, title: string): string {
  return `${key.toUpperCase()}${EM_DASH}${slugify(title)}`.normalize("NFC");
}

export function boardRelPath(key: string, title: string): string {
  return `${BOARD_DIR_PATH}/${buildFolderName(key, title)}`;
}

export type ParsedFolderName = { key: string; slug: string };

export function parseFolderName(name: string): ParsedFolderName {
  const dashIndex = name.indexOf(EM_DASH);
  if (dashIndex === -1) throw new Error(`no em dash (U+2014) found in board folder name: ${name}`);
  const rawKey = name.slice(0, dashIndex).toUpperCase();
  if (!KEY_PATTERN.test(rawKey)) throw new Error(`board folder name's key part is not <PREFIX>-<number>: ${name}`);
  return { key: rawKey, slug: name.slice(dashIndex + EM_DASH.length) };
}
```

Full file, with its reasoning comments, is at `scripts/board-path.ts`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/board-path.test.ts`
Result: 15/15 passed.

- [x] **Step 5: Commit**

```bash
git add scripts/board-path.ts scripts/board-path.test.ts
git commit -m "feat(board-path): add build/parse for <KEY>—<slug> board folder names"
```
Committed as `5bedd2b`.

---

### Task 2: `scripts/session-path.ts` — build/parse session note and brief paths

**Files:**
- Create: `scripts/session-path.ts`
- Test: `scripts/session-path.test.ts`

**Interfaces:**
- Consumes: nothing in this plan.
- Produces: `SESSIONS_DIR_PATH` (`.digismith/sessions`), `NOTE_FILENAME` (`note.md`),
  `BRIEF_FILENAME` (`brief.md`), `isSafeSessionName(name: string): boolean`,
  `noteRelPath(sessionName: string): string`, `briefRelPath(sessionName: string): string`,
  `listNoteSessionNames(mainRoot: string): string[]`. Task 3 imports `listNoteSessionNames`
  directly.

- [x] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SESSIONS_DIR_PATH, listNoteSessionNames } from "./session-path.ts";

describe("listNoteSessionNames", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-path-test-")); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  function writeFile(root: string, relPath: string): void {
    const full = path.join(root, ...relPath.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
  }

  it("excludes a brief-only folder (a worker)", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/dgs-161/brief.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith"]);
  });

  it("excludes workbox-archive (a dated subfolder, not a note, directly inside it)", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/workbox-archive/2026-09-26-v8-sol-review/progress.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith"]);
  });
});
```

(Full suite — 16 tests across `isSafeSessionName`, `noteRelPath`/`briefRelPath`,
`listNoteSessionNames` — is already in `scripts/session-path.test.ts`; this excerpt is the pair
the maestro named explicitly in the checkpoint-3 correction.)

- [x] **Step 2: Run the tests to verify they fail against no implementation**

Run: `npx vitest run scripts/session-path.test.ts`
Result (verified live, against a stub file): every test fails with "is not exported" — confirmed
before writing the real implementation.

- [x] **Step 3: Implement `scripts/session-path.ts`**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

export const SESSIONS_DIR_PATH = ".digismith/sessions";
export const NOTE_FILENAME = "note.md";
export const BRIEF_FILENAME = "brief.md";

export function isSafeSessionName(name: string): boolean {
  return name.length > 0 && name !== ".." && !name.startsWith(".") && !name.includes("/") && !name.includes("\\");
}

export function noteRelPath(sessionName: string): string {
  return `${SESSIONS_DIR_PATH}/${sessionName}/${NOTE_FILENAME}`;
}

export function briefRelPath(sessionName: string): string {
  return `${SESSIONS_DIR_PATH}/${sessionName}/${BRIEF_FILENAME}`;
}

function subdirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function hasFile(dir: string, filename: string): boolean {
  try {
    return fs.statSync(path.join(dir, filename)).isFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

export function listNoteSessionNames(mainRoot: string): string[] {
  const dir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
  return subdirs(dir)
    .filter((name) => isSafeSessionName(name) && hasFile(path.join(dir, name), NOTE_FILENAME))
    .sort();
}
```

Full file, with its reasoning comments, is at `scripts/session-path.ts`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/session-path.test.ts`
Result: 16/16 passed.

- [x] **Step 5: Commit**

```bash
git add scripts/session-path.ts scripts/session-path.test.ts
git commit -m "feat(session-path): add build/parse for session note and brief paths"
```
Committed as `f4665cc`.

---

### Task 3: Fix the real gap the maestro's checkpoint-3 review found

**Files:**
- Modify: `scripts/lineage-handoff.ts`
- Modify: `scripts/session-init.ts`
- Test: `scripts/lineage-handoff.test.ts`
- Test: `scripts/session-init.test.ts`

**Interfaces:**
- Consumes: `listNoteSessionNames` from Task 2's `scripts/session-path.ts`.
- Produces: `lineage-handoff.ts`'s `main()` (`--action list`) now prints fallback keys *and*
  current-convention session names, one per line. `session-init.ts`'s
  `buildLineagePointer(mainRoot: string): string | undefined` now combines both kinds into one
  banner line, joined with `"; "` when both exist — byte-for-byte identical output to before this
  change when no current-convention note exists yet (every existing caller of `buildLineagePointer`
  is unaffected).

**Why this exists.** The original design (section 4, now struck through and corrected in section
8.1) argued the SessionStart banner was deliberately fallback-only forever. The maestro checked
this against the repo and found the opposite is documented directly:
`skills/handoff/SKILL.md`'s own Overview table says the script "still know[s] only [the old
paths] until DGS-159 migrates them", and its own `--action list` documentation ("list the folders
under `.digismith/sessions/` that hold a `note.md`") has never matched what `lineage-handoff.ts`'s
`listNotes` actually scans (`.digismith/docs/` only, to this day). Once Part 6 moves the six
fallback notes away, `listNotes` returns `[]` and a fresh maestro gets no pointer to its own note
at all — a real regression this plan closes before it can happen.

- [x] **Step 1: Write the failing tests**

```typescript
// scripts/lineage-handoff.test.ts — new case alongside the existing "--action list" test
it("--action list also prints current-convention session names after the fallback keys", () => {
  const main = path.join(tmpDir, "main");
  initRepo(main);
  writeNote(main, ".digismith/docs/A/A.1/handoff.md");
  writeNote(main, ".digismith/sessions/DigiSmith/note.md", "# Note\n");
  writeNote(main, ".digismith/sessions/dgs-161/brief.md", "# Brief\n");

  const result = runCli(main, "--action", "list");

  expect(result.status).toBe(0);
  expect(result.stdout.trim().split(/\r?\n/)).toEqual(["A/A.1", "DigiSmith"]);
});
```

```typescript
// scripts/session-init.test.ts — new cases alongside the existing buildLineagePointer describe block
it("names a current-convention session note on its own, once no fallback notes exist", () => {
  writeNote(tmpDir, ".digismith/sessions/DigiSmith/note.md");
  expect(buildLineagePointer(tmpDir)).toBe(
    `DigiSmith: session notes in ${path.join(tmpDir, ".digismith", "sessions")}: DigiSmith — read the one matching your session title (get_session self), or say "resume"`,
  );
});

it("combines fallback notes and current-convention session notes in one line", () => {
  writeNote(tmpDir, ".digismith/docs/A/A.1/handoff.md");
  writeNote(tmpDir, ".digismith/sessions/DigiSmith/note.md");
  expect(buildLineagePointer(tmpDir)).toBe(
    `DigiSmith: lineage handoff notes in ${path.join(tmpDir, ".digismith", "docs")}: A/A.1; ` +
      `session notes in ${path.join(tmpDir, ".digismith", "sessions")}: DigiSmith — read the one matching your session title (get_session self), or say "resume"`,
  );
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lineage-handoff.test.ts scripts/session-init.test.ts`
Result (verified live, before the implementation edits below): the two new cases failed — the CLI
printed only `["A/A.1"]` (no session name), and `buildLineagePointer` returned `undefined` /
the fallback-only string without the session-notes clause. The other 71 pre-existing tests in
these two files passed unaffected, confirming the baseline.

- [x] **Step 3: Implement**

`scripts/lineage-handoff.ts` — import `listNoteSessionNames` and print it after the fallback keys
in `main()`'s `"list"` case:

```typescript
import { listNoteSessionNames } from "./session-path.ts";
// ...
case "list": {
  for (const key of listNotes(mainRoot)) console.log(key);
  for (const name of listNoteSessionNames(mainRoot)) console.log(name);
  break;
}
```

A top-of-file comment records that `listNotes`/`parseLineageKey` stay fallback-only on purpose —
`session-path.ts` is the sibling for current paths — so a future reader doesn't try to fold the
two together inside this file.

`scripts/session-init.ts` — combine both lists in `buildLineagePointer`:

```typescript
import { SESSIONS_DIR_PATH, listNoteSessionNames } from "./session-path.ts";
// ...
export function buildLineagePointer(mainRoot: string): string | undefined {
  const keys = listNotes(mainRoot);
  const sessionNames = listNoteSessionNames(mainRoot);
  if (keys.length === 0 && sessionNames.length === 0) return undefined;

  const clauses: string[] = [];
  if (keys.length > 0) {
    const docsDir = path.join(mainRoot, ...DOCS_DIR_PATH.split("/"));
    clauses.push(`lineage handoff notes in ${docsDir}: ${keys.join(", ")}`);
  }
  if (sessionNames.length > 0) {
    const sessionsDir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
    clauses.push(`session notes in ${sessionsDir}: ${sessionNames.join(", ")}`);
  }
  return `DigiSmith: ${clauses.join("; ")} — read the one matching your session title (get_session self), or say "resume"`;
}
```

`skills/handoff/SKILL.md`'s own text is **not** touched — per the maestro's instruction, this task
is script-only.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lineage-handoff.test.ts scripts/session-init.test.ts`
Result: 41/41 and 34/34 passed (75 total — 71 pre-existing plus 4 new, all green; no pre-existing
test needed a change, since the fallback-only output is byte-for-byte unchanged when no
current-convention note exists).

- [x] **Step 5: Commit**

```bash
git add scripts/lineage-handoff.ts scripts/lineage-handoff.test.ts scripts/session-init.ts scripts/session-init.test.ts
git commit -m "feat(handoff): list current-convention session notes alongside the fallback ones"
```
Committed as `e6a7762`.

---

### Task 4: `update-history.ts` — recognize board/ reports, and fix a live em-dash bug

**Files:**
- Modify: `.digismith/hooks/post-finish/scripts/update-history.ts`
- Test: `.digismith/hooks/post-finish/scripts/update-history.test.ts`
- Modify: `.digismith/hooks/post-finish/03-history-update.md` (one sentence, describing the
  pathspec this task changes)

**Interfaces:**
- Consumes: nothing from Tasks 1–3 (deliberately independent — the design's own scope note:
  guessing at a future board-report header shape is Part 4/6's call, not this task's).
- Produces: `ParsedReport` gains a `base: "docs" | "board"` field. `buildReferenceLinks(slug: string, base: "docs" | "board", cwd?: string): string`
  — signature change, `base` is now a required second parameter (previously `cwd` was second).

- [x] **Step 1: Write the failing tests**

```typescript
// findChangedReports — board shape
it("returns a board/<key>—<slug>/report.html path added since the base commit", () => {
  const dir = makeTmpDir("update-history-repo-");
  initHistoryFixtureRepo(dir);
  const baseSha = revParseHead(dir);
  const slug = "DGS-159—ticket-naming-script-layer";
  const reportPath = path.join(dir, ".digismith", "board", slug, "report.html");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  writeReportFixture(reportPath);
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "add board report"], { cwd: dir });
  const headSha = revParseHead(dir);

  expect(findChangedReports(baseSha, headSha, dir)).toEqual([`.digismith/board/${slug}/report.html`]);
});

// parseReport — board shape, two segments (a part subfolder)
it("extracts a two-segment board slug (a part subfolder), with base \"board\"", () => {
  const dir = makeTmpDir("update-history-test-");
  const slugDir = path.join(dir, ".digismith", "board", "DGS-159—ticket-naming-script-layer", "script-layer");
  fs.mkdirSync(slugDir, { recursive: true });
  const reportPath = path.join(slugDir, "report.html");
  writeReportFixture(reportPath, { title: "Shared Path Modules", mapItem: "DGS-159", date: "2026-10-04", summary: "Built the modules." });

  const parsed = parseReport(reportPath);
  expect(parsed.slug).toBe("DGS-159—ticket-naming-script-layer/script-layer");
  expect(parsed.base).toBe("board");
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run .digismith/hooks/post-finish/scripts/update-history.test.ts`
Result (verified live, before any implementation change): the board-shaped `findChangedReports`
test failed with an empty array (the pathspec never matched `.digismith/board/`); the board-shaped
`parseReport` test failed with "Cannot derive slug from report path" (the regex only knew
`docs/`). The three pre-existing `parseReport` success-case assertions also needed a `base: "docs"`
field added to their expected objects, since `base` is a new required field on every result —
done in this same step, confirmed as an expected, not accidental, diff.

- [x] **Step 3: Implement — then find and fix a live bug the new test surfaced**

Pathspec and slug parsing:

```typescript
const result = spawnSync("git", [
  "diff", "--name-only", "-z", "--diff-filter=AM", `${baseSha}..${headSha}`,
  "--", ".digismith/docs/*/report.html", ".digismith/board/*/report.html",
], { cwd, encoding: "utf8" });
// ...
return result.stdout.split("\0").filter((line) => line.length > 0);
```

```typescript
const BOARD_SLUG_PATTERN = /\.digismith\/board\/([^/]+(?:\/[^/]+)?)\/report\.html$/;
const DOCS_SLUG_PATTERN = /\.digismith\/docs\/((?:[^/]+\/){0,2}[^/]+)\/report\.html$/;
// ...
const boardMatch = BOARD_SLUG_PATTERN.exec(normalizedPath);
const docsMatch = boardMatch ? null : DOCS_SLUG_PATTERN.exec(normalizedPath);
const slug = boardMatch?.[1] ?? docsMatch?.[1];
const base: "docs" | "board" = boardMatch ? "board" : "docs";
```

```typescript
export function buildReferenceLinks(slug: string, base: "docs" | "board", cwd: string = process.cwd()): string {
  const folder = path.join(cwd, ".digismith", base, slug);
  // ... each href becomes `${base}/${slug}/...` instead of a hardcoded `docs/...`
}
```

**The bug Step 2's test caught before this step started:** a first pass at this implementation
kept the original plain `--name-only` (no `-z`) and newline-split. Running the new board-shaped
test against *that* version failed — not on logic, but on git's own output: a board folder name
carries a real em dash (U+2014), and git's default `core.quotepath=true` octal-escapes any byte
≥0x80 in plain `--name-only` output (`".digismith/board/DGS-159\342\200\224ticket.../report.html"`,
confirmed live), which a newline-split can't turn back into a real path. This is exactly the risk
the design's own section 9 table names for this character — just not yet hit by any caller until
this task's own board-shaped path exercised it. Fixed by switching to `-z` (NUL-terminated,
unquoted, real UTF-8 bytes) and splitting on `"\0"` instead of `"\n"` — see the pathspec code
above, already written with the fix in place.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run .digismith/hooks/post-finish/scripts/update-history.test.ts`
Result: 29/29 passed (24 pre-existing, 5 new — 2 `findChangedReports` board cases, 2 `parseReport`
board cases, 1 `buildReferenceLinks` board case — all green, including the two board-shaped
`findChangedReports` tests that only pass with the `-z` fix in place).

- [x] **Step 5: Update the hook doc's one stale sentence**

`.digismith/hooks/post-finish/03-history-update.md` described the `NOTHING` result as meaning no
`.digismith/docs/<slug>/report.html` existed in range — now says `docs/<slug>/report.html` or
`board/<key>—<slug>/report.html`, and adds the `<part>` subfolder case to the existing parenthetical
about what `parseReport` already matches.

- [x] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/update-history.ts .digismith/hooks/post-finish/scripts/update-history.test.ts
git commit -m "fix(history): recognize board/ reports and fix em-dash path parsing"
```
Committed as `89dd365`. (The doc-sentence fix in `03-history-update.md` landed earlier, bundled
with the design-doc correction commit `e57207d` — both are documentation-only changes recording
the same checkpoint-3 correction, not code.)

---

### Task 5: Whole-unit verification and report

**Files:**
- Create: `.digismith/board/DGS-159—ticket-based-naming-code-and-files/script-layer/report.html`

**Interfaces:**
- Consumes: Tasks 1–4's commits (`5bedd2b`, `f4665cc`, `e6a7762`, `89dd365`) and this plan's own
  commit.
- Produces: a closed-out unit — a report summarizing what shipped, committed, ready for the
  maestro's merge order.

- [ ] **Step 1: Run the full repo test suite**

Run: `npx vitest run`
Expected: every test file this plan touched passes; the two pre-existing unrelated failures
(`packages/cli/src/index.e2e.test.ts`'s color-code assertion, `packages/cli/src/depot/process-lifecycle.test.ts`'s
netstat-dependent case) are unchanged by this branch — confirm by their failure messages matching
what they already showed before this plan's commits, not a new failure signature.

- [ ] **Step 2: Write `report.html`**

Run `date` first and use its real output — the shipped file must contain the actual date as plain
text. Same HTML shell as `design.html` (byte-for-byte `<style>` block), summarizing: the two new
modules, the checkpoint-3 correction to the handoff script layer, the `update-history.ts` board
support and the em-dash bug it caught, and the three remaining open items this unit does not
touch (Parts 3–7, waiting on Jack).

- [ ] **Step 3: Commit**

```bash
git add ".digismith/board/DGS-159—ticket-based-naming-code-and-files/script-layer/report.html"
git commit -m "docs(ticket-naming): report for DGS-159 Part 1+2"
```

- [ ] **Step 4: Report to the maestro**

State: all commit hashes and messages, the files touched, that this plan is implemented and
tested in full, and that Parts 3–7 remain untouched. Do not push: wait for "approved: push"
(standing brief rule).
