# DGS-581: Nightwatch: run record and event log for every worker run (run.json frozen at dispatch, events.jsonl from hooks)

**Key:** DGS-581
**ClickUp:** 14zcebrwbvt (lineage J.5 Nightwatch DGS-580, initiative Autonomous Operation DGS-548)
**Source text:** order ~/.digismith-depot/sessions/DigiSmith/orders/order-nw-01-dgs-581-build.md; brief .digismith/sessions/dgs-581/brief.md

At dispatch, write run.json for each worker run (Builder, Reviewer, Scout): order path, ticket key, role, seat, model, plugin version, base SHA, branch, worktree, herdr tab, budget. Write it once. Nothing changes it later.
Plugin hooks append events.jsonl for the run: a monotonic seq, a timestamp, a type, a payload.
Named lifecycle events: dispatched / started / blocked / review_ready / merged / pushed / lost / ended (with phase and reason).
Location: ~/.digismith-depot/runs/<KEY>/<run-id>/. A new attempt gets a new run id. Never reuse a run id.
Done when: a real ticket run produces run.json and an events.jsonl that seq orders, with started and ended. A permission prompt produces a blocked event.
