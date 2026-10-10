# Porting a change across market repos: check each market's structure before planning

**ClickUp:** **DGS-309** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Idea only, confirmed live once. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

EMKT-810 was framed as "the feature is already completed in JP, so this is more about copy and
paste" (port of JP's EMKT-806, commit dbac5063, to PH and KR). PH matched JP's structure. KR did
not: KR's slider cart renders only a header, an empty state and an upsell, and its cart icon goes
to `/cart` (confirmed live on www.emma-sleep.co.kr). A literal port into KR's
`cart-drawer-items.liquid` would have been dead code. The KR worker caught this during
brainstorming. The manager had also found that PH's file differed from JP's pre-change file in
about 160 lines, so a file copy was never safe.

## The idea

A "port across markets" step (in brainstorming, or a small helper) that takes the source commit,
lists its target files, and for each target market reports: is the file present, is it rendered
(who renders it), how far it is from the source's pre-change version (diff ignoring line endings),
and which metafields or keys it reads. Plan per market from that report.

## Related

[manager-orchestrator-profile.md](manager-orchestrator-profile.md) (one worker per market), the
existing [jira-intake-market-repo-selection.md](jira-intake-market-repo-selection.md), and I.2
multi-repo distribution in [jira-write-back-adf-reporting.md](jira-write-back-adf-reporting.md).
