# Merge order for dgs-214: slice 2 (approved: merge and push, per finish_option)

From b3-maestro, 2026-10-10 ~19:0x UTC+7 [12:0xZ]. Gates are green (head `99b70dd`, 1092/1092 tests, build OK, scoped re-review clean). Jack's saved
`finish_option` for DigiSmith is `merge_locally`, then push (DGS-271), so no further yes is needed.

## Do
1. I already committed the DGS-214 board files in the main checkout: `13f972e` (docs(board): slice 2 session-id source, plan Task 10, Sol review). Do not
   commit in main for other reasons; main also holds other sessions' untracked files: touch none of them.
2. Run `digismith:finishing-a-development-branch` Option 1 (merge locally) for `dgs-214-slice-2` into `main`, then push `main`. A hand merge skips the
   post-finish hooks, so follow `skills/finishing-a-development-branch/fire-lifecycle-hook.md` exactly: set the merge-range pins first (like slice 1: the
   range must cover your slice 2 report and board files and must not re-append another session's report, for example DGS-46), then fire hooks 01 to 03.
   Hook 02 uses `claude plugin update digismith@jazurite`; skip the cache flush. Version bump included.
3. Write the slice 2 report if the history hook needs one (`report.html` of this folder, slice 2 added), commit it title-only, push.
4. Clean up: delete the merged branch, remove `.worktrees/dgs-214-slice-2`. Keep `.sdd-workspace/progress.md` per the order unless the finish skill deletes it
   after your snapshot; the snapshot (`tokens.json`) must be written first and committed in the board folder.
5. Report: merge commit, new version, the history entry (heading appears once in `history.html`), the push range, and `dg tokens DGS-214` output
   (steps and task rows). Then stop and wait. I run `/reload-plugins` and close the tabs.

## Rules
- Stop and report on a red gate, a merge conflict, or a hook failure. Do not force-push. No ClickUp write.
- Title-only commits, no AI attribution. Counts only. pnpm only. Times UTC+7 first, UTC in brackets. Short plain sentences.
