# DGS-486 design: Autonomous Operation, the scan that works while Jack is away

Date: 2026-10-19 (UTC+7), rev 2. Design only, no code. Rev 1 (2026-10-18) was approved at checkpoint 1; rev 2 applies the Maestro's change of 2026-10-19 (Jack): the feature is renamed from Lights-Out to **Autonomous Operation**, and it works while Jack is **away** (commuting, meetings), not only at night. Decisions of rev 1 stand unless this text says otherwise. `v1` is the placeholder version (DGS-452).

## Summary
Two jobs in the Nexus scheduler (DGS-456, on main) run plain `dg` commands. `autonomous-scan` runs every 60 min. It works when the clock is inside the night window (23:00 to 06:00 UTC+7) **or** the away switch is on; at any other time it exits `off` with no ClickUp call. A working scan finds the best ticket in `to do`, checks it is ready, claims it, writes an order for the digismith-conductor and prompts the conductor. It never starts a worker. The conductor builds the ticket with its normal runbook, then releases the lock, which triggers the next scan at once. `autonomous-report` runs at 06:00 and when Jack says `back`; each report covers the time since the previous report. A scan that finds nothing is plain code: no model tokens.

## 0. DGS-456 on main: what the registry can say (checked 2026-10-19 against `scripts/nexus-api/src/scheduler/registry.ts` and `clock.ts`)
- `JobDef.schedule = { atUtc7, windowEndUtc7, everyMinutes? }`; a window may cross midnight; `everyMinutes` is a whole number from 5 to 720; one run per slot.
- **A window whose end equals its start is refused at load, and `HH:MM` stops at `23:59`.** A full 24 h window cannot be written.
- **Closest fit, used here:** `atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 60`. The slots are 00:00, 01:00 ... 23:00: all 24 hours of the day, every one before the window end. Only the minute 23:59 to 00:00 is outside the window, and no slot falls in it. The command decides for itself whether to work (night window or away), so the scheduler window only has to be wide.
- Entry fields: `autonomous-scan`: `catchUp: 'skip'` (a missed hour is the next hour), `manualOutsideWindow: 'allowed'` (the command's own rule says `off` when it is not time), `timeoutMs` 5 min, `notify: 'failures'`, `order: 50`. `autonomous-report`: `atUtc7: '06:00', windowEndUtc7: '07:00'` (one slot), `catchUp: 'run-once-in-window'`, `manualOutsideWindow: 'allowed'` (run-now on `back`), `timeoutMs` 5 min, `notify: 'failures'`, `order: 60`.
- Cost of an hourly slot all day: while Jack is at home and it is daytime, a scan is one short Node start that reads the clock and `away.json` and exits `off`. No network, no model tokens.

## 1. Commands (new `dg autonomous` group, in `packages/cli/src/autonomous/`)
| Command | Who calls it | What it does |
|---|---|---|
| `dg autonomous scan [--dry-run]` | the scheduler job | one scan (section 3). `--dry-run` reads only: prints the candidates and each Definition of Ready verdict, writes nothing, works at any time of day. |
| `dg autonomous away [--until HH:MM]` | Jack | switch the away mode on (section 2), then run-now on `autonomous-scan`. |
| `dg autonomous back` | Jack | switch the away mode off, then run-now on `autonomous-report`. |
| `dg autonomous release --ticket K --result merged\|failed\|stopped\|awaiting-jack [--reason "..."]` | the conductor | clears the lock, logs the event, comments on the ticket for `failed`, `stopped`, `awaiting-jack`, then calls run-now on `autonomous-scan` (section 7). |
| `dg autonomous report` | the scheduler job, `back` | writes the report for the time since the previous report (section 8). |
| `dg autonomous status` | Jack, the conductor | prints: away or not (and until when), the lock, the last scan (time and outcome), the newest report. Read only. |
The scheduler's registry commands are `dg autonomous scan` and `dg autonomous report` with absolute paths (456 rule). The ClickUp client is the one `dg clickup` uses (credentials from the depot, no shell environment).

## 2. The away switch
- **File:** `~/.digismith-depot/autonomous/away.json`: `{ "away": boolean, "since": ISO, "until": ISO | null, "endedAt": ISO | null }`. Never deleted: `back` rewrites it (atomic temp file and rename).
- **`away [--until HH:MM]`:** `HH:MM` is UTC+7 and means the **next** time that clock reads `HH:MM` (a time already passed today means tomorrow; so `--until` is at most 24 h ahead). Without `--until`, `until` is `null`: away stays on until `back`. Writes `away: true`, `since: now`; logs `away-on`; calls run-now on `autonomous-scan` so the first scan starts at once. A second `away` while away is on replaces `until` (and still calls run-now; the scan says `busy` or works as normal).
- **`back`:** rewrites `away: false`, `endedAt: now`; logs `away-off`; calls run-now on `autonomous-report`. It does **not** stop a build in progress: the lock stays, the conductor finishes and calls `release`, and the scan that `release` triggers says `off` in the daytime (the report names the lock as "still building" if one is held when it is written).
- **A passed `--until` counts as back.** `isAway(file, now)` is `away === true && (until === null || now < until)`. The first scan that sees `away: true` with a passed `until` does exactly what `back` does (rewrite the file, log `away-expired`, run-now on `autonomous-report`), then goes on with the night-window rule. So Jack gets his report within one hour of the end time.
- A failed run-now (409, 403, a stopped API) is logged and printed, never an error: the next hourly slot scans anyway, and the report slot at 06:00 still comes.
- **Later, not in this ticket:** switching away on or off from the phone through the Nexus API.

## 3. The scan, step by step
0. **Expiry.** If `away.json` says `away: true` and `until` has passed: act as `back` (section 2).
1. **Work rule.** Work only when `inNightWindow(now)` (23:00 inclusive to 06:00 exclusive UTC+7) or `isAway`. Otherwise log `off` and exit 0, **before any ClickUp call or lock read**. (`--dry-run` skips this step.)
2. **Busy check.** If the lock file exists (section 5): log `busy` (ticket named) and stop. Exit 0.
3. **Query.** All tasks in status `to do` in the DigiSmith space (id `1301150000001271`), all lists. Only task types Task and Bug are candidates (`custom_item_id`); Epic, Initiative and Spike are logged `skipped: type` and never commented.
4. **Order:** priority (urgent first, none last), then due date (earliest first, none last), then created (oldest first).
5. **Walk the list.** For each ticket in order: Definition of Ready (section 4). Fail: comment once (below), try the next. Pass: claim (section 5) and stop walking; one ticket per scan.
6. **Hand over** (section 6).
7. Log one `scan` event: counts of candidates, skipped (with reasons), claimed ticket or none.

**The status exists.** Checked on 2026-10-18 (read only): `dg clickup add-status --space 1301150000001271 --name "to do" --type open` without `--yes` answers `status "to do" already exists in this set`. (A working scan checks it once; if it ever disappears the scan logs `no-starter-status`, comments on DGS-548 once, and stops.)

## 4. Definition of Ready check (before the claim)
A ticket is ready when all four hold:
| Check | How it is read |
|---|---|
| Spec and plan on the ticket | an attachment named `design.*` or `spec.*` and one named `plan.*`, **or** the ticket text links a board folder (`.digismith/board/<KEY>—<slug>/`) that holds `design.*` and `plan.md` on `main` of this checkout |
| Sign-off mark | the custom field `Sign-off` is set (`Auto` or `Jack`) |
| Milestone | the ticket carries a milestone (Genesis, Dawn, after Dawn). The plan's first task reads one done ticket (read only) and pins the exact field or link; the spec does not guess it. |
| No open blocker | no dependency "waiting on" a ticket that is not done or closed |
**A fail gets one comment**, text: `Autonomous scan skipped this ticket (<date UTC+7>): <the failed checks, one line each>. It stays in to do. Fix and it is picked up on a later scan.` The ticket stays in `to do`. **No repeat comments:** the scan keeps `autonomous/notes.json` (`{ <KEY>: <hash of the reasons> }`) and comments again only when the reasons change.

## 5. Busy and claim
- **Lock file:** `~/.digismith-depot/autonomous/lock.json`: `{ ticket, taskId, claimedAt, claimedAtUtc7, order, scanId }`. Created with an exclusive open (`wx`): the second of two scans that start together gets `EEXIST` and logs `busy`. The lock is the claim; ClickUp is the second witness.
- **Claim order:** (1) create the lock, (2) set the ticket to `in progress`, (3) read it back; it must read `in progress`, (4) only then write the order and prompt the conductor. If any step fails: remove the lock, try to put the ticket back to `to do`, log `claim-failed`, stop (the next hour retries).
- **A stuck lock** is never cleared by a scan. `dg autonomous report` names a lock older than 8 h; the Maestro or Jack removes it with `dg autonomous release --ticket K --result stopped`.
- One Autonomous ticket at a time. Tickets Jack starts by hand are not blocked by the lock; the scan only ever takes `to do`.

## 6. Who builds: the conductor, not the scan
- **Order file:** `~/.digismith-depot/sessions/DigiSmith/orders/order-ao-<day>-<KEY>.md` (`day` = the UTC+7 date of the claim, plus `HHmm`: `2026-10-19-1432`, so two orders for one ticket never collide). Fixed template: ticket key, title, task id, the claim time, where the spec and plan are, the Sign-off value, the standing text (build per the conductor runbook: seat rule, Builder in role mode, Reviewers, merge, hooks 01-03, report.html, plan.md), the **mandate** (section 9), and the closing step: run `dg autonomous release --ticket <KEY> --result <merged|failed|stopped|awaiting-jack>`.
- **Prompt:** `herdr agent prompt` to the digismith-conductor (found through `~/.digismith-depot/conductors.json`; herdr only through `~/.digismith-depot/bin/herdr-ws`), one line: `Autonomous order: build <KEY>, read <order path>`. A failed prompt counts as a failed claim (section 5).
- The scan never starts a worker, never touches a worktree, never merges. The conductor runbook gets an "Autonomous order" section (a plan task; the runbook is untracked, so the Maestro applies the text).

## 7. Scan again at once
`dg autonomous release` (called by the conductor after the merge, or after a failure or stop) clears the lock, then calls run-now on `autonomous-scan` (`POST /api/v1/jobs/autonomous-scan/run` with the DGS-456 guard parts: JSON content type, `{"confirm":"autonomous-scan"}`, the token file in the depot; base URL `NEXUS_URL`, default `http://127.0.0.1:4300`). The scan decides: working time or away gives the next ticket; otherwise `off`. A refused run-now is logged and not an error.

## 8. Reports: `autonomous-report` at 06:00 and on `back`
- **Period:** from the previous report's end to now. `autonomous/last-report.json` holds `{ "at": ISO }` (written after each report). With no previous report, the period starts at the first event of the oldest events file.
- **Source:** the day files `~/.digismith-depot/autonomous/events-<YYYY-MM-DD>.jsonl` (UTC+7 date of the event; one JSON line per scan, `off`, claim, skip, release, away-on, away-off; written by the commands only, append-only). The report reads the lines whose time is inside the period.
- **Output:** `~/.digismith-depot/autonomous/reports/<YYYY-MM-DD-HHmm>.md` (UTC+7 time the report was written) and **one comment on DGS-548**. Contents: the period; away periods inside it; number of working scans (`off` scans counted on one line, not listed); tickets built (key, result, merge commit if released with it, minutes); skipped with reasons; failures and stops with the conductor's reason; a lock still held (ticket named, "still building"; a warning if older than 8 h); tickets waiting for Jack (awaiting-jack, stopped).
- A `release` after a report was written appends one line to the newest report file (no new comment).
- **Catch-up:** `scripts/conductor/consult.ts` shows the newest report when it is under 24 h old (a plan task with its own test). Push or email is DGS-448, later.

## 9. Mandate (written into every order, night or away)
Allowed: merge, push, restart an already-installed service. Never: `sudo`, a new background service or LaunchAgent, any delete, a Caddy or Tailscale change. When the ticket needs one of these, the conductor stops that ticket, calls `release --result stopped --reason "<what is needed>"`, and the ticket waits for Jack: a comment on the ticket and the lock cleared. Status handling follows DGS-490 once it exists; until then the ticket stays `in progress` with the comment (the scan reads only `to do`, so it is never retaken). A `Sign-off: Jack` ticket runs to the acceptance point, then `release --result awaiting-jack`; Jack accepts when he is back.

## 10. Files and state (all in the depot, `AUTONOMOUS_DIR` overrides the folder)
`~/.digismith-depot/autonomous/`: `away.json`, `lock.json`, `notes.json`, `last-report.json`, `events-<YYYY-MM-DD>.jsonl`, `reports/<YYYY-MM-DD-HHmm>.md`. No token, no ticket text beyond key, title and reasons. The commands read no `.env` themselves (the ClickUp client does, as for every `dg clickup` call).

## 11. What the plan will test without Jack
Everything runs on this Mac with no ClickUp, no herdr, no real Nexus:
- **Fake clock** (`now()` injected): night window bounds (23:00 inclusive, 06:00 exclusive), daytime `off`, the UTC+7 day across midnight and a month change, `--until HH:MM` resolution (later today, tomorrow), an `until` that has passed.
- **Away switch:** `away` writes the file and calls run-now on `autonomous-scan`; `back` rewrites (the file still exists, `away: false`) and calls run-now on `autonomous-report`; a passed `until` counts as back and posts one report request; `off` makes **zero** ClickUp calls and creates no lock; away in the daytime works like the night window.
- **Fake ClickUp client** (in memory: tasks, statuses, custom fields, dependencies, attachments, comments): ordering, each Definition of Ready check alone failing, one comment per reason set, the claim writes `in progress` and reads it back, Epic, Initiative, Spike skipped.
- **Two scans at once** on one lock: exactly one claims.
- **Fake herdr** (a recording script): the prompt argv; a failing prompt returns the ticket to `to do`.
- **Throwaway server on a high port** with a temp state folder: `away`, `back`, `release` call run-now with the right path and headers; 409 and 403 are logged, not thrown.
- Order file contents; report content for a period with built, skipped, failed, away and a held lock; a second report covers only the time since the first; consult shows a fresh report only.
- **The registry entry against DGS-456's own clock:** the scan's slots for one day are 24 (00:00 to 23:00); the report has one slot at 06:00.
- Mutation checks by hand: lock exclusivity, read-back, the work rule (night or away), the `off` exit before any ClickUp call, comment dedupe, the "scan reads only `to do`" filter.
No test touches the real ClickUp, depot, Nexus (4300), herdr or a conductor.

## 12. Jack's first use (after the build is merged, installed, and Jack has restarted the Nexus API once)
1. `dg autonomous scan --dry-run --repo ~/Workspace/Jazurite/DigiSmith`: read-only list of the `to do` tickets and each verdict. No write.
2. `dg autonomous status`: shows away off, no lock.
3. Put **one small `Sign-off: Auto` ticket** with spec, plan and milestone into `to do`. Run `dg autonomous away --until <HH:MM>` (a commute length), leave, come back and run `dg autonomous back`. Expected: the first scan at once, one build, one merge, the lock cleared, the report as a comment on DGS-548 and in the catch-up.
4. Later, one real night with no `away` (the night window alone).
The DGS-456 first use (J1 to J3) comes first.

## Not in this ticket
Push or email of the report (DGS-448), the status after a stop (DGS-490), switching away from the phone through the Nexus API, parallel Autonomous builds, picking tickets from other spaces, any change to the conductor beyond the runbook text.
