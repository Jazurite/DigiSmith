# Own worktree mechanism at `.worktrees/`, sunset `using-git-worktrees` (A.0)

**Status:** Not applied. Jack's call, 2026-09-26:

- DigiSmith gets its own worktree mechanism.
- The vendored `using-git-worktrees` primitive is sunset.
- DigiSmith stops using Claude Code's native worktree tool, which puts worktrees under
  `.claude/worktrees/<name>` on branch `worktree-<name>`.
- New worktrees go to `.worktrees/<branch>` at the repo root, created with plain
  `git worktree add`.

Filed under lineage **A.0** (Primitives, clan A) as ClickUp **DGS-86**.

**Source:** Raised mid-brainstorm on the lineage-handoff build
(`.digismith/docs/A/A.0/lineage-handoff/design.html`). That build still runs in a native worktree,
`.claude/worktrees/lineage-handoff`, and it is not moved.

## Why

`finishing-a-development-branch` Step 6 removes only worktrees under `.worktrees/` or
`worktrees/`. It treats native `.claude/worktrees/` as host-owned and leaves them in place. On
2026-09-26, four stale `.claude/worktrees/*` were still registered (`git worktree list`). The
vendored skill also prefers the native tool first ("never fight the harness"). So DigiSmith's own
worktrees depend on a mechanism that DigiSmith does not clean up.

## What changes

- **New DigiSmith worktree mechanism** (a native skill, possibly with a small script). It creates
  `.worktrees/<branch>`, verifies that `.worktrees/` is ignored, runs project setup and a baseline
  test run, and owns removal. What `using-git-worktrees` Steps 0–3 do today moves here where it is
  still needed (detect existing isolation, directory choice, setup, baseline). The native-tool step
  is dropped.
- **Sunset `skills/using-git-worktrees/`**: remove the skill, and also remove it from
  `scripts/check_vendored_skills.ts:174` and from `vendored/PROVENANCE.md`'s verbatim list. Record
  the retirement the way earlier retirements were recorded (Q, H, Enforcer).
- **Call sites to repoint:**
  - `skills/bootstrap/SKILL.md:389` and `:405`. These currently say to use a native worktree tool,
    or `digismith:using-git-worktrees` otherwise.
  - `skills/executing-plans/SKILL.md:19`.
  - `skills/subagent-driven-development/SKILL.md:113`. This one still says `superpowers:`.
  - `skills/writing-plans/SKILL.md:16`.
  - `skills/using-superpowers/references/codex-tools.md:26`.
- **`finishing-a-development-branch` Step 6**: its "who owns cleanup" rule points at the new
  mechanism instead of "Superpowers created this worktree".
- **`skills/bootstrap/SKILL.md:299` and `skills/telemetry/SKILL.md:110`**: both describe how a
  `/.claude/worktrees/` path is munged into a transcript folder name (`--claude-worktrees-`). Check
  what a `.worktrees/` path munges to, and update the text.
- **`.gitignore`**: already has `.worktrees/`. Keep `.claude/worktrees/` until the old worktrees are
  gone.

## Open questions for the brainstorm

- **Branch naming.** Native worktrees use `worktree-<name>`. The new mechanism picks the name. For
  example: the ticket key, or `<lineage>-<slug>`.
- **The session's working directory.** With a native worktree the session itself moves in
  (`EnterWorktree`). With `git worktree add` the session stays at the main root and `cd`s. Check what
  that means for `SessionStart` hooks. The lineage-handoff main-checkout resolution works either way,
  because it uses the git common directory.
- **Desktop-app-created worktrees.** Sessions the app starts in a worktree still get the native
  location. Decide whether the mechanism adopts them, or leaves them to the host.
- **Clean-up of the existing `.claude/worktrees/*` entries.** On Windows, `git worktree remove` and
  `rm -rf` can fail for a short time while a process still holds files open. Retry, do not force.

## Why not applied yet

Filed during an unrelated brainstorm. Needs its own `digismith:brainstorming` pass.
