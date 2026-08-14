# `inject-standards` has no scenario for review-time dispatch

**Status:** Not applied. Idea only.

**Source:** Jack's own observation, 2026-08-14, prompted by writing
`standards/global/surgical-changes.md`.

## The gap

`digismith:inject-standards` detects four scenarios (Conversation,
Creating a Skill, Shaping/Planning, Dispatching a Subagent) and Scenario
4's auto-include logic is specifically framed as "about to fire an `Agent`
tool call to **build** something." `superpowers:subagent-driven-development`'s
whole-branch final review — the step that actually checks a diff for scope
creep, unrelated refactors, and orphaned cleanup — never goes through
`inject-standards` at all.

Practical effect: `standards/global/surgical-changes.md`,
`branch-scope-discipline.md`, and `fixing-blockers-mid-task.md` shape what
an *implementer* subagent writes (if matched/injected at dispatch time),
but nothing systematically hands them to whoever reviews the branch
afterward — the exact place these diff-hygiene rules are meant to be
checked against, not just followed.

## Why this might matter

These three standards are specifically about spotting scope creep and
unrelated changes after the fact, not just about writing clean code in the
first place. A review pass that doesn't know they exist can't check for
them explicitly — it's relying on the reviewer noticing the same things
by general judgment, which is exactly the gap standards injection exists
to close everywhere else in DigiSmith.

## Where this would land, not yet decided

Likely a new Scenario 5 ("Dispatching a Review Subagent") in
`inject-standards`, triggered by `superpowers:requesting-code-review`, the
`code-review` skill, or `subagent-driven-development`'s own whole-branch
final review step — auto-including the diff-hygiene-flavored `global/`
standards as explicit review criteria. Not scoped or confirmed; could also
turn out to only matter for `global/` standards specifically (scope/diff
rules) rather than every standard category.
