# OpenCode safety layer as strong as Claude Code auto mode (ask prompts, a pre-tool reviewer plugin, deny rules)

**Status:** Idea, Jack (2026-10-10 ~14:4x UTC+7 [07:4xZ]). ClickUp: **DGS-226** (C.1: Workbox, subtask of DGS-223, task id `14zcebrvcp2`). No design yet.

## Jack's rule

"I want the same guardrail as Claude Code Desktop applied to OpenCode. I don't want OpenCode to do anything it is not supposed to do."
**No OpenCode maestro does real work on the shared server before this is in place.**

## Why

Claude Code comes with safety built in: auto mode's classifier reviews each risky action (today it blocked `herdr session delete`, the relaunch
script, an unseen `rm`), and permission prompts ask before unclear actions. OpenCode has neither: its default agent runs every shell command and
edit without asking. On the shared server a model runs unattended, reachable from Jack's PC and phone, with access to the repos and herdr. A cheap
model that misreads an order, or text that steers it, could print secrets (`.env` keys into a chat every client sees), delete or force-push (Emma
is company code), or disturb other maestros' herdr tabs. The DGS-169 probes showed it: before the rules, `head -c 20 .env` printed a fake secret.

## Three layers

| Claude Code | OpenCode layer to build |
|---|---|
| Permission prompts | `ask` permissions: risky tools pause and ask in Jack's client (PC, browser); he approves or refuses there |
| Auto mode classifier | A plugin on `tool.execute.before` that reviews every tool call: fixed rules first, then a small model (Haiku or luna through TokenReply) for unclear cases; it blocks, asks, or allows, and logs each verdict |
| Settings deny rules, launch flags | The DGS-169 permission rules: secrets denied by path, herdr only through `herdr-ws` with the project's `HERDR_WS`, exact git list, no pipes, redirects, `;`, `&`, `$` |

## To do

- Which actions ask, which block, which pass; the reviewer's prompt and its model; what happens when the reviewer or the gateway is down
  (block, never pass).
- Apply to every agent on the shared server, every project (DGS-225), including OpenCode's built-in agents (disable or guard them).
- A verdict log Jack can read; cost of the reviewer model per day.
- Probe it like DGS-169: the old slips, plus steering text in a file the agent reads.

## Related

DGS-223 ([shared-opencode-server.md](shared-opencode-server.md)), DGS-225 ([opencode-maestro-projects-emma-soveron.md](opencode-maestro-projects-emma-soveron.md)),
DGS-169 (guardrail findings), DGS-155 (maestro approval inside a guardrail).
