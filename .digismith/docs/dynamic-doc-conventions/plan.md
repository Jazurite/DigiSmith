# Dynamic Doc Conventions (G.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every distinct DigiSmith build (a first pass or a later addendum) its own permanent,
never-reused `<Letter.N>` sub-item and a matching nested doc folder, resolving both the
report/plan filename-collision gap and Jack's own request for per-letter doc nesting in one move.

**Architecture:** `digismith:brainstorming` resolves the nested path once (scanning the letter's
own folder on disk for the next free number) and writes `design.html` there;
`digismith:writing-plans` and `digismith:report-implementation` both reuse that same resolved
path rather than re-deriving anything. `report-implementation`'s existing `<feature-slug>`
placeholder is allowed to itself contain a `/` for the nested case, so every downstream
`.digismith/docs/<feature-slug>/...` string interpolation already in place needs zero further
changes. `update-history.ts`'s `parseReport()` gains a matching two-segment case.

**Tech Stack:** Markdown (skill instruction files), TypeScript/Vitest (`update-history.ts` and its
existing test file).

## Global Constraints

- Existing flat folders (V.4, V.5, I.6, etc.) are frozen historical record — never migrated,
  never touched by this work
- Any reader of `.digismith/docs/` must check the nested shape first, flat second, permanently
  (not a transition window — old folders never move)
- This build covers DigiSmith's own repo only (map-letter grouping) — consumer-repo
  generalization is explicitly out of scope
- No AI/Claude/assistant attribution in any commit message (standing DigiSmith-wide rule)

---

### Task 1: Fix `update-history.ts`'s nested-path support

**Files:**
- Modify: `.digismith/hooks/post-finish/scripts/update-history.ts:51-63` (`parseReport`)
- Modify: `.digismith/hooks/post-finish/scripts/update-history.test.ts` (new test case)
- Modify: `.digismith/hooks/post-finish/03-history-update.md:60` (prose)

**Interfaces:**
- Consumes: nothing — first task, no prior task in this plan
- Produces: `parseReport(reportPath: string): ParsedReport` now returns a two-segment `slug`
  (e.g. `"G/G.3-dynamic-doc-conventions"`) for a nested report path, alongside its existing
  single-segment behavior for a flat one. `findChangedReports` and `buildReferenceLinks` are
  unchanged — both already work correctly with a `/`-containing slug (confirmed: git's default
  pathspec glob already crosses directory separators, and `path.join`/template-string
  interpolation both handle an embedded `/` correctly with no special casing).

- [ ] **Step 1: Write the failing test**

Add this test immediately after the existing `"extracts title, map item, date, summary, and slug
from a valid report"` test in `.digismith/hooks/post-finish/scripts/update-history.test.ts`:

```typescript
  it("extracts a two-segment slug from a nested report path", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "G", "G.3-dynamic-doc-conventions");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Dynamic Doc Conventions (G.3)", mapItem: "G.3", date: "2026-09-23", summary: "Nested the docs." });

    const parsed = parseReport(reportPath);

    expect(parsed).toEqual({
      featureTitle: "Dynamic Doc Conventions (G.3)",
      mapItem: "G.3",
      date: "2026-09-23",
      summary: "Nested the docs.",
      slug: "G/G.3-dynamic-doc-conventions",
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run .digismith/hooks/post-finish/scripts/update-history.test.ts`
Expected: FAIL — the new test's `slug` assertion doesn't match (the current regex only captures
the single flat segment, `"G.3-dynamic-doc-conventions"`, not the joined two-segment form).

- [ ] **Step 3: Write minimal implementation**

In `.digismith/hooks/post-finish/scripts/update-history.ts`, replace:

```typescript
  const normalizedPath = reportPath.replace(/\\/g, "/");
  const slugMatch = /\.digismith\/docs\/([^/]+)\/report\.html$/.exec(normalizedPath);
  if (!slugMatch) {
    throw new Error(`Cannot derive slug from report path (expected .digismith/docs/<slug>/report.html): ${reportPath}`);
  }

  return {
    featureTitle: titleMatch[1],
    mapItem: mapItemMatch[1],
    date: dateMatch[1],
    summary: summaryMatch[1].trim(),
    slug: slugMatch[1],
  };
```

with:

```typescript
  const normalizedPath = reportPath.replace(/\\/g, "/");
  const nestedMatch = /\.digismith\/docs\/([^/]+)\/([^/]+)\/report\.html$/.exec(normalizedPath);
  const flatMatch = /\.digismith\/docs\/([^/]+)\/report\.html$/.exec(normalizedPath);
  const slug = nestedMatch ? `${nestedMatch[1]}/${nestedMatch[2]}` : flatMatch?.[1];
  if (!slug) {
    throw new Error(`Cannot derive slug from report path (expected .digismith/docs/<slug>/report.html or .digismith/docs/<parent>/<slug>/report.html): ${reportPath}`);
  }

  return {
    featureTitle: titleMatch[1],
    mapItem: mapItemMatch[1],
    date: dateMatch[1],
    summary: summaryMatch[1].trim(),
    slug,
  };
```

(Try the two-segment pattern first, then fall back to one segment — a flat path can never match
the two-segment pattern in the first place, since that requires a literal `/` where the flat
path's single segment sits directly against `/report.html`, so there is no ambiguity between the
two cases.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run .digismith/hooks/post-finish/scripts/update-history.test.ts`
Expected: PASS — all tests in the file, including every pre-existing one (the flat-path case is
unchanged behavior).

- [ ] **Step 5: Update the hook's own prose**

In `.digismith/hooks/post-finish/03-history-update.md`, replace:

```
range)` result means the pinned range (`base..head`) contained no `.digismith/docs/<slug>/report.html` — either
```

with:

```
range)` result means the pinned range (`base..head`) contained no `.digismith/docs/<slug>/report.html`
(`<slug>` may itself be a nested `<Letter>/<Letter.N>-<real-slug>` or `_unlettered/<real-slug>`
path — `parseReport` matches both the same way it matches a flat slug) — either
```

- [ ] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/update-history.ts .digismith/hooks/post-finish/scripts/update-history.test.ts .digismith/hooks/post-finish/03-history-update.md
git commit -m "feat(hooks): support nested doc paths in update-history's parseReport"
```

---

### Task 2: Wire `brainstorming`, `writing-plans`, and `report-implementation` to the nested shape

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (the "After the Design" documentation section)
- Modify: `skills/writing-plans/SKILL.md` (the "Save plans to" section)
- Modify: `skills/report-implementation/SKILL.md:86-107` (Step 1) and `:201-204` (2a's
  `{{FEATURE_SLUG}}` bullet)

**Interfaces:**
- Consumes: nothing new from Task 1 — this task's changes are independent prose edits to three
  skill files; Task 1's `update-history.ts` fix is a separate call site with no shared state
- Produces: the full resolve-once-reuse-everywhere path convention described in the design doc,
  end to end across all three skills that participate in a build's doc lifecycle

- [ ] **Step 1: Update `skills/brainstorming/SKILL.md`'s documentation section**

Find this text (inside the "DigiSmith-tracked work" bullet, right after the HTML shell code
block):

```
  `{{MAP_ITEM}}` is "no map letter — `<one-line reason>`" for a structural change with no map
  letter, same as `unified-docs-convention/design.html` already does — never leave it blank or
  invent a letter.

  **Slug:** reuse whatever slug the caller already resolved and passed into this invocation
  (e.g. `digismith:bootstrap` derives one before calling this skill, and passes it along) —
  never re-derive independently when one was already given. No slug was passed (a
  fully ad-hoc call — DigiSmith's own self-development or any other untracked-by-a-ticket case,
  no `digismith:bootstrap` in the loop) → derive it yourself: lowercase the feature description,
  drop filler words (a, an, the, on, to, of, for, in), replace remaining non-alphanumeric runs
  with a single hyphen, truncate to ~40 characters at a word boundary.

  **Before committing**, check whether the target path is gitignored in this repo:
  `git check-ignore -q .digismith/docs/<slug>/design.html` — exit 0 (ignored) → write the file,
  skip `git add`/commit, never force with `-f`; exit 1 (not ignored, the normal case for
  DigiSmith's own repo) → commit normally.
```

Replace it with:

```
  **Slug:** reuse whatever slug the caller already resolved and passed into this invocation
  (e.g. `digismith:bootstrap` derives one before calling this skill, and passes it along) —
  never re-derive independently when one was already given. No slug was passed (a
  fully ad-hoc call — DigiSmith's own self-development or any other untracked-by-a-ticket case,
  no `digismith:bootstrap` in the loop) → derive it yourself: lowercase the feature description,
  drop filler words (a, an, the, on, to, of, for, in), replace remaining non-alphanumeric runs
  with a single hyphen, truncate to ~40 characters at a word boundary.

  **Path:** once the slug is known, resolve where `design.html` actually gets written — this
  resolved path (not just the bare slug) is what `digismith:writing-plans` and
  `digismith:report-implementation` both reuse downstream, so carry it forward exactly rather
  than letting a later step re-derive a bare slug and reconstruct a flat path from it.

  - **Map item has a letter** (e.g. `G.3`, `U.1`) — nest under that letter: scan
    `.digismith/docs/<Letter>/` on disk for existing `<Letter>.M-*` folders, take `max(M)+1` as
    this build's own number `N` (a build with no existing folders under that letter yet starts at
    `N=1`), and write to `.digismith/docs/<Letter>/<Letter>.<N>-<slug>/design.html`. An addendum
    to already-shipped work gets its own new `N` here too — it never reuses its parent's folder,
    even though the map item it addends may share the same conceptual number elsewhere; the
    filesystem numbering is independent per-letter and always increments.
  - **No map letter** (a structural change with no map item at all) — write to
    `.digismith/docs/_unlettered/<slug>/design.html` instead. Flat inside this bucket, no `.N`
    numbering — there's no letter to number against, and no historical case has ever needed a
    second build under the same letterless slug. `{{MAP_ITEM}}` is "no map letter —
    `<one-line reason>`" for this case, same as `unified-docs-convention/design.html` already
    does — never leave it blank or invent a letter.

  **Before committing**, check whether the resolved target path from above is gitignored in this
  repo: `git check-ignore -q <resolved-path>/design.html` — exit 0 (ignored) → write the file,
  skip `git add`/commit, never force with `-f`; exit 1 (not ignored, the normal case for
  DigiSmith's own repo) → commit normally.
```

- [ ] **Step 2: Verify Step 1 landed correctly**

Run: `grep -c "max(M)+1" skills/brainstorming/SKILL.md`
Expected: `1`

Run: `grep -c "_unlettered" skills/brainstorming/SKILL.md`
Expected: `1` or more

- [ ] **Step 3: Update `skills/writing-plans/SKILL.md`'s "Save plans to" section**

Find this text:

```
  **Slug:** reuse the slug already established earlier in this same session (this skill runs as
  `brainstorming`'s own terminal step once the user approves the spec, so a slug is normally
  already in context from that earlier work). No slug in context (a fully standalone
  invocation) → derive it yourself, same rule as `brainstorming`'s own ad-hoc case: lowercase
  the feature description, drop filler words (a, an, the, on, to, of, for, in), replace
  remaining non-alphanumeric runs with a single hyphen, truncate to ~40 characters at a word
  boundary.

  There is no gitignore check for `plan.md` — only `design.html` gets one.
```

Replace it with:

```
  **Path:** reuse the exact resolved path `brainstorming` already established earlier in this
  same session — nested `.digismith/docs/<Letter>/<Letter.N>-<slug>/` or
  `.digismith/docs/_unlettered/<slug>/`, per that skill's own Path rule (this skill runs as
  `brainstorming`'s own terminal step once the user approves the spec, so the resolved path is
  normally already in context from that earlier work). Write `plan.md` into that same folder,
  alongside `design.html` — never re-derive a bare slug and reconstruct a flat
  `.digismith/docs/<slug>/` path from it.

  No resolved path in context (a fully standalone invocation, no prior `brainstorming` step this
  session) → derive a bare slug yourself, same rule as `brainstorming`'s own ad-hoc case
  (lowercase the feature description, drop filler words, hyphenate, truncate ~40 characters), and
  fall back to the flat `.digismith/docs/<slug>/plan.md` shape — there's no letter to nest under
  without `brainstorming`'s own resolution step having run.

  There is no gitignore check for `plan.md` — only `design.html` gets one.
```

- [ ] **Step 4: Verify Step 3 landed correctly**

Run: `grep -c "Path:.*reuse the exact resolved path" skills/writing-plans/SKILL.md`
Expected: `1`

- [ ] **Step 5: Update `skills/report-implementation/SKILL.md`'s Step 1**

Find this text:

```
1. **Plan file** — the same plan file the just-finished run executed,
   normally `.digismith/docs/<feature-slug>/plan.md`. Derive
   `<feature-slug>` from that file's path, **guarded**:
   - **Check first:** does the plan's path actually match
     `.digismith/docs/<something>/plan.md` — i.e. is its parent directory
     sitting directly under `.digismith/docs/`?
   - **Yes (the normal case)** → `<feature-slug>` is that parent directory
     name. Read it straight off the path; don't re-derive it from content.
     E.g. `.digismith/docs/capture-ephemeral-url/plan.md` →
     `capture-ephemeral-url`.
   - **No (the plan lives somewhere else)** → the parent directory name is
     *not* a slug and must not be used as one. This happens when a plan
     predates the unified-docs convention, or was deliberately excluded
     from a migration, and still sits under the old
     `docs/superpowers/plans/` layout — where the parent directory is
     literally `plans`. Fall back to parsing the slug out of the plan
     file's **own filename**, which follows `<date>-<slug>-plan.md`: strip
     the leading `<date>-` (`YYYY-MM-DD-`) and the trailing `-plan.md`.
     E.g. `docs/superpowers/plans/2026-08-08-unified-docs-convention-plan.md`
     → `unified-docs-convention` (**not** `plans`).
```

Replace it with:

```
1. **Plan file** — the same plan file the just-finished run executed,
   normally `.digismith/docs/<feature-slug>/plan.md`. Derive
   `<feature-slug>` from that file's path, **guarded**:
   - **Check first:** how many path segments sit between `.digismith/docs/` and `plan.md`?
   - **Exactly one (the flat case)** → `<feature-slug>` is that single parent directory
     name. Read it straight off the path; don't re-derive it from content.
     E.g. `.digismith/docs/capture-ephemeral-url/plan.md` →
     `capture-ephemeral-url`.
   - **Exactly two (the nested case)** → `<feature-slug>` is both segments, joined by `/`.
     E.g. `.digismith/docs/G/G.3-dynamic-doc-conventions/plan.md` →
     `G/G.3-dynamic-doc-conventions`, or `.digismith/docs/_unlettered/some-slug/plan.md` →
     `_unlettered/some-slug`. Preserve the slash — every downstream step in this skill already
     treats `<feature-slug>` as a plain path-interpolation value
     (`.digismith/docs/<feature-slug>/report.html` and so on), so a two-segment slug
     reconstructs the correct nested path with no further changes needed anywhere else here.
   - **Neither (the plan lives somewhere else)** → the parent directory name is
     *not* a slug and must not be used as one. This happens when a plan
     predates the unified-docs convention, or was deliberately excluded
     from a migration, and still sits under the old
     `docs/superpowers/plans/` layout — where the parent directory is
     literally `plans`. Fall back to parsing the slug out of the plan
     file's **own filename**, which follows `<date>-<slug>-plan.md`: strip
     the leading `<date>-` (`YYYY-MM-DD-`) and the trailing `-plan.md`.
     E.g. `docs/superpowers/plans/2026-08-08-unified-docs-convention-plan.md`
     → `unified-docs-convention` (**not** `plans`).
```

- [ ] **Step 6: Update `skills/report-implementation/SKILL.md`'s 2a `{{FEATURE_SLUG}}` bullet**

Find this text:

```
- `{{FEATURE_SLUG}}`: the slug already derived in Step 1 — the plan file's
  parent directory name in the normal case, or the slug parsed out of its
  filename in Step 1's fallback case. E.g. `capture-ephemeral-url`. Never
  a bare container directory like `plans`.
```

Replace it with:

```
- `{{FEATURE_SLUG}}`: the slug already derived in Step 1 — the plan file's
  parent directory name in the flat case, both segments joined by `/` in the nested case
  (e.g. `G/G.3-dynamic-doc-conventions`), or the slug parsed out of its
  filename in Step 1's fallback case. E.g. `capture-ephemeral-url`. Never
  a bare container directory like `plans`.
```

- [ ] **Step 7: Verify Steps 5-6 landed correctly**

Run: `grep -c "Exactly two (the nested case)" skills/report-implementation/SKILL.md`
Expected: `1`

Run: `grep -c "both segments joined by" skills/report-implementation/SKILL.md`
Expected: `1` or more

Run: `grep -c "^### Step" skills/report-implementation/SKILL.md`
Expected: `5` (confirms no step heading was accidentally duplicated or removed)

- [ ] **Step 8: Final read-through**

Read all three edited files (`skills/brainstorming/SKILL.md`'s documentation section,
`skills/writing-plans/SKILL.md`'s "Save plans to" section, `skills/report-implementation/SKILL.md`'s
Step 1 and 2a) in full. Confirm: brainstorming's Path rule and writing-plans' Path rule describe
the same resolved-path handoff consistently (same folder shape, same "reuse, don't re-derive"
language); report-implementation's three-case guard reads naturally as an extension of the
original two-case one, not a bolted-on afterthought; no section contradicts another.

- [ ] **Step 9: Commit**

```bash
git add skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md skills/report-implementation/SKILL.md
git commit -m "feat(docs-convention): wire brainstorming/writing-plans/report-implementation to per-letter nesting"
```
