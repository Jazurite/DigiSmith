# Auto-link ticket keys in DigiSmith JIRA comments

**Status:** Idea only, confirmed live once. No design yet. Filed as a task chip 2026-10-02.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

In EMKT-810 comment 3468302, "the JP solution (EMKT-806)" was plain text. Jack asked for it to be
a link to the ticket, and it was edited by hand to `[EMKT-806](https://emma-sleep.atlassian.net/browse/EMKT-806)`.

## The idea

A deterministic pass (in `fill-template.ts`, the ADF converter, or both) turns every bare ticket
key (word-bounded `[A-Z][A-Z0-9]+-\d+`) into a link to `https://<JIRA_SITE>/browse/<KEY>`.
`JIRA_SITE` already exists in `~/.digismith-depot/.env`. Do not double-link keys that are already
inside a link. Do not touch keys inside URLs. Decide whether the Teams template's `ticket-line`
uses the same rule. Tests: bare key, already-linked key, key inside a URL, the comment's own key.
