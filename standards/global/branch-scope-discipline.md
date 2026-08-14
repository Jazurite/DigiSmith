# Branch Scope Discipline

Before squashing a branch's commits into one, verify every file is actually
in scope.

- Diff every file against the target base: `git diff <base>..HEAD --name-only`
- Don't assume a file belongs just because it's already committed on the branch
- Watch for stale merge commits that silently revert changes the base branch
  has since picked up elsewhere
- A file with many unrelated-looking matches can still be legitimately in
  scope — verify by reading the actual diff content, not just the filename
  (e.g. removing a block type theme-wide touches dozens of templates as one
  coherent change, not scope creep)
