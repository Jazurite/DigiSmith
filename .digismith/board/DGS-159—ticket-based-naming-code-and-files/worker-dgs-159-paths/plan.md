# DGS-159 Part 4: Path-Mention Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish applying the ticket-based naming convention (DGS-158) to the skills and the hook
Parts 1–3/5/6 left out: `report-implementation`'s `{{MAP_ITEM}}`/`{{TICKET_KEY_META}}` fold into
one `{{TICKET}}` field, `brainstorming`/`writing-plans` gain a keyed board-folder branch,
`generate-comment` reads whichever path `report-implementation` actually used, one line in
`adopt`'s HTML shell gets the same `{{TICKET}}` value, and the history hook's `parseReport`
accepts a new `Ticket:` line while still accepting the legacy `Map item:` line. Keyless work is
untouched everywhere — design at
`.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-paths/design.html`.

**Architecture:** One TDD script task (the hook parser) first, so every later task that starts
emitting `Ticket:` lands on a parser that already accepts them. Then one task per skill file,
each touching only the keyed branch of that skill's own flow; two one-line documentation/comment
tasks; a closing task runs the test suite and writes this unit's own report.

**Tech Stack:** TypeScript (`--experimental-strip-types`, no build step) and Vitest for Task 1,
matching every other script in `scripts/` and `.digismith/hooks/`. Tasks 2–8 are Markdown
skill-prose/comment edits — no build step, no test runner; each is self-checked by tracing the
exact combinations named in the design's markup table through the new text.

**Recommended execution:** Subagent-Driven Development. Nine tasks, several of which edit
core onboarding/reporting skills every ticket in every repo eventually goes through — worth an
independent reviewer's fresh eyes per task, same precedent as Part 3.

## Global Constraints

- Keyless work (`ticket: false`, genuinely no key supplied, or no tracker key evident) gets
  **zero behavior changes** anywhere in this plan — verify this explicitly in each task's
  self-check, not just assume it. The one exception, stated explicitly per-task below, is
  `report-implementation`'s own `{{TICKET}}` field: unlike every other change in this plan, it
  applies identically whether or not a key exists (see Task 2's markup table — "map letters are
  gone" means gone even when a title still carries one).
- Every edit changes only the lines the keyed path needs — never drop a sentence that wasn't
  about the path convention just because it sits next to one that was. Each task's self-check
  runs `git diff` on the file it touched and confirms every removed line has a same-job
  replacement, and no unrelated sentence vanished (same rule Part 3 used).
- `scripts/board-path.ts`'s shipped functions (`buildFolderName`, `boardRelPath`,
  `parseFolderName`, `boardRelPathForSlug`, `findBoardFolderBySlug`) are not touched — this plan
  only *calls* them from skill text, via the CLI, same pattern `jira-intake`/`bootstrap`/`adopt`
  already use ("The Script").
- Every script that shells out to `git` on a path containing a real em dash (U+2014) must use
  `-z`/NUL-terminated output, never newline-split plain `--name-only` — not newly relevant here
  (no new `git` invocations in this plan), stated only because it governs `update-history.ts`,
  which Task 1 touches.
- Times written in UTC+7 first, UTC in brackets (standing repo rule).
- No AI attribution in any commit (repo rule).
- Never write or edit `MEMORY.md` or the four lifecycle skills' own path/keyless logic (only the
  one named line in `adopt`, Task 3).

## The Markup Table (every combination `report-implementation`/`parseReport` must handle)

This resolves the checkpoint-2 ambiguity directly: **`report-implementation`'s own
`{{TICKET}}` field never falls back to the old map-letter-derived value, in any case** — the
"keyless branch keeps `Map item` byte for byte" rule from the design applies only to
`brainstorming`'s and `adopt`'s own `design.html` shells (a different field, a different file,
governing where `design.html` nests on disk — not report-implementation's report.html header).

| # | Case | File | Exact rendered markup | Check |
|---|---|---|---|---|
| 1 | Keyed ticket | `report-implementation`'s **new** report.html | `<span>Ticket: <strong>DGS-123</strong></span>` | Task 1 test: `parseReport` on a fixture with this exact line returns `ticket: "DGS-123"` |
| 2 | Keyless, title still carries an old map-letter parenthetical (e.g. `Foo (G.3)`) | `report-implementation`'s **new** report.html | `<span>Ticket: <strong>n/a</strong></span>` — **identical to row 3**; the letter in the title plays no role in this field any more | Task 1 test: `parseReport` on a fixture with `Ticket: <strong>n/a</strong>` returns `ticket: "n/a"`; Task 2's self-check dry-runs the derivation by hand against a title that does carry `(G.3)` and confirms the rule still yields `n/a`, not `G.3` |
| 3 | Keyless, no map letter at all | `report-implementation`'s **new** report.html | `<span>Ticket: <strong>n/a</strong></span>` | Same fixture/test as row 2 (the markup is byte-identical) |
| 4 | An **old** report already on disk, generated before this change | any already-committed report.html | unchanged, e.g. `<span>Map item: <strong>G.3</strong></span>` — never regenerated, never touched by this plan | Task 1 test: `parseReport` on a fixture using only the legacy `Map item: <strong>…</strong>` line (no `Ticket:` line at all) still returns `ticket: "G.3"` |
| 5 | Neither line present at all | any report.html | n/a — this is an error case | Task 1 test: `parseReport` throws, naming both `TICKET`/`Ticket:` and the legacy `MAP_ITEM`/`Map item:` in the message |

A **separate**, unrelated table governs `brainstorming`'s and `adopt`'s own `design.html` shells
(Task 3, Task 4) — not hook-parsed, not covered by the rows above:

| Case | Rendered markup | Why |
|---|---|---|
| Keyed | `<span>Ticket: {{TICKET}}</span>` (the resolved ticket key) | New — same value rule as the report.html field, different file |
| Keyless, has a map letter | `<span>Map item: G.3</span>` | **Unchanged** — the existing letter-derivation stays byte for byte |
| Keyless, no map letter | `<span>Map item: no map letter — <reason></span>` | **Unchanged** — the existing `_unlettered` fallback text stays byte for byte |

---

### Task 1: `update-history.ts` — accept `Ticket:`, keep `Map item:` for old reports

**Files:**
- Modify: `.digismith/hooks/post-finish/scripts/update-history.ts`
- Modify: `.digismith/hooks/post-finish/scripts/update-history.test.ts`

**Interfaces:**
- Consumes: nothing new — same `fs`/`path`/`spawnSync` already imported.
- Produces: `ParsedReport.ticket: string` (renamed from `ParsedReport.mapItem`). Nothing in this
  repo reads `.mapItem`'s value today (confirmed in the design, section 2) — `main()` only uses
  `.summary`, `.slug`, `.base`, `.date`, `.featureTitle` — so this rename changes no behavior
  anywhere else in this file.

- [ ] **Step 1: Write the failing tests**

  In `update-history.test.ts`, replace `writeReportFixture` with a version that can emit either
  line:

  ```typescript
  function writeReportFixture(dir: string, overrides: Partial<{
    title: string;
    ticket: string;
    date: string;
    summary: string;
    legacy: boolean;
  }> = {}): string {
    const title = overrides.title ?? "Sample Feature (Z)";
    const ticket = overrides.ticket ?? "Z";
    const date = overrides.date ?? "2026-09-11";
    const summary = overrides.summary ?? "Built the sample feature end to end.";
    const legacy = overrides.legacy ?? false;
    const ticketLine = legacy
      ? `<span>Map item: <strong>${ticket}</strong></span>`
      : `<span>Ticket: <strong>${ticket}</strong></span>`;
    const html = `<!doctype html>
  <html><head><title>${title} — Implementation Report</title></head>
  <body>
  <header class="doc-head">
    <h1>${title} — Implementation Report</h1>
    <div class="meta">
      <span>Date: ${date}</span>
      ${ticketLine}
    </div>
  </header>
  <section id="summary">
    <h2>Summary</h2>
    <p>${summary}</p>
    <p>Reference documents: the <a href="design.html">design spec</a>.</p>
  </section>
  </body></html>`;
    fs.writeFileSync(dir, html);
    return dir;
  }
  ```

  Update every existing call site's `mapItem:` key to `ticket:`, and add `legacy: true` to each
  (these five tests — flat, two-segment, three-segment, one-segment board, two-segment board —
  are about slug derivation, not the ticket line, so they keep using the old `Map item:` label
  unchanged):

  ```typescript
  writeReportFixture(reportPath, { title: "Sample Feature (Z)", ticket: "Z", date: "2026-09-11", summary: "Built it.", legacy: true });
  // ...and the matching `expect(parsed).toEqual({ ... ticket: "Z", ... })` (was `mapItem: "Z"`)
  ```

  Apply the same `mapItem:` → `ticket:`, `legacy: true` edit to the `"Dynamic Doc Conventions
  (G.3)"`, `"Lineage Handoff"`, and both `"Shared Path Modules"` (board) fixtures/expectations.

  Rewrite the missing-marker test (today: `"throws a clear error when the map item marker is
  missing"`, expects `.toThrow("Cannot find MAP_ITEM")`):

  ```typescript
  it("throws a clear error when neither Ticket nor Map item is present", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, "<html><body><h1>X — Implementation Report</h1></body></html>");

    expect(() => parseReport(reportPath)).toThrow("Cannot find TICKET");

    fs.rmSync(dir, { recursive: true, force: true });
  });
  ```

  The two tests below it (missing DATE, missing SUMMARY_PARAGRAPH) already embed a literal
  `Map item: <strong>X</strong>` line in their raw HTML fixtures purely so parsing gets past that
  check — leave those two untouched; a legacy-format line still satisfies the new combined check.

  Add four new tests, right after the existing `parseReport` describe block's board-folder tests:

  ```typescript
  it("accepts a new-style Ticket: line for a keyed report", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "board", "DGS-199—some-ticket");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Some Ticket", ticket: "DGS-199", date: "2026-10-05", summary: "Shipped it." });

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("DGS-199");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a new-style Ticket: line with the literal n/a value for keyless work", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "some-keyless-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Some Keyless Feature", ticket: "n/a", date: "2026-10-05", summary: "Shipped it." });

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("n/a");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("still accepts a legacy Map item: line with no Ticket: line present at all", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "an-old-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "An Old Feature (G.3)", ticket: "G.3", date: "2026-08-01", summary: "Shipped it long ago.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("G.3");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("prefers Ticket: over Map item: if a malformed report somehow had both", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "both-lines", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      '<html><body><h1>X — Implementation Report</h1>' +
        '<span>Date: 2026-10-05</span>' +
        '<span>Ticket: <strong>DGS-1</strong></span>' +
        '<span>Map item: <strong>Z</strong></span>' +
        '<section id="summary"><p>Built it.</p></section>' +
        '</body></html>',
    );

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("DGS-1");

    fs.rmSync(dir, { recursive: true, force: true });
  });
  ```

- [ ] **Step 2: Run the tests to verify the new ones fail**

  Run: `node --experimental-strip-types $(which vitest 2>/dev/null || echo npx vitest) run .digismith/hooks/post-finish/scripts/update-history.test.ts`
  (or whatever this repo's standing test-runner command is — check `package.json`'s `scripts.test`
  if unsure; every other script here uses Vitest directly).
  Expected: the four new tests FAIL (`ticket` is `undefined`, or the thrown message doesn't say
  "Cannot find TICKET" yet), and the five renamed-field tests FAIL on the `toEqual`/property name.

- [ ] **Step 3: Implement**

  In `update-history.ts`, change the interface:

  ```typescript
  export interface ParsedReport {
    featureTitle: string;
    ticket: string;
    date: string;
    summary: string;
    slug: string;
    base: "docs" | "board";
  }
  ```

  Replace the map-item block:

  ```typescript
  const ticketMatch =
    /Ticket: <strong>(.+?)<\/strong>/.exec(html) ??
    /Map item: <strong>(.+?)<\/strong>/.exec(html);
  if (!ticketMatch) {
    throw new Error(
      `Cannot find TICKET (Ticket: <strong>...</strong>) or the legacy MAP_ITEM ` +
        `(Map item: <strong>...</strong>) in ${reportPath}`,
    );
  }
  ```

  And the return statement's `mapItem: mapItemMatch[1]` becomes `ticket: ticketMatch[1]`.

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: all tests in this file PASS.

- [ ] **Step 5: Self-check**

  `git diff .digismith/hooks/post-finish/scripts/update-history.ts` — confirm the only changes
  are the interface field rename and the single regex/error-message block; `findChangedReports`,
  `buildReferenceLinks`, `buildEventHtml`, `insertTimelineEntries`, `bumpLastUpdated`, and `main`
  are byte-for-byte unchanged. Confirm row 1, 2/3, 4, and 5 of the Markup Table above each have a
  passing (or, for row 5, throwing) test.

- [ ] **Step 6: Commit**

  ```bash
  git add .digismith/hooks/post-finish/scripts/update-history.ts .digismith/hooks/post-finish/scripts/update-history.test.ts
  git commit -m "feat(ticket-naming): accept a Ticket: line in parseReport, keep Map item: for old reports"
  ```

---

### Task 2: `report-implementation` — fold `{{MAP_ITEM}}`/`{{TICKET_KEY_META}}` into `{{TICKET}}`, read board folders

**Files:**
- Modify: `skills/report-implementation/SKILL.md`

**Interfaces:**
- Consumes: Task 1's new hook behavior (this task is what starts emitting the `Ticket:` line the
  hook now accepts).
- Produces: nothing other tasks call by name — `generate-comment` (Task 6) only needs to know
  *where* this skill wrote `report.html`, not any new field name.

- [ ] **Step 1: Step 1 — add the board-folder case**

  Old text (the "Exactly one / Exactly two / Exactly three / None of these" guard, around line
  92):

  > - **Check first:** how many path segments sit between `.digismith/docs/` and `plan.md`?

  New text — insert this check *before* that one, so a board-folder plan never falls into the
  docs segment-counting logic at all:

  ```markdown
  1. **Plan file** — the same plan file the just-finished run executed. **Check first: does the
     path start with `.digismith/board/`?**
     - **Yes** — the folder immediately after `board/` must be a real board folder name; validate
       it with `node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action parse --name '<that folder name>'`
       (a parse failure here is a real error: stop and report it, don't fall through to the docs
       logic below). `<target folder>` is simply the plan file's own parent directory —
       `dirname(plan.md)` — whether that's the board folder itself (a flat ticket,
       `.digismith/board/<KEY>—<slug>/plan.md`) or a nested worker folder inside it
       (`.digismith/board/<KEY>—<slug>/worker-<agent>/plan.md` — this very ticket's own shape).
       No segment-counting needed either way: whatever directory the plan sits in **is** the
       target folder. `<feature-slug>` for this case is that same `<target folder>`'s path
       relative to `.digismith/`, e.g. `board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-paths`
       — used only for the footer/commit-message text below, nothing parses it structurally the
       way the docs case's slug gets parsed.
     - **No** — fall through to the existing `.digismith/docs/` segment-counting logic below,
       unchanged (flat / nested / lineage / the `docs/superpowers/plans/` filename fallback).
  ```

  Leave every word of the existing flat/nested/lineage/fallback bullets as-is underneath this new
  check — they still apply verbatim whenever the new check's "No" branch is taken.

- [ ] **Step 2: Step 1.5 — generalize the ticket-key read path**

  Old text (line 140): `` `.digismith/docs/<feature-slug>/ticket.md` exists and has a `` …

  New text: `` `<target folder>/ticket.md` exists and has a `` … — `<target folder>` is whichever
  Step 1 resolved (the board folder/worker-subfolder, or the docs folder). Nothing else in Step
  1.5 changes: the profile-gate logic, the "no matching file → treat as stale" fallback, and the
  `ticket: false` discard rule are untouched.

- [ ] **Step 3: Step 2a — replace `{{MAP_ITEM}}` and drop `{{TICKET_KEY_META}}`**

  Old text (two separate bullets):

  ```markdown
  - **`{{MAP_ITEM}}`** — the map-item letter/number in `{{FEATURE_TITLE}}`'s
    own parenthetical. E.g. `Capture Ephemeral URL (M)` → `M`.
  ...
  - **`{{TICKET_KEY_META}}`** — from Step 1.5: if a ticket key survived
    that step's profile gate, this is literally
    `<span>Ticket: <strong><Key></strong></span>` with the real key
    substituted (escaped per Step 2f, though a JIRA key like `EMKT-9001`
    never actually needs it). If no key survived (no `ticket.md`, no
    `**Key:**` line in it, or the active profile has `ticket: false`),
    this is the empty string — the span is omitted entirely, not rendered
    blank.
  ```

  New text — one bullet, replacing both:

  ```markdown
  - **`{{TICKET}}`** — from Step 1.5: the ticket key if one survived that step's profile gate
    (no title-parenthetical parsing any more — map letters are gone for this field, in every
    case, including a title that still happens to carry one). If no key survived (no
    `ticket.md`, no `**Key:**` line in it, or the active profile has `ticket: false`), this is
    the literal string `n/a`. Always rendered — never the empty string, never omitted.
  ```

- [ ] **Step 4: Template — the new `Ticket:` span**

  Old text (inside `.meta`):

  ```html
  <span>Date: {{DATE}}</span>
  <span>Map item: <strong>{{MAP_ITEM}}</strong></span>
  {{TICKET_KEY_META}}
  <span>Commit range: <code>{{MERGE_BASE_SHORT}}..{{HEAD_SHORT}}</code></span>
  ```

  New text:

  ```html
  <span>Date: {{DATE}}</span>
  <span>Ticket: <strong>{{TICKET}}</strong></span>
  <span>Commit range: <code>{{MERGE_BASE_SHORT}}..{{HEAD_SHORT}}</code></span>
  ```

- [ ] **Step 5: Step 4 — generalize the write target, gitignore check, and commit message**

  Old text (Step 4, item 1): `` Target path: `.digismith/docs/<feature-slug>/report.html`, using the slug from Step 1 ``…

  New text: `` Target path: `<target folder>/report.html`, using the `<target folder>` Step 1
  resolved (board or docs) `` — keep the rest of item 1's "normally the same folder as
  `plan.md`/`design.html`" explanation, just swap the literal path.

  Old text (item 4's `git check-ignore -q .digismith/docs/<feature-slug>/report.html` and its two
  branches' prose) → swap every literal `.digismith/docs/<feature-slug>/report.html` for
  `<target folder>/report.html`, same substitution, no other wording change.

  Old text (item 4's commit, `git commit -m "docs: add <feature> (<map-item>) implementation
  report"`) → the parenthetical now shows whichever value `{{TICKET}}` rendered for this report:
  `git commit -m "docs: add <feature> (<ticket>) implementation report"`, where `<ticket>` is the
  same string used in the template (a real key, or `n/a`).

- [ ] **Step 6: Error Handling and Quick Reference — same substitution**

  - "Plan file isn't at `.digismith/docs/<slug>/plan.md`" row: leave this row describing the
    **docs** fallback exactly as-is (it's specifically about the docs-case filename fallback,
    unaffected by the new board check landing earlier).
  - "Target report path is gitignored..." row and the Quick Reference's Step 1/Step 4 lines: swap
    `.digismith/docs/<feature-slug>/report.html` for `<target folder>/report.html`, same as Step
    5 above.
  - Quick Reference Step 2's `{{TICKET_KEY_META}}` mention → `{{TICKET}}` (ticket key or `n/a`,
    always rendered).

- [ ] **Step 7: Self-check against the Markup Table**

  Walk all five rows of the Markup Table above against the new Step 1/1.5/2a/template text:
  1. A board-folder plan with a real key in `ticket.md` → row 1 (`Ticket: <strong>DGS-123</strong>`).
  2. A docs-folder plan whose `{{FEATURE_TITLE}}` still has `(G.3)`, `ticket: false` profile or no
     `ticket.md` → row 2 (`Ticket: <strong>n/a</strong>` — confirm the new Step 2a text has no
     path left that would read the `(G.3)` parenthetical for this field at all).
  3. A docs-folder plan with no parenthetical and no key → row 3 (same `n/a` markup as row 2).
  4. Confirm nothing in this task touches any already-committed `report.html` (no "regenerate
     existing reports" step exists anywhere here — row 4 is about `parseReport`, Task 1's job,
     not this task's).
  5. A nested worker-folder plan (`.digismith/board/<KEY>—<slug>/worker-<agent>/plan.md`) →
     confirm Step 1's new check resolves `<target folder>` to the worker subfolder itself, not
     the parent ticket folder — this is the exact shape this very ticket's own report will use in
     Task 9.

  `git diff skills/report-implementation/SKILL.md` — confirm every removed line (the two old
  `{{MAP_ITEM}}`/`{{TICKET_KEY_META}}` bullets, the old docs-only Step 1 guard intro, the old
  literal docs paths in Step 4/Error Handling/Quick Reference) has a same-job replacement above,
  and that Steps 2b–2f, Step 3's offload/render logic, and Step 5 are untouched.

- [ ] **Step 8: Commit**

  ```bash
  git add skills/report-implementation/SKILL.md
  git commit -m "feat(ticket-naming): report-implementation reads board folders, folds Map item into Ticket"
  ```

---

### Task 3: `adopt` — one line, same `{{TICKET}}` value

**Files:**
- Modify: `skills/adopt/SKILL.md`

**Interfaces:** none — a single-line value swap inside an already-existing HTML shell. No other
task depends on this one.

- [ ] **Step 1: Edit the one line**

  Old text (`SKILL.md:308`, inside the HTML shell's `.meta` block):

  ```html
  <span>Map item: {{MAP_ITEM}}</span>
  ```

  New text:

  ```html
  <span>Ticket: {{TICKET}}</span>
  ```

  Value rule (add one sentence right after the shell, where the shell's placeholder-filling
  instructions already live, line ~232): `{{TICKET}}` is the real key when Step 3 resolved one,
  `n/a` when it didn't — same rule Task 2 gave `report-implementation`'s own template.

  This is the only line in `adopt` this plan touches. Every other mention of `.digismith/docs/`
  or `.digismith/board/` in this file (the already-shipped Part 3 keyed/keyless branching) stays
  exactly as merged.

- [ ] **Step 2: Self-check**

  `git diff skills/adopt/SKILL.md` — confirm exactly one rendered line changed (plus the one new
  value-rule sentence), nothing else in the file moved.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/adopt/SKILL.md
  git commit -m "feat(ticket-naming): adopt's design.html shell uses the same Ticket value"
  ```

---

### Task 4: `brainstorming` — keyed board-folder branch, `{{TICKET}}` for that branch only

**Files:**
- Modify: `skills/brainstorming/SKILL.md`

**Interfaces:**
- Consumes: `board-path.ts --action find --slug` / `--action path --key --title` (already shipped,
  Part 1+2), via the CLI — same invocation pattern `jira-intake`'s "The Script" section uses.
- Produces: the resolved `<target folder>` that Task 5 (`writing-plans`) reuses "exactly as
  established earlier in this same session" — same hand-off contract that already exists for the
  keyless case.

- [ ] **Step 1: Insert the keyed branch before the existing map-letter logic**

  Old text (the "Map item has a letter" / "No map letter" bullets, lines 226–238) stays
  **completely unchanged** — that's the keyless branch (Decision c, design section 4). Insert a
  new bullet immediately above it:

  ```markdown
  - **A tracker key is in hand** (passed in by `bootstrap`/`adopt`, or already evident from how
    this work was requested) — resolve the **existing** folder first, never reconstruct one:
    `node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action find --slug '<slug>'`
    against `.digismith/board/`. **Found** → that folder, `<folder>/design.html`. **Not found**
    (an ad hoc keyed call with no prior `jira-intake` run this session) → compute fresh:
    `node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action path --key '<key>' --title '<title>'`.
    Wrap `<slug>`/`<key>`/`<title>` in single quotes, `'` inside any of them as `'\''` — same
    quoting rule as `jira-intake`'s "The Script".
  ```

  Reword the line directly above the two existing bullets (currently: `- **Map item has a
  letter**...` starts a bulleted list with no lead-in sentence) by adding one clause so the two
  original bullets now read as the keyless alternative: prepend `**No tracker key** (the existing
  behavior, unchanged):` as a new sub-heading line directly above the unmodified `- **Map item
  has a letter**` bullet, so the structure reads "keyed → (new bullet); no key → (two existing
  bullets, byte for byte)."

- [ ] **Step 2: Template — `{{MAP_ITEM}}` for the keyed branch only**

  The shell's `.meta` block (line 194) and the footer-path logic are shared by both branches
  today. Split it: state explicitly, right after the HTML shell, that the `<span>` line reads
  `Ticket: {{TICKET}}` (value: the key, Decision a/b — always present in this branch, a key that
  resolved a folder is never absent) when the keyed branch above was taken, and keeps today's
  `Map item: {{MAP_ITEM}}` with its existing letter-or-"no map letter — reason" value when the
  keyless branch was taken. Do not change the HTML shell's literal text itself (both labels can
  coexist as alternatives described in the surrounding prose, the same way the shell already
  describes "DigiSmith-tracked" vs. "not tracked" as prose alternatives around one shell).

- [ ] **Step 3: Self-check**

  Trace two scenarios by hand: (1) `bootstrap` hands this skill a key and slug already matching
  an existing `.digismith/board/DGS-170—example/ticket.md` → confirm the new bullet's `--action
  find` branch is the one taken, and the header renders `Ticket: DGS-170`. (2) A fully ad hoc,
  keyless call (DigiSmith's own self-development, no ticket at all) with a map letter `U.2` →
  confirm the existing bullets are reached unchanged and the header still renders `Map item:
  U.2`, exactly as before this task.

  `git diff skills/brainstorming/SKILL.md` — confirm the two original map-letter bullets are
  present byte for byte, and every other change is additive (the new bullet, the lead-in
  sub-heading, the template-prose split).

- [ ] **Step 4: Commit**

  ```bash
  git add skills/brainstorming/SKILL.md
  git commit -m "feat(ticket-naming): brainstorming resolves a keyed ticket's board folder"
  ```

---

### Task 5: `writing-plans` — mirror brainstorming's keyed branch

**Files:**
- Modify: `skills/writing-plans/SKILL.md`

**Interfaces:**
- Consumes: Task 4's resolved `<target folder>` when this session already ran `brainstorming`.

- [ ] **Step 1: Insert the keyed branch**

  Old text (lines 26–38) describes only the keyless nested/`_unlettered`/flat-fallback path.
  Insert, directly above the existing "**Path:** reuse the exact resolved path..." paragraph:

  ```markdown
  **A tracker key is in hand:** reuse the exact resolved board folder `brainstorming` already
  established earlier in this same session (this skill runs as its terminal step) — never
  re-derive. No resolved path in context (a fully standalone keyed invocation) → the same
  two-step `brainstorming` just ran: `board-path.ts --action find --slug '<slug>'` against
  `.digismith/board/` first, falling back to `--action path --key '<key>' --title '<title>'` only
  if nothing is found. Write `plan.md` into that folder, alongside `design.html`.
  ```

  The existing keyless paragraph stays exactly as-is below it, now reached only when no key is in
  hand.

- [ ] **Step 2: Self-check**

  Trace the same two scenarios as Task 4 Step 3, one level further: a keyed session where
  `brainstorming` already resolved `.digismith/board/DGS-170—example/` → `plan.md` lands there,
  no re-derivation. A keyless session → unchanged nested/`_unlettered`/flat fallback.

  `git diff skills/writing-plans/SKILL.md` — confirm the keyless paragraph is untouched and the
  new paragraph is the only addition.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/writing-plans/SKILL.md
  git commit -m "feat(ticket-naming): writing-plans reuses brainstorming's resolved board folder"
  ```

---

### Task 6: `generate-comment` — read whichever path `report-implementation` actually used

**Files:**
- Modify: `skills/generate-comment/SKILL.md`

**Interfaces:**
- Consumes: the `<target folder>` Task 2's `report-implementation` resolves (reused if this
  session already ran it; otherwise re-resolved the same two-step way).

- [ ] **Step 1: Edit Step 2's existence check**

  Old text (line 75): `` Check whether this session already has `.digismith/docs/<slug>/report.html` from map item **N** (`digismith:report-implementation`), the same slug this ticket's work used. ``

  New text:

  ```markdown
  Check whether this session already has a `report.html` from `digismith:report-implementation`
  (**N**) for this same ticket's work. **This session already ran N** → reuse the exact
  `<target folder>/report.html` path it resolved, never re-derive. **Standalone invocation, N
  didn't run this session** → resolve the same way N itself does: a tracker key in hand →
  `board-path.ts --action find --slug '<slug>'` against `.digismith/board/`, found folder's
  `report.html`; no key, or not found → the flat `.digismith/docs/<slug>/report.html` fallback,
  unchanged from today.
  ```

  Line 16's own citation to `generate-comment`'s historical design doc
  (`.digismith/docs/generate-comment/design.html`) is unrelated and untouched — that's this
  skill's own permanent home, not per-ticket output.

- [ ] **Step 2: Self-check**

  Trace: a keyed ticket where this same session already ran `report-implementation` and wrote
  `.digismith/board/DGS-170—example/report.html` → confirm the new text reuses that exact path,
  no re-derivation. A standalone `generate-comment` call for a keyless ticket with no N run this
  session → confirm the flat `docs/<slug>/report.html` fallback is reached, matching today's
  behavior exactly.

  `git diff skills/generate-comment/SKILL.md` — confirm only line 75's paragraph changed.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/generate-comment/SKILL.md
  git commit -m "feat(ticket-naming): generate-comment reads report-implementation's resolved path"
  ```

---

### Task 7: `sdd-workspace` — fix the stale top comment

**Files:**
- Modify: `skills/subagent-driven-development/scripts/sdd-workspace`

**Interfaces:** none — comment-only, no logic change (the script already operates on
`dirname "$plan"`, which already works for a board-folder plan).

- [ ] **Step 1: Edit the comment**

  Old text (lines 11–13):

  ```
  # Every DigiSmith plan file is literally named plan.md (flat
  # .digismith/docs/<slug>/plan.md or nested
  # .digismith/docs/<Letter>/<Letter>.<N>-<slug>/plan.md), so the plan's own
  ```

  New text:

  ```
  # Every DigiSmith plan file is literally named plan.md (flat
  # .digismith/docs/<slug>/plan.md, nested .digismith/docs/<Letter>/<Letter>.<N>-<slug>/plan.md,
  # or a keyed .digismith/board/<KEY>—<slug>/plan.md, itself possibly nested one level under a
  # worker subfolder), so the plan's own
  ```

- [ ] **Step 2: Self-check**

  Confirm no other line in this file mentions a path shape — the script's actual logic already
  never branches on `docs/` vs. `board/` (it only ever calls `dirname "$plan"`), so this is a
  documentation-only fix with zero behavior risk.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/subagent-driven-development/scripts/sdd-workspace
  git commit -m "docs(ticket-naming): sdd-workspace's own comment mentions the board/ shape"
  ```

---

### Task 8: `03-history-update.md` — mention the new `Ticket:` line

**Files:**
- Modify: `.digismith/hooks/post-finish/03-history-update.md`

**Interfaces:** none — prose only, describing Task 1's already-shipped behavior.

- [ ] **Step 1: Edit the prose**

  Old text (in the "An `APPENDED <n>: <titles>`..." paragraph): no mention of `Ticket:` at all
  today, only `Map item:` implicitly via `parseReport`'s requirement.

  Add one sentence to that paragraph, right after the existing description of what counts as a
  changed report: "A report's header must carry either a `Ticket: <strong>…</strong>` line (new
  convention — a real key, or the literal `n/a` for keyless work) or the legacy `Map item:
  <strong>…</strong>` line (old reports, still accepted) — `parseReport` throws, and this hook
  stops, if neither is present."

- [ ] **Step 2: Self-check**

  Read the full file once more end to end — confirm the new sentence doesn't contradict anything
  else already said about the `Map item`/table sections note at the bottom (it doesn't; that note
  is about the Map/Build Order/Progress Overview *sections* of `history.html`, an unrelated
  concept from the per-report header line this sentence describes).

- [ ] **Step 3: Commit**

  ```bash
  git add .digismith/hooks/post-finish/03-history-update.md
  git commit -m "docs(ticket-naming): document the Ticket:/Map item: hook requirement"
  ```

---

### Task 9: Final review and report

**Files:**
- Create: `.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-paths/report.html`

**Interfaces:** none — this task consumes everything above, produces nothing further.

- [ ] **Step 1: Run the full test suite**

  Run this repo's standing test command (check `package.json`'s `scripts.test` if unsure) and
  confirm every test passes, not just `update-history.test.ts` in isolation — Task 1's rename
  touches an exported type (`ParsedReport`), and nothing else in the repo imports it today, but
  this step is the actual verification of that claim, not an assumption.

- [ ] **Step 2: Whole-branch review**

  Re-read every file this plan touched against the Global Constraints and the Markup Table one
  more time, as a single pass across the whole diff (not per-task) — same final gate Part 3 used
  before its own report.

- [ ] **Step 3: Write this ticket's own report.html**

  Invoke `digismith:report-implementation` normally. **Important:** this invocation runs the
  skill as currently **installed** (the plugin cache version), not this branch's own in-progress
  edit from Task 2 — so it will naturally still render the **old** `Map item: <strong>{{MAP_ITEM}}</strong>`
  line, which is exactly what the maestro asked for: this ticket's own report must stay valid
  against the **current**, not-yet-merged hook parser until this very change lands. Do not
  hand-edit the generated report.html to use the new `Ticket:` format — that would make it
  inconsistent with whichever skill version actually produced it. Confirm it passes the **current**
  parser before committing:

  ```bash
  node --experimental-strip-types -e "import('./.digismith/hooks/post-finish/scripts/update-history.ts').then(m=>console.log(m.parseReport(process.argv[1])))" \
    ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-paths/report.html"
  ```

  This target folder is itself the nested-worker-folder shape Task 2 Step 7's scenario 5 names —
  a live end-to-end confirmation of that exact case, using this very report.

- [ ] **Step 4: Commit**

  ```bash
  git add ".digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-paths/report.html"
  git commit -m "docs(ticket-naming): report for DGS-159 Part 4 path-mention skills"
  ```

- [ ] **Step 5: Stop**

  Report to the maestro per the brief's Report format and wait — never push or merge without
  "approved: push".
