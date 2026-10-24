# Oculus: current phase and time in phase in the Runs table, phase durations on the run page

**Key:** DGS-613
**Tracker:** ClickUp (https://app.clickup.com/t/14zcebrwjdc)
**Status:** refinement
**Priority:** normal
**Parent epic:** J.5 Oculus

## Description

Jack, 2026-10-24 ~17:5x UTC+7, from two Oculus screenshots (Runs table row of a running build; the run page's phase strip): "we should see the running build time here and here".

What
Runs table: a running run shows its current phase and the time in that phase (for example "building 0:14"), next to the total duration.
Run page: the phase strip (Claimed, Worktree ready, Building, Review, Merged, Pushed) shows how long each phase took, and a live counter on the current phase; the budget bar already shows "building 0:15 of 45 min".

Notes
Phase times come from the phase markers already in the events. Times UTC+7. Depends on the Oculus rename (DGS-599). Sign-off: ask Jack at refinement (screens).
