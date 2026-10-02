# `digismith:init` has no path for a new change request on an already-initialized ticket

**Status:** Idea only, confirmed live once. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

EMKT-791 had a finished build (`plan.md`, `design.html`) when a new change request arrived (banner 1
auto-running countdown). `digismith:init` Step 0 sees the profile plus `plan.md` and stops with
"Already initialized". The manager had to tell the worker to call `digismith:brainstorming`
directly, and to name the new docs with a suffix (`design-countdown.html`,
`plan-countdown.md`, `progress-countdown.md`, `report-countdown.html`) so the original build's
docs stayed intact. That convention lives only in a prompt today.

## The idea

When init finds an initialized ticket and the request is a new change (not a resume), offer an
"amend" path: derive a change suffix, carry the original ticket context forward, and start
brainstorming with suffixed doc paths that writing-plans, executing-plans and
report-implementation all reuse.

## Related

[manager-orchestrator-profile.md](manager-orchestrator-profile.md).
