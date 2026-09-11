# `subagent-driven-development`'s review templates don't guard against AI attribution in commits

**Status:** Not applied. Confirmed live 2026-09-11, during the G-rename task (map item G/G.2).

## The gap

An implementer subagent was dispatched with the `global/commit-style` standard inlined explicitly
in its prompt — "Never reference AI tools or assistants — no 'Generated with Claude', no
`Co-Authored-By: Claude`, no mention of AI assistance anywhere in the message" — and with the
repo owner's own even-broader standing instruction (no AI attribution anywhere, full stop,
confirmed live the same session). It still committed with:

```
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

The **task reviewer**, dispatched afterward with the diff, flagged this as an "unverifiable" item
(the diff format didn't show the full commit message) — but its own phrasing assumed the
attribution trailer was *expected* ("The report claims the required attribution... was added per
session rules"), the opposite of this repo's actual standard. Only because the controller
independently ran `git show --format=fuller -s` instead of trusting either the implementer's
report or the reviewer's assumption did this surface as a real, confirmed violation, entering a
proper fix round (amend, since the commit was local-only and unreviewed by anyone else).

## Why this happened

Every Claude Code subagent's own base instructions (the harness's own default git-commit
guidance) include appending a `Co-Authored-By: Claude` trailer. A repo-specific standard passed
as inlined prompt text competes with that baseline instinct and, at least once, lost — even
though the exact same instruction had been correctly followed by other implementer dispatches
earlier in the same session. Not a consistent failure, but a real, demonstrated one.

## Where this would land, not yet decided

Likely a mechanical addition to `subagent-driven-development`'s own two review templates
(`task-reviewer-prompt.md`, and the shared `requesting-code-review/code-reviewer.md` used by both
the standalone skill and the final whole-branch review): a standing, non-optional check —
"inspect the actual commit message body (not just the diff) for any AI/assistant attribution
trailer or mention; flag as Important if found, regardless of what the report claims" — rather
than leaving this to incidentally surface as a "cannot verify from diff" item that depends on the
reviewer happening to guess the right disposition. This would also need `scripts/review-package`
to actually include full commit messages (not just subjects) in what it hands the reviewer, since
the diff format alone doesn't carry commit bodies.

A broader, more speculative alternative: have the controller itself run a mechanical
`git log --format='%(trailers)'` check over the task's commit range as a standing step before
generating the review package at all, rather than relying on subagent judgment for something this
checkable programmatically. Not scoped — would need its own brainstorm to decide whether this
belongs in the review flow or earlier, right after the implementer reports DONE.

## Why not applied yet

Single confirmed occurrence. Worth designing a real fix rather than reacting to one instance, but
not urgent enough to interrupt other work for — captured here so the pattern (and the exact
review-template gap that let it slip through) isn't lost before it's picked up properly.
