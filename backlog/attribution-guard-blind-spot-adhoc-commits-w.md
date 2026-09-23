# AI Attribution Guard (W.8) never runs on ad-hoc/direct commits — only inside a formal review flow

**Status:** Not applied. Confirmed live, 2026-09-23 — four real commits in this repo's own
history carry an unwanted `Co-Authored-By: Claude ...` trailer despite the standing
no-attribution rule, caught by Jack directly, not by any DigiSmith mechanism.

**Source:** A live incident in a self-development session running ad-hoc backlog/design work
(no ticket, no `subagent-driven-development` plan, no `requesting-code-review` invocation) —
just direct `git commit` calls for docs/backlog bookkeeping. A session-level attribution
instruction ("end git commit messages with Co-Authored-By: ...") arrived mid-session and got
followed literally instead of being overridden by the user's own standing "no AI attribution
anywhere" preference, which explicitly states it overrides exactly this kind of generic
default. Four commits already pushed to `origin/main` before Jack caught it:
`b0f41c8`, `11bbd91`, `2508f74`, `490ce4f` — all docs-only (backlog notes, a design spec),
no functional code affected. Left in git history as-is; fixing forward, not rewriting shared
history other concurrent sessions may already depend on.

## What's confirmed

W.8 (`.digismith/docs/review-template-ai-attribution-guard/design.html`, built 2026-09-11)
already built a real, working mechanical check for exactly this class of mistake —
`check-attribution` blocks `subagent-driven-development`'s `review-package` step from writing
a package when a commit message carries an attribution trailer/phrase/emoji, and
`requesting-code-review`'s shared `code-reviewer.md` template runs the identical check as a
mandatory step. This genuinely works, and W.8's own final review already logged two real,
deliberately-deferred gaps in it (`backlog/attribution-guard-pr-description-gap.md` — PR
descriptions go unchecked; `backlog/check-attribution-no-escape-hatch-for-pre-policy-history.md`
— 39 pre-existing commits already carry attribution from before the policy existed).

**This incident is a third, distinct gap, not yet recorded anywhere:** all four checks above
are gated on going through a formal review flow (`subagent-driven-development`'s
`review-package`, or `requesting-code-review`). None of them fire on a direct, ad-hoc
`git commit` made outside any plan or review skill — exactly the shape of most of this
session's own commits, and a genuinely common pattern for DigiSmith's own self-development
(backlog bookkeeping, quick design-doc fixes, one-off docs commits — this whole session alone
made dozens of exactly this kind of commit before the four offending ones). The mechanical
guard that exists today simply never runs in that path.

**W.10 (`hooks/hooks.json`, `scripts/session-init.ts`, shipped 2026-09-22 — the day before this
incident) is directly relevant, unused infrastructure.** It's a real `SessionStart` hook that
already fires on every session start, startup/resume/clear/compact/fork alike — but it only
ever prints a banner when `.digismith/profile` exists, and stays completely silent otherwise
("missing config is benign," matching G.2/H/P's own precedent). DigiSmith's own repo
deliberately never has `.digismith/profile` set (that file is explicitly for consumer repos,
never DigiSmith's own — established since `bootstrap`'s own Step 0). So W.10's hook already
fires in exactly this incident's context (a bare self-development session, no ticket) and
already does nothing — the one session-start mechanism that could have surfaced a reminder here
is silently opting out of the exact case that needed it.

## Why this matters

Confirmed AI attribution has been Jack's own explicit standing rule since before W.8 even
shipped — W.8 built the mechanical enforcement specifically because a reviewer's judgment alone
wasn't reliable ("the original incident's reviewer had none to check against and defaulted to
assuming the trailer was expected"). This incident is the same failure mode one level up: no
reviewer *or* mechanical check was even in the loop, because ad-hoc self-development commits
don't route through either. The fix direction W.8 already chose (mechanical check, not
judgment) is the right template — it just needs a path that covers direct commits too, not only
reviewed ones.

## Suggested shape (not yet decided)

Two independent angles, not mutually exclusive:

1. **Reactive, at commit time:** wire `check-attribution`'s existing check into a `git`
   pre-commit hook (or a lightweight wrapper DigiSmith's own self-development commits already
   go through, if one exists) so it fires on *any* commit in this repo, not just ones a review
   skill happens to touch — closing the actual blind spot directly, independent of which flow
   produced the commit.
2. **Proactive, at session start (closer to Jack's own framing of this — "commit style not
   injected when a session starts"):** extend W.10's `session-init.ts` to also state the
   no-attribution rule (and maybe the rest of DigiSmith's own commit-style standard,
   `standards/global/commit-style.md`) as part of its startup banner, unconditionally for
   DigiSmith's own repo — not gated on `.digismith/profile` existing, since that file is
   deliberately never set here. A proactive reminder wouldn't have stopped this specific
   incident by itself (the conflicting instruction arrived mid-session, not at start), but it's
   real defense-in-depth and directly closes the "W.10 already fires here and already does
   nothing" gap noted above.

Option 1 is the one that actually would have caught this exact incident; option 2 is a good
complement but not a substitute for it.

## Why not applied yet

Surfaced live, mid-incident — written down per the same "record it, don't fix it under an
unrelated task's momentum" pattern the rest of this backlog uses. W-lineage's own territory
(W.8, W.10 both live here), not designed further in this session.
