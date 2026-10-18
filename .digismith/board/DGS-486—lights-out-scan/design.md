# DGS-486 design: the Lights-Out scan (an unattended night run)

Date: 2026-10-18 (UTC+7), rev 1. Design only, no code. Decisions 1 to 8 are the Maestro's (order lo-01, Jack: "Approved with the four changes"); this spec makes them exact. `v1` is the placeholder version (DGS-452).

## Summary
Two jobs in the Nexus scheduler (DGS-456) run plain `dg` commands. `lightsout-scan` runs every 60 min from 23:00 to 06:00 UTC+7. It finds the best ticket in `to do`, checks it is ready, claims it, writes an order for the digismith-conductor and prompts the conductor. It never starts a worker. The conductor builds the ticket with its normal runbook, then releases the lock, which triggers the next scan at once. `lightsout-report` runs at 06:00 and writes the morning report. A scan that finds nothing is plain code: no model tokens.

## 0. One thing to decide first: DGS-456 cannot express this job yet
DGS-456 gives each job **one slot per day** (`atUtc7`) and a window that **stays inside one UTC+7 day** (its plan, task 2: a midnight wrap is "refused at load"). The scan needs every 60 min and a window 23:00 to 06:00, which wraps midnight. Options:
| Option | Cost |
|---|---|
| A. Extend DGS-456 before it merges: field `everyMinutes?: number` (slots at `atUtc7 + n * everyMinutes` inside the window) and a window that may wrap midnight. **Recommended.** | A small change to `clock.ts`, `engine.ts` and their tests in an unmerged branch; the 456 design stays the same otherwise. |
| B. Seven registry entries, one per hour (`lightsout-scan-23`, `-00` ... `-05`), each with a one-hour window. | No 456 change; seven names, and "run now" has no single name. |
| C. One slot at 23:00, the command loops and sleeps inside. | A run lasting 7 hours holds the serial queue (flux and cleanup would wait). Rejected. |
The Maestro orders A or B. The rest of this spec reads the same for both; the plan names the registry text for the chosen option.

Also needed from 456 (registry fields it already has): `manualOutsideWindow: 'refused'` for `lightsout-scan` (a daytime "run now" must not start a build), `timeoutMs` 5 min, `notify: 'failures'`, `catchUp: 'skip'` (a missed hour is just the next hour). `lightsout-report`: `atUtc7 06:00`, window 06:00 to 07:00, `catchUp: 'run-once-in-window'`, timeout 5 min, `manualOutsideWindow: 'allowed'`.

## 1. Commands (new `dg lightsout` group, in `packages/cli/src/lightsout/`)
| Command | Who calls it | What it does |
|---|---|---|
| `dg lightsout scan [--dry-run]` | the scheduler job | one scan (section 2). `--dry-run` reads only: prints the candidates and each Definition of Ready verdict, writes nothing. |
| `dg lightsout release --ticket K --result merged\|failed\|stopped\|awaiting-jack [--reason "..."]` | the conductor | clears the lock, logs the event, comments on the ticket for `failed`, `stopped`, `awaiting-jack`, then calls run-now on `lightsout-scan` (section 6). |
| `dg lightsout report [--night YYYY-MM-DD]` | the scheduler job | writes the morning report (section 7). |
| `dg lightsout status` | Jack, the conductor | prints the lock, tonight's events, the last report. Read only. |
The scheduler's registry commands are `dg lightsout scan` and `dg lightsout report` with absolute paths (456 rule). The ClickUp client is the one `dg clickup` already uses (credentials from the depot, no shell environment).

## 2. The scan, step by step
0. **Window guard.** The command reads the clock itself (injectable `now()`, fixed +7 h). Outside 23:00 to 06:00 UTC+7 it logs `outside-window` and exits 0. (456 already refuses a daytime run-now; this is a second wall, and it makes the 05:59 call from `release` safe.)
1. **Busy check.** If the lock file exists (section 4): log `busy` (ticket named) and stop. Exit 0.
2. **Query.** All tasks in status `to do` in the DigiSmith space (id `1301150000001271`), all lists. The plan prefers one filtered team-level request over a loop of `list-tasks`; if the client has no such call, it loops over `get-lists` lists. Only task types Task and Bug are candidates (`custom_item_id`); Epic, Initiative and Spike are logged `skipped: type` and never commented.
3. **Order:** priority (urgent first, no priority last), then due date (earliest first, none last), then created (oldest first).
4. **Walk the list.** For each ticket in order: Definition of Ready (section 3). Fail: comment once (below), try the next. Pass: claim (section 4) and stop walking; one ticket per scan.
5. **Hand over** (section 5). 
6. Log one `scan` event line: counts of candidates, skipped (with reasons), claimed ticket or none.

**The status exists.** Checked on 2026-10-18 (read only): `dg clickup add-status --space 1301150000001271 --name "to do" --type open` without `--yes` answers `status "to do" already exists in this set`. The Maestro need not add it. (The scan itself checks this once per night; if the status ever disappears it logs `no-starter-status`, comments on DGS-548 once, and stops.)

## 3. Definition of Ready check (before the claim)
A ticket is ready when all four hold:
| Check | How it is read |
|---|---|
| Spec and plan on the ticket | an attachment named `design.*` or `spec.*` and one named `plan.*`, **or** the ticket text links a board folder (`.digismith/board/<KEY>—<slug>/`) that holds `design.*` and `plan.md` on `main` of this checkout |
| Sign-off mark | the custom field `Sign-off` is set (`Auto` or `Jack`) |
| Milestone | the ticket carries a milestone (Genesis, Dawn, after Dawn). The plan's first task reads one done ticket (read only) and pins the exact field or link; the spec does not guess it. |
| No open blocker | no dependency "waiting on" a ticket that is not done or closed |
**A fail gets one comment**, text: `Lights-Out skipped this ticket (<date UTC+7>): <the failed checks, one line each>. It stays in to do. Fix and it is picked up on a later scan.` The ticket stays in `to do`. **No repeat comments:** the scan keeps `lightsout/notes.json` (`{ <KEY>: <hash of the reasons> }`) and comments again only when the reasons change, so a ticket that waits all week gets one comment, not one per hour.

## 4. Busy and claim
- **Lock file:** `~/.digismith-depot/lightsout/lock.json`: `{ ticket, claimedAt, claimedAtUtc7, order, scanId }`. Created with an exclusive open (`wx`): the second of two scans that start together gets `EEXIST` and logs `busy`. The lock is the claim; ClickUp is the second witness.
- **Claim order:** (1) create the lock, (2) set the ticket to `in progress`, (3) read it back; the status must read `in progress`, (4) only then write the order and prompt the conductor. If (2) or (3) fails: remove the lock, try to put the ticket back to `to do`, log `claim-failed`, stop (the next hour retries).
- **A stuck lock** is never cleared by a scan. `dg lightsout report` names a lock older than 8 h; the Maestro or Jack removes it with `dg lightsout release --ticket K --result stopped`. (No automatic unlock: a wrong unlock could start a second build next to a running one.)
- One Lights-Out ticket at a time. Tickets Jack starts by hand are not blocked by the lock; the scan only ever takes `to do`.

## 5. Who builds: the conductor, not the scan
- **Order file:** `~/.digismith-depot/sessions/DigiSmith/orders/order-lo-<night>-<KEY>.md` (night = the UTC+7 date the 23:00 window opened). Fixed template: ticket key, title, task id, the claim time, where the spec and plan are, the Sign-off value, then the standing text: build per the conductor runbook (seat rule, Builder in role mode, Reviewers, merge, hooks 01-03, report.html, plan.md); the **night mandate** (section 8); and the closing step: run `dg lightsout release --ticket <KEY> --result <merged|failed|stopped|awaiting-jack>`.
- **Prompt:** `herdr agent prompt` to the digismith-conductor (found through `~/.digismith-depot/conductors.json`; herdr only through `~/.digismith-depot/bin/herdr-ws`), one line: `Lights-Out order lo: build <KEY>, read <order path>`. A failed prompt counts as a failed claim (section 4): lock removed, ticket back to `to do`, `claim-failed` logged.
- The scan never starts a worker, never touches a worktree, never merges. A change of the conductor runbook (a "Lights-Out order" section: read the order, the mandate, call `release`) is a plan task; the runbook is untracked, so the Maestro applies the text the plan supplies.

## 6. Scan again at once
`dg lightsout release` (called by the conductor after the merge, or after a failure or stop) clears the lock, then calls run-now on `lightsout-scan`: `POST /api/v1/jobs/lightsout-scan/run` with the three DGS-456 guard parts (JSON content type, `{"confirm":"lightsout-scan"}`, the token file in the depot; the base URL from `NEXUS_URL`, default `http://127.0.0.1:4300`). A refused run-now (409 already running, 403 outside the window) is logged and not an error: the next hourly slot scans anyway. At 06:00 or later the window guard ends the loop; no new pickup after 06:00.

## 7. Morning report: `lightsout-report` at 06:00
- Source: the night's event file `~/.digismith-depot/lightsout/events-<night>.jsonl` (one JSON line per scan, claim, skip, release; written by the commands only, append-only, one `appendFile` per line).
- Output: `~/.digismith-depot/lightsout/reports/<night>.md` and **one comment on DGS-548**. Contents: number of scans; tickets built (key, result, merge commit if released with it, minutes); skipped with reasons; failures and stops with the conductor's reason; a lock still held at 06:00 (ticket named, "still building"); tickets waiting for Jack (awaiting-jack, stopped).
- Idempotent: a second run for the same night rewrites the file and adds no second comment. A `release` after 06:00 appends one line to the report file (no new comment).
- **Catch-up:** `scripts/conductor/consult.ts` shows the newest report when it is under 24 h old (a plan task with its own test). Push or email is DGS-448, later.

## 8. Mandate at night (written into every order)
Allowed: merge, push, restart an already-installed service. Never: `sudo`, a new background service or LaunchAgent, any delete, a Caddy or Tailscale change. When the ticket needs one of these, the conductor stops that ticket, calls `release --result stopped --reason "<what is needed>"`, and the ticket waits for Jack: a comment on the ticket and the lock cleared. Status handling follows DGS-490 once it exists; until then the ticket stays `in progress` with the comment (the scan reads only `to do`, so it is never retaken). A `Sign-off: Jack` ticket runs to the acceptance point, then `release --result awaiting-jack`; Jack accepts by day.

## 9. Files and state (all in the depot, `LIGHTSOUT_DIR` overrides the folder)
`~/.digismith-depot/lightsout/`: `lock.json`, `notes.json`, `events-<night>.jsonl`, `reports/<night>.md`. No token, no ticket text beyond key, title and reasons. The commands read no `.env` themselves (the ClickUp client does, as for every `dg clickup` call).

## 10. What the plan will test without Jack
Everything runs on this Mac with no ClickUp, no herdr, no real Nexus:
- **Fake clock** (`now()` injected): window bounds (23:00 inclusive, 06:00 exclusive), midnight wrap, `outside-window`, night id across midnight and a month change.
- **Fake ClickUp client** (in memory: tasks, statuses, custom fields, dependencies, attachments, comments): order by priority, due, created (with nulls); each Definition of Ready check alone failing; one comment per reason set and none on repeat; the claim writes `in progress` and reads it back; a claim that reads back wrong clears the lock; Epic, Initiative, Spike skipped.
- **Two scans at once** on one lock: exactly one claims.
- **Fake herdr** (a recording script, as in 456's fake `dg`): the prompt argv; a failing prompt returns the ticket to `to do`.
- **Throwaway server on a high port** with a temp state folder: `release` calls run-now with the right headers; 409 and 403 are logged, not thrown.
- Order file contents (mandate text, key, release command); report content for a night with built, skipped, failed and a held lock; report idempotence; consult shows a fresh report only.
- Mutation checks by hand: lock exclusivity, read-back, window bound, comment dedupe, the "scan reads only `to do`" filter.
No test touches the real ClickUp, depot, Nexus (4300), herdr or a conductor.

## 11. Jack's first use (after the build is merged, installed, and Jack has restarted the Nexus API once)
1. `dg lightsout scan --dry-run` on the real ClickUp: read-only list of the `to do` tickets and each verdict. No write.
2. One real night: Jack (or the Maestro on his word) puts **one small `Sign-off: Auto` ticket** with spec, plan and milestone into `to do` before bed.
3. Next morning: `dg lightsout status` and the report comment on DGS-548 (or the catch-up). Expected: one build, one merge, the lock cleared, scans each hour with no model tokens.
The DGS-456 first use (J1 to J3) comes first; this ticket adds no Jack step beyond the one in the plan.

## Not in this ticket
Push or email of the report (DGS-448), the status after a stop (DGS-490), parallel Lights-Out builds, picking tickets from other spaces, any change to the conductor beyond the runbook text.
