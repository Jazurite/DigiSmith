# Auto-accept Claude Code folder trust for manager-started worker agents in Jack's own repos

**ClickUp:** **DGS-303** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Idea only, confirmed live 3 times. No design yet. Filed as a task chip 2026-10-02.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

A new Claude Code worker in a folder Claude Code has not seen blocks on the folder-trust prompt
("Quick safety check: Is this a project you created or one you trust?").
`herdr agent start` returns `agent_not_ready`. This happened for shopify-template-in (EMKT-791),
then for the fresh shopify-template-ph and -kr clones (EMKT-810). Jack approved by hand each time,
then said "the trust both should be done automatically".

## The idea

- Pre-accept trust before `agent start`. Prefer a documented Claude Code setting over editing
  internal state such as `hasTrustDialogAccepted` in `~/.claude.json`. Verify against the
  installed `claude --version`.
- Scope it to an allowlist: git clones of Jack's own orgs (`git@github-emma:emma-sleep/*`,
  Jazurite repos) under `/root/Workspace`. Never auto-trust any other folder.
- Fallback used live: read the screen, `send-keys down`, confirm the line with the selection
  arrow reads "Yes, I trust this folder", and only then `send-keys enter`.

## Where this would land, not yet decided

The manager profile ([manager-orchestrator-profile.md](manager-orchestrator-profile.md)) or
`digismith:depot`. Needs tests for the allowlist check.
