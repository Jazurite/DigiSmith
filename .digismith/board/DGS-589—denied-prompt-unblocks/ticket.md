# Nightwatch: a denied permission prompt leaves the run blocked until its next turn

**Key:** DGS-589
**Tracker:** ClickUp (`dg clickup get-task DGS-589`). Sign-off: Auto.

A denied permission prompt writes no event, so the run stays `blocked` until its next turn.
Fix: an `idle_prompt` after the last `permission_prompt` ends the blocked state.
