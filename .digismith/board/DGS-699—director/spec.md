# DGS-699 Director: spec

Written 2026-11-02 ~22:xx UTC+7 by refine worker `dgs-699-refine` (order fa-06; the express lane is DGS-700 and is not here). Docs only. Inputs: the ticket (Jack 2026-11-02), the DGS-683 Castle spec and plan (read only), and the code on main: `packages/cli/src/autonomous/` (scan, rank, ready, conductor, tick, act, watch, watchdog, attention, release, merge-gate, guardrails, protected-paths, state, types), `packages/cli/src/run/limit*.ts`, `packages/cli/src/salvage/`, `skills/reviewer/SKILL.md`, the runbook "The rule" and "Reading usage". Done-when of this ticket (Jack): a ticket goes from refinement to done, protected paths included, with no Maestro or Jack step, and only out-of-authority requests reach Jack. Section 2 says which part of that this ticket delivers and which part waits for the Warden.

## 1. Goal

The Director keeps the Workbox factory running, and nothing else: **flow** (claims refinement and to-do tickets), **capacity** (seats, quota, worker limit), **unblocking** (stuck or failed runs), **escalation** (a question back to `concept`). It is a Claude session of kind `factory` in the Castle (DGS-683), always on. Inside its written authority it decides, does it and records it, and never asks. Outside it, it puts one question on the ticket and waits for Jack.

## 2. What this ticket delivers, and what it does not

| Part of Jack's goal | Delivered here | How |
|---|---|---|
| Refinement joins the loop (no wait for the Maestro to start it) | yes | refine lane in the scan, refine worker, release to `to do` |
| Spec/plan approval does not wait for a person | yes, as a mechanical gate | the Director moves a ticket to `to do` only on a clean plan-Reviewer report (a machine verdict, section 6). It applies the gate; it does not judge the plan. |
| Stuck or failed runs are handled around the clock | yes | section 7 |
| Only out-of-authority questions reach Jack | yes | sections 4 and 8 |
| Express lane | no | DGS-700, later (section 10) |
| **Protected-path merge without the Maestro** | **no (Warden)** | The Maestro's scope order: gates and review are the Warden, a later role. The merge gate (`merge-gate.ts`) keeps refusing a protected-path merge with an attention item `refused`. Until the Warden exists the Maestro answers it. For a ticket whose plan changes the Director's own authority (4.4), the merge note must carry Jack's written yes. The Director only makes the wait visible: it lists a `refused` item older than 30 minutes in its plan and records it, and it parks that ticket and continues with the rest. |
| Breaker open (two failed releases in a row) | no, stays Jack's | closing it widens a guardrail. Listed in section 4 as a candidate for Jack to move into the authority list. |

Say it plainly to Jack: the goal "no approval waits on the Maestro" is met for refinement approval and for everything inside the loop, and is **not yet met for protected-path merges** until the Warden ticket lands.

## 3. Who does what

| Level | Role | Does |
|---|---|---|
| 0 | Jack | rules, backlog, concept, review, the authority list |
| - | Maestro | Jack's voice while logged in, outside the chain |
| 1 | **Director** | flow, capacity, unblocking, escalation. Highest authority in the factory after Jack |
| 2 | Conductors (project, ticket `tc-`, on-call `nw-`) | foremen: each oversees the Floor, drives its tickets, manages its workers |
| 2 | Warden (later), Steward | gates and quality / ClickUp, session and note sync |
| 3 | Builder, Reviewer, refine worker, Scout | each does its own job |

The Director never writes product code, never reviews, never merges, never syncs ClickUp for others. It does not take over a ticket from the conductor that drives it.

## 4. The authority list

One list in the Director's card (`skills/director/SKILL.md`) and the same list in code (`authority.ts`, ids below). A test fails when an id is in the code and not in the card, or the other way round. **Jack changes the list; the Director never widens it.** Two things make that true: (a) the refinement gate refuses a plan that names an authority path (4.4), and (b) the card and the code are protected paths (section 13), so the merge itself is a protected-path merge. A protected merge is the Maestro's today, not Jack's, so (a) is the real guard and the merge note of such a ticket must carry Jack's written yes.

### 4.1 Within its authority (decide, do, record, never ask)

| id | The Director may | Reason |
|---|---|---|
| `claim-refine` | claim a `refinement` ticket (Mode not Manual) and start a refine worker | it is the loop |
| `claim-build` | the scan claims a `to do` ticket on its behalf and hands the order straight to the ticket's driver (5.5); the scan records the decision | it is the loop |
| `start-worker` | start a refine worker itself; ask the project conductor to start the plan Reviewer (the Reviewer card says a conductor starts every review, and the card stays untouched); always through `dg run start` and inside the run limit | the limit is the rule |
| `pick-seat` | choose the Claude seat by the runbook rule (section 5.4) | Jack's saved rule, Jack 2026-10-04 |
| `apply-refinement-gate` | move a ticket `refinement` -> `to do` after a clean plan-Reviewer report and a passing readiness check, and only when the plan names no authority path (4.4) | a mechanical gate (section 6); Sign-off Jack tickets too (14 of section 15) |
| `reprompt-run` | ask a ticket's driver to re-prompt a stalled run, or re-prompt a refine worker the Director started itself | harmless, reversible |
| `restart-run` | restart a lost run of a **refine worker it started** (`start-again`). For a Builder there is **no Director restart move**: the tick sends the first restart (`act.ts` `retry`); the Director's only Builder action after that is `release stopped` + escalate | one retry per run, never a second actor for the same restart |
| `release-stopped` | stop a ticket that cannot go on: `release --result stopped` (build lane) or `refine-release` (refine lane). Never `failed`: a failed release counts toward the breaker | the existing release path; the Director's own stops must not open the breaker |
| `escalate-concept` | move a `refinement` or `to do` ticket back to `concept` with one question | the only way a question reaches Jack |
| `start-ticket-conductor` | start a ticket conductor (DGS-683 ticket 5) for a claimed ticket, inside the cap of 2 | the Castle rule |
| `record-decision` | write the decision record (section 9) | every decision is recorded |

### 4.2 Outside its authority (waits for Jack, question on the ticket)

| id | Why only Jack |
|---|---|
| `delete-data` | deleting a database or any irreversible data loss |
| `spend-money` | money, a new paid service, a new paid seat |
| `go-public` | anything public: a publish, a post, a public repo, a customer-visible change |
| `personal-data` | personal data of any kind |
| `product-taste-names-scope` | product, taste, names, scope: always Jack's |
| `change-authority` | this list, the card, the run limits, the guardrails (`.digismith/config.yml`), the protected-path list, `.digismith/mandate.yml`, `.digismith/profiles/` |
| `answer-prompt` | answering a permission, delete or "keep allowing" prompt: an answer widens a run's permissions, which is settings. A `blocked` run stays in the attention list for Jack (candidate to move into authority later) |
| `change-host` | `sudo`, a LaunchDaemon or LaunchAgent, a new background service, Caddy, Tailscale, the settings files, the live registry by hand |
| `close-breaker` | `dg autonomous resume` / `back`: the breaker is a safety stop |
| `merge-protected` | a merge that touches a protected path (until the Warden exists: the Maestro answers; never the Director) |
| `rewrite-history` | force push, `reset --hard` of shared history, branch delete of unmerged work |

### 4.3 How an out-of-authority need is handled

`dg director decide --id <id> ...` checks the id against the list. A Jack-only id is refused (exit 3) with the text "outside the Director's authority: use dg director escalate". An unknown id is refused too (exit 4): anything not on the within list is outside by default. `escalate` is section 8.

### 4.4 The authority paths (the guard behind `change-authority`)

`AUTHORITY_PATHS` in `authority.ts` has two parts. The **full paths**: `packages/cli/src/autonomous/director/` (the whole folder, so `refine.ts`, `authority-backstop.ts` and every other Director file), `skills/director/` (the card, the briefs), `packages/cli/src/run/limit` (the run limits), `packages/cli/src/autonomous/guardrails.ts`, `packages/cli/src/autonomous/protected-paths.ts`, `packages/cli/src/autonomous/merge-gate.ts`, `packages/cli/src/autonomous/breaker.ts`, `.digismith/config.yml`, `.digismith/mandate.yml`, `.digismith/profiles/`. The code that enforces the guard is itself an authority path (the backstop lives in `director/`; `merge-gate.ts` and `breaker.ts` are listed; `breaker.ts` is what makes `close-breaker` Jack's). The **short spellings** a plan really uses, matched as case-insensitive substrings: `director/`, `skills/director`, `authority.ts`, `authority-backstop.ts`, `refine.ts`, `refine-brief.md`, `merge-gate.ts`, `breaker.ts`, `run/limit`, `limit-check.ts`, `limit.ts`, `guardrails.ts`, `protected-paths.ts`, `config.yml`, `nightwatch.limits`, `protected_paths`, `mandate.yml`, `profiles/`.

**Tokens, not entries.** `namesAuthorityPath(text)` returns the whole **path tokens** the text writes around each hit (the run of `[A-Za-z0-9_./-]` around it, leading `./` or `../` and trailing punctuation removed), for example `director/refine.ts`, `autonomous/protected-paths.ts`, `director/`. A token is **covered** by an approval only when it (a) equals a listed path, or (b) is a suffix of a listed path (a short spelling of the same file), or (c) lies under a listed folder (the listed path ends with `/`). A folder token (`director/`) is covered only by a folder approval. The config keys `nightwatch.limits` and `protected_paths` count as `.digismith/config.yml`. So an approval for `director/authority.ts` covers neither `director/refine.ts` nor a bare `director/`; an approval for `packages/cli/src/autonomous/director/` covers both.

`apply-refinement-gate` (`refine-release --result ready`) reads the ticket's `spec.md` and `plan.md` and **refuses** when either names an authority path that the ticket's approval does not cover. It escalates with id `change-authority` ("The plan changes the Director's own authority: <paths>. Jack decides. When Jack agrees, he adds the line `Authority change approved by Jack: <date>: <paths>` to the ticket description, and the ticket goes back to refinement.").

- **The approval line is bound to the paths:** `Authority change approved by Jack: <date>: <comma-separated paths>`. A token is covered by the rule above (equal, suffix, or under a listed folder). A plan naming a token the line does not cover is refused, so one approval cannot cover a later, wider plan.
- **Fail closed:** when the board folder cannot be found, or `spec.md` or `plan.md` is missing, the gate exits 2 with the reason, writes no status and keeps the lock.
- **The Director never edits a ticket description.** It cannot write the approval line itself. Jack writes it; the Maestro may write it only on Jack's written word, and then the merge note carries that word. The card says so and a card test checks it.
- **Approval record:** when the gate passes a ticket with an approval line, it writes `<autonomous state dir>/director/authority-approvals/<KEY>.json` (`ticket, paths, line, at`). It lives in the autonomous state dir (`~/.digismith-depot/autonomous`, or `AUTONOMOUS_DIR`), outside the repo, and is never in the repo tree.
- **Merge-time backstop (`merge-gate.ts`):** the gate lists the branch diff files; a file matching an authority path with no approval record for that ticket that covers it is refused. At merge the coverage is the full-path form of the 4.4 rule: a full diff path is covered when a listed approval path equals it, is a `/`-boundary suffix of it, or is a folder (ends with `/`) that the diff path lies under at a `/` boundary. Matching at merge uses whole path tokens at `/` boundaries or the exact basenames of the listed files: `profiles/` means `.digismith/profiles/` (so `profiles/emma.yml` is not a hit) and `limit.ts` does not hit `rate-limit.ts` with code `authority-path` and the text "authority path: needs Jack's written yes". Every authority path is also a protected path, so a covered change still gets the protected-path refusal and goes to the Maestro. Limit, stated plainly: a Maestro who merges by hand past the gate is not stopped by code; the merge note and this rule are the check.

## 5. The loop

### 5.1 Two lanes, two resources

| Lane | Candidates (ClickUp status) | Resource | Claim record | Worker |
|---|---|---|---|---|
| Build | `to do`, Mode not Manual, Task or Bug, ready (spec and plan, no open blocker) | the factory lock (one ticket, as today) and a builder slot | `lock.json` (unchanged) | the ticket's conductor and Builder |
| Refine | `refinement`, Mode not Manual, Task or Bug, has a "Done when" line, no open blocker | the `role` slot (limit 1) | `refine-lock.json` (new, one ticket) | a refine worker (role `other`, docs only, no worktree) |

The lanes are independent: each scan can claim one ticket in each lane. A refine claim never writes a ClickUp status (the ticket stays `refinement` until it is released); the lock file is the claim.

### 5.2 Claim order (both lanes)

The existing `rankTasks`: ClickUp priority (1 Urgent .. 4 Low, none last), then due date (none last), then age (created, oldest first). This is the answer to the open question 1 (Maestro default).

### 5.3 Capacity

- Build lane: free when `builderFull()` is null (existing, DGS-665) and no lock.
- Refine lane: free when no `refine-lock.json` and `refusal(count, "role")` is null.
- Reviewers: a conductor starts them through `dg run start`, which refuses over the limit. The Director never starts a Reviewer itself: for a plan review it asks the project conductor (the Reviewer card is protected and unchanged).
- The limit is the configured numbers (4 builders, 2 reviewers, 1 role on 2026-11-02, DGS-702 and DGS-703; the defaults in code are 2, 1, 1), read from `.digismith/config.yml` `nightwatch.limits` in the main checkout (existing `currentCount`). The Director never edits it.
- A `stale` slot (dead pane) is cleared with `dg run event <run-id> lost` (existing rule, in authority as `restart-run`).

### 5.4 Seats and quota (the runbook rule as a pure function)

`rankSeats(readings, workers, lastAssigned, now)` in `seat.ts` encodes "The rule" and "Reading usage" of `.digismith/sessions/workbox.md`:

1. Drop seats whose "exhausted until" is later than now.
2. A seat whose weekly window resets within 24 hours sorts first ("use it or lose it": it counts as nearly free), soonest reset first, **only while its 5h window has room**: 5h used below `SOONEST_RESET_MAX_FIVE_HOUR_USED` (70, one constant). A soon-resetting seat above it is ranked by steps 3 and after like any other.
3. Then more weekly headroom (100 minus used), then more 5h headroom, then fewest workers in use, then least recently assigned.
4. A seat that carries the Maestro with 5h used above 40 percent is moved behind the others for a heavy worker.
5. Unknown readings (`?`): skip steps 2 to 3 for that seat and let the worker count stand in.

The usage reading itself (the probe: a short Claude process) is a Director action by card, hourly at most; the function only ranks readings it is given. The Director records the seat in "Last assigned" in its note.

### 5.5 What the scan does now (code change, protected path)

`runScan` keeps every existing step. Two additions, both outside the existing body:

1. **A wrapper.** The current `runScan` body becomes `runBuildScan`; the exported `runScan(d)` calls it, then runs the refine lane unless the outcome is `breaker`, `guardrail-config` or `conductor-config` (the three safety stops, which are Jack's), and returns the build result unchanged. So the refine lane runs after the breaker, guardrail and conductor-config checks, **and also while the build lock is held** (outcome `busy`) or the builder limit is full. A lane failure is caught and logged (`refine-failed`); it never changes the build outcome. With `deps.refine` absent the wrapper is a no-op.
2. **The claim goes to the driver, not to the Director.** After the Part 2 wiring, `claim()` prompts the ticket's driver (the project conductor, `drivers/<KEY>.json`, fallback `DigiSmith/digismith-conductor`) with the same order text as today, writes the driver record, and records `claim-build`. The Director never receives a build order: its card says it does not take over a ticket. The Director gets only refine orders and wake ticks.

### 5.6 Waking the Director

The Director is a Claude session: it must not poll and burn tokens. The scan (every `scan_every_minutes`, 15 now) and the watchdog (every 5 minutes) wake it **only when there is something to do**: `planLoop` (pure, no model) returns moves; if the list is empty nothing is sent. A wake is one prompt `Director tick: dg director plan` sent through `herdr-ws` only when the pane exists, is not working and its input box is empty (the existing observer logic; idle catch-up misfire rule). An identical move list is not sent again within 10 minutes (hash in `director/last-tick.json`).

## 6. The refine lane

1. The scan finds the first ready refine candidate and the role slot is free: `claimRefine` takes `refine-lock.json` (exclusive create; fields `ticket, taskId, claimedAt, order, scanId, attempt, round`), writes `order-ar-<stamp>-<KEY>.md`, prompts the Director `Director: refine <KEY>, read <order>`, appends event `refine-claim`, records `claim-refine`.
2. The Director starts a refine worker with `skills/director/refine-brief.md` (docs only, no worktree, no branch, files in the board folder uncommitted, nothing scoped with the ticket key committed, `STOP: plan-ready <path>`), the seat from 5.4, under the role limit.
3. The Director **asks the project conductor** to start a `ticket` plan Reviewer (the Reviewer card stays untouched; the order says so). The conductor reports the report path.
4. **Clean report** (no Critical or Important finding): the Director attaches `spec.md` and `plan.md` (`dg clickup upload-attachment`) and runs `dg director refine-release --ticket K --result ready --report <report.md>`:
   - refuses when `spec.md` or `plan.md` names an authority path token that the description's approval line does not cover (4.4, bound to the paths; fail closed when the board folder or a file is missing): escalates `change-authority`;
   - re-reads the ticket and runs `checkReady`; any reason: exit 2 with the reasons, status and lock unchanged;
   - sets `to do`, reads it back, clears the lock, records `apply-refinement-gate`.
5. **Dirty report** (round 1): the Director verifies each finding the way `digismith:receiving-code-review` says (reads the cited text; a finding it cannot verify counts as confirmed) and relays the confirmed ones to the refine worker. One fix wave. The conductor starts one scoped re-review (round 2; `refine-lock.json` `round` is set to 2 by `dg director refine-round`). Round 2 clean: step 4. Round 2 still dirty: `refine-release --result escalated` with the open findings as the question (id `product-taste-names-scope`), lock cleared.
6. `--result failed` (the worker crashed): the lock clears and one retry runs on a later scan; a second failure escalates with the cause.
7. **Age limit:** `refine-lock.json` older than `REFINE_LOCK_MAX_AGE_MINUTES = 360` (6 hours) is an unblock move (section 7, row "refine lock too old"): the Director stops that refine run and escalates. The role slot never stays held with no end.
8. A refinement ticket without a "Done when" line in its **description** is never refined: the scan escalates it at once, once, with the question "Add a Done when line to this ticket's description, then move the ticket back to refinement." Return path: Jack edits the description and moves the ticket back; the scan marks the escalation `returned`, finds the line, and claims it. If the ticket comes back **without** the line, the same question is refused as "already asked and answered" and an attention item `question-already-asked` (run `<KEY>/escalation`, kind `unknown`) opens, so the skip is never silent. The Tracker cannot read comments, so the line must be in the description.

The Director applies the gate, it does not own it. It covers Sign-off Jack tickets too: Jack is needed only at backlog, concept and review, and Sign-off Jack stops at acceptance; the Maestro confirms this in one line when it approves this spec (an older rule gave the Maestro the gate only for Sign-off Auto). When the Warden exists it reads the Warden's verdict instead of the Reviewer report; `refine-release` takes the verdict reader as one function.

## 7. Unblocking

Scope (spec 3, and the Castle rule "own workers first"): the Director acts only on (a) the **factory ticket** (the one in `lock.json`), and only **after** the watchdog's existing retry is used up, and (b) the **refine worker** it started. Everything else belongs to a conductor and is listed, never acted on. For (a) the Director never touches the worker: a move for a build run is **sent to the ticket's driver** (the conductor) with `promptDriver`.

Input: the open attention items (`readOpen`), the run records, `classify` states, and the watchdog journal (`journal.ts`: `retryItemOf`, `resultsOf`, `readJournal`) as history of what the tick already did. `unblock.ts` is a pure table `movesFor(item, history, now)`. History is keyed on **ticket + run + id** (never ticket + id).

| Item | Move (for the factory ticket / refine worker) | Never |
|---|---|---|
| `lost` / `pane-gone`, Builder, `retryEligible` and no `retry` line in the journal yet | none: the tick restarts it (act.ts `retry`) | a second restart order |
| `lost` Builder, the tick's retry is in the journal and the item is still open 30 minutes later | release (build lane) `stopped` + escalate | restart again |
| `lost`, refine worker, first time | start the same refine worker again from its brief (Director's own) | |
| `lost`, refine worker, second time | `refine-release --result failed` (twice: escalate) | |
| `lost` Reviewer, or any run of a ticket other than the factory ticket | list only (a conductor owns it) | start a Reviewer |
| `stalled` (`silent-working-180-min`, `*-over-N-min`), no `reprompt-run` for this run | ask the driver to re-prompt the run | prompt the worker directly |
| `stalled`, a re-prompt exists for this run and the item is still open 30 minutes later | treated as lost (rows above) | |
| `stalled` `waiting-240-min` | re-prompt via the driver, then after 30 minutes release (build lane) `stopped` | |
| `blocked` (permission prompt or `pane-blocked`) | list only. It never gets a question on the ticket: it stays in the attention list for Jack (`answer-prompt`) | answer, deny or accept any dialog |
| `failed` transient (`gateway-5xx`, `rate-limited`, `pane-died`, `tab-lost`) | none if the tick retried; else one retry via the driver | |
| `failed` transient, retry used | release `stopped` + escalate | |
| `failed` durable (`classifier-block`, `mandate-deny`, `test-red`, `review-rejected`, `spec-gap`, `merge-refused`) | release `stopped` + escalate with the cause text | retry |
| `failed` / any item with cause class `unknown` | list only, with the reason "cause class unknown" | guess |
| `refused` (`merge-refused: protected path`) | list it, mark `gate-wait` past 30 minutes, continue with other tickets (section 2) | merge |
| breaker open | list only (`close-breaker`) | resume |
| refine lock older than 6 hours | stop the refine run, `refine-release --result escalated` | |
| item with no ticket | list only | |

**Releases are `stopped`, never `failed`.** `recordRelease` counts only failed releases toward the breaker (two in a row open it), so the Director's own build releases never open it. The refine lane has no breaker: `refineRelease` (any result) never calls `recordRelease`, and a test says so. The release move is **lane-aware**: `{ kind: "release", lane: "build" }` runs `dg autonomous release --result stopped`; `{ kind: "refine-release", lane: "refine" }` runs `refine-release`. A refine-lane ticket has no `lock.json`, so the build release would take its no-lock path: a test covers both.

**The Director runs a move with `dg director do <move-id>`**, which executes the move and records it in one step (record first, then effect; a failed effect is recorded as failed and the move may come again). `plan` hands out a stable id `m-<sha1(kind|ticket|run)[:8]>` per move and never records. The card says: do not perform a move by hand.

## 8. Escalation

`dg director escalate --ticket K --id <authority id> --question "<one question>" [--via-release]`:

1. Refuses a second question that is the same as one already asked: the key is `ticket|id|sha1(normalised question)`. If an earlier one is answered (the ticket came back to `refinement` or `to do`), the Director must decide itself or ask a different question; the command says "already asked and answered at <time>" **and opens an attention item `question-already-asked`**, so the refusal is never silent.
2. If the ticket already has an open escalation and is still in `concept`, it does nothing (no second comment, no second status write).
3. Else: sets the status `concept` (read back), writes one ClickUp comment `Director (<time> UTC+7): <question>. Needs: <id>. Answer here, then move the ticket back to refinement.`, appends to `escalations.jsonl`, records the decision.
4. A ticket already `in progress` is not moved: `--via-release` skips the status write because the existing `release --result stopped --reason` already makes the ticket wait for Jack and comments. The escalation is still recorded.
5. Return from Jack: when the scan sees a ticket in `refinement` with an open escalation, it marks the escalation `returned` and passes Jack's latest comment into the refine brief.

## 9. The decision record

Every decision (within or outside) writes two things, in this order, and fails the command if the first fails:

1. `~/.digismith-depot/autonomous/director/decisions.jsonl`, one line: `{ ts, tsUtc7, ticket, id, side: "within"|"escalated", what, why, by: "director" }` (append only, one `appendFileSync` of one line).
2. A ClickUp comment on the ticket (`Director decision (<time> UTC+7): <what>. Why: <why>.`), except `reprompt-run` and `pick-seat`, which only go to the journal (too noisy for a ticket). A failed comment is retried on the next `plan` and never blocks the action.

The journal is the Director's memory across restarts and flux: `decisions.jsonl`, `escalations.jsonl`, `refine-lock.json` are the whole state. The Director's session note repeats nothing that these files hold.

## 10. Express lane

Express lane: DGS-700, later. Hook point, built nothing: `planLoop` (section 5.6) is the one place a later express rule would add moves.

## 11. The card text (draft; `skills/director/SKILL.md` is this, in the style of `skills/reviewer/SKILL.md`)

```
---
name: director
description: Use when you are the Director (the herdr session of kind factory in the Castle), when starting or briefing it, or when asked what the Director does. Not for a project conductor, a ticket conductor or a worker.
---

# Director

Purpose: keep the Workbox factory running. Nothing else. Flow, capacity, unblocking, escalation, around the clock.

Lives: the Castle herdr session (DGS-683), workspace Factory, agent name `director`, registry key DigiSmith/director, kind factory. Always on. Started by the Castle bootstrap (LaunchDaemon com.jazurite.herdr-castle); restarts after a crash or a flux. State is in files (~/.digismith-depot/autonomous/), never in your head.

Owns: the loop (claims refinement and to-do tickets by ClickUp priority, due date, age); capacity (seats by the runbook rule, quota, the worker limit); unblocking (the table in section 7); escalation (back to concept, one question).
Does not own: product, taste, names, scope (Jack); code (Builders); review, spec/plan approval as a judgement, merges (the Warden, later; until then the clean plan-Reviewer report is the gate and the Maestro answers protected merges); ClickUp, session and note sync (Steward).
Talks to: down conductors, Warden, Steward; up Jack only on the ticket (a question) or when he asks (no scheduled report); sideways the Maestro.
Reads: ClickUp statuses, run records, seat usage, attention items, Reviewer reports. Writes: claims, orders, decisions.

Each wake-up: run `dg director plan`, then do each move it lists with `dg director do <move-id>` (it runs the move and records it in one step; never perform a move by hand), nothing else. A refine order: follow section 6 (start the refine worker; ask the project conductor to start the plan Reviewer; never start a Reviewer yourself). Record any other decision with `dg director decide`. When a move needs something outside your authority, run `dg director escalate` and go on to the next move. Never ask Jack or the Maestro a question in chat.

## Authority
(the two tables of the spec, section 4, one id per row; a test keeps this list and authority.ts equal)
Jack changes this list. You never widen it, never edit this card, never edit the limits, the guardrails or the protected paths.

## Rules
- Never answer a permission, delete or "keep allowing" prompt. Never accept an unknown dialog.
- Never read or print a token or a .env value. No sudo. No delete. No force push.
- Never start a worker except through dg run start.
- Times UTC+7 first. Short plain sentences. No AI attribution anywhere.
```

## 12. Dependency on the Castle (DGS-683) and the build order

The Director runs as a Castle session of kind `factory`; it is **not** needed to build or merge the code. What depends on what:

| Part | Needs the Castle? | Why |
|---|---|---|
| Authority, decision record, escalation, refine lane (lock, readiness, release), capacity, seat rank, unblock table, `plan`, the card and brief files, the protected-path additions | **no**. Fakes only. Build now | no registry, no live session |
| Routing refine orders and wake ticks to the Director, and claim and tick orders to the ticket's driver (`promptDirector`, `promptDriver`, the claim hand-off) | **yes: after DGS-683 ticket 1 (registry) and ticket 3 (autonomous `conductor.ts` registry lookup) merge.** Both tickets edit `autonomous/conductor.ts`; Part 2 must be rebased on them | the registry (`packages/cli/src/conductor-registry/registry.ts`, `readRegistryFile`, `findByKind`) and its `session` fields |
| Starting the live Director session, the registry entry, the bootstrap change | **yes, and not for a Builder** (section 13) | a live session in the Castle |

**Order:** (1) DGS-699 Part 1 (tasks T1 to T4, T5 steps a to d, T6) builds now, in parallel with the Castle builders, since it touches no file the Castle plan touches except `scan.ts` and `watch.ts` (a small, local change each). (2) DGS-683 tickets 1 and 3 merge. (3) DGS-699 Part 2 (T5 steps e to f) builds. (4) The Maestro does the live steps (section 13): the registry flip is **one atomic write** (a new `conductors.json` written next to the old one and renamed over it, backup first), which adds `director` with `kind: factory` and changes `digismith-conductor` from `factory` to `project` in the same file. Never two factory entries at once: the Castle `conductor.ts` throws on two and the scan stops with `conductor-config`.

**Recommended split into two ClickUp tickets** (the Castle's own numbering rule, no letters): `DGS-699 1` = Part 1 (T1 to T4, T5 a to d, T6; no blocker) and `DGS-699 2` = Part 2 (T5 e to f; blocked by DGS-683 ticket 3). One ticket also works if the conductor accepts that it waits for DGS-683 ticket 3.

Until the live flip, behaviour is unchanged: with no Director in the registry the scan prompts the existing factory conductor (`digismith-conductor`), no refine claim happens (no Director to prompt; the refine lane is gated by the registry having a `factory` entry named `director`).

## 13. Protected paths and the steps that are not for an unattended Builder

Protected (`DEFAULT_PROTECTED` and the config list): `hooks/`, `hooks/hooks.json`, `.digismith/config.yml`, `skills/finishing-*/`, `skills/reviewer/`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/mandate.yml`, `.digismith/profiles/`.

| Task | Protected path touched | Merge |
|---|---|---|
| T1 to T5 | `packages/cli/src/autonomous/` (new `director/` folder, `scan.ts`, `watch.ts`, `types.ts`, `protected-paths.ts`) | **Maestro** (protected-path merge goes to the Maestro until the Warden exists) |
| T5 edit of `packages/cli/src/index.ts` | none (not protected) | with the rest |
| T6 | `.digismith/config.yml` (adds `skills/director/` to `protected_paths`), `packages/cli/src/autonomous/protected-paths.ts` | **Maestro** |
| T6 `skills/director/*`, `docs/director.md` | none today; protected from the moment T6 merges | |

`skills/reviewer`, `skills/finishing-*`, `hooks/`, `reviewer/` and the scheduler are **not touched**. There is one merge touching protected paths for the whole of Part 1 and one for Part 2; the Maestro answers both.

**Not for an unattended Builder (Maestro or Jack, live):** installing anything; starting the Director session; editing `~/.digismith-depot/conductors.json` (the one atomic flip of section 12); `herdr-bootstrap.sh`, the Castle LaunchDaemon, settings files, the Nexus scheduler jobs; the first live `dg director plan`. A Builder writes code and tests, runs vitest, and stops.

After the Director exists the protected-path merge still goes to the Maestro until the Warden: the Director never merges a protected path.

## 14. Testing approach (details in the plan)

All with fakes: fake `Tracker` (`FakeTracker`), fake clock (`now: () => Date`), fake `Exec` for `herdr-ws` and for `git`, fake run rows (the `RunRow` shape), temp depot directories. No live herdr, no live ClickUp, no network. Test first. The existing tests (`scan.test.ts`, `watch.test.ts`, `limit*.test.ts`) must pass unchanged: the old behaviour stays when there is no Director.

## 15. Risks and decisions for the conductor and Jack

1. **Goal not fully met until the Warden** (section 2): protected-path merges still wait for the Maestro. Say it in the merge note. A plan that changes the Director's own authority also needs Jack's written yes (4.4).
2. **Driver record**: Part 2 reads `~/.digismith-depot/drivers/<KEY>.json` (format of DGS-683 spec 6.3). Until DGS-683 tickets 5 and 6 write it, the claim writes it itself (exclusive create) naming `digismith-conductor`. Same format, so the Castle builders' handover just rewrites it.
3. **Seat probe cost**: one small prompt per reading; limited to once an hour by the card.
4. **The ClickUp status `refinement` exists** (read from DGS-699 itself, 2026-11-02). If it is missing the scan opens an attention item and claims no refinement, like the `claimed` status check.
5. **Old conductors** (main, dawn, token-economics, d3): out of scope (Maestro default). They stay as they are.
6. **Breaker**: the Director's own releases are `stopped` and never open it. Closing it stays Jack's.
7. **Sign-off Jack and the gate**: the Director applies the gate to Sign-off Jack tickets too (6). Maestro: confirm in one line.
8. **Atomic registry flip** (section 12) is a live Maestro step; a two-step flip stops the scan.
9. **Known limit of the authority gate (F24):** it matches any mention, so a plan that merely recites the protected-path list (`config.yml`, `mandate.yml`, `profiles/`) is escalated to Jack as `change-authority`. Fail closed is accepted: some over-escalation is cheaper than a missed authority change. The refine brief tells the worker to name an authority path only when the plan changes it and to refer to the list as "the protected paths (section 13, `DEFAULT_PROTECTED`)". Future fix, no code now: match only the plan's Files / Modify / Create lines.
