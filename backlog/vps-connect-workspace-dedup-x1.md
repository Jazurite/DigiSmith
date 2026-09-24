# `dg vps connect` leaks a duplicate herdr workspace on every crash-recovery cycle

**Status:** Not applied. Confirmed live, 2026-09-23, during X.1's Task 6 live verification.

**Source:** X.1 (`.digismith/docs/X/X.1-vps-session-herdr/`) replaced V.3's tmux-based VPS session
with a herdr-supervised OpenCode one. The design's one open, explicitly-flagged unknown was
whether a herdr pane survives OpenCode crashing inside it — confirmed **true** live: killing the
`opencode-main` process left the `digismith-main` workspace and its pane fully intact
(`herdr workspace list` still showed it, `pane_count: 1`), only the *agent registration* for that
name went away (`herdr agent get opencode-main` → `agent_not_found`).

## What's wrong

`runConnect`'s recovery branch (`packages/cli/src/vps/connect.ts`, the `!status.agentAlive.ok`
case) always calls `buildCreateWorkspaceCommand` — `herdr workspace create --label
<workspace_label> ...` — whenever the named agent isn't found. It never checks whether a
workspace with that label already exists first. herdr's own `workspace create` does not dedupe
by label; confirmed live by running it twice with the same `--label digismith-main` and getting
two independent workspaces (`w2` and `w3`), both labeled identically, both fully functional in
isolation.

Since a killed-but-recovering OpenCode process leaves its workspace behind exactly in this state
(pane alive, agent registration gone), every real crash-and-reconnect cycle through `dg vps
connect` abandons the old pane and creates a brand-new one instead of reusing it. The new agent
does end up healthy either way — this isn't a correctness failure for the session itself — but
each cycle leaves an orphaned, empty workspace/pane on the VPS that nothing ever cleans up.
Confirmed the manual fix works fine: `herdr pane list --workspace <old_id>` to find the surviving
pane, then `herdr agent start <name> --kind opencode --pane <that pane_id> -- ...` reuses it
directly, with `herdr workspace close <new_duplicate_id>` to clean up the accidental extra one.

## Why not applied yet

Explicitly deferred at decision time during X.1's Task 6 (see the plan's own live-verification
task) — X.1 was scoped to "the persistence case only," and the current behavior is functionally
correct (connect always ends with a healthy, working session), just wasteful. Fixing it properly
needs a bit of design, not a one-line patch: before creating a new workspace, list existing
workspaces, find one matching `config.workspace_label`, and if found, list its panes and try
starting the agent directly on the existing (idle) pane before falling back to creating a new
workspace. Worth designing alongside a decision on what to do if a matching-labeled workspace's
pane is *not* idle/available (`agent_pane_busy`, as also confirmed live when a stale agent is
still technically running there) — probably: try the next pane in that workspace, or fall back to
creating a new one, but that's exactly the kind of small design call that shouldn't happen
inline mid-plan.

## Suggested shape (not yet decided)

1. Before `buildCreateWorkspaceCommand`, run `herdr workspace list`, filter for
   `label === config.workspace_label`.
2. If one or more matches exist, try `herdr pane list --workspace <id>` on the first match and
   attempt `herdr agent start <agent_name> --kind opencode --pane <pane_id> -- ...` directly on
   its first pane, skipping `workspace create` entirely.
3. If that `agent start` call fails with `agent_pane_busy` (or the workspace list is empty),
   fall back to today's behavior — create a fresh workspace.
4. Optionally: `status`'s own report could warn ("N orphaned `<label>`-labeled workspaces found on
   the VPS — consider `herdr workspace close`") so existing leaked workspaces from before this fix
   don't just sit there silently forever.
