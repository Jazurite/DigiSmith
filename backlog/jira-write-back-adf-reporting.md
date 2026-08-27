# Multi-repo distribution (I.2): profile-gated worktree fan-out

**Status:** Not applied. Raw material only — needs a design spec before
becoming a skill. (This item originally also covered I.1's real ADF
formatting technique; **I.1 shipped 2026-08-26** as
`digismith:jira-progress-write-back` — see
`.digismith/docs/jira-progress-write-back/` — so this file has been
narrowed to the still-open **I.2** piece only.)

**Source:** Learned empirically during EMKT-784 (Trial/Returns Banner
rollout across shopify-hub + 4 market repos), captured in
`shopify-hub`'s `Arsenal` branch as `EMKT-784-reporting-workflow.md`
and `EMKT-784-summary.md`. Copied here so it isn't stranded on a
worktree branch that may eventually get deleted.

## What this covers

**I.2** — multi-repo distribution. Gated behind a profile field (map
item **O**): on for Emma (per-market theme repos), off for a
single-repo personal profile, where there's nothing to distribute.

### Multi-repo distribution (worktree fan-out across market repos)

Same ticket key + slug branch name (`<KEY>__<slug>`) created as a
worktree in each affected repo, repeating `digismith:using-digismith`'s
single-repo convention manually per repo (that skill doesn't natively
fan out across siblings today).

- **SSH access gotcha:** a repo can 404 (`ERROR: Repository not
  found`) even when the default SSH identity authenticates fine
  elsewhere, if that identity's GitHub account lacks access to this
  specific repo. Fix: `GIT_SSH_COMMAND="ssh -i ~/.ssh/<correct-key>
  -o IdentitiesOnly=yes"` before fetch/push; confirm the right key via
  `ssh -i <key> -T git@github.com`, which announces the authenticated
  username.
- **Never touch a market's main checkout** — some teams run live dev
  servers directly in the main checkout, so uncommitted state there is
  normal, not contamination. Always branch fresh off
  `origin/<default-branch>` into a new worktree.
- **PR conventions** (confirmed against real merged PRs): title
  `<TICKET-KEY>: <short description>`, no market/repo name in the
  title (the repo itself already identifies the market). Body uses the
  repo's own `.github/pull_request_template.md` verbatim if present —
  never an invented `## Summary`/`## Test plan` structure (a prior PR,
  `emma-sleep/shopify-hub#63`, was closed for reading as AI-generated
  specifically because of that). Never an AI-signature comment either.
- **Ephemeral preview links:** `digismith:capture-ephemeral-url`
  already automates this per-repo; for N repos it needs to run once
  per repo/PR. Watch for a repo's ephemeral deploy failing outright on
  "A shop may only have 100 themes" — that's stale-theme housekeeping,
  not a code bug; flag it for someone with store admin access.

## Suggested shape

- **I.2** — a "distribute across markets" step: given a ticket key +
  list of affected repos, create worktrees, handle the SSH-identity
  check, and open PRs using each repo's own template + no-market-suffix
  title convention, as one repeatable operation. Only runs when the
  active profile enables it (map item **O**) — Emma's per-market
  profiles yes, a single-repo personal profile no.
- **I.2** — a "capture ephemeral links" step wrapping
  `digismith:capture-ephemeral-url` over every repo in the distribution
  list, same profile gate as above.

## Why not applied yet

Raw findings from a single live session, not yet run through
`superpowers:brainstorming`/`writing-plans`. Needs a design spec
before becoming a skill, including the new profile field for **I.2**
(name, default, which profiles set it) alongside **O**'s existing
ticket/ephemeral/reporting/publish_artifact fields.
