# DigiSmith MCP: one place where every agent finds our internal API

**Status:** Idea, Jack (2026-10-10 UTC+7). No design yet. ClickUp: **DGS-216** (list D: Depot Pavilion, created 2026-10-10 12:00 UTC+7 [05:00Z], task id `14zcebrvcka`).

**Source:** the DGS-215 talk, 2026-10-10. Jack told the Master "you can create it yourself with all the tools in Depot". The Master then had
to read `packages/clickup-client` source to find `getTaskTypes()` and the `custom_item_id` write field (the `dg` CLI shows neither), and
searched the Proxyman capture and the memories for the Frontdoor shapes. Jack: "we need our own MCP, another way for other agents to reach
our own internal API, to know what to do, instead of me manually directing you to the correct one."

## The problem

What DigiSmith can do is spread over many places, and an agent sees only part of it:
- the `dg` CLI (its `--help` shows only the commands that are wired),
- the client packages, which can do more than the CLI (`packages/clickup-client`, `packages/jira-client`),
- the Depot scripts (`backlog-sync/sync.py`, `captures-dump.py`, `usage-probe`, `herdr-ws`, and `frontdoor-create-profile-field.py`,
  which replayed a captured ClickUp UI call on 2026-10-02 and made the O.2 `Profile` field: the Depot can do what the UI does once a call
  is captured),
- call shapes kept in ClickUp tickets (DGS-76, DGS-133 to DGS-138), the runbooks, and the memories.

So Jack has to point each agent to the right tool.

## The idea

A DigiSmith MCP server, hosted by the Depot, whose tool list is the catalog. Every agent sees the same typed tools with descriptions:
ClickUp (task read and write, task type, parent, dependency, link, status, comment, attachment, list rename), backlog sync, the usage
probe, herdr (agent list, read, prompt), and Frontdoor calls.

Why MCP:
- **Both agent hosts load it.** Claude Code and OpenCode both load MCP servers. OpenCode does not load the DigiSmith plugin (DGS-169 spike),
  so skills alone cannot give the OpenCode maestro our tools.
- **Credentials stay in the server.** The agent never reads a token or the Frontdoor auth. Each MCP tool gets a permission rule that Jack
  writes (the DGS-155 guardrail approach), so the agent does not work around the classifier.
- **One place for the rules:** never hard-delete a ticket, keep ClickUp in step (DGS-213), Jira status stays manual.

## Open questions

1. Local stdio per agent, or one HTTP server on the Workbox that every herdr pane, the Desktop sessions and Jack's PC (over Tailscale) share.
2. Which tools first. Suggestion: the ClickUp tools, because the task-type, dependency and link gaps (DGS-215) need them now.
3. TypeScript with the MCP SDK, built with pnpm, next to `packages/cli`; the CLI and the server share the client packages.
4. Merge with DGS-124 (MCP-based orchestration: X server, V orchestrator, K bare metal) or keep both. DGS-124 is about the offload runners'
   calling convention; this one is about finding and calling our own API.
5. A lighter first step: a generated catalog (every `dg` command, client method and Depot script, with one line each) as a skill or a file.

## Related

DGS-124, DGS-133 (Frontdoor client), DGS-138 (Frontdoor auth without the agent reading it), DGS-155, DGS-169, DGS-213, DGS-215,
`platform-clan.md` ("D: Depot stays Jack's public server and MCP"), `mcp-orchestration-architecture-xvk.md`.
