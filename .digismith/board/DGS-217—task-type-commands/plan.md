# Plan: DGS-217 task-type commands (checkpoint 1)

Worker `dgs-217`, 2026-10-10. Branch `task-type-commands`, worktree `.worktrees/dgs-217`.
One branch for the whole set: the six parts share the Frontdoor client and the CLI group. pnpm only, TDD (vitest), title-only commits.
No code until "approved: checkpoint 1".

## 1. Order of parts and what each ships

| # | Ticket | Ships |
|---|---|---|
| 1 | DGS-133 | `FrontdoorClient` in `packages/clickup-client`. Reads `CLICKUP_FRONTDOOR_AUTH` (a single-quoted value) from `~/.digismith-depot/.env`. Host is config with a default (`frontdoor-prod-ap-southeast-2-2.clickup.com`). Workspace id from `CLICKUP_TEAM_ID`. HTTP 401 or 403 gives one error: "Frontdoor session expired or not enough, capture a new one". `check-credentials` reports the Frontdoor auth as present or missing, never the value. Same rate limiter as `ClickUpClient`. Methods for the type calls only (list, create, update, merge); field calls stay in DGS-134/135. |
| 2 | DGS-138 | `dg clickup frontdoor import-auth` and `dg clickup frontdoor dump`. `dump` is the masked body dump moved from `~/.digismith-depot/captures-dump.py`: bodies only, never a header, JWTs masked, `--match <path regex>` filter, default filter = no filter beyond Frontdoor-looking calls. `import-auth` finds the `frontdoor-prod-*` request, writes its Authorization header to `.env` as `CLICKUP_FRONTDOOR_AUTH='<value>'` (replaces an existing line, single quotes), prints only "stored" and the JWT `exp` in UTC+7 first, UTC in brackets. It never moves or chmods the export. Default `--capture` = newest `Raw_*` in `~/Downloads/Proxyman Captures/ClickUp/`. Capture procedure documented in the command help and README. |
| 3 | DGS-218 | `dg clickup list-task-types` (id, name, plural, description) and `--type <name or id>` on `create-task` and `update-task` (sets `custom_item_id`). Name match is case-insensitive on singular or plural. Unknown name = error listing the valid names. A name that matches several types = error asking for the id. Numeric id accepted; 0 = plain task, 1 = Milestone. Public API only. |
| 4 | DGS-217 | `dg clickup create-task-type --name --plural [--description] [--icon]` (Frontdoor POST `customItem`, default icon `fas` `user-alt`, as captured). An existing name (singular or plural) is an error. |
| 5 | DGS-221 | `dg clickup update-task-type --type [--name] [--plural] [--description] [--icon]`. Reads the type first and sends the full body (PUT is not a patch). A new name that another type has is an error. |
| 6 | DGS-222 | `dg clickup delete-task-type --type --merge-into` (Frontdoor PUT `.../merge`). `--merge-into` is required, `0` must be named. Refuses ids below 1000. Prints the task count and target and stops (see section 3). Tasks are never deleted. |

Call shapes come from capture `Raw_10_10_2026_12_22_34` calls [129], [131], [136], [148], [159]. I read them only with `dump`, after part 2 ships (parts 1 and 2 use the shapes written in the tickets, so I need no early capture read).
A better order found: none. Part 3 only needs the public API, but it keeps its place because Epic/Initiative need it for the final `--type` step.

## 2. The one narrow allow rule (Jack approves once)

In DigiSmith's `.claude/settings.json` (project, committed):

```json
{ "permissions": { "allow": [
  "Bash(dg clickup frontdoor import-auth:*)",
  "Bash(dg clickup frontdoor dump:*)"
] } }
```

Exactly those two commands. Nothing else under `dg clickup` is allowed by it. Matching variants for the `digismith` binary name and for `node .../packages/cli/...` invocations are NOT added; the worker runs `dg`.
The commands print no secret by design, and `dump` reads only bodies. Neither writes to ClickUp.
Until the branch merges, the rule has no effect on `dg` (it ships in the new build). So Jack adds it to the repo `.claude/settings.json` on `main` (or approves my commit of it on the branch) before I run `dump` against the real capture.

## 3. Getting the Frontdoor commands past the auto-mode classifier

The block today was a one-off script `--send` (a write using the session token, labeled "Auto-Mode Bypass"). I will not rename verbs or hop agents. Proposed guardrail, in three layers:

1. **Read side (`import-auth`, `dump`):** the allow rule above. This is the route the classifier's own denial message names.
2. **Write side is a dry run by default.** Every Frontdoor write command (`create-task-type`, `update-task-type`, `delete-task-type`) prints the exact call it would make (method, path, body, no headers) and exits 0 without sending. It sends only with `--yes`. This is the same pattern as `frontdoor-create-profile-field.py` (dry run, then `--send`).
3. **Jack's yes is a rule or a prompt, his choice.** Two options for the write side; I recommend A:
   - **A (recommended):** no allow rule for the writes. I run the dry run (auto-approved: it only prints). For the real call, I run the same command with `--yes`, and Claude Code asks Jack at that one call. Jack's approval is the human gate. It is exactly what the task-type ticket wants ("with Jack's yes").
   - **B:** an allow rule per command, e.g. `Bash(dg clickup create-task-type:*)`. Only if Jack wants Epic/Initiative created without a prompt. Not for `delete-task-type`, which keeps its prompt always.
4. **delete-task-type:** prints the task count (public API, `custom_items[]` filter) and the target, then stops. It sends only with `--yes --confirm-count <N>` where N must equal the printed count, so a stale yes cannot remove a type that gained tasks.

If the classifier still blocks a `dg` command after the rule is in, I stop and report the denial text. I do not retry in another form.

## 4. Order of work, review, merge

- TDD per part: failing vitest first (mocked axios, injected client factory as the existing commands do), then code, one commit per part, title only, e.g. `feat(clickup-client): add FrontdoorClient with session auth`.
- Whole-branch review by Sol after part 6, I verify each finding.
- Then I stop and report. The maestro orders the merge after Jack's yes (version bump and `plugin update` are in the maestro's order).
- After the merge, with Jack's yes, the maestro (not I) runs the ClickUp writes: Epic and Initiative via `dg`, then `--type` on DGS-25, DGS-182, DGS-213. I touch no ClickUp state and no task type other than through tests with mocks.

## 5. Open points for Jack

1. Option A or B for the write commands (section 3).
2. Icon default: `fas` `user-alt` as in the capture, or none. The order says Epic = bolt and Initiative = flag, so `--icon` is a real option. I add it to create and update.
3. `ssh_key` preference for this repo is unset. I did not ask (not needed for the build).
