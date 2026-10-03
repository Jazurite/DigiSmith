# A hand merge skips the post-finish hooks, and running sessions cannot load the new plugin without a restart

**Status:** Idea, Jack's call (2026-10-03 22:24 UTC+7 [15:24Z]): "Update the plugin so my session has the new skill clauses. This
should be done automatically next time, add backlog." Rewritten at 22:27 UTC+7 [15:27Z] after the root cause was found. No design
yet. ClickUp: no ticket yet. Under "no ticket, no work" this item needs one: ask Jack for the list (candidates: C.1 Workbox, A.3
Lifecycle Hooks).

**Source:** the merge of Flux build 1 (DGS-154, 2026-10-03).

## What happened

- The automation already exists. `finishing-a-development-branch` Option 1 fires the post-finish hooks
  (`.digismith/hooks/post-finish/`): `01-version-bump.md`, `02-plugin-reinstall.md`, `03-history-update.md`.
- The Flux worker merged by hand (rebase, fast-forward, push) on the maestro's order, which did not say to fire the hooks. So
  none ran. The version stayed `0.75.0-beta`, and the installed plugin had no new skill text. This is the known gap in
  [post-finish-hooks-direct-push-gap.md](post-finish-hooks-direct-push-gap.md), now hit through a worker.
- The worker then fired the hooks by hand, with merge-range pins it created itself (`refs/digismith/post-finish/flux-protocol/base`
  and `/head`). Result: version bump `0.75.0-beta` to `0.76.0-beta` (commit `8e3419d`), pushed, installed. Hook 03 found no
  `report.html` in the range and changed nothing.

## What is still wrong

1. **Hook 02 uses a command that does not update.** `claude plugin install digismith@jazurite --scope user` answers "already
   installed at 0.75.0-beta, run `claude plugin update`". The update needs `claude plugin update digismith@jazurite`. The hook text
   is stale.
2. **A running session cannot load the update.** `claude plugin update` says "restart required to apply". The Desktop maestro
   cannot restart itself, and `clear_session` keeps the process, so a clear may not reload the plugin (not tested). The panes show
   "Update installed · Restart to apply".
3. **The cache flush is unsafe on a shared VPS.** Hook 02 deletes the old version directories. Running sessions still load skills
   from the old directory, so the flush would break them until a restart. The worker skipped it; `0.73.0-beta`, `0.74.0-beta` and
   `0.75.0-beta` stay in `~/.claude/plugins/cache/jazurite/digismith/`.
4. **Hook 01 reads the `ssh_key` preference, and the auto-mode classifier blocked that read** as credential access. The worker
   skipped it and used a plain `git push origin main`. Related: `h2-ssh-key-preference-list-candidates.md`,
   `gh-auth-status-blocked-by-classifier.md`.
5. **Nothing tells the maestro to fire the hooks when a worker merges.** The order for a worker merge must include them.

## Ideas

- The runbook's merge step for a worker names the hooks: "after the merge, fire the post-finish hooks (fire-lifecycle-hook.md)".
- Fix hook 02 to use `claude plugin update`, and make the flush wait until no running session uses the old version.
- A restart mechanism for sessions that need the new plugin: a `dg workbox` command for the herdr workers (DGS-151), and a way for
  Jack to restart the Desktop maestro.
- Let the hooks run without the `ssh_key` read when `git push` already works.

## Open questions

- Does `/reload-plugins` or a `clear` apply a plugin update to a running session, or is a process restart the only way?
- How does the maestro learn that a worker merged to main (the worker's report, a git hook, a poll of `origin/main`)?
- Which machines: the VPS only (the Windows machine is retired)? Emma and Soveron sessions use the same plugin: do they restart too?

## Related

[plugin-cache-lag-self-development.md](plugin-cache-lag-self-development.md),
[post-finish-hooks-direct-push-gap.md](post-finish-hooks-direct-push-gap.md), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151),
DGS-154 Flux (the live run waits for the restart).
