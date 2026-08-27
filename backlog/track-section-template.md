# Ticket description Track-section template (Deliverable / Per Market)

**Status:** Not applied. Live-tested design, not yet a skill. Produced
entirely by hand via direct REST (see
[[jira-rest-graphql-direct-api.md]]) — no DigiSmith skill generated any
of this. Needs `superpowers:brainstorming` alongside that item before
becoming part of `I.1`/`I.2`.

**Independently verified 2026-08-27** against the live EMKT-756 ticket
(direct REST fetch, not the session's own self-report) — the Deliverable
section, the Per-Market table (JP/PH/KR, CA correctly absent), the
icon-replaces-bullet convention, and the Documentation
stage-DONE-but-sub-item-🔄 rollup mismatch all confirmed exactly as
described below. Comment `3367093` also confirmed real, ADF-correct, and
free of any repo/PR/branch mention.

**Source:** EMKT-756 (cross-sell "Default Title" fix, rolled out across
JP/KR/PH), the single largest change of that session — roughly 15 rounds
of live iteration against the real ticket description, each round
verified by re-fetching before reporting back.

## The shape

```
📦 Track:

  📋 Deliverable:
    Technical Development – DONE
    Storybook Conversion – DONE
      ✅ 1x component: Cross Sell
    Design Review – DONE
      ✅ Latest components available in Storybook
      ✅ Obtain design approval
    Documentation – DONE
      🔄 Added to master "Above the Fold" doc (Section 3)
    Engineering Code Review – DONE
    Business Acceptance – IN PROGRESS
    Rollout – IN PROGRESS

  🌍 Per Market:
    | Market | Dev | Review | QA | Country | Deployment |
    |---|---|---|---|---|---|
    | JP | ✅ | ✅ | ✅ | 🔄 | – |
    | PH | ✅ | ✅ | ✅ | 🔄 | – |
    | KR | ✅ | ✅ | ✅ | ✅ | ✅ |
```

## Design rules, distilled from the session's churn

- **Two-section split.** "Deliverable" holds genuinely one-time/central
  stages (one Figma review, one shared Storybook component, one shared
  Confluence doc) — never repeated per market. "Per Market" holds
  everything that actually varies market-by-market. Engineering Code
  Review is deliberately in **both**: a rollup line in Deliverable *and*
  a column in the Per-Market table, per explicit request — not
  either/or.
- **Icon replaces bullet, not appends to it.** For any per-market or
  per-item status line, the status icon (✅ DONE, 🔄 IN PROGRESS) *is*
  the bullet marker — never `- ✅ thing`, always `✅ thing`. TODO items
  have no defined icon in the ticket's own Legend, so they keep a plain
  bullet. Caught mid-session after a line briefly had both.
- **Never use the word "Status" in a heading.** It collides with Jira's
  own native Status field and reads as ambiguous. "Per-Market Status" →
  "Progress" → simplified further to just "Per Market" once the two
  sections sit side by side and the word adds nothing.
- **The business-facing gate is named "Business Acceptance" with an
  Internal QA / Country Approval split underneath, not "QA."** Plain
  "QA" conflates internal testing with getting a market's PO/WO/country
  stakeholder to sign off on the live preview — the same gate `I.1`
  implicitly waits on before a market counts as done. Rejected
  alternatives: "Sign-off"/"Business Sign-off" (too familiar), "Country
  Approval" alone (kept as the *sibling* label, paired with "Internal
  QA" — clearer and non-redundant since the parent stage is already
  named "Business Acceptance").
- **"Rollout" (parent stage) vs. "Deployment" (per-market column) are
  deliberately different words** — Rollout is the stage label, Deployment
  is the market-level release action within it.
- **Rollup status is a manual convention, not a formula.** The parent
  line (e.g. "Business Acceptance – IN PROGRESS") is hand-set to match
  the table's actual values and has to be hand-updated again whenever a
  market's cell changes. No live rollup exists.
- **A market can be excluded entirely** (no table row, no per-market
  to-do) per explicit instruction — e.g. a market that's shutting down.
  Its historical checkmarks elsewhere in the document are left alone
  rather than retroactively erased.

## Tension with `I.1`'s current scope — read before touching either

[skills/jira-progress-write-back/SKILL.md](../skills/jira-progress-write-back/SKILL.md)'s
Step 7 today only ever writes **one thing** to the Track section: it
flips the existing "Technical Development" paragraph's `status` node to
DONE and appends one `✅ <repo label>` checkmark line under it — by
design, since the skill is explicitly single-repo/single-run scoped (see
its own Step 7 comment: "this skill has no visibility into other repos,
so completing this one *is* the whole of what it's tracking").

The template above is a materially different shape: a full per-market
table with five independent columns (Dev/Review/QA/Country/Deployment),
filled in across an entire ticket's lifecycle by someone with visibility
into every market at once. That's inherently an **I.2** (multi-repo
distribution, still unbuilt — see
[[jira-write-back-adf-reporting.md]]) concern, not something a
single-repo `I.1` run can produce correctly on its own. When I.2 gets
designed, this table should be its natural output surface rather than
inventing a new one — don't let `I.1`'s Step 7 "Technical Development
only" logic quietly become the permanent ceiling for what Track-section
writes can do.

## Why not applied yet

Single-ticket live-tested design, not run through
`superpowers:brainstorming`. Blocked on the same prerequisite as
[[jira-rest-graphql-direct-api.md]] — every edit here happened via
manual `curl` because `I.1`'s own MCP-based description fetch (Step 4)
returns lossy ADF, so there's no working skill path to generate this
template today even for the single-repo Deliverable half.
