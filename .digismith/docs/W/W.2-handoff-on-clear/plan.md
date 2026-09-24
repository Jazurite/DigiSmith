# Handoff on Clear (W.12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap where `finishing-a-development-branch`'s Step 7 only ever gives a verbal, never-written-down warning before clearing a session's context — Step 7 now writes a 5-section markdown handoff to `.digismith/sessions/<session-id>.md` on every clear, and W.10's `SessionStart` hook (`session-init.ts`) points to it whenever one exists.

**Architecture:** Two independent halves, no dependency between them beyond agreeing on a shared file-format contract (first line is an `# ` H1 title; file lives at `.digismith/sessions/<id>.md`). Task 1 builds the *read* side: new pure functions in `scripts/session-init.ts` that find the newest pending handoff and print a pointer, wired as an independent check in `main()` (never nested inside the existing profile-gated `buildBanner`, since that returns `null` whenever no `.digismith/profile` exists — always true for DigiSmith's own repo). Task 2 builds the *write* side: rewrites `finishing-a-development-branch`'s Step 7 to compose and write the file instead of speaking a warning, plus a one-time `.gitignore` self-heal.

**Tech Stack:** TypeScript (`session-init.ts`), Vitest with real temp-dir fixtures (this file's existing style — no mocked fs), Markdown/prose (the Step 7 skill-file edit).

## Global Constraints

- Full spec: `.digismith/docs/W/W.2-handoff-on-clear/design.html` — read it if anything below is ambiguous.
- File location: `.digismith/sessions/<session-id>.md`, one file per clear, never a single overwritten slot.
- File format, exact, single source of truth for both tasks: an `# <title>` H1 as the file's first line, followed by exactly 5 `##` sections in this order and with these exact headers: `Where this fits`, `Status per unit of work`, `Exact resume point`, `Anything flagged but deliberately out of scope`, `Literal resume commands`.
- `scripts/session-init.ts`'s existing exported functions (`readProfile`, `loadVoiceSummary`, `formatBanner`, `buildBanner`, `isDigismithRepoRoot`, `main`) keep their exact current signatures — every new function in Task 1 is a fully independent addition, never threaded through `buildBanner`.
- The handoff pointer must print regardless of `.digismith/profile` presence — verify this explicitly with a test that has no profile file at all (mirrors the existing "prints the attribution reminder in DigiSmith's own repo even with no profile" test's shape).
- Test command for this repo: `pnpm test` (runs `vitest run`). Single file: `pnpm exec vitest run <path>`.
- Commit messages: title only, no body, **no AI attribution of any kind** (no `Co-Authored-By`, no "Generated with", no robot emoji) — this repo's standing rule. After every commit, run `git log -1 --format=%B` and confirm the message is exactly the one line you intended.
- Windows checkout: do not change a file's existing line-ending style; edit in place.
- This is DigiSmith's own self-development. Other Claude Code sessions may be concurrently active on the same repo. Before any edit that relies on an exact "find" substring against a shared doc (`skills/finishing-a-development-branch/SKILL.md`), confirm the substring still matches the file's current content; if it doesn't, stop and report rather than guess at a fuzzy replacement.

---

### Task 1: Handoff pointer in `session-init.ts`

**Files:**
- Modify: `scripts/session-init.ts`
- Modify: `scripts/session-init.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `SESSIONS_DIR_PATH` (exported constant, value `".digismith/sessions"`) and the file-format contract in Global Constraints above — Task 2 writes files that satisfy it, by literal convention, not by importing anything from this file.

- [ ] **Step 1: Write the failing tests**

Read the current full contents of `scripts/session-init.test.ts` first. Add these names to the existing import list from `./session-init.ts`:

```typescript
  SESSIONS_DIR_PATH,
  listHandoffFiles,
  findNewestHandoff,
  readHandoffTitle,
  buildHandoffPointer,
```

Add this to the existing `describe("constants", ...)` block, after the `VOICE_INIT_FILENAME` test:

```typescript
  it("locks the documented sessions directory path", () => {
    expect(SESSIONS_DIR_PATH).toBe(".digismith/sessions");
  });
```

Add four new `describe` blocks after the existing `describe("isDigismithRepoRoot", ...)` block and before `describe("buildBanner", ...)`:

```typescript
describe("listHandoffFiles", () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    sessionsDir = path.join(tmpDir, "sessions");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty array when the directory doesn't exist", () => {
    expect(listHandoffFiles(sessionsDir)).toEqual([]);
  });

  it("returns an empty array for an existing, empty directory", () => {
    fs.mkdirSync(sessionsDir);
    expect(listHandoffFiles(sessionsDir)).toEqual([]);
  });

  it("returns full paths of every file in the directory", () => {
    fs.mkdirSync(sessionsDir);
    fs.writeFileSync(path.join(sessionsDir, "abc.md"), "# Title\n");
    expect(listHandoffFiles(sessionsDir)).toEqual([path.join(sessionsDir, "abc.md")]);
  });

  it("throws on a genuine read error other than a missing directory", () => {
    fs.writeFileSync(sessionsDir, "not a directory");
    expect(() => listHandoffFiles(sessionsDir)).toThrow();
  });
});

describe("findNewestHandoff", () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    sessionsDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessionsDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when there are no files", () => {
    expect(findNewestHandoff(sessionsDir)).toBeUndefined();
  });

  it("returns the only file when there's exactly one", () => {
    const filePath = path.join(sessionsDir, "abc.md");
    fs.writeFileSync(filePath, "# Title\n");
    expect(findNewestHandoff(sessionsDir)).toBe(filePath);
  });

  it("returns the most recently modified file when there are several", () => {
    const oldPath = path.join(sessionsDir, "old.md");
    const newPath = path.join(sessionsDir, "new.md");
    fs.writeFileSync(oldPath, "# Old\n");
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(oldPath, oldTime, oldTime);
    fs.writeFileSync(newPath, "# New\n");

    expect(findNewestHandoff(sessionsDir)).toBe(newPath);
  });
});

describe("readHandoffTitle", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    filePath = path.join(tmpDir, "handoff.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    expect(readHandoffTitle(filePath)).toBeUndefined();
  });

  it("strips a leading '# ' and trims the first line", () => {
    fs.writeFileSync(filePath, "# Handoff: Foo  \nBody text...\n");
    expect(readHandoffTitle(filePath)).toBe("Handoff: Foo");
  });

  it("returns the first line as-is when there's no '#' prefix", () => {
    fs.writeFileSync(filePath, "Foo\nBar\n");
    expect(readHandoffTitle(filePath)).toBe("Foo");
  });

  it("returns undefined for an empty file", () => {
    fs.writeFileSync(filePath, "");
    expect(readHandoffTitle(filePath)).toBeUndefined();
  });
});

describe("buildHandoffPointer", () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    sessionsDir = path.join(tmpDir, "sessions");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when the sessions directory is missing", () => {
    expect(buildHandoffPointer(sessionsDir)).toBeUndefined();
  });

  it("returns undefined when the sessions directory is empty", () => {
    fs.mkdirSync(sessionsDir);
    expect(buildHandoffPointer(sessionsDir)).toBeUndefined();
  });

  it("points to the single file's title when there's exactly one", () => {
    fs.mkdirSync(sessionsDir);
    fs.writeFileSync(path.join(sessionsDir, "abc.md"), "# Handoff: Foo\n");
    expect(buildHandoffPointer(sessionsDir)).toBe(
      'DigiSmith: handoff from prior session — "Handoff: Foo" — see .digismith/sessions/',
    );
  });

  it("includes a pending count and the newest title when there's more than one", () => {
    fs.mkdirSync(sessionsDir);
    const oldPath = path.join(sessionsDir, "old.md");
    fs.writeFileSync(oldPath, "# Old One\n");
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(oldPath, oldTime, oldTime);
    fs.writeFileSync(path.join(sessionsDir, "new.md"), "# New One\n");

    expect(buildHandoffPointer(sessionsDir)).toBe(
      'DigiSmith: handoff from prior session — "New One" (2 pending) — see .digismith/sessions/',
    );
  });
});
```

Add one new test inside the existing `describe("main (CLI)", ...)` block, after its last existing `it(...)`:

```typescript
  it("prints the handoff pointer even with no .digismith/profile", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith", "sessions"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".digismith", "sessions", "abc123.md"), "# Handoff: Foo\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      'DigiSmith: handoff from prior session — "Handoff: Foo" — see .digismith/sessions/',
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`

Expected: FAIL — the new imports (`SESSIONS_DIR_PATH`, `listHandoffFiles`, `findNewestHandoff`, `readHandoffTitle`, `buildHandoffPointer`) don't exist yet, so the whole file fails to load.

- [ ] **Step 3: Implement**

In `scripts/session-init.ts`, add this new exported constant next to the existing ones (after `VOICE_INIT_FILENAME`):

```typescript
export const SESSIONS_DIR_PATH = ".digismith/sessions";
```

Add these new exported functions after `isDigismithRepoRoot` (before `type VoiceInitModule = ...`):

```typescript
export function listHandoffFiles(sessionsDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(sessionsDir, entry.name));
}

export function findNewestHandoff(sessionsDir: string): string | undefined {
  const files = listHandoffFiles(sessionsDir);
  if (files.length === 0) return undefined;
  return files.reduce((newest, current) =>
    fs.statSync(current).mtimeMs > fs.statSync(newest).mtimeMs ? current : newest,
  );
}

export function readHandoffTitle(filePath: string): string | undefined {
  if (!isFile(filePath)) return undefined;
  const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0]?.trim();
  if (!firstLine) return undefined;
  return firstLine.replace(/^#+\s*/, "");
}

export function buildHandoffPointer(sessionsDir: string): string | undefined {
  const files = listHandoffFiles(sessionsDir);
  if (files.length === 0) return undefined;
  const newest = findNewestHandoff(sessionsDir)!;
  const title = readHandoffTitle(newest) ?? "(untitled)";
  const countSuffix = files.length > 1 ? ` (${files.length} pending)` : "";
  return `DigiSmith: handoff from prior session — "${title}"${countSuffix} — see ${SESSIONS_DIR_PATH}/`;
}
```

(`isFile` is already defined lower in this same file — used by `loadVoiceSummary`. No new import needed; `fs`/`path` are already imported at the top.)

In `main()`, find:

```typescript
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  if (isDigismithRepoRoot(path.join(process.cwd(), ".claude-plugin", "plugin.json"))) {
    console.log("DigiSmith: no AI attribution in commits or PRs — no exceptions");
  }
  try {
    const banner = await buildBanner(
```

Replace with:

```typescript
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  if (isDigismithRepoRoot(path.join(process.cwd(), ".claude-plugin", "plugin.json"))) {
    console.log("DigiSmith: no AI attribution in commits or PRs — no exceptions");
  }
  try {
    const handoffPointer = buildHandoffPointer(path.join(process.cwd(), SESSIONS_DIR_PATH));
    if (handoffPointer) console.log(handoffPointer);
  } catch (err) {
    console.error(`session-init: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
  try {
    const banner = await buildBanner(
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`

Expected: PASS — every test in the file, including all pre-existing ones, which are untouched by this change and whose tmp dirs never contain `.digismith/sessions/`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/session-init.ts scripts/session-init.test.ts
git commit -m "feat(hooks): point SessionStart at a pending handoff file (W.12)"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 2: Step 7 writes the handoff instead of speaking a warning

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (the `## Step 7: Offer to Clear Context` section)

**Interfaces:**
- Consumes: the file-format contract from Task 1's Global Constraints (file path, H1-title-first-line convention) — by literal agreement, not by import (this file is prose, not code).
- Produces: nothing consumed by another task in this plan — this is the last task.

- [ ] **Step 1: Replace the unresolved-thread-and-clear paragraphs**

Read the current full contents of `skills/finishing-a-development-branch/SKILL.md` first and confirm the block below still matches verbatim — if it doesn't, stop and report rather than guess at a fuzzy replacement.

Find this exact block:

```markdown
Before actually clearing (whichever path led here), scan the conversation for any unresolved
thread unrelated to the feature just shipped — a pending question, a task mentioned but not
started, something asked to be revisited later. If one exists, name it plainly as part of the
final message: "Note: before I clear this session's context, you still have `<X>` open from
earlier — nothing's tracking that after this clears, so make a note if you want to come back to
it." This is a verbal warning only — never write it to a file or a memory entry. If nothing
unresolved is found, skip this silently.

To actually clear: say the complete final summary first — what shipped, what's next, the
unresolved-thread warning if one applies — then, as the last action of the turn, invoke
`mcp__ccd_session_mgmt__clear_session` with `session_id: "self"`. The clear only takes effect
once this turn ends and the session goes idle, so nothing said before it is lost from the
conversation the human partner just read — only from what a future turn remembers. If the human
partner sends another message before the session goes idle, the tool itself silently drops the
queued clear; that is expected behavior, not a bug to work around.
```

Replace it with:

```markdown
Before actually clearing (whichever path led here), write a handoff file so the next session that
opens this repo doesn't start from nothing — replacing the old verbal-only warning entirely.

**Ensure `.digismith/sessions/` is gitignored** (once per repo — every run after this finds the
line already present and skips straight to writing the handoff file):

```bash
git check-ignore -q .digismith/sessions/ ; echo "exit=$?"
```

`exit=0` (already ignored) → skip straight to composing the handoff below. `exit=1` (not
ignored) → append a `.digismith/sessions/` line to this repo's `.gitignore` (create the file if
it doesn't exist), then commit and push immediately, reusing `SSH_KEY_PREFIX` exactly as already
resolved earlier in this run's option (Option 1 or Option 2) — do not re-resolve the `ssh_key`
preference:

```bash
git add .gitignore
git commit -m "chore: gitignore .digismith/sessions/"
${SSH_KEY_PREFIX}git push
```

This can't wait for a later commit — Step 7 runs after Option 1/2's own push already happened, so
without this the repo would end the run with unpushed local state.

**Resolve this session's own id:** invoke `mcp__ccd_session_mgmt__get_session` with
`session_id: "self"` and read the returned `sessionId`. If the call fails or returns no usable
id, fall back to an ISO-8601 timestamp (`date -u +%Y%m%dT%H%M%SZ`) instead — the write must still
happen either way.

**Compose the handoff:** scan the conversation for any unresolved thread unrelated to the feature
just shipped — a pending question, a task mentioned but not started, something asked to be
revisited later — the same scan this step already ran before this change, now feeding the file's
sections instead of a spoken warning. Write `.digismith/sessions/<session-id-or-timestamp>.md`
with exactly these 5 sections, drawn from what this session already knows — never parsed from a
branch name, never inferred by a lookup:

```markdown
# <one-line title: what this session was doing>

## Where this fits

<Map item(s) or ticket key this session was working, links to the relevant design.html/plan.md,
the branch/worktree path.>

## Status per unit of work

<Explicit done/in-progress/not-started per item, cross-checked against any existing ledger or
progress file rather than restated from memory.>

## Exact resume point

<The next concrete action, named precisely enough that a cold session doesn't have to infer it.>

## Anything flagged but deliberately out of scope

<A spawned background task, a deferred backlog note, a bug found in passing — named with its own
tracking id/link. "None" if there's genuinely nothing.>

## Literal resume commands

<The actual `cd`/skill-invocation a session would run, not just a description.>
```

If the file write itself fails (disk, permissions), report it in the final summary but do not
block the clear on it — this is an orientation aid, not a gate.

To actually clear: say the complete final summary first — what shipped, what's next, and
`Handoff written to .digismith/sessions/<id>.md for the next session.` in place of the old
unresolved-thread warning — then, as the last action of the turn, invoke
`mcp__ccd_session_mgmt__clear_session` with `session_id: "self"`. The clear only takes effect
once this turn ends and the session goes idle, so nothing said before it is lost from the
conversation the human partner just read — only from what a future turn remembers. If the human
partner sends another message before the session goes idle, the tool itself silently drops the
queued clear; that is expected behavior, not a bug to work around.
```

- [ ] **Step 2: Verify the edit reads correctly**

```bash
grep -c "Ensure \`.digismith/sessions/\` is gitignored" skills/finishing-a-development-branch/SKILL.md
grep -c "never write it to a file or a memory entry" skills/finishing-a-development-branch/SKILL.md
```

Expected: first command prints `1`; second command prints `0` (the old verbal-only line is gone).

- [ ] **Step 3: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(vendored-skills): Step 7 writes a handoff file on clear (W.12)"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Final Verification

- [ ] Run `pnpm test` at the repo root — full suite passes, no regressions in any other file.
- [ ] Run `grep -n "## Step 7" skills/finishing-a-development-branch/SKILL.md` and read the full section once more end-to-end — confirm the `clear_context` preference logic (returns unset/yes/no) above the replaced block is untouched, and the replaced block reads coherently as one continuous procedure.
- [ ] Confirm the map (`MEMORY.md`'s **W** row) still needs a **W.12** entry added and `.digismith/history.html`'s Timeline needs an entry — both handled by `digismith:report-implementation` / the `post-finish` history hook, not by this plan directly.
