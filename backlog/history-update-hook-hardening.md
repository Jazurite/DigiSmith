# `update-history.ts` / `03-history-update.md` hardening (map item Y.1.3)

**Status:** Not applied. Found during Y.1.3's final whole-branch review
(2026-09-11) and its fix-wave re-review. Deliberately deferred — none are
reachable under today's real conditions, and the hook's failure mode when
they do become reachable is loud and safe (exit 1, nothing written, nothing
committed), not silent corruption.

**Source:** Final review (opus) of the Y.1.3 branch, plus the scoped
re-review of that review's own one-line fix wave (the `-- .digismith/history.html`
pathspec guard, applied before merge).

## Items

- **No template-contract test bounds the blast radius.** `parseReport`'s
  four regexes are coupled to `report-implementation` (N)'s fixed
  `report.html` template — the em-dash in `<h1>… — Implementation Report</h1>`,
  `Map item: <strong>…</strong>`, `<span>Date: …</span>`, the first `<p>`
  inside `<section id="summary">` — and `insertTimelineEntries`' anchor is
  the exact `\r\n\r\n  </div>\r\n</section>` closing of `history.html`'s
  Timeline section. The review validated all four markers against every one
  of the 33 real `report.html` files in the repo (33/33 parse) and the anchor
  against the real `history.html`, so nothing is broken today. But a future
  template change fails at the worst moment — mid-merge, after the branch is
  already pushed, inside a hook that otherwise commits and pushes on its own
  — instead of in CI. Fix: one cheap Vitest test asserting the four markers
  against a real committed `report.html` (or, better, against N's template
  block in `skills/report-implementation/SKILL.md` directly) and the anchor
  against the real `.digismith/history.html`. The reviewer called this the
  highest-value follow-up.
- **`--diff-filter=AM` makes the skipped dedup check more reachable than the
  design assumes.** The design's no-dedup rationale ("`ORIG_HEAD..HEAD` is a
  fresh range per merge, so the same report reappearing is very unlikely")
  holds for *added* reports, but the `M` in the filter means a later branch
  that merely fixes a typo in an old `report.html` re-selects it and appends a
  second Timeline entry for an already-logged feature. Still YAGNI-correct to
  skip today — it hasn't happened — but the assumption is weaker than stated.
  Options if it bites: drop `M` (added-only), or add the one-line
  grep-for-existing-link dedup the design explicitly declined.
- **`mapItem` is parsed, typed, and tested — then never used.** `parseReport`
  extracts it, `ParsedReport` declares it, a test asserts it, and `main()`
  never reads `parsed.mapItem` — a vestige of the badge-flipping requirement
  scoped out at design time. Small real consequence: the generated `<h4>` is
  the report's `<h1>` prefix only. Most reports embed the map item in the
  title ("VPS Session CLI (V.3)"), but not all — `agentic-bridge/report.html`
  is titled "Agentic Bridge" with map item `K.9`, so its auto-generated entry
  would name no map item anywhere, unlike every hand-written entry in the
  timeline, all of which lead with one. Fix: thread the already-parsed
  `mapItem` into the title when the title doesn't already contain it.
- **Smaller deferred minors from the same review, carried forward:**
  `03-history-update.md`'s non-zero-exit prose says "stop here, do not
  commit, and investigate" but not `01-version-bump.md`'s "do not continue to
  any further post-finish hook" — moot while `03` is last, latent the day a
  `04-` hook is added; `requireArgs` sits outside `main()`'s `try`, so a
  missing `--base` surfaces as a raw stack trace rather than the
  `Cannot update history: …` stderr line (exit still non-zero, hook always
  passes `--base`); the git pathspec `.digismith/docs/*/report.html` matches
  `/` in git's wildcard semantics, so a hypothetical nested
  `.digismith/docs/a/b/report.html` would be selected and then hard-fail
  `parseReport`'s single-segment slug regex (fail-safe, no such nesting
  exists); generated `<p>` bodies are one 500–1600-char line where
  hand-written entries wrap at ~70 chars with 6-space continuation indent
  (renders identically, only affects future `history.html` diff
  readability).

## Why not applied yet

None reachable under today's real conditions — verified live during the
branch's own final review (33/33 real reports parse; the Timeline anchor
resolves against the real file; the first real run of the hook, on this
very branch's merge, appended its own entry cleanly). Worth fixing
opportunistically the next time `update-history.ts` is touched — e.g. when
a fourth `post-finish` hook or a second lifecycle point arrives — not on its
own. The template-contract test is the one item worth pulling forward if
`report-implementation`'s template is ever about to change.
