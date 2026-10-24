# DGS-589 spec: a denied permission prompt unblocks the run

Rewritten 2026-10-24 (UTC+7) after a probe run on the Maestro's order. Sign-off: Auto. Refinement only today; the build runs in the 23:00 scan.

## Facts
1. Old premise (ticket): after a denial Claude Code fires `idle_prompt` about 60 s later. FALSE.
2. Probe A (probe run on the Maestro's order, real session): an unanswered permission prompt for 4 min 8 s gave only `started` + `blocked(permission_prompt)`. No `idle_prompt` fires while a prompt waits.
3. Probe B (probe run on the Maestro's order, real session): after a denial no `idle_prompt` came in 86 s or in 4 min. A hook log of every event (PostToolUseFailure, PermissionDenied, Stop, Notification, ...) shows NO hook fires on a denial. So no event in the events file can show a denial.
4. Probe B: herdr `agent_status` was `done` after the denial (probe pane).
5. Read-only check by this session (2026-10-24, UTC+7): `herdr-ws pane list` (the call the watchdog already makes once per workspace) returns `agent_status` for every pane. Values seen across w2-w4: `working` (5), `idle` (9), `done` (11), `unknown` (2). My own pane read `working`. This session saw no `blocked` (no prompt was waiting).
5b. Probe C (probe run on the Maestro's order, 2026-10-24 16:56-16:57 UTC+7, haiku probe, manual mode, seat jack): `herdr-ws pane list` `agent_status` read `blocked` for the whole 70 s a permission prompt waited, and `done` within 8 s of the denial (it stayed `done` for 30 s). So the signal is measured: `blocked` while a prompt waits, `done` after a denial.
6. Hook side: `idle_prompt` and `permission_prompt` both reach the events file as `blocked` events with `data.kind` (`buildData("blocked")`, seen in real files). No hook change is needed.

## Change
The signal is herdr's status for the run's pane, not an event.

`classify` stays pure. It gets one new last parameter: `agentStatus: string | null = null` (herdr `agent_status` of `run.herdr.pane`; null = not known).

Rule, applied only where `classify` now returns `blocked` (last `permission_prompt`, no later `tool` or `turn_end`):
- `agentStatus` is `idle`, `done` or `working` AND the prompt is at least 60 s old (`now - ts >= 60_000`): the prompt was answered. Do not return blocked; continue to the silence and phase rules (normally healthy).
- Anything else stays blocked: `blocked`, `unknown`, null (no herdr, no pane on the record, herdr did not answer), an unlisted value, or a prompt younger than 60 s. Fail safe: an unsure watchdog keeps the item open.
- A gone pane is still `lost` (unchanged, checked earlier).
- The 60 s grace covers herdr lagging behind the Notification hook (status may still read `working` for a moment after the prompt appears).
- `idle_prompt` stays ignored (DGS-583 rule): never blocked, never an answer.

Plumbing (no extra herdr call):
- `pane.ts`: `PaneLookup` returns `Map<pane_id, agent_status> | null` (was `Set`). `herdrPaneLookup` reads `agent_status` next to `pane_id` (a missing or non-string status becomes `"unknown"`). `null` still means herdr did not answer.
- `watch.ts`: `paneOf` keeps `Present/gone/unknown` from `map.has`. A second small helper `statusOf(ws, pane)` reads the same cached map (null when the pane or the map is missing). The call becomes `classify(record, events, pane, nowMs, budgets, statusOf(...))`. Nothing else in `watch.ts` changes. The DGS-583 guard (run + kind + `since`) is untouched: `healthy` closes the item and clears the run's `opened` keys; a later prompt has a new `since`.
- `packages/cli/src/oculus/derive.ts` (Oculus) keeps calling `classify(..., "unknown", ...)` with no status: its view is unchanged (a denied run still shows blocked there until the next turn; out of scope, noted).
- Hook, `hooks/hooks.json`, settings: no edit.

## Fit with DGS-598 (approved spec and plan, read only)
- Its hook change keeps the `blocked` event shape and `kind`. Our change does not depend on the hook at all now.
- Its Task 7 adds `isWatched` and one early return in `classify` right after the `ended` check, and edits `watch.ts` in `withEvents` and above the main loop. We edit `classify`'s blocked branch and signature (different lines), `paneOf` and the one `classify(` call in `watch.ts`. Expect a clean merge in either order; if a hunk touches, keep both. Its `watchdog.test.ts` cases still pass (status defaults to null = stay blocked).
- Automatic runs it creates get a `herdr.pane` from the labeller; a run with no pane keeps today's behavior.

## Tests (fakes only; no real herdr)
`watchdog.test.ts` (prompt 5 min old, `agentStatus` as noted):
- `blocked` -> blocked; `unknown` -> blocked; null -> blocked; `"weird"` -> blocked.
- `idle`, `done`, `working` -> healthy.
- `done` but prompt 30 s old -> blocked (grace).
- `done`, then a second `permission_prompt` 2 min later (events) -> blocked with the new `since`.
- gone pane + `done` -> lost.
- idle_prompt alone -> healthy (existing); permission_prompt then idle_prompt with null status -> blocked (idle_prompt is no answer).
`pane.test.ts`: `herdrPaneLookup` returns a Map with statuses; a pane with no `agent_status` -> `"unknown"`; code != 0 or bad JSON -> null.
`watch.test.ts` (the helper `present` becomes a Map): run with an old permission_prompt, status `blocked` -> item opens; next pass status `done` -> item resolved; a new permission_prompt after that with status `blocked` -> a new item; herdr down (null map) -> the item stays open.

## First use (after the merge; last plan step)
Throwaway run in a herdr tab (run env set). Trigger a prompt and wait: confirm `herdr-ws pane list` reads `blocked` and `dg autonomous watch` opens the item. Deny it: confirm the status leaves `blocked` and the next pass (after the 60 s grace) resolves the item. Confirm with a real read; if herdr never reads `blocked`, the rule is wrong: stop and tell the Maestro.
