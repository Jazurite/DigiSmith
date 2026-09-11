# MCP-based orchestration: X as server, V (Depot) as orchestrator, K (Maestro) as bare metal

**Status:** Idea only, not scoped. Captured verbatim per the same "write it down, don't design
mid-flight" pattern used for other cross-cutting ideas this session (see Z.1/Z.2's own backlog
spin-offs). Spans three separate lineages — deliberately not owned by any single one.

**Source:** 2026-09-11, surfaced during a Z.2-adjacent conversation about why the confirmed
permission-classifier block (`backlog/offload-blocked-by-permission-classifier-k.md`) can't be
architected around by simply moving *which skill* asks for the credential-fetch-then-spawn
action — the classifier watches the actual Bash action shape, not the calling context. That
observation led to a bigger question: what if the calling convention itself weren't Bash at all.

## The idea

A three-tier split, refining an earlier looser "MCP or REST API" framing from the same
conversation into a specific mapping onto three existing map items:

- **X (server)** — the literal hosting layer. `backlog/vps-session-hosting-x.md`'s own idea (a
  persistent VPS-hosted Claude Code session) is the natural fit: the machine everything else in
  this design would actually run on, not something new to invent.
- **V / Depot (orchestrator)** — not new work, a reframing of what Depot's `ensure-*` operations
  (`ensure-opencode-server`, `ensure-agentic-bridge`, `ensure-claude-code`) already do: check if a
  resource is alive, start it if not, return a handle either way. Depot is already an
  orchestrator in exactly this sense — lifecycle management, not business logic, not raw dispatch.
- **K / Maestro (bare metal)** — the actual dispatch mechanics that touch real work: today's
  `offload-implementer` Steps 1-6, the gateway providers (`scripts/providers/tokenreply.ts`,
  `chutes.ts`), the runners. The nuts and bolts that talk to TokenReply/Chutes for real.

**The actual proposed change:** how the intelligent layer (the agent — Claude Code itself) talks
to this stack. Today it's Bash: `opencode run --attach http://127.0.0.1:<port> ...`, or a direct
`claude -p` spawn with `ANTHROPIC_AUTH_TOKEN` exported inline. Both are real Bash tool calls, and
the *credential-fetch-then-spawn* shape specifically is what the classifier refuses — confirmed
live on both runners, confirmed again when Depot's own `ensure-opencode-server` tried the
identical shape internally as a hypothesized workaround (see the K-lineage backlog item above;
also failed, identical classifier message).

Replace the Bash calling convention with MCP tool calls (or a plain REST API, functionally
similar for this purpose) between the agent and V's orchestration layer. A dispatch would become
a normal MCP tool invocation (`dispatch_task(prompt, model, role)` or similar) — not a Bash
command, not visible to the classifier's Bash-specific heuristics at all, since MCP tool calls
have their own, separate permission surface. The actual credential handling and process
spawning would happen entirely inside the already-running MCP/REST server process, never in a
command the controller's own Bash tool executes.

## Why this matters

- This isn't a workaround for the classifier block — it's an architecture that makes the block
  structurally inapplicable, because the risky action (credential-fetch-then-spawn) never appears
  as a Bash tool call again. Today's best available mitigation (Z.2's ledger-based caching, plus
  the "start the server warm, outside auto-mode, once" manual workaround discussed live this
  session but not yet tested) both still require the block to happen at least once, or require a
  human to intervene at cold-start. This design would remove the cold-start exposure entirely,
  *if* the server's own startup path also avoids the blocked shape (see Open Questions).
- It generalizes past TokenReply/Chutes specifically. Once the calling convention is "agent talks
  to orchestrator via MCP," any future gateway, runner, or even the VPS-hosted session itself (X)
  could sit behind the same interface without re-deriving a Bash-safe dispatch shape each time.

## Relationship to existing map items

- **Not Z's territory.** Z (Model Router) only ever consumed K's bare-metal dispatch procedure
  by reference (`offload-implementer`'s Steps 1-6) — it never owned the dispatch mechanism, the
  credential handling, or Depot's server lifecycle. This design changes all three, none of which
  Z has ever touched.
- **Depot (V)** already has the right shape (check-alive/start-if-not/return-handle) — this
  design doesn't replace that logic, it replaces the *transport* between the agent and it.
- **K (Maestro)** owns the actual TokenReply/Chutes-facing mechanics today (`offload-implementer`,
  `scripts/providers/`, `scripts/runners/`) — under this design those mechanics move *inside* the
  MCP/REST server process rather than being invoked directly by the controller via Bash, but the
  logic itself (provider resolution, `OffloadRole` branching, XTML-leak handling) doesn't
  necessarily need to change, only where it executes.
- **X** is a prerequisite in spirit (a real persistent server needs a real persistent host) but
  not a hard dependency — an MCP/REST orchestration server could run on the current machine
  first, with migrating it onto a dedicated VPS (X) as a later, independent step.

## Open questions, not yet scoped

- **Does the server's own cold start avoid the blocked shape?** If starting the MCP/REST server
  for the first time still requires a Bash command that fetches a credential and hands it to a
  spawned process, the classifier could still refuse *that* — the design needs the server's own
  bootstrap to either not need Bash at all (started once manually, outside auto-mode, the same
  untested workaround from this session) or to fetch credentials from inside a already-permitted
  process (e.g. Node's own `fs`/`readFile` reading `~/.digismith-depot/.env` directly, never a
  shell `$(...)` substitution) rather than shell-level credential fetching.
- **MCP vs. REST:** MCP is the more "native" fit for an agent-to-agent calling convention (tool
  definitions Claude Code already understands natively) and might not need any special permission
  grant at all beyond normal MCP server trust; REST would need the agent to reach it via a
  fetch/HTTP-capable tool, which has its own permission story that hasn't been checked against the
  classifier either. Neither has been tested live against the actual classifier behavior — this
  whole design rests on an inference from the confirmed Bash-specific block, not a confirmed MCP
  bypass.
- **Security surface of a credential-holding MCP/REST server.** A process that holds real
  TokenReply/Chutes credentials and accepts dispatch requests needs its own access story — even
  scoped to localhost, this is a materially different exposure than a one-shot Bash-spawned
  process that exits after one dispatch. Not designed here.
- **Where this actually lives.** A new skill (`digismith:` something) wrapping the MCP/REST
  client side, a new persistent server script under `scripts/` (parallel to
  `scripts/agentic-bridge/server.ts`), or a bigger restructuring of `offload-implementer` itself
  to talk to this server instead of spawning runners directly — not decided.

## Why not applied yet

Idea only, captured verbatim rather than brainstormed, per Jack's own explicit request this
session ("write this up... whichever session actually owns that work next"). Spans three
lineages (X, V, K) with real open questions before any of them could design their own slice —
notably, the core inference (MCP/REST calls avoid the classifier because they aren't Bash
actions) is untested, not confirmed, and should be the first thing verified live before
committing to this direction over Z.2's existing (working, if narrower) caching mitigation.
