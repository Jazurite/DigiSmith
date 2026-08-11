# PR creation: existing-PR check, fork-aware remotes, injection-safe args

**Status:** Not applied. Findings only — no ticket, no code touched.

**Source:** `D:\Workspace\Library\automaker`, specifically
`apps/server/src/services/pr-service.ts` (`resolvePrTarget`) and the
`create-pr.ts` route handler that uses it
(`apps/server/src/routes/worktree/routes/create-pr.ts`).

## Patterns found

1. **Check for an existing PR before creating one.** Before calling
   `gh pr create`, automaker runs
   `gh pr list --head <branch> --json number,title,url,state,createdAt --limit 1`.
   If found, it reuses that PR instead of attempting a create that will
   just fail with "already exists." It still keeps a fallback path for the
   race case: if `gh pr create` fails with an "already exists" error
   anyway, it runs `gh pr view` to fetch and use the PR that appeared in
   between the check and the create.

2. **Fork-aware remote resolution (`resolvePrTarget`).** Parses
   `git remote -v`, distinguishes `origin` from `upstream`, and resolves
   which remote to push to vs. which repo to open the PR against. Fails
   fast with an explicit error when a caller names a `targetRemote` that
   can't be resolved, rather than silently falling back to a guess.

3. **Smaller hygiene worth carrying regardless:**
   - Commit only if `git status --porcelain` shows changes, before
     pushing.
   - On push failure, retry once with `--set-upstream` before giving up.
   - Every git/`gh` invocation builds args as an array
     (`execGitCommand(['commit', '-m', message], ...)`,
     `gh pr create --title <t> --body <b>` via arg array) rather than a
     shell string — avoids injection from a title/body/branch name
     containing backticks, `$`, or quotes.

## Relevance check against DigiSmith's current PR-creation step

DigiSmith doesn't own a PR-creation skill today — "push and create PR" is
Option 2 of the upstream `superpowers:finishing-a-development-branch`
skill (not a DigiSmith file). As of superpowers 6.2.0, that option is
just:

```bash
git push -u origin <feature-branch>
```

followed by "create the pull/merge request against \<base-branch\> with
the forge's tooling... following the repo's PR template and conventions
if present." No existing-PR check, no injection-safety guidance, no fork
handling — pattern 1 and the arg-array hygiene in pattern 3 are real gaps
against automaker's version, confirmed by reading the skill file
directly, not assumed.

Pattern 2 (fork detection) is likely **not worth porting** — Emma theme
repos are single-team repos, not forks, so `origin`-only push/PR is
already correct for that context. Included above for completeness, not
because it's a probable next step.

## Where this would land, not yet decided

Per DigiSmith's own philosophy (`MEMORY.md` — "it augments, never
replaces... duplicating a Superpowers capability is a bug"), this isn't
a DigiSmith skill to write from scratch — Option 2 lives inside an
upstream Superpowers skill. Two real paths, undecided:

- Patch/PR the existing-PR-check and arg-array safety upstream into
  `superpowers:finishing-a-development-branch` itself (benefits every
  consumer of that skill, not just DigiSmith).
- Fold the existing-PR check specifically into the already-pending "create
  a PR following Emma standard, using the repo's PR template" step from
  [[project_pr-automation-feature-pending]] (map item **I.1**-adjacent),
  since that step already needs to layer Emma-specific PR-template
  handling on top of whatever `finishing-a-development-branch` does — the
  existing-PR check could live in that Emma-specific layer instead of
  upstream.

No ticket exists for either path yet.
