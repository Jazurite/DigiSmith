# DGS-683 Suite: spec

Written 2026-11-01 ~22:0x UTC+7 by refine worker `dgs-683-refine`. Docs only. Inputs: the ticket and Jack's five decisions (comment 2026-11-01 12:58 UTC = 19:58 UTC+7), `probe.md` (cross-session control works with `--session default`), order fa-03, DGS-640, DGS-641, and a read of the code and depot files named below (file:line from main at 8cacaae8).

## 1. Goal and the five decisions

Move every conductor out of herdr session `default` into a new herdr session `Suite`. `default` keeps the workers and the other roles and is called the Floor.

| # | Jack's decision | What it means here |
|---|---|---|
| 1 | Ticket conductor = one per ticket; it drives one build (Builder -> Reviewer -> merge), then closes | A third conductor kind, section 6 |
| 2 | Floor: one workspace per project as today (DigiSmith w2, Emma w3, Soveron w4), no conductor tab | Floor workspaces stay; tab 1 is no longer a conductor |
| 3 | Suite: one workspace per project, each holding that project's conductors | Suite workspaces `DigiSmith`, `Emma`, `Soveron`, plus `Factory` (decision 4) |
| 4 | One factory line for all projects; one factory conductor ranks to-do tickets of every project | Workspace `Factory` in Suite, one conductor in it |
| 5 | Same permissions for every conductor; the name is the assignment; acting on another conductor's worker is recorded; one driver per ticket. Jack: "every conductor can use and control any workers, focus on its own first" | Section 7 (scope: own Suite workspace + every Floor workspace; "own first" is a rule, not a limit) and section 6 (driver record, log) |

Success test: after the migration, `herdr --session Suite agent list` shows all live conductors, `herdr --session default agent list` shows no conductor, the factory scan prompts the factory conductor in Suite, and the catch-up, flux, state refresh and session sweep give the same answers as before.

## 2. Terms

- **Suite**: herdr session named `Suite`. Its own socket `~/.config/herdr/sessions/Suite/herdr.sock`. Holds conductors only.
- **Floor**: herdr session `default` (herdr cannot rename a session). Workers, Builders, Reviewers, Scouts, Researchers. One workspace per project, one tab per ticket.
- **Project conductor**: today's "default conductor" of DGS-641. Takes attended work from the Maestro (Manual tickets, work Jack starts by hand). Examples: `digismith-conductor`, `emma-conductor`.
- **Factory conductor**: today's "autonomous conductor" of DGS-641. Nobody except the scan prompts it. Owns the line: claim, advance, merge, release, for every project.
- **Ticket conductor**: new. One per ticket, started by a project or the factory conductor.
- **Standing conductors** (main, dawn, token-economics, d3, scheduling): long-lived conductors that own a topic, not a project line. They live in their project's Suite workspace like a project conductor.
- **Nightwatch** (DGS-641's third role): an on-call conductor, started for an attention item, closed when done. In Suite it is started and closed exactly like a ticket conductor. Its own ticket (DGS-641) stays open; this spec only makes sure the Suite mechanics fit it (section 6, "kind").

## 3. Reconciling DGS-640 and DGS-641

| Ticket | Outcome here |
|---|---|
| DGS-641 "Default / Autonomous / Nightwatch" | Default -> project conductor. Autonomous -> factory conductor (Suite workspace `Factory`). Nightwatch -> on-call conductor of kind `ticket` with `ticket: null` and an attention item as its subject. DGS-641 keeps its own scope: building the on-call behaviour and the split of the factory work out of `digismith-conductor`. DGS-683 only provides the place and the registry. |
| DGS-640 "Shifts" | Unchanged. Shifts (attended/unattended, seat headroom, ping rules) change how the factory conductor behaves, not where it lives. No dependency either way. |

Consequence for DGS-641: its hard-coded conductor (`packages/cli/src/autonomous/conductor.ts:8`, key `DigiSmith/digismith-conductor`) is replaced in this ticket's plan by a registry lookup of kind `factory`. Until the factory conductor exists, the lookup returns `digismith-conductor`, so nothing changes for the line on day one (see migration step order, section 10).

## 4. Suite boot

### 4.1 Layout

Session `Suite`, workspaces (label = project, so `ws_id` by label works as in `herdr-bootstrap.sh`):

| Suite workspace | Holds | Folder (cwd) |
|---|---|---|
| `Factory` | factory-conductor, later on-call (Nightwatch) conductors | DigiSmith checkout (the line merges there) |
| `DigiSmith` | digismith-conductor, main-conductor, dawn-conductor, token-economics-conductor, d3-conductor, scheduling-conductor, ticket conductors of DigiSmith tickets | DigiSmith checkout |
| `Emma` | emma-conductor, Emma ticket conductors | `~/Workspace/Emma/shopify-hub` |
| `Soveron` | soveron conductor (standby, not live today) | `~/Obsidian/Knowpolis/1. Soveron` |

Oculus gets no workspace now (Jack 2026-10-24: Oculus is its own project; DGS-620). The registry accepts a new project by adding one `ensure_ws` line (section 4.4).

Tab per conductor, tab label = agent name. No tab 1 rule: in Suite no conductor is special by position (the old "tab 1 = conductor" rule in `herdr-ws:61` and `workbox.md:9,34` goes away, section 7).

### 4.2 Start and restart

Decision: a **second LaunchDaemon** `com.jazurite.herdr-suite` runs `~/.local/bin/herdr-boot-suite.sh`, which loads the active seat token like `herdr-boot.sh` and runs `exec herdr --session Suite server`. Same plist shape as `com.jazurite.herdr` (`UserName workbox`, `RunAtLoad`, `KeepAlive SuccessfulExit false`, `ThrottleInterval 30`, own log files `~/.config/herdr/suite.launchd.*.log`).

Reasons: (a) a crash of Suite does not take the Floor down and the other way round (launchd restarts each alone); (b) no edit of the working `herdr-boot.sh`; (c) the same hand-install path as the first daemon (root-owned plist, Jack installs; no sudo by an agent). Rejected: starting Suite in the background from `herdr-boot.sh` (a child that dies is not restarted, and one script then owns two servers).

Restart behaviour: herdr restores agents after a server restart as `claude --resume <id>` with history but without launch flags (`workbox.md:30-32`). That holds per session. The bootstrap (4.3) relaunches each conductor with flags, as today.

Reboot sequence (documented in the runbook `workbox.md`, "After a reboot"): 1) wait for auto-login; 2) `herdr session list` shows `default` and `Suite` running; 3) run `~/.local/bin/herdr-bootstrap.sh` once; it handles both sessions.

### 4.3 What `herdr-bootstrap.sh` becomes

Today (`~/.local/bin/herdr-bootstrap.sh`): `S=default`, `ensure_ws` for DigiSmith/Emma/Soveron, `ensure_maestro` starts one conductor in `$ws:p1` of each with `HERDR_WS=$ws` and `--allowedTools "Bash(herdr-ws *)"`.

After:
1. Two session handles: `FLOOR=(herdr --session default)`, `SUITE=(herdr --session Suite)`. Wait loop for both sockets.
2. `ensure_ws` on the Floor for the project workspaces (no conductor tab; if Floor tab 1 is an old conductor, leave it: migration section 10 handles it).
3. `ensure_ws` on Suite for `Factory`, `DigiSmith`, `Emma`, `Soveron`.
4. The conductor list is read from `conductors.json` (section 5), not written into the script. For each entry of kind `project`, `factory` or `standing` with `session: "Suite"`: `ensure_conductor name suite-ws cwd`, which is `ensure_maestro` with: pane lookup by tab label in the Suite workspace instead of `$ws:p1`; env `HERDR_SCOPE` (section 7) instead of `HERDR_WS`; same flags; same "restored as plain resume -> relaunch with flags" branch.
5. After the ensure steps, write the resolved workspace ids back into `conductors.json` (atomic write, only the `workspace` and `floor` fields). Reason: ids like `w7` are assigned by the server and the registry must follow a restore.
6. Ticket conductors are not started by the bootstrap (they are on demand). After a reboot an open ticket conductor is restored by herdr as a plain resume; the bootstrap relaunches it with flags if its registry entry is `open` (4.5).
7. Idempotent as before. The script stays Jack's file in `~/.local/bin` (hand install; the repo holds the new text in `scripts/herdr/` as a proposal).

### 4.4 Adding a project later

One line in the bootstrap's workspace list and one registry entry. No code change. Checked by a test that runs the bootstrap against a scratch session pair (`HERDR_SESSION`-style override: the script already accepts `HERDR_SESSION`; it gains `HERDR_FLOOR_SESSION` and `HERDR_SUITE_SESSION`, defaults `default` and `Suite`).

### 4.5 Open ticket conductors across a reboot

`conductors.json` keeps a ticket conductor's entry while it is open (section 6). The bootstrap relaunches `open` entries and ends with a list of any that failed. Closing the conductor removes the entry (the conductor's last step, section 6).

## 5. The conductor registry

### 5.1 `~/.digismith-depot/conductors.json` today

```json
{"DigiSmith/digismith-conductor": {"note": ".../.digismith/sessions/DigiSmith/note.md", "workspace": "w2"},
 "Emma/emma-conductor": {"note": ".../sessions/Emma/emma-conductor/note.md"}}
```

Key `Project/name`. `note` read by `scripts/conductor/state.ts:84` and `flux-targets.ts:54`. `workspace` read only by `packages/cli/src/autonomous/conductor.ts:20-37` (and checked by `scan.ts:166-180`).

### 5.2 New fields (all optional; no field = today's behaviour)

| Field | Meaning | Default when absent |
|---|---|---|
| `session` | herdr session where the conductor runs: `default` or `Suite` | `default` |
| `workspace` | workspace id of the conductor in that session | none (as today) |
| `floor` | workspace id in `default` where this conductor's workers run | for `session: default`, equals `workspace` |
| `kind` | `project`, `factory`, `standing` or `ticket` | `project` |
| `ticket` | ticket key for `kind: ticket` | none |
| `under` | name of the conductor that started this one (kind `ticket`) | none |
| `status` | `open` or `closed` for kind `ticket`; others are always `open` | `open` |

Decision: **old entries keep working unchanged** and the migration flips one entry at a time (section 10). This is the main safety property: code that reads the new fields ships first (ticket A), the data changes later by hand (ticket B).

Resolution API (one module, `scripts/conductor/registry.ts` for scripts, used from `packages/cli` through the same path rule the CLI already uses for `scripts/`; the plan fixes the exact import): `resolveConductor(key)` -> `{ key, session, workspace, floor, kind, note }`; `findByKind("factory")`; `herdrArgs(entry)` -> `["--session", entry.session]`. Callers never build `--session` by hand again.

### 5.3 Session cards `runs_on`

`scripts/session-cards/card-hook.ts:70` writes `runs_on = herdr <HERDR_PANE_ID>`, for example `herdr w2:p1`. Pane ids repeat across sessions (probe: Suite also had `w1:p1`), so this value is ambiguous after the move.

Decision: new format `herdr <session>/<pane_id>`, for example `herdr Suite/w7:p1`. The old `herdr w2:p1` stays valid and means session `default`. The session comes from `HERDR_SESSION`, and **an unset variable means `default`**: verified in this pane, `HERDR_SESSION` is not set in `default` (only in a named session, per the probe). One parse function `parseRunsOn(s)` -> `{ session, workspace, pane } | null` with regex `^herdr (?:([\w-]+)/)?(w\d+):(\S+)$`; `desktop`, `ssh`, `workbox` return null as today.

### 5.4 `HERDR_WS`

Becomes `HERDR_SCOPE`, section 7. `HERDR_WS=w2` alone keeps its old meaning (`default:w2`) so every existing worker brief, `opencode.json` rule and test keeps working.

## 6. Ticket conductor

### 6.1 Role

A conductor for exactly one ticket. Drives Builder -> Reviewer -> merge for that ticket and closes. It is the same kind of Claude session as the other conductors (same permissions, decision 5); the difference is its lifetime and its assignment.

### 6.2 Who starts it, and how

Started by a project conductor (attended ticket) or the factory conductor (claimed ticket). The starter runs one command, `dg conductor start-ticket --ticket KEY --under NAME` (new, in `packages/cli/src/conductor/`), which does, in order:
1. Refuse when the ticket already has a driver (6.3).
2. Write the driver record (6.3) and the registry entry `Project/tc-<key>` with `kind: ticket`, `ticket`, `under`, `session: Suite`, `workspace` = the project's Suite workspace, `floor` = the project's Floor workspace, `status: open`.
3. Create a tab `tc-<key>` in the Suite workspace and start Claude there with the standard conductor flags, `HERDR_SCOPE` (section 7.2: own Suite workspace plus every Floor workspace), plus a brief `.digismith/sessions/tc-<key>/brief.md` generated from the ticket (what to drive, the stop conditions, "close after merge").
4. Print the registry key and pane id.

Every `herdr` call in the command goes through `herdr-ws` (guardrail 7), so the command is allowed for any conductor and refused for anything outside its scope.

### 6.3 One driver per ticket: the "driven by" record

File `~/.digismith-depot/drivers/<KEY>.json`: `{ "ticket": "DGS-683", "driver": "digismith-conductor|tc-dgs-683|factory", "since": "<iso+07:00>", "mode": "attended|factory" }`. Created with exclusive-create (`wx`), so two starters cannot both win.

Relation to the factory's claim lock: the factory claims in its own state under `~/.digismith-depot/autonomous/`. Decision: the driver record is the general rule, and the factory claim **also writes** a driver record (`driver: factory`, then handed to the ticket conductor with `dg conductor handover`, which rewrites the file with the new driver in one atomic rename). The claim lock stays the factory's own concurrency control; nothing in `autonomous/` is removed. An attended ticket gets a driver record the moment its conductor starts a worker for it (`dg run start` refuses a second driver, section 8 row `run`).

Acting on another conductor's worker (Jack: "mainly focus on its assigned workers first"): allowed for every conductor (section 7.2, Floor reach of every project). Every such act appends one line to `~/.digismith-depot/drivers/<KEY>.log` (`who`, `acted-on`, `verb`, `time`) written by the wrapper itself, so the record needs no conductor discipline. The driver of the ticket does not change by this.

### 6.4 Closing

After the merge and push, the ticket conductor: 1) writes its final note line (Done, Decisions, Next) to `.digismith/sessions/tc-<key>/note.md`; 2) deletes the driver record (`dg conductor close --self`, which also sets the registry entry `status: closed` and removes it); 3) closes its own tab with `herdr-ws --session Suite tab close` (allowed for tabs labelled `tc-*`, section 7).

Failure paths: a ticket conductor that ends without closing is found by the session sweep (the card goes `lost`), and `dg conductor sweep` lists registry entries of kind `ticket` whose pane is gone, so the starter can restart or close it. It never blocks the line: the factory conductor treats a `lost` driver as "needs attention" through the existing attention list.

### 6.5 Kinds and Nightwatch

`kind` decides the lifetime rules only: `ticket` entries are removed on close; `standing`, `project` and `factory` never. Nightwatch is `kind: ticket` with `ticket: null`, key `Project/nw-<attention-id>`; its start and close use the same two commands. DGS-641 builds its behaviour.

## 7. The herdr-ws guardrail change

Source: `scripts/opencode-boot/herdr-ws` (installed copy `~/.digismith-depot/bin/herdr-ws`). Today (`:7`) every call runs `herdr --session default`, `WS = $HERDR_WS` is one workspace, groups `agent`, `pane`, `tab` only, targets are checked by workspace, `create` needs `--workspace == WS`, and `tab close` of `WS:t1` is refused (`:61`).

### 7.1 New rule: a scope of (session, workspace) pairs

`HERDR_SCOPE` is a comma list `session:workspace`, one pair per allowed workspace (a session may appear several times), for example `HERDR_SCOPE=Suite:w7,default:w2,default:w3,default:w4`. Absent: `default:$HERDR_WS` (exactly today's rule, so no existing caller changes).

Allowed:
1. `--session <S>` as the first argument of `herdr-ws` selects the session, `S` must appear in the scope. Without it the session is `default` (so existing calls such as `herdr-ws agent prompt dgs-683 ...` work unchanged and stay on the Floor).
2. Within the chosen session, the same checks as today against the set of workspaces the scope names for that session: lists are filtered to that set, `create` needs `--workspace` inside it, targets must lie in it, `start` checks `--pane`. With one pair per session this is exactly today's single-workspace rule.
3. Groups stay `agent`, `pane`, `tab`. `workspace`, `session`, `server` stay refused. The wrapper never accepts a `--session`, `--socket` or `HERDR_SOCKET_PATH` override of its own: it builds the argv itself from the validated session name (so a conductor cannot reach a third session, for example a test session).
4. Close in Suite: `tab close` and `agent stop` are refused in Suite except for a tab whose label starts with `tc-` or `nw-` and is in the caller's Suite workspace (label read with `tab get`). This replaces the `:t1` rule, which was a position rule (protects the conductor's own tab by being tab 1); in Suite a label rule protects every non-ticket conductor from a sibling.
5. The wrapper writes the audit log (6.3) itself: a call whose target is in a Floor workspace other than the caller's own project Floor workspace appends one line to `~/.digismith-depot/drivers/<KEY>.log` (or `drivers/_unmapped.log` when the target maps to no ticket). Read verbs (`list`, `read`, `get`) are not logged; every other verb is.

### 7.2 What each conductor kind gets (set by the bootstrap or `start-ticket`, never by the conductor itself)

| Kind | `HERDR_SCOPE` |
|---|---|
| project / standing / ticket | `Suite:<its own Suite workspace>,default:<every project's Floor workspace>` |
| factory | `Suite:<Factory workspace>,default:<every project's Floor workspace>` |

Decision (Maestro, from Jack: "every conductor can use and control any workers, but mainly focus on its assigned workers first"): all conductor kinds get the same Floor reach, every project's Floor workspace. "Own workers first" is the conductor's rule (in its brief), not a technical limit. The cost of reaching a worker of another conductor is the log line (7.1 item 5), not a refusal. The bootstrap and `start-ticket` build the Floor part of `HERDR_SCOPE` from the Floor workspaces in `conductors.json` (`floor` fields of all entries plus the project list), so a new project is reached without a code change. There is no widening step.

What stays narrow: Suite. A conductor reaches only its own Suite workspace (never another project's Suite workspace or another conductor's tab outside it), and only the sessions `default` and `Suite`. The Suite close rule (7.1 item 4) is unchanged.

### 7.3 Consequences for existing guardrail copies

- `.opencode/maestro/opencode.json` (many `HERDR_WS=w2 ... herdr-ws *` rules) and `.opencode/safety/maestro-safety.js:173-184` (regex `^HERDR_WS=(\S+) (\S+) (\S+) (\S+)(.*)$`) match a literal `HERDR_WS=` prefix and one workspace. They guard the OpenCode maestro (DGS-401/408). Decision: **unchanged and out of scope**. They keep `HERDR_WS=w2` which still means Floor-only; the OpenCode maestro is not a conductor in Suite. If a Suite conductor ever runs on OpenCode, that is a later ticket.
- `scripts/conductor/runner.ts:79-94` (`checkHerdr`, observer-grade) already accepts `--session <label>` and the read-only verbs. Works as is.
- `scripts/conductor/flux-herdr.ts:25-50` (`fluxRunner`) allows `HERDR_WS_BIN` with `agent list|get`, `pane read`, `agent prompt` only, no `--session`. Needs the session: it passes the conductor's session through `HERDR_SCOPE` env and `--session` as the first args (section 8).

## 8. Every place the probe lists under "Consequences"

Status words: **as is** (works untouched), **field** (needs a session field or a session argument), **breaks** (wrong after the move without a change).

| # | Place | file:line | Today | Status | Change |
|---|---|---|---|---|---|
| 1 | Registry | `~/.digismith-depot/conductors.json` | `note`, `workspace` per key | field | new fields 5.2; old entries valid |
| 2 | Registry reader (autonomous) | `packages/cli/src/autonomous/conductor.ts:8,20-37,51-57` | constant key `DigiSmith/digismith-conductor`; `workspace` must match `^w\d+$`; `promptConductor` runs `herdr-ws agent prompt <name> <msg>` with `HERDR_WS=<workspace>` | breaks (the conductor is no longer in `default`) | read `session`, `workspace` from the registry; find the target by `kind: factory` (fallback: the constant key); call `herdr-ws --session <S> agent prompt` with `HERDR_SCOPE`. Protected path (`autonomous/`) |
| 3 | Scan guard | `packages/cli/src/autonomous/scan.ts:166-180` | `conductorCheck` stops the scan when the entry has no `w\d+` workspace | as is | still true for the new shape; the message learns the session. Protected path |
| 4 | Conductor state: note path | `scripts/conductor/state.ts:84` | `conductors.json` -> `note` | as is | no session involved |
| 5 | Conductor state: herdr health | `scripts/conductor/state.ts:255-266` | `herdr --session default status server` and `tab list [--workspace W]` | field | `--session` and workspace come from the conductor's registry entry; the Floor line stays for workers (health shows both sessions: "Suite up; Floor up") |
| 6 | State refresh: Running rows | `scripts/conductor/refresh.ts:130-175` | workspace = `--herdr-workspace` or `^herdr (w\d+):` of the conductor card's `runs_on`; `herdr --session default agent list`; keeps agents of that workspace | breaks (runs_on of the conductor now points into Suite, but the workers are on the Floor) | workers are read from the conductor's `floor` workspace in `default` (registry); the conductor card's own `runs_on` is parsed with `parseRunsOn`, session and workspace only used to find the conductor, never the workers. The factory conductor reads all `floor` workspaces |
| 7 | `--herdr-workspace` / `HERDR_WS` flag | `scripts/conductor/cli.ts:55,83`; `docs/conductor-state.md:13` | one workspace, default session | field | flag stays (Floor workspace); `HERDR_SCOPE` is read for the pair; docs updated |
| 8 | Flux: wrapper | `scripts/conductor/flux-cli.ts:72`; `flux-herdr.ts:6-50` | needs `HERDR_WS`; no session | field | needs `HERDR_SCOPE` or `HERDR_WS`; `--session` as first arg for every herdr-ws call; `fluxRunner` allows the `--session` prefix |
| 9 | Flux targets | `scripts/conductor/flux-targets.ts:41-65`; `~/.digismith-depot/flux-targets.json` | note from `conductors.json`; one entry `token-economics-conductor` | as is | the target agent name is looked up in the registry's session; no change to the file format |
| 10 | Session cards: `runs_on` write | `scripts/session-cards/card-hook.ts:70` | `herdr <pane>` | breaks (pane ids repeat across sessions) | 5.3 format `herdr <session>/<pane>` |
| 11 | Session cards: sweep | `scripts/session-cards/session-sweep.ts:25-29,44` | `readLiveSessions` runs `herdr-ws agent list` with the caller's env (one workspace); `runs_on.startsWith("herdr")` | breaks for a conductor card in Suite (not listed, so "lost" by mistake) | read live sessions from both sessions in scope (`--session` per call, merged); `startsWith("herdr")` stays true for both formats |
| 12 | Session cards: validity | `scripts/session-card.ts:24,38,41`, `packages/cli/src/sessions/cleanup.ts:21` | `runs_on` required | as is | any non-empty string; the parse is separate |
| 13 | Identity card | `scripts/identity.ts:170` | `desktop` or `ssh` | as is | outside herdr; not a conductor card |
| 14 | Catch-up | `scripts/conductor/consult.ts:89` (remote), `state.ts` | `consult` reads the conductor's note, refreshes through state.ts | as is after row 5 | the "stale state" refresh (DGS-577) uses row 5 and 6 |
| 15 | Run records | `packages/cli/src/run/auto.ts:52,62`; `run/index.ts:27` | stores `HERDR_WORKSPACE_ID`, `TAB_ID`, `PANE_ID`, no session | field | add `herdr.session` (from `HERDR_SESSION`, unset = `default`); `dg run read` prints it. Old records have no session = `default`. This matters for the ticket conductor's own run record |
| 16 | Nightwatch watch | `~/.digismith-depot/bin/conductor-watch:36-40` | `herdr agent get <target>` with no `--session` (its environment decides: outside herdr it reaches `default`) | breaks for Suite targets | target syntax `Suite/emma-conductor` or `Suite/w7:p1`; the script splits on `/` and adds `--session`. Plain targets stay `default`. This script is outside the repo (depot); the new text goes into `scripts/herdr/` as a proposal and is installed by the conductor |
| 17 | Oculus live view | `packages/cli/src/oculus/live.ts:12,81-85`; `oculus/README.md:14` | one call with fixed argv `--session default agent list` | field | two fixed calls (`default`, `Suite`); each row gets `session`; the join to runs uses `(session, pane)`; fixtures extended |
| 18 | Bootstrap | `~/.local/bin/herdr-bootstrap.sh`, `~/.local/bin/herdr-boot.sh` | one session, one workspace per project, conductor in `$ws:p1` | breaks | section 4 |
| 19 | Runbook | `.digismith/sessions/workbox.md:9,24-45,414` | "conductor = tab 1 of a project workspace in `default`"; reboot steps; tab cleanup | breaks (text) | Layout, After a reboot, Suite and Floor sections rewritten; "Tab cleanup" gains the ticket-conductor close (untracked file, edited by the conductor) |
| 20 | OpenCode maestro guardrails | `.opencode/maestro/opencode.json`, `.opencode/safety/*` | literal `HERDR_WS=w2` | as is | 7.3: out of scope |
| 21 | Drift alarm | `~/.digismith-depot/bin/drift-check` (DGS-557) | repo sweep, no herdr | as is | not touched |

Also affected, found while reading: `skills/researcher/SKILL.md:33` and the Builder/Reviewer skills pass `--workspace <w>` to `dg run start` and `dg reviewer pack`. These are Floor workspaces (workers live there), so **as is**. `skills/reviewer/SKILL.md` and `skills/finishing-*` are protected paths and are not changed.

## 9. The move of today's conductors

Live conductors in `default` now (read from `herdr --session default agent list`, 2026-11-01 ~22:0x UTC+7): `digismith-conductor` (w2:p1), `token-economics-conductor` (w2:pK), `d3-conductor` (w2:pN, tab title "d3-maestro"), `dawn-conductor` (w2:p5E), `main-conductor` (w2:p5Q), `emma-conductor` (w3:p1). Not live: `scheduling-conductor` (depot folder with note, brief, `bin/`; no agent), the Soveron conductor (workspace w4 exists, no agent), Nightwatch (no agent). Workers that stay on the Floor: dgs-571, warren-researcher, dgs-666-refine, dgs-683-refine.

### 9.1 How a conductor moves without losing context

Decision: **handoff note, then a fresh start in Suite** (the flux path the project already proved: `digismith:handoff`, `scripts/conductor/flux*.ts`, `flux-targets.json`). Not a resume of the old Claude session id in the new session: a Claude session id works across herdr sessions, but two live copies of one id corrupt the history and herdr restore would resurrect the old one. The note is the source of truth in this project (`CLAUDE.md`: "live session notes ... live in the depot"), so a fresh session reading its note loses nothing the note does not already hold.

Per-conductor steps (a Maestro/conductor step, never an unattended Builder):
1. Preconditions: no running worker of its own (`herdr-ws agent list` shows none for it), input box empty, no pending order. Otherwise skip it for now.
2. It writes its handoff note (Done / Decisions / Next / Open problems) to its note path (table 9.2).
3. Registry: the entry gets `session: "Suite"`, `workspace`, `floor`, `kind` (hand edit by the Maestro, with a `.before-dgs-683` backup, as done for DGS-623).
4. The bootstrap starts the conductor in its Suite workspace and sends the flux wake text (`flux-targets.json` `wake`, default "Read your note and brief, say what you understood, wait for an order").
5. The Maestro checks `herdr --session Suite agent list` shows it and that it answers a catch-up.
6. Tab cleanup (decided by the Maestro: part of the migration, no per-batch ask to Jack): once the Suite copy passed the step 5 checks, the old Floor conductor agent is stopped and its tab closed by the migrating conductor/Maestro, one conductor at a time. The step 5 checks are the gate: the Suite copy lists and answers a catch-up, and the registry entry points at Suite. The close names the exact old tab id read from `herdr --session default agent list` just before. Never close a tab that holds a worker.

### 9.2 The list

| Conductor | Project / Suite workspace | Note path (the handoff target) | Order | Notes |
|---|---|---|---|---|
| `d3-conductor` | DigiSmith | `.digismith/sessions/d3-maestro/note.md` (old name; the note mentions it; verified at move time) | 1 | idle; simplest first move, the trial |
| `dawn-conductor` | DigiSmith | `~/.digismith-depot/sessions/DigiSmith/dawn-conductor/note.md` | 2 | |
| `token-economics-conductor` | DigiSmith | `flux-targets.json` entry: `.digismith/sessions/b3-maestro/note.md` | 3 | its brief lives in the old `b3-maestro` folder; keep it |
| `scheduling-conductor` | DigiSmith | `~/.digismith-depot/sessions/DigiSmith/scheduling-conductor/note.md` | 4 | not live: only a registry entry and the Suite start when Jack next needs it |
| `main-conductor` | DigiSmith | `~/.digismith-depot/sessions/DigiSmith/main-conductor/note.md` | 5 | leaves when its tickets are quiet |
| `emma-conductor` | Emma | `~/.digismith-depot/sessions/Emma/emma-conductor/note.md` (registry entry exists) | 6 | cwd `~/Workspace/Emma/shopify-hub` |
| `digismith-conductor` | DigiSmith | `.digismith/sessions/DigiSmith/note.md` (registry) | 7, last | it carries the factory line today; see 9.3 |
| Soveron conductor | Soveron | per `herdr-bootstrap.sh` (`soveron-maestro`); not live | n/a | registry entry only; started only when Jack needs it |

### 9.3 The factory conductor

`digismith-conductor` is both the project conductor and the factory conductor today (`conductor.ts:8` prompts it). To avoid moving the line and a conductor in one step:
1. First move `digismith-conductor` into Suite as a project conductor and keep `kind: factory` on it too (registry field `kind: ["project","factory"]` is allowed for this one period: `findByKind("factory")` returns it). The scan prompts it in Suite. No behaviour change for the line.
2. Later (DGS-641's ticket) a dedicated `factory-conductor` is created in Suite/Factory; its entry takes `kind: factory` and the old entry drops it. This is a registry edit plus a scan prompt; the code already reads the kind.

So DGS-683 delivers the place and the lookup; the split of the roles stays DGS-641.

## 10. Migration order and rollback

### 10.1 Order (nothing is live before step 6)

1. **Code, registry readers, `herdr-ws` scope, card format, run-record session, Oculus two-session read** merged to main with tests. All of it backward compatible: with no new field and no `HERDR_SCOPE`, every path behaves as today. (Ticket A.)
2. **Docs and runbook text** drafted in the repo; installed later. (Ticket A/B.)
3. **Boot files** written as proposals: `herdr-boot-suite.sh`, `com.jazurite.herdr-suite.plist`, new `herdr-bootstrap.sh`, new `conductor-watch`, new `herdr-ws` (deploy copy). (Ticket B.)
4. **Install by hand** (Jack for the root-owned plist; the conductor for files in `~/.local/bin` and the depot): backups first (`*.before-dgs-683`), then the new `herdr-ws`, then the plist, then `launchctl bootstrap system ...` and `herdr session list` shows `Suite` running. Order matters: the new `herdr-ws` must be in place first because it is backward compatible.
5. **Create the Suite workspaces** and a trial conductor: the new bootstrap in `--dry-run`, then for real with only d3-conductor (9.2 order 1). Check: it lists, answers, and a worker started by it in `default` works through `herdr-ws --session default`.
6. **Move the rest** in the 9.2 order, one per turn, each with the checks of 9.1.
7. **Flip the scan** (9.3 step 1): the registry entry of `digismith-conductor` gets its Suite fields; the next scan prompts it in Suite. Watch two scans (10 minutes).
8. **Floor clean-up**: any old conductor tab left (a conductor that was skipped in step 6 and moved later) closed by the same tab cleanup rule; `workbox.md` rewritten; Floor has no conductor tab.
9. **Ticket conductor** (Ticket C) goes live after step 8: first use on one real ticket.

### 10.2 Rollback

| After step | Rollback |
|---|---|
| 1 (code merged) | revert the merge; no live effect since nothing used the fields |
| 4 (install) | `launchctl bootout` the Suite daemon, restore the `*.before-dgs-683` files; the old `herdr-ws` is the same file minus the scope code |
| 5-6 (a conductor moved) | set its registry entry back (`session` removed or `default`, `workspace` = Floor id) from the `.before-dgs-683` backup; start it in `default` through the old bootstrap; it reads the same note. The note is untouched by the move, so nothing is lost; at worst one handoff cycle |
| 7 (scan flipped) | restore the registry entry of `digismith-conductor`; the scan prompts the Floor pane again on the next tick |
| 8 (tabs closed) | not reversible for the tab itself; the conductor is re-created by the bootstrap from its note (that is why each tab is closed only after its Suite copy passed the checks, and step 8 comes last) |

Stopping criterion: if a moved conductor does not answer a catch-up within 10 minutes of its start, stop the migration and roll that one back.

## 11. Testing approach (details in the plan)

Test first wherever code exists: the registry resolver, `parseRunsOn`, the `herdr-ws` scope parser (extends `scripts/opencode-boot/test-herdr-ws.mjs`: the existing refusal cases stay and new cases cover scope, third session, session override, Suite close rule), the card hook format, the refresh and state tests (extend `refresh.test.ts`, `state.test.ts`), the Oculus live fixture, the scan `conductorCheck`, `start-ticket` and `close` with a fake herdr runner. Real herdr tests use throwaway sessions (`suite-probe`-style, headless) and never touch `default` or `Suite`.

## 12. Risks

1. Pane ids repeat across sessions. Mitigation: every stored id carries a session (rows 10, 15, 17). A test fails if a stored id has no session after the change.
2. A conductor that outlives its registry entry (or the other way). Mitigation: bootstrap rewrites ids by label; sweep lists mismatches.
3. The Maestro's own session is outside herdr and unaffected. It reaches Suite with `herdr --session Suite ...` (probe: works from any shell).
4. The Workbox is already under load (seen on 2026-10-26: load 120+, swap 7/8 GB). A second herdr server and the same number of Claude processes: the move adds one server process, not more Claude sessions. Ticket conductors add one Claude per open ticket: the worker limit (DGS-665: 2 builders, 1 reviewer, 1 role) does not count them, because they are conductors, not workers. Decision: the plan caps open ticket conductors at 2 until DGS-640 headroom rules exist.

## 13. Decided (formerly "Questions for Jack")

Approved by the Maestro 2026-11-01 (checkpoint 1). No question is open.

1. **Cross-use of workers.** Decided: every conductor reaches its own Suite workspace and every project's Floor workspace; "own workers first" is a rule, not a limit; cross-project acts are logged (7.2, 7.1 item 5). No Maestro widening step. (Jack's own sentence.)
2. **Names.** Decided: Suite workspaces `Factory`, `DigiSmith`, `Emma`, `Soveron`; ticket conductor agents `tc-<ticket>` (for example `tc-dgs-683`); factory conductor `factory-conductor`.
3. **Ticket conductors.** Decided: a project conductor starts a ticket conductor only for a ticket that needs the full Builder -> Reviewer -> merge run; small attended work stays with the project conductor.
4. **Cap.** Decided: at most 2 open ticket conductors at a time until seat headroom (DGS-640) exists.

## 14. Out of scope

DGS-640 shifts, DGS-641's split of the roles and the Nightwatch behaviour, a conductor on OpenCode, an Oculus workspace, an extra conductor for overload (parked 2026-10-25), any change to Builder, Reviewer or finishing skills.


Suite is now Castle: the herdr session and every name were renamed in DGS-683 (the registry, scripts, daemon files, runbook). Read "Suite" in this spec and plan.md as "Castle".
