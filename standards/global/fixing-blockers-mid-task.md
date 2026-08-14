# Fixing Blockers Found Mid-Task

A genuine blocker — something broken that stops you from testing or running
the change — gets fixed in the same PR, not deferred.

- Doesn't license bundling in unrelated feature work sitting in the branch's
  history — that still gets reverted per branch-scope-discipline
- The distinction: a blocker stops the current task; unrelated feature work
  is scope creep
- Watch for cascading side effects from the fix itself (e.g. a dependency
  install triggering an automigrate that rewrites unrelated files) — revert
  those, keep only the intentional fix
