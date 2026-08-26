# JIRA write-back (I.1) + multi-repo distribution (I.2): ADF formatting, profile-gated fan-out

**Status:** Not applied. Raw material only — needs a design spec before
becoming a skill.

**Source:** Learned empirically during EMKT-784 (Trial/Returns Banner
rollout across shopify-hub + 4 market repos), captured in
`shopify-hub`'s `Arsenal` branch as `EMKT-784-reporting-workflow.md`
and `EMKT-784-summary.md`. Copied here so it isn't stranded on a
worktree branch that may eventually get deleted.

## What this covers

Map item **I** (JIRA comment write-back, unscoped) has real technique
now, not just the "consumes M's output, no status transition" shape
already in `MEMORY.md`. Two parts, now split into two sub-items
(2026-08-26) since one is profile-gated and the other isn't:

- **I.1** — JIRA ADF formatting. Applies regardless of profile.
- **I.2** — multi-repo distribution. Gated behind a profile field
  (map item **O**): on for Emma (per-market theme repos), off for a
  single-repo personal profile, where there's nothing to distribute.

### 1. Real Jira formatting via ADF, not markdown approximation (I.1)

Plain markdown with bold text standing in for "DONE"/"IN PROGRESS"
works and is safe, but doesn't produce Jira's actual native status
lozenges, emoji icons, or collapsible "expand" panels.

**The trap:** reading an issue back (`getJiraIssue`, any
`responseContentFormat`) renders special ADF nodes as pseudo-HTML:
`<custom data-type="status">DONE</custom>`. This is **read-only** —
sending that literal text back via `contentFormat: "markdown"` does
*not* re-parse into real nodes; it round-trips as visibly broken
literal text on the real ticket. Confirmed by testing directly on a
live ticket (caught and reverted within a minute).

**What works:** `contentFormat: "adf"` on `editJiraIssue`/
`addCommentToJiraIssue`, value set to a stringified real ADF document
(`{"type":"doc","version":1,"content":[...]}`). The response echoes
special nodes back with an auto-assigned `data-id="id-N"` — that
`data-id`'s presence (vs. absence for the broken literal-text case) is
the tell that a real node was created.

Node schemas confirmed against `developer.atlassian.com/cloud/jira/platform/apis/document/nodes/...`:

- `status`: `{"type":"status","attrs":{"text":"DONE","color":"green"}}`
  — `color` ∈ `neutral|purple|blue|red|yellow|green`.
- `emoji`: `{"type":"emoji","attrs":{"shortName":":check_mark:","text":"✅"}}`
  — `id` not required for a standard shortcode; server resolves it.
- `expand`: `{"type":"expand","attrs":{"title":"..."},"content":[...]}`
  — a real collapsible panel.
- Standard nodes (`paragraph`, `heading`, `bulletList`/`listItem`,
  `table`/`tableRow`/`tableHeader`/`tableCell`, `hardBreak`, `text`
  with `strong`/`link` marks) all work as expected via the same ADF
  path.

**Known gaps:**
- A *custom, site-uploaded* emoji needs a real registered UUID-style
  `id` to render — no discovered way to look that up through this Jira
  MCP connector. Don't guess an id; skip the icon or find another way
  to enumerate site emoji first.
- No delete-comment capability — a duplicate/mistaken comment can only
  be edited, never removed. Check for an existing matching comment
  (e.g. the user's own "📣 Progress Update – <date>" skeleton) and
  update it via `commentId` before creating a new one.
- `editJiraIssue` replaces the entire field value, not a patch/append
  — any section needing a real ADF node forces the *entire* field to
  be submitted as one ADF document in that call. No mixing "most of
  the description via easy markdown" with "one section via ADF."

### 2. Multi-repo distribution (worktree fan-out across market repos) (I.2)

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
- **I.1** — a "post Jira progress update" step using the ADF node
  shapes above, so future reports get genuine formatting on the first
  attempt. Runs regardless of profile. Still no automated status
  transitions — that stays manual per standing preference.

## Why not applied yet

Raw findings from a single live session, not yet run through
`superpowers:brainstorming`/`writing-plans`. Needs a design spec
before becoming a skill, including the new profile field for **I.2**
(name, default, which profiles set it) alongside **O**'s existing
ticket/ephemeral/reporting/publish_artifact fields.
