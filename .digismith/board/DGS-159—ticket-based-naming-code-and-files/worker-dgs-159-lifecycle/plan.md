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
  `.digismith/docs/<slug>/design.html`). Every other line of the shell, and the gitignore check
  immediately below it, stays exactly as shipped — just substitute `<target folder>` for whichever
  path Step 3 resolved wherever this section already says `.digismith/docs/<slug>/design.html`.
```

- [ ] **Step 4: Update Quick Reference rows 3, 5, 6**

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

- [ ] **Step 5: Self-check against two scenarios**

1. **`ticket: true` repo, Step 1 confirms key `EMKT-9001`.** Step 3 → "Otherwise" branch → Door 1
   with `EMKT-9001` → `.digismith/board/EMKT-9001—<slug>/ticket.md`. Step 6 → target folder is that
   same board path for `plan.md`/`design.html`. Matches design section 6's adopt card.
2. **`ticket: false` repo (`personal`), Step 1 finds no real key.** Step 3 → first branch →
   derive slug directly, no `ticket.md`. Step 6 → target folder is
   `.digismith/docs/<slug>/`, exactly the pre-existing unmodified behavior — confirms the keyless
   path in this skill got no edit either.

- [ ] **Step 6: Diff review — confirm no unrelated line was dropped**

Run `git diff -- skills/adopt/SKILL.md` and read every removed line. For each one, point to the
replacement line that does the same job for the keyed path. Any removed sentence with no
replacement doing its job is a bug — fix it before Step 7.

- [ ] **Step 7: Commit**

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
     this specific ticket. Read `profile` from `.digismith/config.yml`, or when `.digismith/profile` exists (A.4 fallback). If `config.yml` exists but cannot be read or parsed, handle it the same way as a stale profile. Use that value as
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
     `.digismith/config.yml`, or when `.digismith/profile` exists (A.4
     fallback). If `config.yml` exists but cannot be read or parsed,
     handle it the same way as a stale profile. Use that value as
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
