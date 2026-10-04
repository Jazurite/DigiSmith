# DGS-159 Part 3: Ticket Lifecycle Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move a **keyed** ticket's lifecycle-skill output (`skills/bootstrap`, `skills/adopt`,
`skills/init`, `skills/jira-intake`) from `.digismith/docs/<slug>/` to
`.digismith/board/<KEY>—<slug>/`, per the design at
`.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/design.html`.
A keyless ticket keeps using `.digismith/docs/<slug>/` exactly as today — no task in this plan
touches that path.

**Architecture:** One new script task (two additions to the already-shipped
`scripts/board-path.ts`, with Vitest tests) followed by four independent skill-text tasks, one per
skill, each changing only the keyed branch of that skill's own flow. A skill-text task has no
compiled code to test; its "test" is a concrete walkthrough against the exact scenarios the design
names (DigiSmith's own DGS-161 case, a Door 2 draft upgrade, a `ticket: false` repo with a key
supplied anyway) — each task's steps spell out that walkthrough explicitly, not as a placeholder.
A closing task runs the full test suite and writes the unit's report.

**Tech Stack:** TypeScript (`--experimental-strip-types`, no build step) and Vitest for Task 1,
matching every other script in `scripts/`. Tasks 2–5 are Markdown skill-prose edits — no build step,
no test runner; each is self-checked by tracing a concrete scenario through the new text.

**Recommended execution:** Subagent-Driven Development. Six tasks, and four of them edit core
onboarding skills every future ticket in every repo goes through — worth an independent reviewer's
fresh eyes per task rather than inline execution.

## Global Constraints

- Every change in Tasks 2–5 fires only on the keyed branch of that skill's flow. The keyless
  branch (`ticket: false`, genuinely no key supplied) gets **zero edits** anywhere in this plan —
  verify this explicitly in each task's self-check, not just assume it.
- Tasks 2–5 change only the lines the keyed path actually needs — never drop a sentence that
  wasn't about the path convention just because it sits next to one that was. Each of these tasks
  has its own diff-review step for exactly this: every removed line must have a replacement that
  does the same job for the keyed path, and no unrelated sentence may simply vanish.
- `scripts/board-path.ts`'s already-shipped `buildFolderName`, `boardRelPath`, and
  `parseFolderName` are not touched — signatures, behavior, and tests stay exactly as Part 1+2
  merged them. Task 1 only *adds* two functions.
- No code in this unit may rename or re-scope the Part 1+2 functions it builds on.
- Every script that shells out to `git` on a path containing a real em dash (U+2014) must use
  `-z`/NUL-terminated output, never newline-split plain `--name-only` (design section 9 of the
  convention doc; already the convention `update-history.ts` follows).
- Times written in UTC+7 first, UTC in brackets (standing repo rule).
- No AI attribution in any commit (repo rule).
- Never write or edit `MEMORY.md` (another worker's ticket, out of scope here).

---

### Task 1: `scripts/board-path.ts` — `boardRelPathForSlug` and `findBoardFolderBySlug`

**Files:**
- Modify: `scripts/board-path.ts`
- Modify: `scripts/board-path.test.ts`

**Interfaces:**
- Consumes: `BOARD_DIR_PATH`, `EM_DASH` (module-private), `parseFolderName`, `ParsedFolderName` —
  all already shipped in this file.
- Produces: `boardRelPathForSlug(key: string, slug: string): string`,
  `findBoardFolderBySlug(slug: string, mainRoot: string): string | undefined`. Tasks 3–5 (the
  skill-text tasks) reference both by these exact names and signatures.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/board-path.test.ts` (new imports at the top alongside the existing ones, new
`describe` blocks at the end):

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  BOARD_DIR_PATH,
  slugify,
  buildFolderName,
  boardRelPath,
  parseFolderName,
  boardRelPathForSlug,
  findBoardFolderBySlug,
} from "./board-path.ts";

describe("boardRelPathForSlug", () => {
  it("joins a known key and slug without re-slugifying", () => {
    expect(boardRelPathForSlug("DGS-161", "plugin-update-after-merge")).toBe(
      `${BOARD_DIR_PATH}/DGS-161—plugin-update-after-merge`,
    );
  });

  it("uppercases the key, matching buildFolderName", () => {
    expect(boardRelPathForSlug("dgs-161", "plugin-update-after-merge")).toBe(
      `${BOARD_DIR_PATH}/DGS-161—plugin-update-after-merge`,
    );
  });
});

describe("findBoardFolderBySlug", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-test-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeBoardFolder(name: string): void {
    fs.mkdirSync(path.join(tmpDir, ...BOARD_DIR_PATH.split("/"), name), { recursive: true });
  }

  it("finds a keyed folder by slug alone, regardless of the key", () => {
    // Matches DigiSmith's own repo today: branch "plugin-update-after-merge" (no key) against
    // folder "DGS-161—plugin-update-after-merge" (keyed) — the slug is the only shared value.
    makeBoardFolder("DGS-161—plugin-update-after-merge");
    expect(findBoardFolderBySlug("plugin-update-after-merge", tmpDir)).toBe(
      "DGS-161—plugin-update-after-merge",
    );
  });

  it("returns undefined when no folder matches the slug", () => {
    makeBoardFolder("DGS-161—plugin-update-after-merge");
    expect(findBoardFolderBySlug("some-other-slug", tmpDir)).toBeUndefined();
  });

  it("returns undefined when .digismith/board/ doesn't exist at all", () => {
    expect(findBoardFolderBySlug("anything", tmpDir)).toBeUndefined();
  });

  it("skips a non-board-shaped folder name instead of throwing", () => {
    makeBoardFolder("not-a-board-folder-at-all");
    makeBoardFolder("DGS-1—real-ticket");
    expect(findBoardFolderBySlug("real-ticket", tmpDir)).toBe("DGS-1—real-ticket");
  });

  it("returns the first match in sorted order when two folders share a slug", () => {
    // readdir's own order is not defined — sorting first makes this deterministic regardless.
    // Lexicographically, "DGS-10—..." sorts before "DGS-2—..." ('1' < '2' at the fifth byte).
    makeBoardFolder("DGS-2—shared-slug");
    makeBoardFolder("DGS-10—shared-slug");
    expect(findBoardFolderBySlug("shared-slug", tmpDir)).toBe("DGS-10—shared-slug");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: the new tests fail with "is not exported" / "is not a function" (neither function exists
yet); every pre-existing test in this file still passes unchanged.

- [ ] **Step 3: Implement**

Add imports at the very top of `scripts/board-path.ts`, before its existing opening comment:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

```

Append these two functions at the end of `scripts/board-path.ts`, after the existing
`parseFolderName`'s closing brace:

```typescript

// For a caller that already has a final key and slug in hand (init, resolving one from a
// branch name) rather than a raw title — skips slugify, which an already-final slug must never
// go through again (re-truncation/re-filler-dropping on it is not guaranteed idempotent).
export function boardRelPathForSlug(key: string, slug: string): string {
  return `${BOARD_DIR_PATH}/${key.toUpperCase()}${EM_DASH}${slug}`.normalize("NFC");
}

// Finds a keyed ticket's board folder by slug alone — a folder's own key does not have to match
// whatever key (if any) the branch name carries. DigiSmith's own repo already has this today:
// branch "plugin-update-after-merge" (no key) against folder "DGS-161—plugin-update-after-merge"
// (keyed). Reconstructing the folder name from the branch's own key would miss that folder.
// Entries are sorted before scanning: readdir's own order is not defined, so if two folders ever
// shared one slug, scanning raw readdir order would be nondeterministic — sorting first means it
// always resolves to the same one (the first match in sorted order), every time.
export function findBoardFolderBySlug(slug: string, mainRoot: string): string | undefined {
  const dir = path.join(mainRoot, ...BOARD_DIR_PATH.split("/"));
  let entries: string[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  for (const name of entries) {
    let parsed: ParsedFolderName;
    try {
      parsed = parseFolderName(name);
    } catch {
      continue; // not a board-shaped folder name — skip it, don't fail the whole scan
    }
    if (parsed.slug === slug) return name;
  }
  return undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: every test passes, including every pre-existing one (unchanged — confirms the two
additions are purely additive).

- [ ] **Step 5: Commit**

```bash
git add scripts/board-path.ts scripts/board-path.test.ts
git commit -m "feat(board-path): add boardRelPathForSlug and findBoardFolderBySlug"
```

---

### Task 2: `skills/jira-intake/SKILL.md` — target path and the Handling Existing Files table

**Files:**
- Modify: `skills/jira-intake/SKILL.md`

**Interfaces:**
- Consumes: `boardRelPath` (already shipped), `findBoardFolderBySlug` (Task 1).
- Produces: the keyed write path and the upgrade-as-move behavior that Tasks 3–4 (bootstrap,
  adopt) rely on when they invoke Door 1 with an already-confirmed key.

- [ ] **Step 1: Replace Step 3's target path and gitignore probe**

Old text (the whole `### Step 3: Derive the Slug and Write` section):

````markdown
### Step 3: Derive the Slug and Write

1. Derive the slug from the title: lowercase, drop filler words (a, an,
   the, on, to, of, for, in), replace remaining non-alphanumeric runs with
   a single hyphen, then truncate to ~40 characters at a word boundary —
   never leaving a trailing filler word or hyphen. Example: "Fix cart
   drawer padding on mobile checkout" → `fix-cart-drawer-padding-mobile`.
   Determinism matters here: two independent runs for the same feature
   must land on the same slug, or the Handling Existing Files table below
   never fires.
2. Target path: `.digismith/docs/<slug>/ticket.md`, in the repo currently
   being worked in — never DigiSmith's own repo, which only hosts this
   skill, not the tickets it processes.
3. **Commit-vs-gitignore, decided once per repo:** before writing into
   `.digismith/docs/` in this repo for the first time, ask git itself
   whether that path is already ignored — don't grep `.gitignore` for a
   literal string:

   ```bash
   git check-ignore -q .digismith/docs/
   ```

   Read the **exit code**, not the (empty) output: **0 = ignored**,
   **1 = not ignored**. Exit code 1 is a normal, expected answer meaning
   "this path is not ignored" — it is *not* a command failure, so don't
   treat it as an error or retry it. `git check-ignore` is authoritative
   where a text match isn't: it correctly resolves a bare `.digismith`
   (no trailing slash), wildcard patterns, negations (`!`), comments,
   nested `.gitignore` files deeper in the tree, `.git/info/exclude`, and
   a global `core.excludesFile` — none of which grepping the root
   `.gitignore` for `.digismith/` would catch.

   Branch on the result:
   - **Ignored (exit 0)** → write gitignored, proceed, no question asked.
   - **Not ignored (exit 1), and nothing under `.digismith/docs/` is
     tracked by git in this repo** → ask once via `AskUserQuestion`
     ("commit this repo's DigiSmith docs, or keep them local-only?").
     - If **gitignored** is chosen, append the entry to this repo's
       `.gitignore` — safely, never by rewriting the file:
       1. If `.gitignore` doesn't exist at all, create it containing the
          single line `.digismith/`. Done.
       2. If it does exist, **read its current content first**.
       3. If that content doesn't already end in a newline, add one — an
          otherwise-valid last line would silently fuse with the entry
          you're appending and corrupt both.
       4. Then append one new line: `.digismith/`.
       5. Use an append operation. Never use a tool or redirect that
          replaces the whole file's content (`>` rather than `>>`, or a
          whole-file write) — that would clobber every existing rule in
          the repo's `.gitignore`.

       Its presence is now the remembered answer for every future session
       in this repo.
     - If **committed** is chosen, do nothing further; the entry's
       continued absence is itself the remembered "committed" signal. Note
       that choosing "committed" doesn't itself commit anything — it just
       means the file is left tracked-and-not-ignored, so it becomes part
       of whatever commit the user (or a later skill) makes normally.
   - **Not ignored (exit 1), but `.digismith/docs/` already has files
     tracked by git in this repo** → an earlier write already happened and
     was committed without adding a `.gitignore` entry; treat as
     "committed" (matches the existing files' actual state), don't ask
     again. Confirm tracked-ness with git, not with directory existence:
     ```bash
     git ls-files .digismith/docs/
     ```
     Non-empty output → genuinely committed, don't ask. **Empty output
     while the directory nevertheless exists on disk** (e.g. an aborted
     earlier run left untracked files behind) → that's not evidence of a
     prior decision at all; fall back to the "ask once" branch above
     rather than silently assuming "committed".
4. Check for an existing file at that path first — see Handling Existing
   Files below — before writing.
5. Write the file in the Ticket Template shape.
````

New text:

````markdown
### Step 3: Derive the Slug and Write

1. Derive the slug from the title: lowercase, drop filler words (a, an,
   the, on, to, of, for, in), replace remaining non-alphanumeric runs with
   a single hyphen, then truncate to ~40 characters at a word boundary —
   never leaving a trailing filler word or hyphen. Example: "Fix cart
   drawer padding on mobile checkout" → `fix-cart-drawer-padding-mobile`.
   Determinism matters here: two independent runs for the same feature
   must land on the same slug, or the Handling Existing Files table below
   never fires.
2. **Target path depends on whether this ticket has a real key**, not on
   the active profile. A real `**Key:**` is set (Door 1 succeeded, or an
   earlier Door 2 draft is now being upgraded) → `boardRelPath(key, title)`
   from `scripts/board-path.ts` (`.digismith/board/<KEY>—<slug>/ticket.md`).
   No key yet (a fresh Door 2 draft, or any repo with none supplied) →
   `.digismith/docs/<slug>/ticket.md`, exactly as before this ticket —
   `docs/` is that ticket's real, permanent home, not a holding pen.
   Either way, the target is in the repo currently being worked in —
   never DigiSmith's own repo, which only hosts this skill, not the
   tickets it processes.
3. **Commit-vs-gitignore, decided once per repo:** before writing for the
   first time in this repo, ask git itself whether this write's own
   target folder is already ignored — the board folder when a key is in
   hand, the docs folder when it isn't. Check only that one target, never
   the other: a repo can ignore one and still track the other.

   ```bash
   git check-ignore -q .digismith/board/   # when a key is in hand
   git check-ignore -q .digismith/docs/    # when there is no key
   ```

   Read the **exit code**, not the (empty) output: **0 = ignored**,
   **1 = not ignored**. Exit code 1 is a normal, expected answer meaning
   "this path is not ignored" — it is *not* a command failure, so don't
   treat it as an error or retry it. `git check-ignore` is authoritative
   where a text match isn't: it correctly resolves a bare `.digismith`
   (no trailing slash), wildcard patterns, negations (`!`), comments,
   nested `.gitignore` files deeper in the tree, `.git/info/exclude`, and
   a global `core.excludesFile` — none of which grepping the root
   `.gitignore` for a literal string would catch.

   Branch on the result:
   - **Ignored (exit 0)** → write gitignored, proceed, no question asked.
   - **Not ignored (exit 1), and nothing under *either* folder is tracked
     by git in this repo** → ask once via `AskUserQuestion` ("commit this
     repo's DigiSmith docs, or keep them local-only?"). This "already
     tracked" check always looks at both folders together, regardless of
     which one this write targets — an earlier decision recorded under
     either folder still answers the question for both:

     ```bash
     git ls-files .digismith/board/ .digismith/docs/
     ```

     - If **gitignored** is chosen, append the entry to this repo's
       `.gitignore` — safely, never by rewriting the file:
       1. If `.gitignore` doesn't exist at all, create it containing the
          single line `.digismith/`. Done.
       2. If it does exist, **read its current content first**.
       3. If that content doesn't already end in a newline, add one — an
          otherwise-valid last line would silently fuse with the entry
          you're appending and corrupt both.
       4. Then append one new line: `.digismith/`.
       5. Use an append operation. Never use a tool or redirect that
          replaces the whole file's content (`>` rather than `>>`, or a
          whole-file write) — that would clobber every existing rule in
          the repo's `.gitignore`.

       Its presence is now the remembered answer for every future session
       in this repo, covering `board/` and `docs/` alike (one bare
       `.digismith/` line is a prefix match over the whole tree).
     - If **committed** is chosen, do nothing further; the entry's
       continued absence is itself the remembered "committed" signal. Note
       that choosing "committed" doesn't itself commit anything — it just
       means the file is left tracked-and-not-ignored, so it becomes part
       of whatever commit the user (or a later skill) makes normally.
   - **Not ignored (exit 1), but either folder already has files tracked
     by git in this repo** → an earlier write already happened and was
     committed without adding a `.gitignore` entry; treat as "committed",
     don't ask again. Confirm tracked-ness with git, not with directory
     existence — same `git ls-files .digismith/board/ .digismith/docs/`
     command as above. Non-empty output → genuinely committed, don't ask.
     **Empty output while either directory nevertheless exists on disk**
     (e.g. an aborted earlier run left untracked files behind) → that's
     not evidence of a prior decision at all; fall back to the "ask once"
     branch above rather than silently assuming "committed".
4. Check for an existing file at the target path first — see Handling
   Existing Files below — before writing.
5. Write the file in the Ticket Template shape.
````

- [ ] **Step 2: Replace the Handling Existing Files table**

Old text:

```markdown
## Handling Existing Files at the Target Slug

Before writing, check whether `.digismith/docs/<slug>/ticket.md` already
exists:

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file | — | Write directly |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — fill in Key/URL/Story Points on the existing file rather than creating a duplicate or asking about a conflict |
| Any existing file | Door 2 (raw need arrives again at this slug) | Confirm before overwriting via `AskUserQuestion` — same as a Door 1 refresh — regardless of whether the existing file already has a Key set |
```

New text:

```markdown
## Handling Existing Files at the Target Slug

Before writing, look for an existing ticket file at this slug: call
`findBoardFolderBySlug(slug, mainRoot)` from `scripts/board-path.ts` against
`.digismith/board/` first (matches regardless of that folder's own key); if
nothing matches there, fall back to the flat `.digismith/docs/<slug>/ticket.md`
check (unchanged).

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file (neither location) | — | Write directly, at the target path Step 3.2 resolves |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent, found under `docs/<slug>/` (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — **move** the whole `.digismith/docs/<slug>/` folder (`ticket.md` and anything already sitting beside it) to `.digismith/board/<KEY>—<slug>/` (`boardRelPath(key, title)`), then fill in Key/URL/Story Points on the moved `ticket.md` — the same move-and-correct idiom `digismith:adopt` Step 3.2 already uses for its own branch-slug correction |
| Any existing file | Door 2 (raw need arrives again at this slug) | Confirm before overwriting via `AskUserQuestion` — same as a Door 1 refresh — regardless of whether the existing file already has a Key set |
```

- [ ] **Step 3: Update the Error Handling bullet and Quick Reference rows**

Old Error Handling bullet:

```markdown
- **`.digismith/docs/` exists on disk but `git ls-files` reports nothing
  tracked there** → treat it as an aborted earlier run, not as a prior
  "committed" decision; use the ask-once branch.
```

New:

```markdown
- **Either ticket-file folder exists on disk but `git ls-files` reports
  nothing tracked there** → treat it as an aborted earlier run, not as a
  prior "committed" decision; use the ask-once branch.
```

Old Quick Reference rows 3.1–3.2 and 3.3:

```markdown
| 3.1–3.2 | Derive the slug; target path is `.digismith/docs/<slug>/ticket.md`, in the repo being worked in — never DigiSmith's own |
| 3.3 | Commit-vs-gitignore, decided once per repo: `git check-ignore -q .digismith/docs/` — exit 0 (ignored) → proceed gitignored; exit 1 (not ignored, *not* an error) + nothing tracked under `.digismith/docs/` → ask once via `AskUserQuestion`, and if gitignored is chosen safely **append** (never overwrite) `.digismith/` to `.gitignore`, newline-guarded; exit 1 + `git ls-files .digismith/docs/` non-empty → treat as committed, don't ask |
```

New:

```markdown
| 3.1–3.2 | Derive the slug; target path is `boardRelPath(key, title)` when the ticket has a real key, `.digismith/docs/<slug>/ticket.md` otherwise (unchanged) — in the repo being worked in, never DigiSmith's own |
| 3.3 | Commit-vs-gitignore, decided once per repo: `git check-ignore -q` on this write's own target only (`.digismith/board/` when keyed, `.digismith/docs/` otherwise — never the other one) — exit 0 (ignored) → proceed gitignored; exit 1 (not ignored, *not* an error) + nothing tracked under **either** folder (`git ls-files .digismith/board/ .digismith/docs/` empty) → ask once via `AskUserQuestion`, and if gitignored is chosen safely **append** (never overwrite) `.digismith/` to `.gitignore`, newline-guarded; exit 1 + that same `ls-files` non-empty → treat as committed, don't ask |
```

- [ ] **Step 4: Self-check against four scenarios**

Trace each through the new text and confirm the resulting path and action:

1. **Door 1, `ticket: true`, a fresh key, this slug never seen before.** Step 3.2 → real key →
   `boardRelPath(key, title)`. Handling Existing Files → `findBoardFolderBySlug` finds nothing,
   flat `docs/<slug>/` check finds nothing → "No existing file" row → write directly under
   `board/`.
2. **Door 2, no key, `ticket: false`, this slug never seen before.** Step 3.2 → no key →
   `.digismith/docs/<slug>/ticket.md`, unchanged. Nothing in this task's diff fires at all on this
   path — confirm by re-reading the new Step 3/table text: every branch that changed behavior is
   gated on "a real key", and this scenario has none.
3. **A Door 2 draft already sits at `.digismith/docs/fix-cart-drawer/ticket.md` with a blank Key,
   and Door 1 now runs for the same slug with key `DGS-200`.** Handling Existing Files →
   `findBoardFolderBySlug` finds nothing under `board/` yet, flat check finds the existing draft at
   `docs/fix-cart-drawer/` → "Blank/absent, found under docs/" row → move
   `.digismith/docs/fix-cart-drawer/` to `.digismith/board/DGS-200—fix-cart-drawer/` in its
   entirety, then fill in Key/URL/Story Points on the moved file.
4. **A repo gitignores only `.digismith/docs/` via a specific line (no bare `.digismith/`
   prefix), and nothing under `board/` is ignored or tracked yet.** A keyed Door 1 write → target
   is `board/` → Step 3.3 checks `git check-ignore -q .digismith/board/` specifically → exit 1 (not
   ignored, since only `docs/` has a rule) → check `git ls-files .digismith/board/ .digismith/docs/`
   → empty (docs/ was never committed, only ignored) → ask once via `AskUserQuestion`. Confirms the
   old combined `board/ || docs/` check (which would have wrongly reported "ignored" here, since
   `docs/` alone satisfied it) no longer misfires — the probe now answers for the folder this write
   actually targets.

- [ ] **Step 5: Diff review — confirm no unrelated line was dropped**

Run `git diff -- skills/jira-intake/SKILL.md` and read every removed line. For each one, point to
the replacement line that does the same job for the keyed path. Confirm these three sentences —
present in the file before this task, not removed by the design — are still there, verbatim or
adapted: "in the repo currently being worked in — never DigiSmith's own repo, which only hosts this
skill, not the tickets it processes"; "Exit code 1 is a normal, expected answer ... it is *not* a
command failure, so don't treat it as an error or retry it"; "Note that choosing "committed" doesn't
itself commit anything ...". Any other removed sentence with no replacement doing its job is a bug —
fix it before Step 6.

- [ ] **Step 6: Commit**

```bash
git add skills/jira-intake/SKILL.md
git commit -m "feat(jira-intake): write a keyed ticket to the board, keyless unchanged"
```

---

### Task 3: `skills/bootstrap/SKILL.md` — the key-already-evident check

**Files:**
- Modify: `skills/bootstrap/SKILL.md`

**Interfaces:**
- Consumes: `boardRelPath` (already shipped), Task 2's updated `jira-intake` Door 1 behavior.
- Produces: nothing new consumed elsewhere in this plan — `init` (Task 5) only reads board/docs
  folders it finds, it never calls into `bootstrap`'s own internals.

- [ ] **Step 1: Replace Step 1's key-evident check**

Old text (the whole `### Step 1: Get a Real Ticket` section):

```markdown
### Step 1: Get a Real Ticket

Check whether this conversation already produced a
`.digismith/docs/<slug>/ticket.md` via `digismith:jira-intake` earlier
this session. If not, invoke `digismith:jira-intake` now.

**If the active profile's `ticket` field is `false`:** skip invoking
`digismith:jira-intake` entirely — no `ticket.md` is written. Derive the
slug directly from the feature description, applying the exact same
deterministic rule `digismith:jira-intake` Step 3.1 already defines:
lowercase, drop filler words (a, an, the, on, to, of, for, in), replace
remaining non-alphanumeric runs with a single hyphen, then truncate to
~40 characters at a word boundary — never leaving a trailing filler word
or hyphen. Restated inline here since `digismith:jira-intake` itself
isn't invoked in this path, not reinvented as a different algorithm. Skip
the rest of Step 1 (no ticket content to read into context) and go
straight to Step 1.5.

If the result has no `**Key:**` line set — it's a Door 2 draft that was
never upgraded to a real ticket — stop here. See Error Handling. Do not
create a branch or worktree for a key-less ticket.

Then, still in the original checkout and **before any worktree exists**,
read the full content of the `.digismith/docs/<slug>/ticket.md` that
`digismith:jira-intake` just wrote (or that this session already had)
into your own context now — title, description, acceptance criteria,
key. A freshly created worktree checks out only what's already committed,
and `digismith:jira-intake` has just written `ticket.md` — it is not yet
committed at this point, and in a repo that chose the gitignored option
it never will be. Either way the effect is the same: `ticket.md` will
**not** be present inside the worktree Step 2 creates. Carry the content
you read here forward to Step 3; never plan on re-reading the file from
inside the new worktree.
```

New text:

```markdown
### Step 1: Get a Real Ticket

Check whether this conversation already produced a ticket file via
`digismith:jira-intake` earlier this session —
`.digismith/board/<KEY>—<slug>/ticket.md` if a key was already known, or
`.digismith/docs/<slug>/ticket.md` otherwise. If not, invoke
`digismith:jira-intake` now.

**If the active profile's `ticket` field is `false`:** check first whether
a real tracker key is already evident from how this work was requested —
the user named one (e.g. "implement DGS-159"), or the dispatching context
supplied one directly (a maestro's brief naming a key, the way this very
ticket's own brief named DGS-159).

- **A key is evident** → invoke `digismith:jira-intake` Door 1 with that
  key already confirmed, the same "already confirmed, don't ask again"
  shortcut `digismith:adopt` Step 3 uses. Its output lands at
  `.digismith/board/<KEY>—<slug>/ticket.md` (`boardRelPath(key, title)`
  from `scripts/board-path.ts`). Continue with the rest of Step 1 below
  as if `ticket` were `true`.
- **No key is evident** → skip invoking `digismith:jira-intake` entirely —
  no `ticket.md` is written. Derive the slug directly from the feature
  description, applying the exact same deterministic rule
  `digismith:jira-intake` Step 3.1 already defines: lowercase, drop filler
  words (a, an, the, on, to, of, for, in), replace remaining
  non-alphanumeric runs with a single hyphen, then truncate to ~40
  characters at a word boundary — never leaving a trailing filler word or
  hyphen. Restated inline here since `digismith:jira-intake` itself isn't
  invoked in this path, not reinvented as a different algorithm. Skip the
  rest of Step 1 (no ticket content to read into context) and go straight
  to Step 1.5. This path is unchanged from before this ticket — it still
  writes nothing and resolves no board path at all.

If the result has no `**Key:**` line set — it's a Door 2 draft that was
never upgraded to a real ticket — stop here. See Error Handling. Do not
create a branch or worktree for a key-less ticket.

Then, still in the original checkout and **before any worktree exists**,
read the full content of the ticket file that `digismith:jira-intake` just
wrote (or that this session already had) into your own context now —
title, description, acceptance criteria, key. A freshly created worktree
checks out only what's already committed, and `digismith:jira-intake` has
just written `ticket.md` — it is not yet committed at this point, and in a
repo that chose the gitignored option it never will be. Either way the
effect is the same: `ticket.md` will **not** be present inside the
worktree Step 2 creates. Carry the content you read here forward to Step
3; never plan on re-reading the file from inside the new worktree.
```

- [ ] **Step 2: Update Step 2's slug-derivation sub-step**

Old text (sub-step 1 of Step 2):

```markdown
1. Derive the slug: reuse the folder name `ticket.md` is already
   sitting in (`.digismith/docs/<slug>/ticket.md`) — that folder name
   already is the correct slug, produced by `digismith:jira-intake`'s
   own deterministic slug algorithm. Never re-derive the slug
   independently from the title.
```

New text:

```markdown
1. Derive the slug: reuse the slug `ticket.md` is already sitting under —
   `.digismith/board/<KEY>—<slug>/ticket.md` when a key was resolved
   (parse the folder name with `parseFolderName` from
   `scripts/board-path.ts`), or `.digismith/docs/<slug>/ticket.md` when
   none was (unchanged). That folder's slug already is the correct one,
   produced by `digismith:jira-intake`'s own deterministic slug algorithm.
   Never re-derive the slug independently from the title.
```

- [ ] **Step 3: Update Quick Reference row 1**

Old text:

```markdown
| 1 | Get a real ticket if the active profile's `ticket` is `true` (invoke `digismith:jira-intake` if needed, stop if key-less); if `ticket` is `false`, derive the slug directly and skip to Step 1.5; read `.digismith/docs/<slug>/ticket.md`'s full content into context now when it exists — a worktree checks out only committed files, and this one isn't committed yet (and may be gitignored outright), so it won't exist in the worktree |
```

New text:

```markdown
| 1 | Get a real ticket: `ticket: true` always invokes `digismith:jira-intake` (stop if key-less). `ticket: false` first checks whether a key is already evident — if so, same as `ticket: true`, output at `.digismith/board/<KEY>—<slug>/ticket.md`; if not, derive the slug directly and skip to Step 1.5, writing nothing (unchanged). Read the ticket file's full content into context now when it exists — a worktree checks out only committed files, and it isn't committed yet (and may be gitignored outright), so it won't exist in the worktree |
```

- [ ] **Step 4: Self-check against two scenarios**

1. **DigiSmith's own repo (`ticket: false`), a maestro brief naming DGS-200.** Step 1 → key
   evident (the brief named it) → invoke Door 1 with `DGS-200` → ticket lands at
   `.digismith/board/DGS-200—<slug>/ticket.md`. Step 2 sub-step 1 reads the slug back out of that
   same folder name via `parseFolderName`. Matches section 2 of the design exactly.
2. **The `personal` profile (`ticket: false`), a one-off local feature request, no key anywhere.**
   Step 1 → no key evident → skip Door 1, derive slug directly, nothing written, go straight to
   Step 1.5. Re-read the diff: this branch's text is byte-for-byte what shipped before this task —
   confirms the keyless path got no edit.

- [ ] **Step 5: Diff review — confirm no unrelated line was dropped**

Run `git diff -- skills/bootstrap/SKILL.md` and read every removed line. For each one, point to the
replacement line that does the same job for the keyed path. Any removed sentence with no
replacement doing its job is a bug — fix it before Step 6.

- [ ] **Step 6: Commit**

```bash
git add skills/bootstrap/SKILL.md
git commit -m "feat(bootstrap): use an already-evident key instead of discarding it"
```

---

### Task 4: `skills/adopt/SKILL.md` — the same narrow fix, plus Step 6's branch

**Files:**
- Modify: `skills/adopt/SKILL.md`

**Interfaces:**
- Consumes: `boardRelPath` (already shipped), Task 2's updated `jira-intake` Door 1 behavior.
- Produces: nothing new consumed elsewhere in this plan.

- [ ] **Step 1: Replace Step 3**

Old text (the whole `### Step 3: Get the Ticket and Resolve the Slug` section):

```markdown
### Step 3: Get the Ticket and Resolve the Slug

**If the active profile's `ticket` field is `false`:** skip straight to
deriving the slug directly from a feature description (ask the user for one
if it isn't already obvious), applying `digismith:jira-intake` Step 3.1's
deterministic rule: lowercase, drop filler words (a, an, the, on, to, of,
for, in), replace remaining non-alphanumeric runs with a single hyphen,
truncate to ~40 characters at a word boundary. No `ticket.md` gets written.
Continue to Step 4.

**Otherwise:**

1. Invoke `digismith:jira-intake` Door 1, supplying the ticket key already
   confirmed in Step 1 directly — it does not need to ask for it again.
   `digismith:jira-intake` fetches the ticket (or asks you to paste it, per
   its own JIRA Detection) and writes
   `.digismith/docs/<its-own-derived-slug>/ticket.md` using its own Step 3.1
   algorithm on the fetched title.
2. Check whether the current branch already matches `<Key>__<slug>`. If it
   does, and that slug differs from the slug `digismith:jira-intake` just
   derived, the branch's slug wins — it's already committed to the branch
   name, and `digismith:adopt` never renames a branch. Move
   `.digismith/docs/<its-own-derived-slug>/` to
   `.digismith/docs/<branch's-slug>/` in its entirety (a move-and-correct
   idiom for handling misplaced files — applied here to correct a misplaced
   `ticket.md` folder).
3. If the branch doesn't match `<Key>__<slug>` at all (an off-convention
   name), there's nothing to compare against — use `digismith:jira-intake`'s
   derived slug directly, no correction needed.

Whichever slug results from this step is used for every step below —
never re-derived a third way.
```

New text:

```markdown
### Step 3: Get the Ticket and Resolve the Slug

**If the active profile's `ticket` field is `false` AND Step 1 did not
confirm a real ticket key:** skip straight to deriving the slug directly
from a feature description (ask the user for one if it isn't already
obvious), applying `digismith:jira-intake` Step 3.1's deterministic rule:
lowercase, drop filler words (a, an, the, on, to, of, for, in), replace
remaining non-alphanumeric runs with a single hyphen, truncate to ~40
characters at a word boundary. No `ticket.md` gets written —
`.digismith/docs/<slug>/` is this work's real, permanent home, same as
before this ticket. Continue to Step 4.

**Otherwise** (the active profile's `ticket` field is `true`, or it's
`false` but Step 1 already confirmed a real key — don't discard a key
that's already in hand):

1. Invoke `digismith:jira-intake` Door 1, supplying the ticket key already
   confirmed in Step 1 directly — it does not need to ask for it again.
   `digismith:jira-intake` fetches the ticket (or asks you to paste it, per
   its own JIRA Detection) and writes
   `.digismith/board/<KEY>—<its-own-derived-slug>/ticket.md`
   (`boardRelPath(key, title)` from `scripts/board-path.ts`) using its own
   Step 3.1 slug algorithm on the fetched title.
2. Check whether the current branch already matches `<Key>__<slug>`. If it
   does, and that slug differs from the slug `digismith:jira-intake` just
   derived, the branch's slug wins — it's already committed to the branch
   name, and `digismith:adopt` never renames a branch. Move
   `.digismith/board/<KEY>—<its-own-derived-slug>/` to
   `.digismith/board/<KEY>—<branch's-slug>/` in its entirety (a
   move-and-correct idiom for handling misplaced files — applied here to
   correct a misplaced `ticket.md` folder).
3. If the branch doesn't match `<Key>__<slug>` at all (an off-convention
   name), there's nothing to compare against — use `digismith:jira-intake`'s
   derived slug directly, no correction needed.

Whichever slug (and, on this branch, key) results from this step is used
for every step below — never re-derived a third way.
```

- [ ] **Step 2: Replace Step 5's "Ticket docs" paragraph**

Old text:

```markdown
**Ticket docs.** If Step 3 wrote (or moved) `.digismith/docs/<slug>/ticket.md`
somewhere other than the worktree Step 4 left you in — i.e. Step 4 attached a
brand-new worktree rather than you already being inside an isolated one — copy
that entire `.digismith/docs/<slug>/` folder into the worktree now: a plain
file copy, never `git add`, never `git add -f`, never a commit. Same reasoning
as the config copy above — a worktree checks out only committed files, so a
folder written moments ago in a different directory would otherwise simply not
exist here. When Step 4 found you already inside an isolated worktree, there's
nothing to copy — Step 3 already wrote directly into it.
```

New text:

```markdown
**Ticket docs.** If Step 3 wrote (or moved) a ticket folder —
`.digismith/board/<KEY>—<slug>/` when a key was resolved,
`.digismith/docs/<slug>/` otherwise — somewhere other than the worktree
Step 4 left you in — i.e. Step 4 attached a brand-new worktree rather than
you already being inside an isolated one — copy that entire folder into
the worktree now: a plain file copy, never `git add`, never `git add -f`,
never a commit. Same reasoning as the config copy above — a worktree
checks out only committed files, so a folder written moments ago in a
different directory would otherwise simply not exist here. When Step 4
found you already inside an isolated worktree, there's nothing to copy —
Step 3 already wrote directly into it.
```

- [ ] **Step 3: Replace Step 6's opening and footer-line note**

Old text (opening paragraph and the HTML shell's footer, rest of the shell unchanged):

```markdown
### Step 6: Relocate the Docs

Write the plan (and spec, if one was supplied) from Step 1 directly into `.digismith/docs/`,
targeting the slug resolved in Step 3:

- **Plan:** write the content you read into context in Step 1 to
  `.digismith/docs/<slug>/plan.md`, creating the folder if needed. Format doesn't change — plans
  are already Markdown. No gitignore check for `plan.md`.
- **Spec, if supplied:** rewrap the content you read into context in Step 1 into the HTML shell
  below at `.digismith/docs/<slug>/design.html` (reuse the `<style>` block byte-for-byte, filling
  in `{{TITLE}}`, `{{DATE}}`, `{{MAP_ITEM}}`, and the body `<section>`s from the supplied spec's
  own content):
```

New text:

```markdown
### Step 6: Relocate the Docs

Write the plan (and spec, if one was supplied) from Step 1 directly into the target folder — the
resolved board path when Step 3 resolved a real key, or `.digismith/docs/<slug>/` unchanged when
it didn't:

- **Plan:** write the content you read into context in Step 1 to `<target folder>/plan.md`
  (`.digismith/board/<KEY>—<slug>/plan.md` or `.digismith/docs/<slug>/plan.md`), creating the
  folder if needed. Format doesn't change — plans are already Markdown. No gitignore check for
  `plan.md`.
- **Spec, if supplied:** rewrap the content you read into context in Step 1 into the HTML shell
  below at `<target folder>/design.html` (reuse the `<style>` block byte-for-byte, filling in
  `{{TITLE}}`, `{{DATE}}`, `{{MAP_ITEM}}`, and the body `<section>`s from the supplied spec's own
  content). The footer line at the bottom of the shell names whichever target folder actually
  applies — change only that one line, from `<footer>DigiSmith ·
  .digismith/docs/<slug>/design.html</footer>` to `<footer>DigiSmith · <target
  folder>/design.html</footer>` (literally `.digismith/board/<KEY>—<slug>/design.html` or
  `.digismith/docs/<slug>/design.html`). Every other line of the shell stays exactly as shipped.
```

The gitignore check sentence immediately below the shell also names a literal path — it must
substitute the same way as the footer line, not stay hardcoded to `docs/`. Old text:

```markdown
  Respect the gitignore check before committing: `git check-ignore -q
  .digismith/docs/<slug>/design.html` — exit 0 (ignored) → write the file, skip `git
  add`/commit, never force with `-f`; exit 1 (not ignored) → commit normally. No spec supplied
  → skip `design.html` entirely, not an error.
```

New text:

```markdown
  Respect the gitignore check before committing: `git check-ignore -q
  <target folder>/design.html` (literally `.digismith/board/<KEY>—<slug>/design.html` or
  `.digismith/docs/<slug>/design.html`) — exit 0 (ignored) → write the file, skip `git
  add`/commit, never force with `-f`; exit 1 (not ignored) → commit normally. No spec supplied
  → skip `design.html` entirely, not an error.
```

- [ ] **Step 4: Replace Step 7's hardcoded hand-off path**

Old text:

```markdown
### Step 7: Hand Off to Build

Invoke `digismith:subagent-driven-development` directly against
`.digismith/docs/<slug>/plan.md` — `digismith:brainstorming` and
`digismith:writing-plans` already ran outside DigiSmith for this ticket,
so they are not invoked here. From this point on,
```

New text:

```markdown
### Step 7: Hand Off to Build

Invoke `digismith:subagent-driven-development` directly against
`<target folder>/plan.md` — `.digismith/board/<KEY>—<slug>/plan.md` when Step 3 resolved a key,
`.digismith/docs/<slug>/plan.md` otherwise (unchanged) — `digismith:brainstorming` and
`digismith:writing-plans` already ran outside DigiSmith for this ticket,
so they are not invoked here. From this point on,
```

- [ ] **Step 5: Update Quick Reference rows 3, 5, 6**

Old text:

```markdown
| 3 | Get the ticket via `digismith:jira-intake` (skip if `ticket: false`), resolve the slug — branch's own slug wins over `digismith:jira-intake`'s derived one if they differ, moving the ticket.md folder to match |
| 4 | Ensure an isolated worktree — already in one, or attach one to the existing branch (`digismith:bootstrap` Step 2.3's logic, no `-b`) |
| 5 | Copy `.digismith/config.yml`, `.digismith/profile` and `.digismith/preferences.yml` (each when present), and (if Step 4 attached a new worktree) the `.digismith/docs/<slug>/` folder in; unconditionally clear then (if `logging: true`) write and copy in a fresh telemetry marker |
| 6 | Write Step 1's in-hand plan (required) and spec (optional) content directly into `.digismith/docs/<slug>/` |
```

New text:

```markdown
| 3 | Get the ticket via `digismith:jira-intake` — skipped only when `ticket: false` **and** no key was already confirmed in Step 1; resolve the slug — branch's own slug wins over `digismith:jira-intake`'s derived one if they differ, moving the ticket.md folder to match |
| 4 | Ensure an isolated worktree — already in one, or attach one to the existing branch (`digismith:bootstrap` Step 2.3's logic, no `-b`) |
| 5 | Copy `.digismith/config.yml`, `.digismith/profile` and `.digismith/preferences.yml` (each when present), and (if Step 4 attached a new worktree) the resolved ticket folder (`.digismith/board/<KEY>—<slug>/` or `.digismith/docs/<slug>/`) in; unconditionally clear then (if `logging: true`) write and copy in a fresh telemetry marker |
| 6 | Write Step 1's in-hand plan (required) and spec (optional) content directly into the resolved target folder — `.digismith/board/<KEY>—<slug>/` when Step 3 resolved a key, `.digismith/docs/<slug>/` otherwise |
```

- [ ] **Step 6: Self-check against three scenarios**

1. **`ticket: true` repo, Step 1 confirms key `EMKT-9001`.** Step 3 → "Otherwise" branch → Door 1
   with `EMKT-9001` → `.digismith/board/EMKT-9001—<slug>/ticket.md`. Step 6 → target folder is that
   same board path for `plan.md`/`design.html`, and its gitignore check and Step 7's hand-off both
   point at that same board path too — not left pointing at `docs/`. Matches design section 6's
   adopt card.
2. **`ticket: false` repo (`personal`), Step 1 finds no real key.** Step 3 → first branch →
   derive slug directly, no `ticket.md`. Step 6 → target folder is
   `.digismith/docs/<slug>/`, exactly the pre-existing unmodified behavior — confirms the keyless
   path in this skill got no edit either, including its gitignore check and Step 7's hand-off.
3. **Re-read Step 6's gitignore-check sentence and Step 7's hand-off sentence specifically** (not
   just the footer line) — confirm neither still hardcodes `.digismith/docs/<slug>/...` for the
   keyed case. This is the exact gap a prior pass on this task left behind: the footer line was
   fixed but the gitignore-check line and Step 7's own path were missed, because the first draft's
   instruction here was self-contradictory ("stays exactly as shipped" next to "substitute
   wherever this section says docs/<slug>") rather than naming both target spots explicitly.

- [ ] **Step 7: Diff review — confirm no unrelated line was dropped**

Run `git diff -- skills/adopt/SKILL.md` and read every removed line. For each one, point to the
replacement line that does the same job for the keyed path. Any removed sentence with no
replacement doing its job is a bug — fix it before Step 8.

- [ ] **Step 8: Commit**

```bash
git add skills/adopt/SKILL.md
git commit -m "feat(adopt): don't discard a key Step 1 already confirmed"
```

---

### Task 5: `skills/init/SKILL.md` — resolve by slug, not by reconstructing a branch's key

**Files:**
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: `findBoardFolderBySlug` (Task 1).
- Produces: nothing new consumed elsewhere in this plan — `init` only dispatches to
  `bootstrap`/`adopt`, it doesn't hand them a resolved path.

- [ ] **Step 1: Replace Step 0's item 2**

Old text:

````markdown
2. **Not on the base branch, and a profile is present**: derive
   `<slug>` from the current branch name — strip a leading `<Key>__`
   prefix if it matches (regex `^([A-Z]+-\d+)__`), otherwise use the
   branch name as-is. Check whether `.digismith/docs/<slug>/plan.md`
   exists.
   - **Exists** → this worktree was already fully set up by DigiSmith for
     this specific ticket. Read `profile` from `.digismith/config.yml`, or from `.digismith/profile` when `config.yml` or its `profile` key is missing (A.4 fallback). If `config.yml` exists but cannot be read or parsed, handle it the same way as a stale profile. Use that value as
     `<name>` and report plainly:

     ```
     Already initialized for DigiSmith (profile: <name>, docs at
     .digismith/docs/<slug>/).
     ```

     Stop here — no re-running detection, no re-relocating docs, no
     further questions. Same posture as `git init` on an existing repo: a
     notice, not a cascade.
   - **Doesn't exist** → a profile is present (inherited from the
     original checkout, or copied in by an earlier partial run) but this
     specific ticket hasn't been set up yet. Continue to Step 1.
3. **Not on the base branch, no profile present** → continue to
   Step 1.
````

New text:

````markdown
2. **Not on the base branch, and a profile is present**: derive
   `<slug>` from the current branch name — strip a leading `<Key>__`
   prefix if it matches (regex `^([A-Z]+-\d+)__`), otherwise use the
   branch name as-is. Find this ticket's folder **by slug**, never by
   reconstructing a path from the branch's own key — a folder's own key
   does not have to match the branch's (DigiSmith's own repo already has
   this: branch `plugin-update-after-merge` against folder
   `DGS-161—plugin-update-after-merge`). Call
   `findBoardFolderBySlug(slug, mainRoot)` from `scripts/board-path.ts`
   against `.digismith/board/` first; found → check `plan.md` inside that
   folder. Not found → fall back to the existing, flat
   `.digismith/docs/<slug>/plan.md` check (unchanged) — the permanent home
   for a genuinely keyless ticket, and (until DGS-164) also still the
   temporary home for an old keyed ticket not yet moved.
   - **Exists** (either place) → this worktree was already fully set up
     by DigiSmith for this specific ticket. Read `profile` from
     `.digismith/config.yml`, or from `.digismith/profile` when
     `config.yml` or its `profile` key is missing (A.4 fallback). If
     `config.yml` exists but cannot be read or parsed, handle it the same
     way as a stale profile. Use that value as
     `<name>` and report plainly, naming whichever folder actually
     matched:

     ```
     Already initialized for DigiSmith (profile: <name>, docs at
     <matched folder>/).
     ```

     Stop here — no re-running detection, no re-relocating docs, no
     further questions. Same posture as `git init` on an existing repo: a
     notice, not a cascade.
   - **Doesn't exist** (neither place) → a profile is present (inherited
     from the original checkout, or copied in by an earlier partial run)
     but this specific ticket hasn't been set up yet. Continue to Step 1.
3. **Not on the base branch, no profile present** → continue to
   Step 1.
````

- [ ] **Step 2: Replace Step 1's rows 2 and 3**

Old text:

```markdown
2. **Already on a feature branch, and `.digismith/docs/<slug>/plan.md`
   already exists** for the slug implied by the branch name (`<Key>__<slug>`
   or `<slug>` alone) → normal resume, already covered by `digismith:bootstrap`'s
   own branch/worktree reuse logic (its Step 2.3). Invoke `digismith:bootstrap`.
3. **Already on a feature branch, no `.digismith/docs/` for it, but a plan
   file exists somewhere** — check whether the conversation already named a
   plan path; if not, ask directly: "Is there a plan already written for
   this, and if so where?" before concluding none exists. A real answer here
   → mid-stream. Invoke `digismith:adopt`.
```

New text:

```markdown
2. **Already on a feature branch, and a plan file already exists for the
   slug implied by the branch name** (`<Key>__<slug>` or `<slug>` alone) —
   checked the same way as Step 0 item 2 above (`findBoardFolderBySlug`
   against `.digismith/board/` first, then the flat
   `.digismith/docs/<slug>/plan.md` fallback) → normal resume, already
   covered by `digismith:bootstrap`'s own branch/worktree reuse logic (its
   Step 2.3). Invoke `digismith:bootstrap`.
3. **Already on a feature branch, no matching folder found by that same
   check, but a plan file exists somewhere** — check whether the
   conversation already named a plan path; if not, ask directly: "Is there
   a plan already written for this, and if so where?" before concluding
   none exists. A real answer here → mid-stream. Invoke `digismith:adopt`.
```

- [ ] **Step 3: Update the Error Handling bullet and Quick Reference rows**

Old Error Handling bullet (first one):

```markdown
- **A profile present, not on the base branch, and
  `.digismith/docs/<slug>/plan.md` exists for this branch's slug** → see
  Step 0; always stops there except for an explicit profile-switch request,
  which routes straight to `digismith:bootstrap`. Profile present but on the
  base branch, or off the base branch with no matching `plan.md` → falls
  through to Step 1 normally, not an error.
```

New:

```markdown
- **A profile present, not on the base branch, and a plan file exists for
  this branch's slug** (board, matched by slug via
  `findBoardFolderBySlug`; else the flat `docs/` fallback) → see Step 0;
  always stops there except for an explicit profile-switch request, which
  routes straight to `digismith:bootstrap`. Profile present but on the base
  branch, or off the base branch with no matching plan → falls through to
  Step 1 normally, not an error.
```

Old Quick Reference rows:

```markdown
| 0 | Base branch → always fall through to Step 1 (profile presence here is expected, not a stop condition). Off base branch + profile present + `.digismith/docs/<slug>/plan.md` exists for this branch → report "already initialized" and stop (profile-switch request → `digismith:bootstrap` directly). Otherwise → fall through to Step 1 |
| 1 | Base branch → `digismith:bootstrap`. Feature branch + `.digismith/docs/<slug>/plan.md` exists → `digismith:bootstrap`. Feature branch + plan exists elsewhere → `digismith:adopt`. Feature branch + no plan anywhere → ask, don't guess |
```

New:

```markdown
| 0 | Base branch → always fall through to Step 1 (profile presence here is expected, not a stop condition). Off base branch + profile present + a plan file exists for this branch's slug (board, matched by slug via `findBoardFolderBySlug`; else the flat `docs/` fallback) → report "already initialized" and stop (profile-switch request → `digismith:bootstrap` directly). Otherwise → fall through to Step 1 |
| 1 | Base branch → `digismith:bootstrap`. Feature branch + a plan file exists for this branch's slug (board first, then `docs/` fallback) → `digismith:bootstrap`. Feature branch + plan exists elsewhere → `digismith:adopt`. Feature branch + no plan anywhere → ask, don't guess |
```

- [ ] **Step 4: Self-check against the DGS-161 scenario and a keyless one**

1. **Resuming on branch `plugin-update-after-merge`, folder `DGS-161—plugin-update-after-merge`
   already exists under `board/`.** Step 0 item 2 → slug = `plugin-update-after-merge` (no
   `<Key>__` prefix to strip) → `findBoardFolderBySlug` finds `DGS-161—plugin-update-after-merge`
   → check `plan.md` inside it → exists → report "already initialized" naming that folder. This is
   exactly the case the old branch-key-reconstruction approach would have missed (no key in the
   branch name to reconstruct `DGS-161—...` from).
2. **Resuming on a keyless branch `local-cleanup`, with `.digismith/docs/local-cleanup/plan.md`
   already on disk and nothing under `board/` at all.** Step 0 item 2 → slug = `local-cleanup` →
   `findBoardFolderBySlug` returns `undefined` (board/ has no match, or doesn't exist) → fall back
   to the flat `docs/local-cleanup/plan.md` check → exists → report "already initialized" naming
   that folder. Confirms the fallback still serves the permanent keyless case, not just migration.

- [ ] **Step 5: Diff review — confirm no unrelated line was dropped**

Run `git diff -- skills/init/SKILL.md` and read every removed line. For each one, point to the
replacement line that does the same job for the keyed path. Any removed sentence with no
replacement doing its job is a bug — fix it before Step 6.

- [ ] **Step 6: Commit**

```bash
git add skills/init/SKILL.md
git commit -m "feat(init): resolve a ticket's folder by slug, not a branch-derived key"
```

---

### Task 6: Whole-unit verification and report

**Files:**
- Create: `.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html`

**Interfaces:**
- Consumes: Tasks 1–5's commits.
- Produces: a closed-out unit, ready for the maestro's merge order.

- [ ] **Step 1: Run the full repo test suite**

Run: `npx vitest run`
Expected: every test file this plan touched passes (all of `scripts/board-path.test.ts`, including
every pre-existing case, unchanged); no other test file is affected, since Tasks 2–5 only edit
Markdown skill files.

- [ ] **Step 2: Re-run every self-check from Tasks 2–5**

Re-trace all ten scenarios listed across Tasks 2–5's self-check steps against the final, committed
text (not just the diff as drafted) — confirms nothing drifted across tasks, and that every
keyless-path claim ("no edit on this branch") still holds once all five tasks are combined.

- [ ] **Step 3: Regression-check every remaining `.digismith/docs` mention**

Run:

```bash
grep -n 'digismith/docs' skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/init/SKILL.md skills/jira-intake/SKILL.md
```

List every line this prints, and write a one-line reason for each: either it is the keyless path
(the `docs/<slug>/` shape genuinely stays there, per design section 2), or it is the legacy-read
fallback (checking `docs/` only after `board/` comes up empty, per design sections 6 and 8). Any
mention this grep finds that isn't one of those two things is a bug — fix it before Step 4.

- [ ] **Step 4: Write `report.html`**

Run `date` first and use its real output — the shipped file must contain the actual date as plain
text. Same HTML shell as `design.html` (byte-for-byte `<style>` block), summarizing: the two new
`board-path.ts` functions, the key-already-evident fix in bootstrap and adopt, jira-intake's
keyed-vs-keyless target path and the Door-2-upgrade-as-move behavior, init's slug-based resolution,
the Step 3 grep audit's result, and the open items from the design (branch naming, DGS-164's scope)
still waiting on the maestro. Also record this one confirmed design note so a future reader
doesn't re-open it: the Step 3.3 "already tracked" check intentionally combines
`.digismith/board/` and `.digismith/docs/` even though the "ignored" check is target-only (section
6 of the design) — the commit-vs-gitignore decision is per repo, not per folder (the stored answer
is a single bare `.digismith/` line covering both), so tracked files in either folder correctly
mean the repo already chose "committed," and splitting the tracked-check per folder would just
reintroduce the redundant question this check was written to avoid.

**The post-finish history hook parses this file — satisfy its exact markup** (learned from the
Part 5 merge, so this unit's own merge doesn't fail the same way):
- `<h1>FEATURE TITLE — Implementation Report</h1>` — a real em dash (U+2014) with spaces on both
  sides, not a plain hyphen.
- A line containing `Map item: <strong>...</strong>` — write a real value, e.g.
  `Map item: <strong>DGS-159 Part 3</strong>`. This field is a leftover of the retired clan-letter
  system; satisfy it as-is here, don't redesign it.
- `<span>Date: ...</span>` with the real date from the `date` command above.
- `<section id="summary">` containing at least one `<p>`.

- [ ] **Step 5: Verify the report against the real parser, before committing**

Run:

```bash
node --experimental-strip-types -e "import('./.digismith/hooks/post-finish/scripts/update-history.ts').then(m=>console.log(m.parseReport(process.argv[1])))" ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html"
```

Expected: prints a parsed object, does not throw. If it throws, the markup in Step 4 is wrong —
fix `report.html` and re-run this check before continuing. This is the same hook that will run at
merge time; catching a mismatch here avoids a merge-time failure.

- [ ] **Step 6: Commit**

```bash
git add ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html"
git commit -m "docs(ticket-naming): report for DGS-159 Part 3"
```

- [ ] **Step 7: Report to the maestro**

State all commit hashes and messages, the files touched, that every task's self-check passed, and
that no keyless path anywhere in this plan was edited. Do not push: wait for "approved: push"
(standing brief rule).

---

### Task 7: `scripts/board-path.ts` — a CLI entry point, in the style of `lineage-handoff.ts`

**Why this task exists.** The final whole-branch review found a real gap: Tasks 2–5's skill text
tells a model to "call `boardRelPath(...)`" or "call `findBoardFolderBySlug(...)`", but a skill is
prose a model follows, not code it executes — there is no command line for it to actually run.
Without one, the model would have to retype `slugify` and the U+2014 em dash by hand, exactly the
mistake the module exists to prevent. The Part 1+2 design deferred this CLI "to whichever part
first creates a real board folder" — that is this part.

**Files:**
- Modify: `scripts/board-path.ts`
- Modify: `scripts/board-path.test.ts`

**Interfaces:**
- Consumes: `parseArgs`, `requireArgs` from `./cli-args.ts` (already shipped, used the same way by
  `scripts/lineage-handoff.ts` and `scripts/config.ts`); `resolveMainRoot` from
  `./lineage-handoff.ts` (already shipped and already imported this same way by `scripts/config.ts`
  — no circular import, `lineage-handoff.ts` does not import `board-path.ts`).
- Produces: a `main()` function and a main-guard, exactly matching
  `scripts/lineage-handoff.ts`'s own shape. Four actions:
  - `--action path --key <key> --title <title>` → prints `boardRelPath(key, title)`.
  - `--action path --key <key> --slug <slug>` → prints `boardRelPathForSlug(key, slug)` (same
    `path` action, disambiguated by whether `--title` or `--slug` is given).
  - `--action find --slug <slug>` → prints the folder name `findBoardFolderBySlug` returns, or
    prints nothing and exits 0 when it returns `undefined`.
  - `--action parse --name <name>` → prints the parsed key on one line and the slug on the next,
    or fails loudly (propagates `parseFolderName`'s own thrown error) when the name doesn't parse.

- [ ] **Step 1: Write the failing tests**

Add these imports to the top of `scripts/board-path.test.ts`, alongside the existing ones:

```typescript
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
```

Add this CLI test-fixture scaffolding and `describe` block at the end of the file — it mirrors
`scripts/lineage-handoff.test.ts`'s own `runCli`/`initRepo`/`real` helpers exactly, since
`--action find` needs a real git repo to resolve `mainRoot` from:

```typescript
const SCRIPT_PATH = fileURLToPath(new URL("./board-path.ts", import.meta.url));

function real(p: string): string {
  return fs.realpathSync.native(p);
}

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base commit");
}

function runCli(cwd: string, ...args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

describe("CLI", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-cli-test-"));
    process.env.GIT_CEILING_DIRECTORIES = real(path.dirname(tmpDir));
    initRepo(tmpDir);
  });

  afterEach(() => {
    delete process.env.GIT_CEILING_DIRECTORIES;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("--action path", () => {
    it("prints boardRelPath's result given --key and --title, with a real em dash", () => {
      const result = runCli(tmpDir, "--action", "path", "--key", "dgs-159", "--title", "Fix cart drawer padding");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(`${BOARD_DIR_PATH}/DGS-159—fix-cart-drawer-padding`);
    });

    it("prints boardRelPathForSlug's result given --key and --slug, without re-slugifying", () => {
      const result = runCli(tmpDir, "--action", "path", "--key", "dgs-161", "--slug", "plugin-update-after-merge");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(`${BOARD_DIR_PATH}/DGS-161—plugin-update-after-merge`);
    });

    it("fails loudly on an empty-slug title, matching buildFolderName", () => {
      const result = runCli(tmpDir, "--action", "path", "--key", "dgs-1", "--title", "To Of For");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("cannot build a board folder name");
    });
  });

  describe("--action find", () => {
    it("prints the matching folder name when one exists, regardless of key", () => {
      fs.mkdirSync(path.join(tmpDir, ...BOARD_DIR_PATH.split("/"), "DGS-161—plugin-update-after-merge"), { recursive: true });
      const result = runCli(tmpDir, "--action", "find", "--slug", "plugin-update-after-merge");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("DGS-161—plugin-update-after-merge");
    });

    it("prints nothing and exits 0 when no folder matches the slug", () => {
      const result = runCli(tmpDir, "--action", "find", "--slug", "nothing-here");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });
  });

  describe("--action parse", () => {
    it("prints the key then the slug on two lines", () => {
      const result = runCli(tmpDir, "--action", "parse", "--name", "DGS-159—fix-cart-drawer-padding");
      expect(result.status).toBe(0);
      expect(result.stdout.trim().split(/\r?\n/)).toEqual(["DGS-159", "fix-cart-drawer-padding"]);
    });

    it("fails loudly on a name with no em dash", () => {
      const result = runCli(tmpDir, "--action", "parse", "--name", "DGS-159-fix-cart-drawer-padding");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("no em dash (U+2014) found");
    });
  });

  it("fails loudly on an unknown action", () => {
    const result = runCli(tmpDir, "--action", "bogus");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown --action "bogus"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: every new CLI test fails (the script has no `main()` yet, so it exits with no output and
status 0 regardless of the args given, or `node` itself errors depending on how the file currently
behaves with no main-guard firing) — confirm the specific failure mode before moving on, same
discipline Task 1 already used.

- [ ] **Step 3: Implement**

Add these two imports at the top of `scripts/board-path.ts`, alongside the existing `fs`/`path`
imports:

```typescript
import { parseArgs, requireArgs } from "./cli-args.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
```

Append this at the very end of the file, after `findBoardFolderBySlug`'s closing brace:

```typescript

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["action"]);
    switch (args.action) {
      case "path": {
        requireArgs(args, ["key"]);
        if (args.title !== undefined) {
          console.log(boardRelPath(args.key, args.title));
        } else {
          requireArgs(args, ["slug"]);
          console.log(boardRelPathForSlug(args.key, args.slug));
        }
        break;
      }
      case "find": {
        requireArgs(args, ["slug"]);
        const mainRoot = resolveMainRoot(process.cwd());
        const found = findBoardFolderBySlug(args.slug, mainRoot);
        if (found !== undefined) console.log(found);
        break;
      }
      case "parse": {
        requireArgs(args, ["name"]);
        const parsed = parseFolderName(args.name);
        console.log(parsed.key);
        console.log(parsed.slug);
        break;
      }
      default:
        throw new Error(`unknown --action "${args.action}" — expected path, find, or parse`);
    }
  } catch (err) {
    console.error(`board-path: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: every test passes, including every pre-existing one from Task 1 (unchanged — confirms
the CLI is purely additive).

- [ ] **Step 5: Commit**

```bash
git add scripts/board-path.ts scripts/board-path.test.ts
git commit -m "feat(board-path): add a CLI entry point, in the style of lineage-handoff.ts"
```

---

### Task 8: Point the four skills at the CLI, and fix three findings from the final review

**Why this task exists.** Task 7 gives the four skills a real command to run instead of asking a
model to "call" a TypeScript function it cannot execute. This task wires that in, the same way
`skills/handoff/SKILL.md` already points at `scripts/lineage-handoff.ts`'s own CLI: one dedicated
"The Script" section per skill giving the full invocation once, then every operational mention in
the body shortened to `--action ...` shorthand that refers back to it. It also fixes three findings
the final whole-branch review raised directly in the code, verified by the controller first:

- **Important, confirmed:** `skills/bootstrap/SKILL.md`'s Step 1.5 and Step 3 each still say "the
  slug... the `ticket.md` folder name when `ticket: true`" — true under the old convention, where
  the folder name and the slug were the same string, but false now for a keyed ticket, where the
  folder name is `<KEY>—<slug>`, not the bare slug. An agent following this literally would write
  `DGS-123—some-slug` into the telemetry marker's `slug:` field, or hand that whole string to
  `digismith:brainstorming` as if it were a slug.
- **Minor, confirmed, fix now (already-touched file, cheap to fold in):** `skills/init/SKILL.md`'s
  Step 0 item 2 doesn't say what happens when `findBoardFolderBySlug` finds a board folder but that
  folder has no `plan.md` inside it (today's real-world case for a keyed `bootstrap` run, since
  Part 4 hasn't yet moved `digismith:writing-plans`'s own output off `docs/` — a keyed ticket's
  `plan.md` still lands in `docs/<slug>/` until Part 4 ships). The flat `docs/` fallback must still
  run in that case, not be skipped because a board folder was found.
- **Minor, confirmed, fix now (same file, same spot):** `skills/adopt/SKILL.md` Step 3.2's rename
  (`.digismith/board/<KEY>—<its-own-derived-slug>/` → `.digismith/board/<KEY>—<branch's-slug>/`)
  is exactly what `boardRelPathForSlug`/the CLI's `path --key --slug` action computes, but the step
  never names it — worth doing now that the CLI invocation is being added to this same step anyway.

**Parked, not fixed here (confirmed, out of scope):** the final review's other two Minor findings —
an old keyed ticket still sitting under `docs/<slug>/` from before this convention, re-run through
Door 1 with the same key, could leave two copies behind (one at `docs/`, a new one at `board/`) —
and `digismith:adopt` Step 3.2 not naming `boardRelPathForSlug` before this task fixes exactly that
in the same step. The first is explicitly a DGS-164 migration-era risk (only existing until the
historical folders move); the second is fixed by this task's own third bullet above.

**Files:**
- Modify: `skills/bootstrap/SKILL.md`
- Modify: `skills/adopt/SKILL.md`
- Modify: `skills/init/SKILL.md`
- Modify: `skills/jira-intake/SKILL.md`

**Interfaces:**
- Consumes: Task 7's CLI (`--action path`, `--action find`, `--action parse`).

- [ ] **Step 1: `skills/jira-intake/SKILL.md`**

Old text (Step 3.2's target-path sentence):

```markdown
2. **Target path depends on whether this ticket has a real key**, not on
   the active profile. A real `**Key:**` is set (Door 1 succeeded, or an
   earlier Door 2 draft is now being upgraded) → `boardRelPath(key, title)`
   from `scripts/board-path.ts` (`.digismith/board/<KEY>—<slug>/ticket.md`).
   No key yet (a fresh Door 2 draft, or any repo with none supplied) →
   `.digismith/docs/<slug>/ticket.md`, exactly as before this ticket —
   `docs/` is that ticket's real, permanent home, not a holding pen.
   Either way, the target is in the repo currently being worked in —
   never DigiSmith's own repo, which only hosts this skill, not the
   tickets it processes.
```

New text:

```markdown
2. **Target path depends on whether this ticket has a real key**, not on
   the active profile. A real `**Key:**` is set (Door 1 succeeded, or an
   earlier Door 2 draft is now being upgraded) → run the script's
   `--action path --key <key> --title <title>` (see "The Script" below;
   prints `.digismith/board/<KEY>—<slug>/ticket.md`). No key yet (a fresh
   Door 2 draft, or any repo with none supplied) →
   `.digismith/docs/<slug>/ticket.md`, exactly as before this ticket —
   `docs/` is that ticket's real, permanent home, not a holding pen.
   Either way, the target is in the repo currently being worked in —
   never DigiSmith's own repo, which only hosts this skill, not the
   tickets it processes.
```

Old text (Handling Existing Files' opening sentence and the upgrade row):

```markdown
Before writing, look for an existing ticket file at this slug: call
`findBoardFolderBySlug(slug, mainRoot)` from `scripts/board-path.ts` against
`.digismith/board/` first (matches regardless of that folder's own key); if
nothing matches there, fall back to the flat `.digismith/docs/<slug>/ticket.md`
check (unchanged).

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file (neither location) | — | Write directly, at the target path Step 3.2 resolves |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent, found under `docs/<slug>/` (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — **move** the whole `.digismith/docs/<slug>/` folder (`ticket.md` and anything already sitting beside it) to `.digismith/board/<KEY>—<slug>/` (`boardRelPath(key, title)`), then fill in Key/URL/Story Points on the moved `ticket.md` — the same move-and-correct idiom `digismith:adopt` Step 3.2 already uses for its own branch-slug correction |
| Any existing file | Door 2 (raw need arrives again at this slug) | Confirm before overwriting via `AskUserQuestion` — same as a Door 1 refresh — regardless of whether the existing file already has a Key set |
```

New text:

```markdown
Before writing, look for an existing ticket file at this slug: run the script's
`--action find --slug <slug>` (see "The Script" below) against `.digismith/board/`
first — it matches regardless of that folder's own key; a non-empty result names the
folder. Nothing printed → fall back to the flat `.digismith/docs/<slug>/ticket.md`
check (unchanged).

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file (neither location) | — | Write directly, at the target path Step 3.2 resolves |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent, found under `docs/<slug>/` (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — **move** the whole `.digismith/docs/<slug>/` folder (`ticket.md` and anything already sitting beside it) to the path `--action path --key <key> --title <title>` prints, then fill in Key/URL/Story Points on the moved `ticket.md` — the same move-and-correct idiom `digismith:adopt` Step 3.2 already uses for its own branch-slug correction |
| Any existing file | Door 2 (raw need arrives again at this slug) | Confirm before overwriting via `AskUserQuestion` — same as a Door 1 refresh — regardless of whether the existing file already has a Key set |
```

Add this new section right before `## Error Handling` (reuse `skills/handoff/SKILL.md`'s own "## The
Script" section as the template — same note about `<digismith-root>`, same quoting caveat):

````markdown
## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action path --key '<key>' --title '<title>'
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action find --slug '<slug>'
```

Wrap `<title>`/`<slug>` in single quotes, and write any `'` inside either as `'\''`.
````

- [ ] **Step 2: `skills/bootstrap/SKILL.md`**

Old text (Step 2's target-path sub-step, the one referencing `boardRelPath`):

```markdown
   `.digismith/board/<KEY>—<slug>/ticket.md` (`boardRelPath(key, title)`
```

New text:

```markdown
   `.digismith/board/<KEY>—<slug>/ticket.md` (the script's
   `--action path --key <key> --title <title>`, see "The Script" below;
```

(Keep reading and preserve whatever this sentence's surrounding words already are on both sides —
only the parenthetical changes, from naming the function to naming the CLI action.)

Old text (Step 2's slug-derivation sub-step, the one referencing `parseFolderName`):

```markdown
1. Derive the slug: reuse the slug `ticket.md` is already sitting under —
   `.digismith/board/<KEY>—<slug>/ticket.md` when a key was resolved
   (parse the folder name with `parseFolderName` from
   `scripts/board-path.ts`), or `.digismith/docs/<slug>/ticket.md` when
   none was (unchanged). That folder's slug already is the correct one,
   produced by `digismith:jira-intake`'s own deterministic slug algorithm.
   Never re-derive the slug independently from the title.
```

New text:

```markdown
1. Derive the slug: reuse the slug `ticket.md` is already sitting under —
   `.digismith/board/<KEY>—<slug>/ticket.md` when a key was resolved (run
   the script's `--action parse --name <folder name>`, see "The Script"
   below, and take its second printed line), or `.digismith/docs/<slug>/ticket.md`
   when none was (unchanged). That folder's slug already is the correct one,
   produced by `digismith:jira-intake`'s own deterministic slug algorithm.
   Never re-derive the slug independently from the title.
```

Old text (the Important finding — Step 1.5's slug-identity sentence):

```markdown
`<slug>` is whichever slug Step 1 just produced — the `ticket.md`
folder name when `ticket: true`, or the directly-derived slug when
`ticket: false`. Never re-derive it a third way.
```

New text:

```markdown
`<slug>` is whichever slug Step 1 just produced — the slug parsed out of the
`ticket.md` folder's own name (the script's `--action parse`, second line;
see "The Script" below) when a key was resolved, or the directly-derived
slug when none was. Never the raw folder name itself (which carries the
key prefix for a keyed ticket), and never re-derive it a third way.
```

Old text (the Important finding — Step 3's slug-identity sentence):

```markdown
From inside that worktree, invoke `digismith:brainstorming`, passing both the slug already
derived (the `ticket.md` folder name Step 2 reused under `ticket: true`, or the slug Step 1
derived directly under `ticket: false` — never re-derived a third way; `brainstorming` reuses
it verbatim rather than re-deriving) and the ticket content **you already read in Step 1** —
```

New text:

```markdown
From inside that worktree, invoke `digismith:brainstorming`, passing both the slug already
derived (the slug Step 2 parsed out of the `ticket.md` folder's own name when a key was resolved,
or the slug Step 1 derived directly when none was — never the raw folder name itself, and never
re-derived a third way; `brainstorming` reuses it verbatim rather than re-deriving) and the ticket
content **you already read in Step 1** —
```

Add this new section right after Step 3 (reuse the same template as jira-intake's, above, scoped to
the one action bootstrap actually uses):

````markdown
## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action path --key '<key>' --title '<title>'
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action parse --name '<folder name>'
```

Wrap `<title>`/`<folder name>` in single quotes, and write any `'` inside either as `'\''`.
````

- [ ] **Step 3: `skills/adopt/SKILL.md`**

Old text (Step 3's Door-1 write sentence):

```markdown
1. Invoke `digismith:jira-intake` Door 1, supplying the ticket key already
   confirmed in Step 1 directly — it does not need to ask for it again.
   `digismith:jira-intake` fetches the ticket (or asks you to paste it, per
   its own JIRA Detection) and writes
   `.digismith/board/<KEY>—<its-own-derived-slug>/ticket.md`
   (`boardRelPath(key, title)` from `scripts/board-path.ts`) using its own
   Step 3.1 slug algorithm on the fetched title.
```

New text:

```markdown
1. Invoke `digismith:jira-intake` Door 1, supplying the ticket key already
   confirmed in Step 1 directly — it does not need to ask for it again.
   `digismith:jira-intake` fetches the ticket (or asks you to paste it, per
   its own JIRA Detection) and writes
   `.digismith/board/<KEY>—<its-own-derived-slug>/ticket.md` (the script's
   `--action path --key <key> --title <title>`, see "The Script" below)
   using its own Step 3.1 slug algorithm on the fetched title.
```

Old text (Step 3.2's rename sentence):

```markdown
2. Check whether the current branch already matches `<Key>__<slug>`. If it
   does, and that slug differs from the slug `digismith:jira-intake` just
   derived, the branch's slug wins — it's already committed to the branch
   name, and `digismith:adopt` never renames a branch. Move
   `.digismith/board/<KEY>—<its-own-derived-slug>/` to
   `.digismith/board/<KEY>—<branch's-slug>/` in its entirety (a
   move-and-correct idiom for handling misplaced files — applied here to
   correct a misplaced `ticket.md` folder).
```

New text:

```markdown
2. Check whether the current branch already matches `<Key>__<slug>`. If it
   does, and that slug differs from the slug `digismith:jira-intake` just
   derived, the branch's slug wins — it's already committed to the branch
   name, and `digismith:adopt` never renames a branch. Move
   `.digismith/board/<KEY>—<its-own-derived-slug>/` to the path the
   script's `--action path --key <key> --slug <branch's-slug>` prints (see
   "The Script" below) in its entirety (a move-and-correct idiom for
   handling misplaced files — applied here to correct a misplaced
   `ticket.md` folder).
```

Add this new section right after Step 3 (same template, scoped to the one action adopt uses):

````markdown
## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action path --key '<key>' --title '<title>'
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action path --key '<key>' --slug '<slug>'
```

Wrap `<title>`/`<slug>` in single quotes, and write any `'` inside either as `'\''`.
````

- [ ] **Step 4: `skills/init/SKILL.md`**

Old text (Step 0 item 2's resolution sentence — this is also the Minor finding's own spot):

```markdown
2. **Not on the base branch, and a profile is present**: derive
   `<slug>` from the current branch name — strip a leading `<Key>__`
   prefix if it matches (regex `^([A-Z]+-\d+)__`), otherwise use the
   branch name as-is. Find this ticket's folder **by slug**, never by
   reconstructing a path from the branch's own key — a folder's own key
   does not have to match the branch's (DigiSmith's own repo already has
   this: branch `plugin-update-after-merge` against folder
   `DGS-161—plugin-update-after-merge`). Call
   `findBoardFolderBySlug(slug, mainRoot)` from `scripts/board-path.ts`
   against `.digismith/board/` first; found → check `plan.md` inside that
   folder. Not found → fall back to the existing, flat
   `.digismith/docs/<slug>/plan.md` check (unchanged) — the permanent home
   for a genuinely keyless ticket, and (until DGS-164) also still the
   temporary home for an old keyed ticket not yet moved.
```

New text:

```markdown
2. **Not on the base branch, and a profile is present**: derive
   `<slug>` from the current branch name — strip a leading `<Key>__`
   prefix if it matches (regex `^([A-Z]+-\d+)__`), otherwise use the
   branch name as-is. Find this ticket's folder **by slug**, never by
   reconstructing a path from the branch's own key — a folder's own key
   does not have to match the branch's (DigiSmith's own repo already has
   this: branch `plugin-update-after-merge` against folder
   `DGS-161—plugin-update-after-merge`). Run the script's
   `--action find --slug <slug>` (see "The Script" below) against
   `.digismith/board/` first; a folder name printed → check `plan.md`
   inside that folder. **Found the folder but no `plan.md` in it, or
   nothing printed at all** → either way, fall back to the existing, flat
   `.digismith/docs/<slug>/plan.md` check (unchanged) — the permanent home
   for a genuinely keyless ticket, and (until Part 4 moves
   `digismith:writing-plans`'s own output, and until DGS-164 migrates old
   keyed tickets) also still the real, current home for a keyed ticket's
   `plan.md` today, even once its `ticket.md` already lives under `board/`.
```

Add this new section right after Step 1 (same template, scoped to the one action init uses):

````markdown
## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action find --slug '<slug>'
```

Wrap `<slug>` in single quotes, and write any `'` inside it as `'\''`.
````

- [ ] **Step 5: Diff review — confirm no unrelated line was dropped, across all four files**

Run `git diff -- skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/init/SKILL.md skills/jira-intake/SKILL.md`
and read every removed line in each file. For each one, point to the replacement line that does the
same job. Any removed sentence with no replacement doing its job is a bug — fix it before Step 6.

- [ ] **Step 6: Self-check against four scenarios**

1. **A keyed Door 1 write (jira-intake).** Trace the new Step 3.2 text: it names the exact CLI
   invocation, the printed path matches what `boardRelPath("DGS-159", "Fix cart drawer padding")`
   already returns per Task 1's own tests.
2. **bootstrap's telemetry marker and brainstorming hand-off, for a keyed ticket with folder
   `DGS-123—fix-cart-drawer`.** Step 2's slug sub-step now runs `--action parse --name
   'DGS-123—fix-cart-drawer'`, takes its second line (`fix-cart-drawer`) as `<slug>`. Step 1.5
   writes `slug: fix-cart-drawer` (not the folder name) into the telemetry marker. Step 3 hands
   `fix-cart-drawer` to brainstorming (not the folder name either). Confirms the Important finding
   is actually fixed, not just reworded.
3. **init resuming on branch `plugin-update-after-merge` where `DGS-161—plugin-update-after-merge`
   exists under `board/` but has no `plan.md` in it (today's real interim state).** Step 0 item 2 →
   `--action find --slug plugin-update-after-merge` prints the folder name → check `plan.md` inside
   it → absent → fall back to `docs/plugin-update-after-merge/plan.md` → (if that exists) report
   "already initialized" naming the docs folder. Confirms the Minor finding's fix: a found-but-empty
   board folder no longer silently reports "doesn't exist" when the docs/ fallback would have found
   it.
4. **adopt's Step 3.2 rename, key `EMKT-9001`, branch slug `fix-cart-drawer-padding-mobile`.** The
   new text runs `--action path --key EMKT-9001 --slug fix-cart-drawer-padding-mobile`, which
   prints `.digismith/board/EMKT-9001—fix-cart-drawer-padding-mobile` — the exact move target the
   old text described by hand, now computed instead of hand-typed.

- [ ] **Step 7: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/init/SKILL.md skills/jira-intake/SKILL.md
git commit -m "feat(ticket-naming): point the four skills at board-path.ts's own CLI"
```

---

### Task 9: Re-verify after Tasks 7–8

**Files:**
- Modify: `.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html`

**Interfaces:**
- Consumes: Tasks 7–8's commits.
- Produces: an updated, still-accurate closing report.

- [ ] **Step 1: Run the full repo test suite**

Run: `npx vitest run`
Expected: unchanged from Task 6's own run, plus Task 7's new CLI tests, all passing.

- [ ] **Step 2: Re-run the Task 6 grep audit**

Run:

```bash
grep -n 'digismith/docs' skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/init/SKILL.md skills/jira-intake/SKILL.md
```

Classify every line the same way Task 6 did — keyless path, legacy-read fallback, or (new, from
Task 8's init fix) the interim Part-4-hasn't-shipped-yet fallback. Anything else is a bug.

- [ ] **Step 3: Re-verify `report.html` against the real parser**

Run the same command Task 6 used:

```bash
node --experimental-strip-types -e "import('./.digismith/hooks/post-finish/scripts/update-history.ts').then(m=>console.log(m.parseReport(process.argv[1])))" ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html"
```

Expected: still prints an object, does not throw (Tasks 7–8 don't touch `report.html`'s own
markup, but re-run this to be sure nothing regressed).

- [ ] **Step 4: Update `report.html`**

Add a short new section (or extend the existing summary) recording: the CLI added in Task 7, the
four skills now pointing at it, and the three findings from the final whole-branch review that
this fixed (bootstrap's slug/folder-name conflation, init's found-but-no-plan.md fallback, adopt's
unnamed rename helper) plus the two that stay parked (an old keyed `docs/` ticket re-run through
Door 1 — DGS-164's concern; nothing else).

- [ ] **Step 5: Commit**

```bash
git add ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html"
git commit -m "docs(ticket-naming): update the report for the CLI and the final-review fixes"
```

- [ ] **Step 6: Report to the maestro**

Send the final verified list: every finding from the final whole-branch review, the controller's
own check for each, and whether it was fixed or parked. Do not push: wait for "approved: push".

---

### Task 10: `--action find` must search the current working tree, not the main checkout

**Why this task exists.** A real bug, found by the maestro reading the Task 7 diff directly: the
`find` action resolved its search root with `resolveMainRoot(process.cwd())` — the same helper
`lineage-handoff.ts` uses, which walks to the MAIN checkout (`git-common-dir`'s parent). But a
worker's own board folder is committed inside that worker's own **worktree**, and does not exist
in the main checkout until the ticket merges. `digismith:init`'s own Step 0/Step 1 resume check —
the very thing `find` exists for — runs *inside* a worktree. Confirmed live: this very ticket's
own worker folder,
`.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/`, exists
only under `.worktrees/dgs-159-lifecycle/`, not in the main checkout. `find`, as shipped by Task 7,
would have searched the wrong tree from inside that worktree and silently missed it — the exact
DGS-161 case (branch `plugin-update-after-merge`, folder living in a worker's own worktree) that
the whole `findBoardFolderBySlug` design exists to get right.

**Files:**
- Modify: `scripts/board-path.ts`
- Modify: `scripts/board-path.test.ts`
- Modify: `skills/init/SKILL.md`
- Modify: `skills/jira-intake/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `findBoardFolderBySlug(slug: string, root: string)` — `root`'s own caller contract
  changes meaning (the current working tree, not necessarily the main checkout) even though the
  function's positional signature is otherwise unchanged; a new CLI-only `--root <path>` override
  flag on `--action find`.

- [ ] **Step 1: Write the failing tests**

Add this new `it` inside the existing `describe("--action find", ...)` block in
`scripts/board-path.test.ts`, right after its existing two tests:

```typescript
    it("uses --root directly when given, bypassing git entirely", () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-root-test-"));
      fs.mkdirSync(path.join(rootDir, ...BOARD_DIR_PATH.split("/"), "DGS-5—root-override"), { recursive: true });
      const nonGitCwd = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-nongit-test-"));

      const result = runCli(nonGitCwd, "--action", "find", "--slug", "root-override", "--root", rootDir);

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("DGS-5—root-override");
      fs.rmSync(rootDir, { recursive: true, force: true });
      fs.rmSync(nonGitCwd, { recursive: true, force: true });
    });

    it("finds a board folder that exists only in the current worktree, not the main checkout — the exact DGS-161 case", () => {
      const worktreeDir = path.join(os.tmpdir(), `digismith-board-path-worktree-${process.pid}-${Date.now()}`);
      git(tmpDir, "worktree", "add", "-q", "-b", "feature", worktreeDir);
      fs.mkdirSync(path.join(worktreeDir, ...BOARD_DIR_PATH.split("/"), "DGS-9—only-in-worktree"), { recursive: true });

      const foundInWorktree = runCli(worktreeDir, "--action", "find", "--slug", "only-in-worktree");
      expect(foundInWorktree.status).toBe(0);
      expect(foundInWorktree.stdout.trim()).toBe("DGS-9—only-in-worktree");

      const foundInMainCheckout = runCli(tmpDir, "--action", "find", "--slug", "only-in-worktree");
      expect(foundInMainCheckout.status).toBe(0);
      expect(foundInMainCheckout.stdout.trim()).toBe("");

      git(tmpDir, "worktree", "remove", "-f", worktreeDir);
    });
```

Keep every existing test in the file exactly as it is — in particular, the keyless-no-match test
(`"prints nothing and exits 0 when no folder matches the slug"`) and the em-dash test
(`"prints boardRelPath's result given --key and --title, with a real em dash"`) stay untouched;
this task only adds the two tests above.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: the two new tests fail — the `--root` flag is silently ignored by today's
`resolveMainRoot`-based code (so the first new test gets no output, since `nonGitCwd` isn't a git
repo and `resolveMainRoot` falls back to `cwd` itself, which has no board folder at all — not the
`rootDir` the test actually wants it to use), and the worktree test fails because `find`, run with
`cwd` = the worktree, still resolves to the main checkout and doesn't see
`only-in-worktree` there. Confirm the specific failure before moving on.

- [ ] **Step 3: Implement**

Old text (the top imports):

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, requireArgs } from "./cli-args.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
```

New text:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "./cli-args.ts";
```

Old text (`findBoardFolderBySlug`'s doc comment and signature):

```typescript
// Finds a keyed ticket's board folder by slug alone — a folder's own key does not have to match
// whatever key (if any) the branch name carries. DigiSmith's own repo already has this today:
// branch "plugin-update-after-merge" (no key) against folder "DGS-161—plugin-update-after-merge"
// (keyed). Reconstructing the folder name from the branch's own key would miss that folder.
// Entries are sorted before scanning: readdir's own order is not defined, so if two folders ever
// shared one slug, scanning raw readdir order would be nondeterministic — sorting first means it
// always resolves to the same one (the first match in sorted order), every time.
export function findBoardFolderBySlug(slug: string, mainRoot: string): string | undefined {
  const dir = path.join(mainRoot, ...BOARD_DIR_PATH.split("/"));
```

New text:

```typescript
// Finds a keyed ticket's board folder by slug alone — a folder's own key does not have to match
// whatever key (if any) the branch name carries. DigiSmith's own repo already has this today:
// branch "plugin-update-after-merge" (no key) against folder "DGS-161—plugin-update-after-merge"
// (keyed). Reconstructing the folder name from the branch's own key would miss that folder.
// Entries are sorted before scanning: readdir's own order is not defined, so if two folders ever
// shared one slug, scanning raw readdir order would be nondeterministic — sorting first means it
// always resolves to the same one (the first match in sorted order), every time.
// `root` is the working tree to search — the CURRENT checkout, not necessarily the main one. A
// worker's own worktree holds its own board folder until the ticket merges; it does not exist in
// the main checkout before then. Searching the main checkout from inside a worktree would
// silently miss every folder that worktree itself just created.
export function findBoardFolderBySlug(slug: string, root: string): string | undefined {
  const dir = path.join(root, ...BOARD_DIR_PATH.split("/"));
```

Old text (`main()`'s `find` case):

```typescript
      case "find": {
        requireArgs(args, ["slug"]);
        const mainRoot = resolveMainRoot(process.cwd());
        const found = findBoardFolderBySlug(args.slug, mainRoot);
        if (found !== undefined) console.log(found);
        break;
      }
```

New text:

```typescript
      case "find": {
        requireArgs(args, ["slug"]);
        const root = args.root ?? resolveCurrentRoot(process.cwd());
        const found = findBoardFolderBySlug(args.slug, root);
        if (found !== undefined) console.log(found);
        break;
      }
```

Add this new helper right before `export function main()`:

```typescript
// `--root` lets a test (or an unusual caller) point this at an arbitrary directory, bypassing
// git entirely. Otherwise: the current working tree's own top level — never the main checkout
// (see findBoardFolderBySlug's own comment above) — falling back to the bare cwd if this
// directory isn't a git repo at all.
function resolveCurrentRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : cwd;
}

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: every test passes, including every pre-existing one (the keyless-no-match and em-dash
tests among them) — confirms this fix is additive to every other action and every other `find`
case already covered.

- [ ] **Step 5: Fix the skill text — both "find" skills say which tree they search**

Old text (`skills/init/SKILL.md`'s "## The Script" section, the line right after the bash block):

```markdown
Wrap `<slug>` in single quotes, and write any `'` inside it as `'\''`.
```

New text:

```markdown
Wrap `<slug>` in single quotes, and write any `'` inside it as `'\''`. `--action find` searches
the working tree you run it in — this skill always runs inside the worktree Step 2 (or an
earlier session) already created, so it finds that worktree's own board folder even before the
ticket merges.
```

Old text (`skills/jira-intake/SKILL.md`'s "## The Script" section, the line right after its bash
block):

```markdown
Wrap `<title>`/`<slug>` in single quotes, and write any `'` inside either as `'\''`.
```

New text:

```markdown
Wrap `<title>`/`<slug>` in single quotes, and write any `'` inside either as `'\''`. `--action find`
searches the working tree you run it in — `jira-intake` runs in the original checkout, so it
searches that checkout's own board folder.
```

- [ ] **Step 6: Fix finding 7 — the remaining raw-function-name mentions**

Old text (`skills/init/SKILL.md` Step 1, row 2):

```markdown
2. **Already on a feature branch, and a plan file already exists for the
   slug implied by the branch name** (`<Key>__<slug>` or `<slug>` alone) —
   checked the same way as Step 0 item 2 above (`findBoardFolderBySlug`
   against `.digismith/board/` first, then the flat
   `.digismith/docs/<slug>/plan.md` fallback) → normal resume, already
   covered by `digismith:bootstrap`'s own branch/worktree reuse logic (its
```

New text:

```markdown
2. **Already on a feature branch, and a plan file already exists for the
   slug implied by the branch name** (`<Key>__<slug>` or `<slug>` alone) —
   checked the same way as Step 0 item 2 above (the script's `--action find`
   against `.digismith/board/` first, then the flat
   `.digismith/docs/<slug>/plan.md` fallback) → normal resume, already
   covered by `digismith:bootstrap`'s own branch/worktree reuse logic (its
```

Old text (`skills/init/SKILL.md` Error Handling bullet):

```markdown
- **A profile present, not on the base branch, and a plan file exists for
  this branch's slug** (board, matched by slug via
  `findBoardFolderBySlug`; else the flat `docs/` fallback) → see Step 0;
```

New text:

```markdown
- **A profile present, not on the base branch, and a plan file exists for
  this branch's slug** (board, matched by slug via the script's
  `--action find`; else the flat `docs/` fallback) → see Step 0;
```

Old text (`skills/init/SKILL.md` Quick Reference row 0):

```markdown
| 0 | Base branch → always fall through to Step 1 (profile presence here is expected, not a stop condition). Off base branch + profile present + a plan file exists for this branch's slug (board, matched by slug via `findBoardFolderBySlug`; else the flat `docs/` fallback) → report "already initialized" and stop (profile-switch request → `digismith:bootstrap` directly). Otherwise → fall through to Step 1 |
```

New text:

```markdown
| 0 | Base branch → always fall through to Step 1 (profile presence here is expected, not a stop condition). Off base branch + profile present + a plan file exists for this branch's slug (board, matched by slug via the script's `--action find`; else the flat `docs/` fallback) → report "already initialized" and stop (profile-switch request → `digismith:bootstrap` directly). Otherwise → fall through to Step 1 |
```

Old text (`skills/jira-intake/SKILL.md` Quick Reference row 3.1–3.2):

```markdown
| 3.1–3.2 | Derive the slug; target path is `boardRelPath(key, title)` when the ticket has a real key, `.digismith/docs/<slug>/ticket.md` otherwise (unchanged) — in the repo being worked in, never DigiSmith's own |
```

New text:

```markdown
| 3.1–3.2 | Derive the slug; target path is the script's `--action path` when the ticket has a real key, `.digismith/docs/<slug>/ticket.md` otherwise (unchanged) — in the repo being worked in, never DigiSmith's own |
```

- [ ] **Step 7: Diff review — confirm no unrelated line was dropped**

Run `git diff -- scripts/board-path.ts scripts/board-path.test.ts skills/init/SKILL.md skills/jira-intake/SKILL.md`
and read every removed line. For each one, point to the replacement line that does the same job.
Any removed sentence with no replacement doing its job is a bug — fix it before Step 9.

- [ ] **Step 8: Self-check against the live repo**

Run, from inside this worktree (`.worktrees/dgs-159-lifecycle`):

```bash
node --experimental-strip-types scripts/board-path.ts --action find --slug ticket-based-naming-code-and-files
```

Expected: prints `DGS-159—ticket-based-naming-code-and-files` (found in THIS worktree). Then run
the same command with `cwd` set to the main checkout (`/root/Workspace/Jazurite/DigiSmith`, not
this worktree) — expected: still finds the top-level ticket folder there too, since that folder
predates this worker's own sub-folder and was already merged from an earlier part. This doesn't
prove the fix by itself (both trees happen to agree at this coarse a grain) — the real proof is
Step 1's worktree-vs-main-checkout test, which creates a folder that exists in ONLY one tree and
checks both.

- [ ] **Step 9: Commit**

```bash
git add scripts/board-path.ts scripts/board-path.test.ts skills/init/SKILL.md skills/jira-intake/SKILL.md
git commit -m "fix(board-path): make --action find search the current working tree, not the main checkout"
```

---

### Task 11: Re-verify after Task 10

**Files:**
- Modify: `.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html`

- [ ] **Step 1: Run the full board-path test suite**

Run: `npx vitest run scripts/board-path.test.ts`
Expected: every test passes, including the two new Task 10 tests and every pre-existing one.

- [ ] **Step 2: Re-run the Task 6/9 grep audit**

Run:

```bash
grep -n 'digismith/docs' skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/init/SKILL.md skills/jira-intake/SKILL.md
```

Classify every line the same way Task 9 did. Nothing in Task 10 touches a `.digismith/docs`
mention, so this should come back identical to Task 9's own result — confirm that explicitly
rather than assuming it.

- [ ] **Step 3: Re-verify `report.html` against the real parser**

Run the same command Task 6/9 used:

```bash
node --experimental-strip-types -e "import('./.digismith/hooks/post-finish/scripts/update-history.ts').then(m=>console.log(m.parseReport(process.argv[1])))" ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html"
```

Expected: still prints an object, does not throw.

- [ ] **Step 4: Update `report.html`**

If the existing report describes `find`'s search root anywhere (it may, from Task 9's own update),
correct it to describe the fixed behavior: the current working tree, not the main checkout. Add a
short note recording this fix and why it mattered (the DGS-161/worktree case, found by the maestro
reading the Task 7 diff directly). Keep every load-bearing marker intact — this is an edit, not a
rewrite.

- [ ] **Step 5: Commit**

```bash
git add ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/report.html"
git commit -m "docs(ticket-naming): update the report for the find-root fix"
```

- [ ] **Step 6: Report to the maestro**

Send the new commit hashes. Do not push: wait for "approved: push".
