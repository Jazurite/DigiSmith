# X.1 handoff — paused mid Task 6 (live VPS verification), uncommitted fixes on disk

**Branch:** `worktree-x1-vps-session-herdr`, worktree at
`D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\x1-vps-session-herdr`. **Not pushed** — this
branch has never been pushed to origin.

**Status:** All 6 tasks' worth of code exist, but Task 6 (live verification) is unfinished and
there are real **uncommitted changes on disk right now**. Do not lose them — see "Uncommitted
work" below before doing anything else.

## Why paused here

Session was asked to stop mid-Task-6 to write this handoff (token/context concern raised by
Jack mid-turn), not because of an error or a blocker. Everything found so far is real, verified,
and either already fixed or deliberately deferred — this is a clean pause point, not a recovery
situation.

## What's done

- **Plan written and pushed to `main`** (not this branch): `.digismith/docs/X/X.1-vps-session-herdr/plan.md`,
  commit `8d41582`, later amended with a pre-flight-scan DRY fix, commit `a704fce` (both on `main`,
  already pushed — only the branch/worktree below is unpushed).
- **Worktree created**, baseline tests confirmed clean (81/81) before starting.
- **Tasks 1-5, each implemented + task-reviewed clean, in order:**
  | Task | What | Commit(s) |
  |---|---|---|
  | 1 | Extract `resolveDigismithRepo` to `packages/cli/src/shared/digismith-repo.ts` | `da7c6ee` |
  | 2 | `VpsConfig`: `tmux_session` → `workspace_label`/`agent_name` | `b730f6a` |
  | 3 | Rewrite `vps/checks.ts` against herdr | `f1beee4` |
  | 4 | Rewrite `vps/status.ts` | `8851763` |
  | 5 | Rewrite `vps/connect.ts` + `skills/depot/SKILL.md` | `76407c6`, `f955ec8` (fix: stale `shared.test.ts` fixture Task 2 broke) |

  Ledger with full detail (offload-skip reasoning, deferred minors, review verdicts) is at
  `.superpowers/sdd/plan/progress.md` inside this worktree — read it before re-deriving anything.
  All 5 task-reviewer verdicts were **Approved**, spec ✅, only Minor/deferred findings (recorded
  in the ledger, none blocking).

- **Task 6 (live verification) — in progress, real infra work already done:**
  1. `pnpm --filter @digismith/cli build` — clean.
  2. Local `~/.digismith-depot/vps.json` updated to X.1's shape (`workspace_label: "digismith-main"`,
     `agent_name: "opencode-main"`). **Old V.3-shaped config backed up at
     `~/.digismith-depot/vps.json.v3.bak`** in case of rollback.
  3. `dg vps status`/`dg vps connect` run live against the real VPS (`46.225.49.140`). herdr,
     toolchain, and TokenReply credentials were already present from the original design spikes —
     only the workspace/agent needed creating, and `connect` created it successfully.
  4. **Confirmed live: the design's one open assumption is TRUE.** Killed the OpenCode process
     inside the herdr pane (`kill -9`) — the pane/workspace survived (`herdr workspace list` still
     showed it), only the *agent registration* for that name went away
     (`herdr agent get` → `agent_not_found`). This was the entire point of X.1 over V.3's tmux
     approach, and it's now live-confirmed, not just spike-confirmed.
  5. **Found + fixed live, 2 real bugs** (both already fixed on disk, see "Uncommitted work"):
     - `buildAttachArgs` (the final interactive-attach command) was missing the
       `HERDR_PATH_PREFIX` export every other herdr command already carries — the design doc's
       own literal attach-command snippet had the same omission. Confirmed live: attach failed
       with `herdr: command not found` before the fix.
     - herdr's own CLI writes its JSON error responses to **stdout**, not stderr — but
       `connect.ts`'s and `status.ts`'s error-reporting for herdr-specific command failures only
       read `.stderr`, so real failures showed up blank (`"failed to start the OpenCode agent — "`
       with nothing after the dash). Fixed by falling back to `.stdout.trim()` when `.stderr` is
       empty, at the three spots that call real herdr commands (workspace-create failure,
       agent-start failure in `connect.ts`; herdr-server-check detail in `status.ts`). Left
       `.stderr`-only reads alone at the spots that are genuinely SSH-level (reachability check,
       scp failure, and the local `print-config.ts` spawn, which already writes its own errors to
       stderr correctly).
  6. **Found + deliberately deferred** (Jack's explicit call, both questions answered together):
     `herdr workspace create` does not dedupe by label — every crash-and-reconnect cycle through
     `connect`'s recovery path abandons the surviving pane and creates a brand-new duplicate
     workspace instead of reusing it. Not a correctness bug (the new agent does end up healthy),
     just resource clutter. Filed as `backlog/vps-connect-workspace-dedup-x1.md` (new file,
     untracked — see "Uncommitted work"). **This backlog item is not yet linked from
     `backlog/README.md`** — I was mid-edit adding that pointer line when this handoff was
     requested.
  7. **Live VPS is currently in a clean, healthy state** — manually verified: exactly one
     `digismith-main` workspace (`w2`), `opencode-main` agent alive and idle on it, confirmed via
     `dg vps status` (all `[OK]`). The two duplicate test workspaces created during investigation
     (`w3`, `w4`) were closed (`herdr workspace close`) before this pause. No cleanup owed on the
     VPS side beyond what's already done.

## Uncommitted work — do this first when resuming

```
 M packages/cli/src/vps/connect.test.ts   (buildAttachArgs test updated for the PATH-prefix fix)
 M packages/cli/src/vps/connect.ts        (buildAttachArgs fix + stdout/stderr fallback ×2)
 M packages/cli/src/vps/status.ts         (stdout/stderr fallback ×1)
?? backlog/vps-connect-workspace-dedup-x1.md   (new backlog item, not yet linked from README.md)
```

All changes are already verified: `pnpm --filter @digismith/cli test` → 83/83 pass (confirmed
after these fixes, not before). Rebuild (`pnpm --filter @digismith/cli build`) before any further
live testing — the `dist/` output on disk right now predates these fixes.

**Next steps in order:**

1. Add the backlog pointer line to `backlog/README.md` (one line, matching the existing list's
   style — see the file for the convention) for `vps-connect-workspace-dedup-x1.md`.
2. Commit the four changes above as one commit (small, live-verification bug fixes — plain title,
   no AI attribution, e.g. `fix(vps): reuse HERDR_PATH_PREFIX in attach, read stdout for herdr
   errors`), plus the new backlog file.
3. Append a ledger entry to `.superpowers/sdd/plan/progress.md` recording this as part of Task 6
   (pane-survival confirmed true, two bugs found+fixed live, dedup gap deferred to backlog per
   Jack's explicit choice).
4. **Resume Task 6 from its own Step 7** (plan.md's Task 6 section): re-confirm SSH-disconnect
   survival against the actual shipped/fixed code path (disconnect, reconnect, `dg vps status`
   again). Step 6 (pane-survival) is already done — don't redo it.
5. **Task 6 Step 8 — V.3 migration cleanup, not yet done, needs Jack's go-ahead again if resuming
   in a new session:** kill the old `claude-main` tmux session, remove `~/start-claude.sh`, remove
   `claude`'s old credentials file on the VPS. Jack already approved doing this in this session
   (alongside the pane-survival kill) but it was not reached before the pause — confirm intent is
   still current before running it, since it's destructive and this file may be read well after
   that approval.
6. Task 6 Step 9 — commit the final verified state (likely nothing further to commit if step 4-5
   above are clean).
7. **Final whole-branch review**: `scripts/review-package PLAN_FILE MERGE_BASE HEAD` (MERGE_BASE =
   `git merge-base main HEAD` from this worktree), dispatch on the most capable available model
   via `superpowers:requesting-code-review`'s `code-reviewer.md`, per
   `subagent-driven-development`'s Final Review section. Point it at the ledger's deferred-minor
   lines (several already recorded across Tasks 1-5) so it can triage what must be fixed before
   merge.
8. If findings come back: ONE fix dispatch, ONE scoped re-review, adjudicate residuals — no second
   fix wave.
9. Once clean: delete this plan's SDD workspace (`rm -rf .superpowers/sdd/plan`), then
   `digismith:finishing-a-development-branch`.
10. **Don't forget the standing push-after-finish preference** — this branch has never been
    pushed; push after merging, per Jack's own standing rule.

## Reference

- Plan: `.digismith/docs/X/X.1-vps-session-herdr/plan.md` (on `main`, commits `8d41582`/`a704fce`)
- Design: `.digismith/docs/X/X.1-vps-session-herdr/design.html`
- Ledger: `.superpowers/sdd/plan/progress.md` (this worktree, gitignored)
- Live VPS: `46.225.49.140`, config at `~/.digismith-depot/vps.json` (already updated to X.1's
  shape; V.3's old shape backed up at `~/.digismith-depot/vps.json.v3.bak`)
