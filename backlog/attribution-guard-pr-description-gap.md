# AI attribution policy covers PR descriptions in wording only — `check-attribution` never checks one

**Status:** Not applied. Confirmed live during W.8's own final whole-branch review (2026-09-11).

**Source:** Final review (opus) of the W.8 branch (`review-template-ai-attribution-guard`),
Recommendations section.

## What's confirmed

W.8's new policy line (added to both `task-reviewer-prompt.md` and `code-reviewer.md`) reads:
"This project forbids AI/assistant attribution anywhere in commit messages **or PR
descriptions** — no exceptions." The "or PR descriptions" half of that sentence is currently
aspirational — `check-attribution` only ever inspects `git log --format=%B` (commit messages),
never a PR's own description text. `finishing-a-development-branch`'s Option 2 (Push and Create
PR) is the one place in this repo's own flow that produces a PR description, and nothing there
calls the guard at all.

This isn't hypothetical: this exact session received a generic harness instruction mid-session
to append a `🤖 Generated with [Claude Code]` footer to PR descriptions (correctly refused, per
this repo's own standing no-attribution rule) — the same failure mode `check-attribution` exists
to catch for commits, just on the one surface it doesn't reach yet.

## Why this matters

`check-attribution`'s own regex (`co-authored-by:.*claude|co-authored-by:.*anthropic|generated
with.*claude|generated with.*anthropic|🤖`) already matches the 🤖-footer pattern — the detection
logic doesn't need new patterns, just a new call site and a source of text to check (the PR
description string, not a commit range).

## Candidate shape, not yet decided

A call to `check-attribution`-equivalent logic (the script currently takes `BASE HEAD` and reads
`git log`, so either a small variant accepting raw text on stdin, or a second thin script sharing
the same regex) inserted into `finishing-a-development-branch`'s Option 2, checked against the PR
description text before it's actually submitted to the forge (`gh pr create --body ...` or
equivalent) — failing the same way `review-package` does: refuse to submit, name what matched,
let the human fix the text.

## Why not applied yet

Explicitly out of scope for W.8's own design (`.digismith/docs/review-template-ai-attribution-guard/design.html`'s
Out of Scope section named this exact gap and deferred it deliberately) — this file exists so the
deferral doesn't get lost, and to record that the policy wording already promises coverage the
mechanism doesn't yet deliver.
