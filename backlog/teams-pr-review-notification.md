# Microsoft Teams notification requesting code review after a PR opens (map item I.4)

**Status:** Not applied. Feature idea, not yet scoped.

**Source:** Raised directly by Jack, 2026-09-09.

## The idea

After every pull request is opened, automatically send a message to a Microsoft Teams
channel/chat informing other engineers that a code review is needed, instead of pinging
them manually each time.

## Why this is I-lineage, not Y

Initially considered as a new lifecycle-hook point (Y-lineage, parallel to Y.1's
`post-finish`), but Jack corrected this: Y's hooks so far are internal DigiSmith
self-development mechanics (version bump, plugin cache reinstall) — genuinely technical,
gated to DigiSmith's own repo. This idea is a reporting/communication concern instead —
notifying people, not performing repo maintenance — which is exactly what **I** was
broadened to cover on 2026-09-08 (renamed from "QA handoff" to plain "Reporting", with
"other reporting channels (e.g. Slack, email)" named as plausible future sub-items, none
designed yet). Microsoft Teams is one of those channels.

The *trigger* (firing right after a PR opens, likely inside `finishing-a-development-branch`'s
Option 2 "Push + PR" flow) could still reuse Y.1's existing hook-file mechanism
(`.digismith/hooks/<point>/`) under the hood for *when* it fires — but the capability itself
("notify a channel to request review") is I's territory, not Y's.

## Where this would land, not yet decided

**I.4** — parallel to I.1 (Jira write-back), I.2 (multi-repo distribution), I.3 (comment
templates). Open questions, none scoped yet:

- Which Teams API/mechanism — webhook (Incoming Webhook connector), Graph API, or an MCP
  server if one becomes available.
- Where the target channel/chat is configured — a new profile field (map item **O**), same
  shape as existing profile toggles, presumably per-repo or per-team.
- Message content/format — plain notification vs. something richer (PR title, link, files
  changed, requested reviewers) — possibly reusing I.3's template-shape thinking once that
  lands.
- Whether this fires unconditionally or is itself gated by a profile field, the same way
  Jira write-back is gated by `ticket: true`.

No design yet.
