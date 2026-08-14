# Surgical Changes

Touch only what the request requires. Clean up only what your own change orphaned.

- Don't "improve" adjacent code, comments, or formatting while you're in there
- Don't refactor things that aren't broken
- Match existing style, even where you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it
- Remove imports/variables/functions that YOUR change made unused; leave
  pre-existing dead code alone

**Why:** every changed line should trace directly to the request. Same
principle as `branch-scope-discipline` and `fixing-blockers-mid-task`,
applied at the single-edit level instead of the branch/PR level.
