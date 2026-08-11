# capture-ephemeral-url: fetch PR comments via REST, not `gh pr view`

**Status:** Not applied. Drafted only — needs review before touching
`skills/capture-ephemeral-url/SKILL.md`.

**Source:** Found while exploring `D:\Workspace\Library\automaker` (a
similar AI-dev-orchestration project) for prior art, specifically its
`apps/server/src/services/pr-review-comments.service.ts`.

## Problem

`skills/capture-ephemeral-url/SKILL.md` Step 4 currently fetches the PR
comment list with:

```bash
gh pr view <PR> --json comments \
  --jq '[.comments[] | select(.author.login=="github-actions") | .body | select(contains("Ephemeral Theme Deployed Successfully"))] | last // empty'
```

Two independent bugs can make this silently return empty (which the
skill currently interprets as "comment not posted yet, keep waiting" —
i.e. these bugs produce a false "not found," not a loud failure):

1. **GraphQL null-author gotcha.** `gh pr view --json comments` is
   GraphQL-backed. GraphQL can return a null `author` for bot/app-authored
   comments. Automaker's `pr-review-comments.service.ts` documents
   exactly this and explicitly avoids `gh pr view --json comments` for
   comment-fetching because of it, using the REST issues-comments
   endpoint instead.
2. **Exact-match login is wrong regardless of bug 1.** The real REST/GraphQL
   login for the default `GITHUB_TOKEN` actor is `github-actions[bot]`
   (bracket suffix), not `github-actions`. `select(.author.login=="github-actions")`
   would never match even with a non-null author.

Verified both failure modes by simulating the jq logic in Node against
fixture JSON shaped like real GitHub API responses (jq isn't installed in
this environment) — the current filter returned empty in both the
null-author case and the plain bracket-suffix case.

## Proposed fix

Switch to the REST endpoint, matching by substring instead of exact
equality, with a fallback to `performed_via_github_app.slug` for
comments posted via a custom GitHub App (mirrors automaker's
`c.user?.login || c.performed_via_github_app?.slug || 'unknown'`
pattern):

```bash
gh api repos/{owner}/{repo}/issues/<PR>/comments --paginate \
  --jq '[.[] | select(((.user.login // .performed_via_github_app.slug // "") | contains("github-actions")) and (.body | contains("Ephemeral Theme Deployed Successfully")))] | last // empty'
```

`{owner}`/`{repo}` are resolved automatically by `gh api` from the
current repo — no separate resolution step needed. Everything downstream
of this (the URL-extraction regexes, the "wait 60s and recheck" fallback,
the error-handling table) stays as-is; only the comment-fetch mechanism
and the identity match change.

## Why not applied yet

Jack asked to draft-and-park this rather than edit the skill directly.
`superpowers:writing-skills` applies when this does get applied (it's an
edit to an existing skill) — the RED/GREEN Node simulation described
above already stands in as the lightweight test appropriate for a
technique/reference-type skill correction (see that skill's "Testing All
Skill Types" section); no need to redo it, just re-verify if the fix
drifts before landing it.
