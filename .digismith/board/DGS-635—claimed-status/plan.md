# DGS-635: replace `ready` with `claimed`, and the scan runs 24/7 (spec + plan)

Date: 2026-10-25 (UTC+7). Sign-off: Auto. Order oc-06 plus the Maestro's scope addition (scan 24/7). Ticket: `dg clickup get-task DGS-635`.

## Summary (for Jack)

- A ticket in `to do` with Mode Autonomous is ready for the factory. Mode Manual (or empty) is never claimed.
- The scan claims a ticket by setting `claimed`. The conductor sets `in progress` when the Builder starts building.
- The scan runs at any hour (it no longer returns `off` outside 23:00-06:00). It still claims one ticket at a time. The lock and the breaker do not change. The away switch only marks the time as unattended.
- **Board column change (Jack sees it):** the status `ready` (index 3, between `to do` and `concept`) becomes `claimed` and moves to sit right before `in progress` (after `refinement`). Its id stays the same. It is the only status that moves.

| | before | after |
|---|---|---|
| set | 0 backlog · 1 scheduled · 2 to do · **3 ready (unstarted)** · 4 concept · 5 discovery · 6 refinement · 7 in progress · 8 review · ... · 14 Closed | 0 backlog · 1 scheduled · 2 to do · 3 concept · 4 discovery · 5 refinement · **6 claimed (custom)** · 7 in progress · 8 review · ... · 14 Closed |

## Design

1. **`dg clickup rename-status` (new; `dg` has only `add-status`).** `--space <id> --from <name> --to <name> [--type <t>] [--after <s> | --before <s>] [--yes]`. Same Frontdoor call as `add-status`: GET the space set, PUT the whole set back. The renamed status keeps its id, takes the new name (and type), and moves to the anchor. Every other status is unchanged except a dense orderindex. No `status_change_map`. A dry run without `--yes`. Refuses: an unknown `--from`, a `--to` that already exists, an anchor that is not in the set, a type order break (open, unstarted, custom, done, closed). With `--yes` it prints the previous set, then reads the set back and checks: same count, same ids, every other status unchanged, the renamed one at its planned name, type and index. It shares the checks with `add-status` (`unstarted` is added to the type list and the rank).
2. **Scan (`scan.ts`, `tracker-clickup.ts`).**
   - Step 1 (the work rule) goes away. No `off` outcome. An expired away is still turned off (step 0). The lock, breaker, guardrail and conductor checks stay where they are.
   - Starter check: `hasStatus("claimed")`. When it is missing, the scan writes the event and the DGS-548 comment as today. It also opens an attention item (`run: "starter-status"`, cause `claimed-status-missing`). The first scan that finds the status closes the item. No claim happens.
   - Candidates: `listByStatus("to do")`. Task/Bug only (as today). A ticket whose Mode is not Autonomous is skipped with the reason `mode`. That skip writes no comment and no event (a Manual `to do` is normal, not a problem). The dry run lists it with "Mode is not Autonomous". `candidates` counts only Autonomous Task/Bug tickets.
   - The ClickUp tracker reads the full ticket only for hits whose Mode is Autonomous. Other hits are built from the search hit (no extra calls). Search hits carry the Mode field (checked live 2026-10-25).
   - Claim: `setStatus("claimed")`, read back `claimed`. On a failed claim the ticket goes back to `to do`.
   - The skip comment says "It stays in to do".
3. **Lock-time repair and journal (`advance.ts`, `reconcile.ts`).** While a ticket is locked and not merged or released, a status that reads `to do` is set back: to `claimed` in phase `claimed`, to `in progress` in later phases (one `status-write` key, as today). The `claim` key settles `succeeded` when the tracker reads `claimed` or `in progress` (the conductor may already have moved it). `status-write` settles `succeeded` on `claimed` or `in progress`.
4. **Scheduled starter (`schedule-release.ts`).** Both Modes move to `to do`. The `noMode` text: "Mode is empty. Set Autonomous or Manual; the ticket then moves to to do."
5. **Steward (`steward/types.ts`, `rules.ts`).** `ready` becomes `claimed` in `STATUSES`. `started` is valid from `to do` or `claimed`. `APPROVE_TARGETS` = `to do`, `scheduled` (`ready` dropped).
6. **Order text (`order.ts`).** A new first step: "When the Builder starts building, set the ticket to in progress and read it back: `dg clickup update-task <KEY> --status "in progress"`, then `dg clickup get-task <KEY>`." The mandate heading reads "Mandate (unattended work)".
7. **Texts.** `dg autonomous` and `scan --help`: "scan to do (Mode Autonomous) and claim the first ticket that passes the Definition of Ready; any hour". `schedule-release --help`: "move to to do". The Nexus job description (`registry.ts`) says the scan claims at any hour (its schedule is already 00:00-23:59 every 5 min: no schedule change). `WATCHDOG.md` gets a short "Ticket flow" note (to do + Autonomous -> claimed -> in progress).
8. **Oculus.** The top bar label `Ready waiting` becomes `To do (autonomous) waiting`. The API field `scan.candidates` is generic, so it keeps its name: no nexus-shared or nexus-api schema change. The visual baselines that show the top bar are refreshed. The `day/night/away` badge stays (it is still true information).
9. **Outside the repo (prepared in the board folder, applied by the conductor after the merge):** `flow-update.md` holds the replacement rows for the DGS-488 ticket flow (a ClickUp description, so a live write) and the runbook line for `.digismith/sessions/workbox.md` (git-excluded on purpose): "Builder start: set the ticket to `in progress` and read it back."

## Rollout (the conductor, after "go: merge", in daytime, away kept off)

1. Merge and push. The live scan still runs the old dist: in daytime with away off it returns `off` before any ClickUp call.
2. Rename in ClickUp. Dry run first, then the real call:
   `dg clickup rename-status --space 1301150000001271 --from ready --to claimed --type custom --before "in progress"` (then the same with `--yes`). Expect the read-back to show `claimed` at index 6.
3. Rebuild the CLI dist right after (the post-finish hooks). Publish the web (`build-www.sh` after the web gate). nexus-api: only the job description changed, so it waits for the next routine publish (no restart for text).
4. **The gap between steps 2 and 3** (minutes): the old scan is `off` in daytime, so it makes no ClickUp call. The old `schedule-release` would fail to move an Autonomous ticket to `ready`, but no ticket is in `scheduled` today (and a failure only comments and retries every 5 min). If step 3 stalls into the night, the old scan finds no `ready` and reports `no-starter-status` (event and a DGS-548 comment). It claims nothing. If step 3 runs first by mistake, the new scan finds no `claimed`: an event, the DGS-548 comment and the attention item, and still no claim.
5. No ticket sits in `ready` today (read 2026-10-25: 0 tickets in `to do`, `ready`, `scheduled`).

**Rollback.** `git revert` the merge commit, push, rebuild the dist. Then
`dg clickup rename-status --space 1301150000001271 --from claimed --to ready --type unstarted --after "to do" --yes` (back at index 3). Order: revert the code first, then rename back. With the new code gone, nothing writes `claimed`. A ticket already in `claimed` is moved to `to do` by hand first (`dg clickup update-task <KEY> --status "to do"`).

## First use (proposed commands; the conductor runs them)

1. `dg autonomous scan --dry-run --repo /Users/workbox/Workspace/Jazurite/DigiSmith` with two throwaway tickets in `to do`: A (Task, Mode Autonomous, Sign-off Auto, a milestone link to DGS-501 Software Factory, spec and plan attachments; DGS-501 is a Milestone-type task on the Imperium list, so the milestone check counts it) and B (the same with Mode Manual). Expect A `ready`, B "Mode is not Autonomous".
2. **Daytime claim, away off:** the real Nexus job claims A on its next 5-minute run (or `run-now` on `autonomous-scan`). Expect A `claimed` in ClickUp, the lock, the order file and a prompt to the conductor. B stays in `to do`, with no comment.
3. The conductor's Builder-start step sets A to `in progress` and reads it back.
4. Release A (`dg autonomous release --ticket A --result stopped --reason "first use"`), then discard A and B.

## Plan

Test first in every task. Suites: `pnpm vitest run packages/cli` and `pnpm vitest run scripts/nexus-web` (unit), then `pnpm --filter nexus-web visual` for the baselines. Code runs under `node --experimental-strip-types`.

### Task 1: `dg clickup rename-status`

Files: `packages/cli/src/clickup/rename-status.ts` (new), `rename-status.test.ts` (new), `add-status.ts` (share the set checks; add `unstarted` to the types and the rank), `clickup/index.ts` (register).
- [ ] Failing tests on `planStatusRename` with the 15-status set above: rename and move (`ready` -> `claimed`, custom, before `in progress`) gives the exact "after" set (written out, ids kept, no `status_change_map`); rename in place without an anchor; the rollback call gives the "before" set back; refusals (unknown from, to exists, unknown anchor, type order break, empty set, missing id or orderindex). Handler tests with a fake Frontdoor: the dry run sends nothing; `--yes` PUTs the plan, reads back, exit 0; a wrong read-back exits 1 and prints the previous set.
- [ ] Implement. Run the suite. Commit `feat(clickup): add rename-status`.

### Task 2: the scan claims `to do` + Autonomous at any hour and writes `claimed`

Files: `autonomous/scan.ts`, `tracker-clickup.ts`, `types.ts` (Tracker doc), `fake-tracker.test-util.ts` (statuses `to do`, `claimed`; default status `to do`), `scan.test.ts`, `tracker-clickup.test.ts`, `index.ts` (help text).
- [ ] Failing tests: a noon clock, away off: a `to do` Autonomous ticket is claimed and reads `claimed`. Away on and away off give the same claim. An open breaker still stops it. A held lock still returns `busy`. Two ready tickets: only one is claimed. A Manual `to do` ticket is skipped (`mode`), with no comment and no event, and does not count as a candidate. The dry run lists it. A failed claim puts the ticket back in `to do`. A missing `claimed` opens the attention item once, and the next clean scan closes it. Tracker: a Manual hit makes no `getTaskByRef` call; an Autonomous hit is read in full. The old "off" tests are rewritten to the new rule.
- [ ] Implement. Run the suite. Commit `feat(autonomous): claim to do tickets at any hour as claimed`.

### Task 3: repair, journal, scheduled starter, steward, order text

Files: `advance.ts`, `reconcile.ts`, `schedule-release.ts`, `order.ts`, `steward/types.ts`, `steward/rules.ts`, and their tests.
- [ ] Failing tests: locked + `to do` in phase `claimed` -> status `claimed`; in phase `building` -> `in progress`. The claim key settles on `claimed` and on `in progress`. Schedule release moves both Modes to `to do`. Steward `started` from `claimed` moves to `in progress`; `approved --into ready` is refused. The order has the Builder-start status step and the new mandate heading.
- [ ] Implement. Run the suite. Commit `feat(autonomous): move scheduled tickets to to do and set in progress at builder start`.

### Task 4: texts, Oculus label, flow notes

Files: `scripts/nexus-api/src/scheduler/registry.ts` (description), `scripts/nexus-web/app/components/oc/OcTopBar.vue` (label) and its unit test or story, the top bar visual baselines, `packages/cli/src/autonomous/WATCHDOG.md`, `.digismith/board/DGS-635—claimed-status/flow-update.md` (new).
- [ ] Failing test: the top bar renders "To do (autonomous) waiting". Change the label, refresh the baselines (`--update-snapshots` on the top bar specs only), and check that no other baseline changed.
- [ ] Texts and `flow-update.md`. Run both suites. Commit `docs(dgs-635): update the ticket flow texts`.
