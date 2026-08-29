# DigiSmith self-development can't test its own not-yet-merged Skill-tool calls

**Status:** Not applied. Observational — a real, recurring limitation of DigiSmith's own
self-development process, not a bug in any shipped skill.

**Source:** 2026-08-28, during V.1's (Depot OpenCode server management) Task 2 live
end-to-end smoke test.

## What happened

Task 2's live smoke test was supposed to verify the new `skills/offload-implementer/SKILL.md`
Step 2 text works as written — including its literal mechanism, `Skill(skill: "digismith:depot",
...)`, to invoke Depot's newly-added `ensure-opencode-server` operation. That call failed with
"Unknown skill": the installed DigiSmith plugin snapshot on this machine predates the very branch
being built, so the `Skill` tool can't resolve to code that only exists in an unmerged worktree.
The implementer worked around it by manually executing `skills/depot/SKILL.md`'s instructions by
hand instead — which proved the underlying *mechanics* work (real server start, real port, real
teardown), but never actually exercised the `Skill()` call path itself.

The controller adjudicated this directly rather than looping a fix round on it (see V.1's own
ledger and implementation report): there is no code or text change any task could make to fix an
uninstalled plugin version resolving — retrying the same `Skill()` call would fail identically
every time until the branch merges and the plugin gets rebuilt/reinstalled.

## Why this is a real, recurring gap, not a one-off

Any future DigiSmith feature with a cross-skill integration point (skill A calling skill B via
the `Skill` tool) that's built and tested *before* merging will hit exactly this same wall: the
live plugin cache is always one version behind whatever's being built. This isn't specific to
Depot or offload-implementer — it's structural to how DigiSmith ships itself (a self-hosted
plugin, developed on a branch, only becoming installable after merge + reinstall).

## What's still worth examining

- Whether `subagent-driven-development`'s own live-verification-gate pattern (used throughout
  DigiSmith's self-development plans) should explicitly document this limitation, so a future
  plan's Task N doesn't spend time being surprised by "Unknown skill" and can go straight to the
  documented workaround (manually execute the sibling skill's file content by hand) instead.
- Whether there's a lighter-weight way to test a not-yet-merged skill's `Skill()`-invocation path
  specifically — e.g. some local plugin-reload mechanism — without a full merge + reinstall
  cycle. Not investigated.

## Why not applied yet

Purely observational. The actual outcome was fine (V.1 shipped correctly, mechanics
independently verified) — raised because this exact limitation will very likely resurface the
next time a DigiSmith feature has a cross-skill integration point, and it's cheaper to have this
written down than to re-diagnose "Unknown skill" from scratch again.
