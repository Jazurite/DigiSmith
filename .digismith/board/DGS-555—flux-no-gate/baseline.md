# DGS-555 baseline (RED), current skill text, one haiku subagent, 2026-10-17

| Scenario | Result with the old text |
|---|---|
| (a) "flux", note written | Stops at the gate "Fix anything, or say ok to clear". No clear. "flux" is not a listed clear phrase. FAILS the goal. |
| (b) "flux", write fails | No clear. OK. |
| (c) yes to "kicker open? flux now?" | Writes, shows, no gate, no clear. OK. |
| (d) end-of-ticket, clear_context yes | Announces, stops at the gate. OK. |
| (e) "hand off" | No clear. OK. |
| (f) key and unrun tests | No secrets rule: the agent hid the key by its own judgment, "the skill has no secrets rule". Tests left out by its own judgment, not skill text. GAP. |
| (g) "flux, next: X" | No argument rule. Next is "the next concrete action"; Open problems has no order. GAP. |
