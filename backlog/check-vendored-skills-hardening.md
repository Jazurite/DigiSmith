# `check_vendored_skills.ts` hardening (map item W)

**Status:** Not applied. Found during W.2's final whole-branch review
(2026-08-29) and its fix-wave re-review. Deliberately deferred — none are
reachable today, and the script is report-only with a human reading the
output, not an automated gate.

**Source:** Final review (opus) of the W.2 branch, plus the scoped
re-review of that review's own fix wave.

## Items

- **Added-upstream files are invisible.** The script drives its
  comparison entirely from `listBaselineFiles` (files present at the
  2026-08-20 baseline commit). A file Superpowers has added to a skill
  folder *since* that baseline is never compared or reported — the
  script has no way to know it exists. This is a deliberate design-scope
  limit (the approved design explicitly scoped the diff loop to
  baseline's file list), not an implementation bug, and is now called
  out as a caveat in `vendored/PROVENANCE.md`'s Sync policy section. If
  ever wanted: union the baseline file list with a fresh `readdirSync`
  of the upstream skill directory so added files show up as a new
  `"added-upstream"` status.
- **A skill absent at baseline reports a false clean.** `git ls-tree`
  exits 0 with empty output for a path that didn't exist at the given
  revision, so `listBaselineFiles` returns `[]` and the report prints
  `<name>: no drift (0 files checked)` instead of flagging the mismatch.
  Only bites if a 15th name is ever added to `VENDORED_SKILLS` without a
  matching baseline-commit file. Guard: throw if the file list comes
  back empty.
- **The per-skill error catch mislabels non-SHA failures.** In `main()`,
  every `checkSkill` throw is reported as "Cannot read baseline commit
  ... git history changed", but `checkSkill` can also throw on a
  `git diff --no-index` failure or the internal-consistency check —
  neither of which is actually a baseline-SHA problem. Soften the
  message or narrow the catch to be more accurate about which failure
  actually occurred.
- **`BASELINE_SHA` is duplicated** between `check_vendored_skills.ts`
  and `check_vendored_skills.test.ts` as two independent string
  literals. The script's own error message tells a human to fix the SHA
  in `PROVENANCE.md` and the script — not the test — so a future SHA
  update following those exact instructions would break the test suite
  confusingly. Fix: import the exported constant in the test instead of
  redeclaring it.
- **Diff headers leak temp-file paths.** `diffContent` writes to
  `mkdtempSync` files named `a`/`b`, so every rendered diff carries a
  `diff --git "a/C:\Users\...\digismith-vendor-diff-XXXX\a"` header.
  Nothing is lost (`formatSkillReport` already prints a clean
  `-- <relPath> --` label immediately above), but it's noise. Optional:
  strip the header lines, or pass `--src-prefix=baseline/
  --dst-prefix=current/` to `git diff`.
- **No handling for git's C-style path quoting.** `listBaselineFiles`
  strips a plain string prefix from `git ls-tree`'s output. A filename
  with non-ASCII or special characters comes back quoted/escaped by
  git, and the prefix strip silently fails, surfacing as `checkSkill`'s
  generic internal-error throw rather than a clear message. Latent —
  every currently-vendored file is plain ASCII. Fix if it ever matters:
  add `-z` to the `git ls-tree` call and split on NUL instead of
  newline.
- **`vendored/PROVENANCE.md` omits the run-from-repo-root
  precondition.** The implementation plan records "run from the
  DigiSmith repo root" as a global constraint, but `PROVENANCE.md` — the
  doc a future reader actually opens — just says `node
  scripts/check_vendored_skills.ts`. Running it from `scripts/` instead
  produces a full false-report ("file missing locally" for everything)
  rather than a loud failure, since `git show` still resolves
  repo-root-relative paths but `readFileIfExists` does not. Worth a
  one-line note in the doc.
- **Task 4-era minors, carried forward:** an import statement in
  `check_vendored_skills.test.ts` for `compareFile`/`formatSkillReport`
  is placed mid-file instead of at the top alongside the module's other
  imports (cosmetic — ESM imports hoist, so no runtime effect); and
  `diffContent`'s trailing-newline output plus `formatSkillReport`'s
  `lines.join("\n")` can leave a double-blank-line between a diff block
  and the next line in the printed report (cosmetic only).

## Why not applied yet

None of these are reachable under today's real conditions (verified
live during the branch's own build — all 14 skills' baseline file
counts matched their upstream counts exactly, so the "added-upstream"
gap is currently inert). This is a report-only, human-in-the-loop
personal tool, not an automated gate — worth fixing opportunistically
the next time this file is touched (e.g. during W.3's call-site
cutover or W.4's first real activation), not on its own.
