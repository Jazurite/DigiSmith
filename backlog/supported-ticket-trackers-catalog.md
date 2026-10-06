# A catalog that dictates which ticket trackers DigiSmith supports

**Status:** Idea, Jack's call (2026-10-06 UTC+7). Concept only. ClickUp: **DGS-189** (Town Hall, task id `14zcebrv059`, created 2026-10-06 UTC+7).

**Source:** Jack, 2026-10-06, answering a DGS-186 (clan F: Scripture) design question about the tracker contract and a profile `tracker` field.
He agreed to the field and said which providers are supported is "another backlog": DigiSmith should dictate the supported ticket trackers,
"similar to what we have in standard or something".

## The idea

A maintained list of the ticket trackers (providers or platforms) DigiSmith supports, kept the way the standards library and `toolchain.yml` are
kept: a file in the repo that is the single source of truth, which skills read, and which Jack can change by dictating. A repo's profile
(clan O: Profiling) picks one value from it, for example `tracker: jira` or `tracker: clickup`.

## What we know

- Today two trackers work: Jira (`packages/jira-client`, `jira-intake`, `jira-progress-write-back`) and ClickUp (the `dg clickup` commands).
- The profile has only `ticket: true/false`. A `tracker` field is part of the DGS-186 design.
- Each supported tracker implements one adapter contract: read a ticket, create one, change status, comment, attach files.
- `toolchain.yml` and `digismith:toolchain` (read or dictate standing defaults) and `digismith:add-standards` / `index-standards` are the
  models for a catalog Jack can dictate into.

## Open questions

1. Where the catalog lives (a `trackers.yml` at the repo root next to `toolchain.yml`, or inside the standards library) and which skill owns it.
2. What each entry holds: the name, the adapter package, the capabilities it supports (for example attachments), and its status (supported,
   planned, retired).
3. How a skill fails when a profile names a tracker that is not in the catalog.
4. Whether a new tracker (GitHub Issues, Linear) can be added by Jack's dictation alone, or needs its adapter built first.

## Related

DGS-186 (clan F: Scripture), `clickup-ticket-writeback-i1-analog.md`, `jira-write-back-adf-reporting.md`, `toolchain-general-trigger-scope.md`,
`opinionated-tech-stack-defaults.md`.
