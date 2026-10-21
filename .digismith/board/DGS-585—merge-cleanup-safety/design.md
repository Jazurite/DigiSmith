# DGS-585 Nightwatch: merge and cleanup safety (spec)

Written 2026-10-22 (UTC+7). Order nw-07. Initiative Autonomous Operation DGS-548, J.5 Nightwatch DGS-580. Spec and plan only: no build until the Maestro orders it.

Warren sources (ideas only, no code copied): runtime-provider-contract §4.1, forge-auto-merge §3.1 and §4, warren-config "Fail-closed dispatch", good-first-issue-batch §3.

## Goal

Five safety parts in one ticket. Each one fails closed: when a check cannot run, the answer is "stop", never "go on".

1. Salvage before a worktree is removed.
2. A night merge gate that refuses a bad merge.
3. Strict reading of the guardrail keys in `.digismith/config.yml`.
4. An already-done check before the claim.
5. A drift section in the morning report.

Parts 1 to 3 are the Maestro's decisions 1 to 4. Part 4 and 5 are decision 5.

## Part 1: Salvage

New command `dg salvage --ticket <KEY> [--worktree <path>] [--dry-run]`. Code in `packages/cli/src/salvage/`.

Steps, in this order. Any failed step stops the command with exit 1 and a message. Later steps do not run.

1. Find the worktree and the branch. Without `--worktree`, take the one entry of `git worktree list` whose branch starts with `<KEY>__`. Zero or two entries: stop.
2. Decide if salvage is needed. It is needed when the tree is dirty (tracked changes or untracked files) or the branch is not in `git branch --merged main`. Neither: print `nothing to salvage` and exit 0. The bundle is then not written.
3. Secret check, only when the tree is dirty, before any commit. List the untracked files that git does not ignore (`git ls-files --others --exclude-standard`). A file matches when its name matches `.env*`, `*.pem`, `*.key`, `*secret*` or `*token*` (case-insensitive, by base name), or when it is larger than 5 MB. Any match: print `not salvaged: <files>`, exit 1, make no commit, write no bundle, push nothing. The cleanup then stops and Jack decides. The check lists names only and never reads a file.
4. WIP commit, only when the tree is dirty: `git add -A`, then `git commit --no-verify -m "wip(<key>): salvage before teardown"`. The title is a conventional commit and has no attribution line. `--no-verify` is on purpose: a rescue must not be stopped by a hook.
5. Bundle: `git bundle create ~/.digismith-depot/salvage/<KEY>-<UTC>.bundle <branch>`, with `<UTC>` as `YYYYMMDDTHHMMSSZ`. Then `git bundle verify` on the file. A bundle that does not verify is a failure.
6. Push: `git push origin <branch>:refs/heads/rescue/<KEY>`. A rejected push is a failure. No `--force`.

Exit 0 only when the needed steps all passed. The command prints one line per step and the bundle path. It never deletes a file, branch or worktree. Git, the clock and the depot directory are injected so tests can fake them.

Where it is called:

- **finishing-a-development-branch cleanup.** `post-merge-cleanup.ts` runs salvage before its worktree-removal step. Its existing check "branch is merged" stays. A dirty tree now salvages first (today it only stops and lists the files). A failed salvage stops the cleanup and changes nothing further. The Step 6 "Discard" path (explicit request, unmerged branch) also runs `dg salvage` before it removes anything; a failed salvage stops the discard.
- **The watchdog's lost path.** The watchdog never deletes and never sends keys, and that stays. It also does not run salvage (that writes git state and pushes). It asks for it in two places, as text: the `lost` attention comment and the `restart` order text (`ORDER_TEXTS.restart` in `act.ts`) gain the line `before any teardown run dg salvage --ticket <KEY>; if it fails, stop and tell Jack`. The conductor or Jack runs the command. A lost run's worktree is only removed by a cleanup, and the cleanup always salvages (above), so the ask is a reminder and not the only guard.

## Part 2: Night merge gate

New command `dg autonomous merge-gate --ticket <KEY> [--repo <path>]`. The conductor's merge step calls it before the merge, and the merge order of DGS-582 (`ORDER_TEXTS.merge`) names it: `<KEY>: run dg autonomous merge-gate first; merge per hooks 01-03 only if it says go, then release merged`.

Exit 0 and the word `go`, or exit 1 and `refused: <reason>`. Checks:

1. Read the policy from `main`, never from the branch: `git show main:.digismith/config.yml`. The config file on the branch is not read. A config that cannot be read or parsed refuses (fail closed), with the error text.
2. Branch has 0 commits ahead of main (`git rev-list --count main..<branch>`): refuse `no-commits`.
3. The diff `git diff --name-only main...<branch>` touches a protected path: refuse `protected-path: <path>`. One refusal lists every touched protected path.
4. The branch cannot be found: refuse.

Protected paths come from `nightwatch.protected_paths` (a list in `.digismith/config.yml`, read from main). A path ending in `/` matches the folder, a `*` matches within one path segment, anything else matches exactly. If the key is absent, the built-in list is used: `hooks/`, `hooks/hooks.json`, `.digismith/config.yml`, `skills/finishing-*/`, `skills/reviewer/`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/mandate.yml`, `.digismith/profiles/`. The plan adds the same list to `.digismith/config.yml` so the file is the source. (The ticket names "hooks.json" and "the reviewer primitives"; the two reviewer paths are where those live on main today.)

A refusal opens an attention item of kind `refused` (DGS-583 shape): `appendOpen` with run `<KEY>`, kind `refused`, cause `merge-refused: <reason>` (cause code `merge-refused`, already in `causes.ts`). The gate writes it itself, so the morning report and the notify pass show it. The gate does not merge, release or touch the lock; the conductor then runs `dg autonomous release --ticket <KEY> --result failed --cause merge-refused`.

Day merges (Jack present) do not call the gate.

## Part 3: Strict config for guardrail keys

Guardrail keys are every key under `nightwatch:` (`protected_paths`, `budgets.*`, and keys added later). All other keys keep today's behaviour (`scripts/config-parse.ts` callers).

New `packages/cli/src/autonomous/guardrails.ts`: `readGuardrails(text)` returns `{ protectedPaths, budgets }` or a list of problems. A problem is any of: the file does not parse (`ConfigError` inside the `nightwatch:` block), a wrong type for a guardrail key (`protected_paths` not a list), a budget that is not a positive whole number, an unknown key under `nightwatch.budgets`. A `ConfigError` outside the `nightwatch:` block is not a guardrail problem.

The cli code runs under `node --experimental-strip-types` and is built to `dist/index.js`. It does not import from `scripts/`. The reader is a small strict parser in `guardrails.ts` in the style of `budgets.ts`, with its own tests. A test feeds the same fixtures to it and to `scripts/config-parse.ts` so the two agree on what is a syntax error.

Effect:

- **Dispatch stops.** `runScan` reads the guardrails (from main, same helper as Part 2) after the breaker check and before the claim. A problem: no claim, an event `guardrail-config` in the run state, an attention item (run `-`, kind `failed`, cause `bad-guardrail-config`), and the scan outcome `guardrail-config`. The item closes itself on the first scan that reads clean.
- **The merge gate refuses** on the same problems (Part 2, check 1).
- **The watchdog keeps its DGS-583 contract.** A bad budget still keeps the default and opens `bad-budget-config`; `readBudgets` is not changed. The scan stop is the new part.

## Part 4: Already-done check before the claim

In `runScan`, after `checkReady` passes and before `claim`. Read-only: git commands on origin/main and the tracker's reads. The tick already runs `git fetch` in the main checkout; the scan runs `git fetch origin main` too and treats a fetch failure as "cannot check" (skip with reason, no claim).

Two checks, new file `packages/cli/src/autonomous/already-done.ts`:

1. **Work already merged.** It counts in only two cases. (a) A commit on origin/main whose subject scope names the key: `(dgs-123)` or `(DGS-123)`, as in `feat(dgs-123): ...` (the scope is the text in the first parentheses of the subject). A key mentioned anywhere else (body, a later part of the subject, a `Refs` line) does not count. (b) A branch `<KEY>__*` (local or origin) is an ancestor of origin/main (`git merge-base --is-ancestor`). Either match: skip with reason `already-merged: <sha>`. The scan comments once on the ticket (the existing skip-comment path) and raises an attention item (run `<KEY>`, kind `unknown`, cause `already-merged-but-open`) so Jack sets the ticket right. It does not change the ticket status itself.
2. **Each blocker merged on main, not only done in ClickUp.** For each blocker with `done: true`: look for a branch `<KEY>__*` locally, on origin, or as `rescue/<KEY>` on origin. If one exists, it must be an ancestor of origin/main (or match rule 1(a)); if not, skip with reason `blocker-not-on-main: <key>`. A `rescue/<KEY>` branch that is not on main means the work was salvaged, not merged, so it blocks. A blocker with no branch at all passes on ClickUp `done` (a ticket with no code has nothing to merge). There is no other exemption.

Skip reasons join the existing `REASON` list so the skip comment, the event and the report show them.

## Part 5: Morning report drift section

`buildReport` gets a new section, `Drift`, after `Still building`. For each ticket with a `claim` event in the report period: compare the ClickUp status now with git.

| ClickUp status | Git on main | Drift line |
|---|---|---|
| done | no commit naming the key | `<KEY>: done in ClickUp, nothing on main` |
| in progress, to do, or any open status | a commit naming the key is on main | `<KEY>: <status> in ClickUp, merged on main (<sha>)` |
| any | the claim's branch exists with 0 commits ahead | `<KEY>: branch has no commits` |
| matches | | no line |

No drift prints `none`. `runReport` reads the statuses (`Tracker` gets a read-only `statusOf(taskIds)`; a failed read prints `<KEY>: status unreadable` so a gap is shown, not hidden). `buildReport` stays a pure function: the git facts and statuses come in as an argument, and a fake supplies them in tests. The same drift lines go into the ClickUp comment on DGS-548, because the report text is the comment text.

## Order of work and files

1. `guardrails.ts` and its tests (Part 3 reader). Parts 2 and 4 use it.
2. `salvage/` and the `post-merge-cleanup.ts`, SKILL.md and order-text changes (Part 1).
3. `merge-gate` command and the `ORDER_TEXTS.merge` change (Part 2); protected paths added to `.digismith/config.yml`.
4. Scan changes: guardrail stop and already-done check (Parts 3 and 4).
5. Report drift (Part 5).
6. Runbook text and `WATCHDOG.md` note; the hooks 01-03 merge order names the gate.

Every `packages/cli/src` file runs under `node --experimental-strip-types`: no parameter properties, enums or namespaces. The DGS-587 smoke test strips every file, so a new file that breaks the rule fails it.

## What the plan tests without Jack

Fakes only: no real ClickUp, herdr, depot or live API, and nothing touches port 4300.

- Salvage, merge gate and already-done run against temporary git repos built in the test (a bare "origin", a main checkout, a worktree). The depot directory is a temp dir. The push goes to the temp bare repo.
- Salvage cases: clean merged tree (nothing to salvage), dirty tree (WIP commit, bundle verified, rescue ref on the fake origin), each secret pattern and a file over 5 MB (exit 1 `not salvaged`, no commit, no bundle, no push, cleanup removes nothing), unmerged clean branch, push rejected (exit 1, cleanup stops), bundle verify fails, two worktrees match, cleanup script with a failing salvage removes nothing.
- Gate cases: 0 commits ahead, each protected pattern, a branch that changes `.digismith/config.yml` to loosen the list (policy still read from main), unreadable config, clean branch (go), refusal writes one `refused` item and writes it once.
- Guardrails: each problem class, an error outside the `nightwatch:` block is ignored, parity with `scripts/config-parse.ts`, scan stops with the fake tracker and makes no claim, item closes on a clean scan.
- Already-done: merged branch, key in a main commit subject scope (both cases), key only in a body or elsewhere in the subject (does not count), blocker with an unmerged branch (local, origin and rescue/ each), blocker branch on main, blocker with no branch passing on done, a failed fetch.
- Drift: all rows of the table, an unreadable status, the no-drift case; `buildReport` snapshot with and without drift.
- The strip-types smoke test and the typecheck cover the new files.

## First use

After the merge the Maestro rebuilds the CLI dist and runs `scripts/nexus-api/install.sh` (same as DGS-583). Then:

1. `dg salvage --ticket DGS-585 --dry-run` on a finished ticket's worktree prints the plan and writes nothing.
2. `dg autonomous merge-gate --ticket <KEY>` on a night branch: `go`. On a throwaway branch that edits `hooks/hooks.json`: `refused: protected-path`, and `dg autonomous attention` lists the `refused` item.
3. Break `nightwatch.budgets.building` on a scratch copy of the config: the next `dg autonomous scan --dry-run` reports `guardrail-config` and claims nothing.
4. The next morning report has a `Drift` section. The first real night is the real test of the already-done check.

## Open points

- Rescue branches stay on origin until Jack deletes them; nothing here cleans them (deletes need Jack).
