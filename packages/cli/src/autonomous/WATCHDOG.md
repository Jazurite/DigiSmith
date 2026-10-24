# The Nightwatch watchdog (DGS-583)

The watchdog looks at every open run and says what state it is in. It writes a list of items that need Jack. It uses no model tokens. It never sends keys to a pane. It only runs `pane list`.

Command: `dg autonomous watch`. The Nexus scheduler runs it every 5 minutes, all day (job `nightwatch-watchdog`). Runs older than 7 days with no `ended` event are skipped.

Role scope (DGS-598): only builder, reviewer and scout runs are classified. A maestro, conductor or other run is skipped before its events are read: it gets no item and no comment. An open blocked or stalled item of such a run is closed with the note "role not watched". Oculus still lists these runs, as healthy or ended.

## The five states

- `healthy`: the run moves and is inside its time budget.
- `blocked`: the last `blocked` event has no later `tool` or `turn_end` event. A prompt waits for an answer.
- `stalled`: the run is alive but has been in one phase longer than its budget.
- `lost`: the pane is gone, or the run has been silent for 30 minutes.
- `ended`: the run has an `ended` event.

## The check order

`classify` stops at the first rule that matches:

0. The role is not builder, reviewer or scout: ended when it has ended, else healthy.
1. An `ended` event: `ended`.
2. The pane is gone: `lost`.
3. A `blocked` event with nothing after it: `blocked`. This beats silence.
4. No event for 30 minutes: `lost`.
5. The phase is over its budget: `stalled`.
6. Otherwise: `healthy`.

An unknown pane (herdr did not answer) never makes a run lost by itself.

## Files in the depot

All files are in the autonomous directory (`~/.digismith-depot/autonomous`, or `AUTONOMOUS_DIR`).

- `attention.jsonl`: one line opens an item, a later line with `resolved: true` closes it. The file is only appended to. There is one open item per run and kind. Items carry `causeClass` and `retryEligible`. Only `lost` items are retry eligible, and nothing retries in DGS-583 (DGS-588 does that).
- `notify-state.json`: which items already got a ClickUp comment, and when each ticket and kind last got one. Limits: one comment per ticket and kind per hour, 10 per pass. A failed comment stays pending and is tried again.
- `breaker.json`: the circuit breaker. Two failed releases in a row open it. A merged release resets the streak. A damaged file reads as open.

Item run keys: a failed release uses the ticket key. The breaker uses `breaker` (kind `failed` for an open breaker, kind `unknown` for an unreadable file).

## The budgets config block

In `.digismith/config.yml`:

    nightwatch:
      budgets:
        building: 45   # minutes
        review: 60
        merge: 20

These are the defaults. A value must be a positive whole number. A bad value keeps the default and opens a `bad-budget-config` item.

## The three commands

- `dg autonomous watch [--dry-run]`: one pass. `--dry-run` writes nothing.
- `dg autonomous attention [--json]`: list the open items. `dg autonomous attention resolve <id> [--note ...]` closes one.
- `dg autonomous resume`: close the breaker (`dg autonomous back` also does it).

The watchdog closes `blocked` and `stalled` items itself when the run moves on. It never closes a `lost` item. Only Jack does that.

## Merge and cleanup safety (DGS-585)

Five checks. Each one fails closed: when a check cannot run, the answer is "stop".

### dg salvage

`dg salvage --ticket <KEY> [--worktree <path>] [--dry-run]` saves a ticket's work before a worktree is removed. It never deletes a file, a branch or a worktree. `--dry-run` prints the plan and writes nothing.

Steps, in order. A failed step stops the command with exit 1:

1. Find the one worktree whose branch starts with `<KEY>__`.
2. If the tree is clean and the branch is merged into main: print `nothing to salvage`, exit 0.
3. Check the files of every commit in `main..branch`, because the push sends them all. A file that matches the secret rule stops the command.
4. If the tree is dirty: check the untracked and changed files the same way. Then make a WIP commit (`--no-verify`).
5. Write a bundle to `~/.digismith-depot/salvage/<KEY>-<UTC>.bundle` and verify it.
6. Push the branch to `rescue/<KEY>` on origin. No `--force`. If that push is rejected because `rescue/<KEY>` has diverged, say so and push to `rescue/<KEY>-<UTC>` (the bundle stamp) instead; the output names the branch pushed.

The secret rule matches a base name of `.env*`, `*.pem`, `*.key`, `*secret*` or `*token*` (any case, any folder), and any file over 5 MB. The check reads names and sizes only. A match prints `not salvaged: <files>; Jack decides`. It makes no commit, no bundle and no push.

The cleanup in `finishing-a-development-branch` runs salvage before it removes anything, and so does the Discard path. A failed salvage stops them. The watchdog does not run salvage. The `lost` comment and the restart order ask the conductor to run it.

Known limit: when salvage commits a dirty tree on a merged branch, `git branch -d` then refuses to delete that branch. The branch stays. Jack decides.

### dg autonomous merge-gate

`dg autonomous merge-gate --ticket <KEY> [--repo <path>]` runs before a night merge. It prints `go` and exits 0, or prints `refused: <reason>` and exits 1.

It refuses when:

- the key is not a ticket key (`bad-key`; nothing is written to attention);
- the policy cannot be read from main, or has a guardrail problem (`config`);
- there is not exactly one branch `<KEY>__*` (`no-branch`);
- the branch has 0 commits ahead of main (`no-commits`);
- the branch changes a protected path (`protected-path`; one refusal lists every path).

The diff lists a rename as a delete plus an add, so both sides count. A delete of a protected path counts too.

A refusal opens an attention item of kind `refused` (cause `merge-refused: <reason>`). The conductor then releases with `--result failed --cause merge-refused`. The gate does not merge, release or touch the lock. Day merges do not call it.

Protected paths come from `nightwatch.protected_paths` in `.digismith/config.yml`. A path ending in `/` matches the folder, a `*` matches inside one path segment, anything else matches exactly. Without the key, the defaults apply: `hooks/`, `hooks/hooks.json`, `.digismith/config.yml`, `skills/finishing-*/`, `skills/reviewer/`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/mandate.yml`, `.digismith/profiles/`.

### Strict guardrail config

The reader `packages/cli/src/autonomous/guardrails.ts` judges the whole top-level `nightwatch:` block. `scripts/config-parse.ts` skips that block, so the reader is the only judge of it. A problem is a syntax error inside the block, a wrong type, a budget that is not a positive whole number, or an unknown key under `nightwatch.budgets`. Any problem stops `dg autonomous scan`: no claim, an event `guardrail-config`, and an attention item with cause `bad-guardrail-config` (own run key `guardrails`, so it never shares a slot with `bad-budget-config`). The item closes on the first scan that reads clean. The merge gate refuses on the same problems. The watchdog keeps its own rule: a bad budget keeps the default and opens `bad-budget-config`.

### Policy comes from local main

The gate and the scan read the policy with `git show main:.digismith/config.yml`. That is the local `main` ref, never the branch. The scan runs `git fetch origin main`, but that does not move local `main`. Open point: the Maestro must keep local `main` current, or the gate and the scan judge an old policy.

### Already-done and blocker rules

The scan checks these after `checkReady` and before the claim, on `origin/main` after a `git fetch origin main`. A failed fetch skips the ticket (no claim).

- Already merged: a commit on `origin/main` whose subject scope names the key, such as `feat(dgs-123): ...`. A key anywhere else does not count. Rule (b), a `<KEY>__*` branch that is an ancestor of `origin/main`, needs a commit on that branch whose scope names the key. It is in effect subsumed by rule (a). A hit skips with `already-merged: <sha>` and opens an attention item (run `<KEY>/already-merged`, kind `unknown`, cause `already-merged-but-open`). The scan never changes the ticket status.
- Blockers (a blocker that is done in ClickUp), checked in this order: (1) a main commit scope names the key: passes, even when a rescue branch exists (merged, then salvaged). (2) Else an unmerged rescue branch (`rescue/<KEY>` or `rescue/<KEY>-<UTC>`, local or origin, not an ancestor of origin/main) blocks with `blocker-not-on-main: <key>`. (3) Else a branch of the key that is an ancestor of origin/main passes (pure ancestry). (4) Else no branch at all passes; a `<KEY>__*` branch not on main blocks.

### Drift

The morning report has a `Drift` section after `Still building`. For each ticket claimed in the period it compares the ClickUp status (read with `Tracker.getStatus`) with git:

- `<KEY>: done in ClickUp, nothing on main`
- `<KEY>: <status> in ClickUp, merged on main (<sha>)`
- `<KEY>: branch has no commits`
- `<KEY>: status unreadable` when ClickUp does not answer.
- `<KEY>: git facts unreadable` when git cannot be read.

No drift prints `none`. The same lines go into the ClickUp comment on DGS-548.
