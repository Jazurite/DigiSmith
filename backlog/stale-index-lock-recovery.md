# Auto-recover from a stale `.git/index.lock` after an interrupted git command

**Status:** Not applied. Findings only — no ticket, no code touched.

**Source:** `D:\Workspace\Library\automaker\apps\server\src\lib\git.ts`
(`isIndexLockError`, `removeStaleIndexLock`, `execGitCommandWithLockRetry`).

## The problem

Any git command that writes to the index (`commit`, `stash push`, etc.)
fails with `Unable to create '.git/index.lock': File exists` (or `could
not write index`) if a `.git/index.lock` file was left behind by a
previously interrupted git operation — a killed process, a Ctrl+C
mid-commit, a crashed session. Once that happens, **every** subsequent
git command in that worktree fails the same way until the lock file is
manually deleted, even though nothing is actually still running. This is
a well-known, common git annoyance, not automaker-specific — but nothing
in DigiSmith's stack currently detects or recovers from it (confirmed:
grepped `skills/` for `index.lock` / "stale lock", no matches).

Given `using-digismith` explicitly supports resuming a ticket's worktree
across sessions (a worktree can sit abandoned mid-operation between
sessions), this failure mode is plausible in exactly the scenario
DigiSmith is built around — not a hypothetical edge case.

## What automaker does about it

```ts
export function isIndexLockError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('could not write index') ||
    (lower.includes('unable to create') && lower.includes('index.lock')) ||
    lower.includes('index.lock')
  );
}

export async function removeStaleIndexLock(worktreePath: string): Promise<boolean> {
  // Resolve `.git` dir via `git rev-parse --git-dir` (works for worktrees too),
  // check the lock file exists, delete it, return whether it did.
}

export async function execGitCommandWithLockRetry(args, cwd, env) {
  // Run the command; on an index-lock error, remove the stale lock and
  // retry exactly once. Non-lock errors, or a failed removal, propagate
  // the original error untouched.
}
```

Key details worth keeping: resolves `.git` dir via `git rev-parse
--git-dir` rather than assuming `<cwd>/.git` (necessary for worktrees,
where `.git` is a file pointing elsewhere, not a directory); retries
**exactly once**, not in a loop; only intercepts errors that actually
look like a lock issue, letting everything else propagate unchanged.

## Caveat worth carrying into any DigiSmith version

Automaker's version doesn't verify the lock is actually *stale* (i.e.
that no process genuinely still holds it) before deleting it — it just
checks the file exists and removes it. That's the standard, well-known
recovery step for this error in practice, but it's technically unsafe if
a git process is legitimately mid-operation at that exact moment (e.g. a
concurrent IDE git integration, or a second session in the same
worktree). Worth a beat of hesitation before automatically deleting —
maybe a brief "does a git process still appear to be running" check —
rather than porting the blind-delete-and-retry behavior as-is.

## Where this would land, not yet decided

This isn't a DigiSmith-specific concern — it'd benefit any git command
any DigiSmith skill runs, and equally benefits plain interactive use
outside DigiSmith entirely. Candidates, undecided: a small
recovery note added to `superpowers:using-git-worktrees` /
`finishing-a-development-branch` (upstream, benefits everyone), or a
DigiSmith-local guard used only inside its own skills. No ticket exists.
