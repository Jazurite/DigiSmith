# `jira-intake`/`bootstrap` never asks which market repo(s) a ticket targets

**Status:** Not applied. Raw finding, no design yet.

**Source:** Live during EMKT-809 (2026-09-29), a JP-only PDP bug ("Paidy info
tooltip does not open on JP mattress PDPs"). `digismith:init` →
`digismith:bootstrap` → `digismith:jira-intake` ran in whatever repo the
session's cwd happened to be (`shopify-hub`) with no step ever asking which
repo actually owns the affected market's code. `shopify-hub` is the *future*
unified monorepo, not yet in use — each market currently lives in its own
separate repo (`shopify-template-jp`, `-kr`, `-ca`, `-ph`, etc., see
`MEMORY.md`'s `project_market_repos` note). The ticket text named "JP
mattress PDPs" explicitly, but nothing in intake connected that to
`shopify-template-jp` — the mismatch was only caught after a full codebase
exploration in the wrong repo turned up no trace of the relevant code
(no `Paidy` string anywhere, component was a dead stub). Branch/worktree/
`ticket.md` had to be redone from scratch in the correct repo.

## Gap

Neither `digismith:jira-intake` (Step 2a/2b) nor `digismith:bootstrap`
(Step 1/Step 2) has any step that maps a ticket's content to "which repo(s)
does this actually touch." Both silently assume the session's current repo
is correct. This is upstream of, and distinct from, **I.2**
([[jira-write-back-adf-reporting]]) — I.2 is about fanning a *known* set of
target repos out into worktrees once decided; this gap is about *deciding*
that set in the first place, before any branch/worktree/docs get created
anywhere.

## Suggested shape

- After fetching/drafting the ticket (end of Door 1 or Door 2, before Step 3
  derives the slug and writes `ticket.md`), ask: does this ticket touch a
  single market, multiple markets, or is it market-agnostic (shared
  tooling, `shopify-hub` itself, non-storefront repos)?
- If a market is named or clearly implied by the ticket text (locale,
  currency, store name, "JP"/"KR"/"CA"/"PH" etc.) and the current repo
  isn't obviously that market's repo, ask explicitly rather than assuming
  the cwd is correct — don't guess silently either way.
- Multi-market answer → hands off into **I.2**'s fan-out shape rather than
  this skill re-inventing it.
- Single, unambiguous market that already matches the current repo → no
  question needed, proceed as today (don't add friction to the common
  case).

## Why not applied yet

Single live occurrence, not yet run through
`superpowers:brainstorming`/`writing-plans`. Needs a design spec — where
exactly the question is inserted in `jira-intake` vs. `bootstrap`, how it
composes with I.2's not-yet-built fan-out, and how "market-agnostic"
tickets are distinguished from "ambiguous, ask anyway."


## New sighting 2026-10-02 (EMKT-810)

The ticket title named the markets ("[PH, KR] …"), so the repo choice was clear. But
`/root/Workspace/Emma/shopify-template-ph` and `-kr` on disk had local files and no `.git`. A
bootstrap there would have failed or worked in a non-repo. Add a check: the chosen market folder is
a git clone with the expected remote (`git@github-emma:emma-sleep/shopify-template-<code>.git`).
If not, stop and offer a fresh clone. Source:
[manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).
