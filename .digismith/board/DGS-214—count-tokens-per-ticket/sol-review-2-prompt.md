You are reviewing a finished feature branch. You are read-only.

Repository: this directory is the DigiSmith main checkout. The branch under review is `dgs-214-slice-2`, checked out in the
worktree `.worktrees/dgs-214-slice-2/` inside this directory. Read the branch's files there directly.
Base commit: `3acd108` (merge-base with main). Review the whole change: `git log 3acd108..dgs-214-slice-2` and `git diff 3acd108..dgs-214-slice-2`.

What the branch builds (ticket DGS-214, slice 2 of 2). Slice 1 (the token counter, `dg tokens`) is already merged. Slice 2 makes the skills write
the registry and the snapshot, so counting no longer relies on fallback tagging. Counts only, never prices.
- `packages/cli/src/tokens/entry.ts`: a plain-Node entry the skills call from Bash. It reads the live session id from `CLAUDE_CODE_SESSION_ID`
  (explicit `--session-id` override wins) and appends registry lines (session registration, step-start, SDD agent ids).
- `packages/cli/src/tokens/ledger.ts`: parser for the SDD ledger (`.sdd-workspace/progress.md`) that yields task rows for the snapshot.
- Skill edits: `skills/bootstrap`, `adopt`, `init`, `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`,
  `finishing-a-development-branch` (`SKILL.md` in each). They register the session, mark step boundaries, record SDD agent ids, and write the
  token snapshot at finish (before SDD deletes its ledger).

The spec is the approved design `.digismith/board/DGS-214—count-tokens-per-ticket/design.html`, the plan is `plan.md` in the same folder
(slice 2 = Tasks 7 to 10, amended), and the session-id decision is `session-id-source.md` there. Where code and design disagree, the design wins.

Check, in this order:
1. Correctness bugs in `entry.ts` and `ledger.ts`: wrong or missing session id handling (unset env, override, `/clear`, resume, subagents),
   torn or duplicated registry lines, wrong paths (board folder vs depot), crashes on a missing or malformed ledger, rows lost when the
   snapshot is rewritten, tagging of the wrong ticket.
2. Skill blocks: wrong placement (a step in the wrong skill or at the wrong point in the flow), wrong flags or command names, paths that do not
   exist, steps a model could skip (a block that is easy to read past, not tied to a required step, or missing from one finishing option),
   and any block that breaks an existing rule in the same skill (the SDD resume rule, finishing options, the ledger deletion order).
3. Design disagreements: counts only (no prices), no message text read or stored, library files import only `node:` built-ins and sibling files.
4. Test gaps: a design rule with no test; a test that can pass while the code is wrong; a test that touches real files under `~/.claude` or
   `~/.digismith-depot` instead of a temporary folder.

Rules:
- Do not edit any file. Do not run builds or tests. Use only `git show`, `git diff`, `git log`, `git grep` and `git status`, and read files
  directly. Do not read anything under `~/.claude` or `~/.digismith-depot`, and no `.env` file.
- Report only findings you verified in the code.
- For each finding give: severity (critical, important or minor), `file:line`, what is wrong, a concrete input or scenario that shows it, and the fix.
- End with one verdict on its own line: ready to merge, ready after fixes, or not ready.
