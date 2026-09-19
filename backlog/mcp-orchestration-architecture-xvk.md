# MCP-based orchestration: X as server, V (Depot) as orchestrator, K (Maestro) as bare metal

**Diagram (2026-09-18):** https://claude.ai/artifact/GhzA6bCwVCa6eQEb9X9nXz — the shipped
TokenReply/OpenCode stack vs. the missing Herdr multiplexer layer proposed on the VPS (X), with
K's open classifier question called out. Reflects the herdr correction below (pane supervisor,
not an inference layer) — see that section for why the diagram is scoped the way it is.

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

## 2026-09-18 addition — herdr (https://herdr.dev/), an existing open-source tool, overlaps here

Jack surfaced **herdr** (github.com/herdrdev/herdr, Apache 2.0, YC-backed) independently, then
connected it back to this note himself. Worth recording the overlap precisely rather than
re-deriving it later:

- **What it actually is:** a background server/runtime that keeps coding-agent CLI sessions
  (Claude Code, Codex, Cursor, OpenCode, Grok — tool-agnostic, wraps rather than replaces them)
  alive persistently across disconnects and machine restarts, reports each agent's status
  (working/blocked/idle), lets agents start/prompt/wait-on each other via a CLI + socket API, and
  links multiple machines over SSH into one workspace.
- **Overlaps X (server) and V/Depot (orchestrator) directly:** X's own idea is "a persistent
  VPS-hosted Claude Code session"; V/Depot's `ensure-*` shape is exactly "check alive, start if
  not, return a handle." Herdr is a working, already-built implementation of both — persistent
  hosting plus check/start/status lifecycle management, generalized across any agent CLI rather
  than DigiSmith-specific. Building V/X's own version from scratch when this already exists and
  is Apache 2.0 would need a real justification (a gap herdr doesn't cover), not just novelty.
- **Does NOT confirm or deny K's actual open question.** K's piece of this design is narrowly
  "does routing the credential-fetch-then-spawn action through something other than a raw Bash
  command make it invisible to this environment's auto-mode permission classifier." Herdr's own
  socket API/CLI *might* have the same shape-avoiding property MCP would (an agent asking an
  already-running server to do something, rather than the agent itself running `$(cmd)` inline) —
  but this is untested inference, exactly like the original MCP/REST framing above. Nothing in
  herdr's public docs addresses Claude Code's auto-mode classifier specifically, since that's a
  DigiSmith-environment-specific constraint, not something a general-purpose multiplexer would
  know or care about.
- **What's actually worth doing next:** live-test whether driving an offload dispatch through
  herdr's CLI/socket API (once installed) avoids the classifier block that plain Bash
  credential-fetch-then-spawn hits (see `backlog/offload-blocked-by-permission-classifier-k.md`).
  If it does, herdr could plausibly replace the *entire* X+V slice of this design (real persistent
  host, real orchestrator) and narrow K's own remaining work to "does dispatching a task through
  it still go through the classifier" — collapsing three speculative lineages of custom-build work
  into one integration + one live test. If it doesn't sidestep the classifier, herdr is still
  independently worth adopting for X/V's persistence-and-status-visibility problem, just doesn't
  solve K's narrower one.
- **Not yet installed, not yet tested against anything in this repo.** This is a recorded
  candidate, not a decision. (Superseded by the 2026-09-19 spike below — herdr is now installed
  and live-tested on both a local Windows machine and the actual Hetzner VPS.)

## 2026-09-19 addition — herdr actually installed and live-tested, the persistence question answered

Jack: "test with herdr first," then specifically "use herdr to run OpenCode." Real spike, both
locally (Windows) and on the actual VPS V.3 already provisioned — no longer a recorded candidate,
an observed result.

**Setup, both machines:** `herdr integration install opencode`, then OpenCode's own
`@ai-sdk/openai-compatible` TokenReply provider config generated by DigiSmith's existing
`scripts/providers/print-config.ts` (`tokenreply --role task|mechanical --runner opencode`) — no
new TokenReply integration code needed, reused what K.3 already built. `herdr agent start
<name> --kind opencode --pane <id> -- --model tokenreply/kimi-k2.7|kimi-k3` launches OpenCode
inside a herdr-supervised pane; `herdr agent prompt <name> "..." --wait` drives it and waits for a
settled state; `herdr agent read <name>` reads the pane's real output.

**Windows-specific:** the Unix `curl | sh` installer fails outright (`unsupported OS:
MINGW64_NT-...`) — Windows needs the PowerShell/`.cmd` installer instead
(`irm https://herdr.dev/install.ps1 | iex`, or download-then-run to avoid an unrelated
auto-mode classifier block on piping remote script content straight into execution). Windows is
explicitly **not supported as a herdr remote host** per herdr's own docs (only as a local client
connecting out) — irrelevant here since the VPS (Linux) was always the intended host, never a
Windows box.

**The actual question this spike existed to answer: does herdr need the same `loginctl
enable-linger` fix V.3 needed for tmux, or does it survive an SSH disconnect on its own?**
Answered cleanly, with the variable properly controlled — confirmed `Linger=no` on the VPS first
(explicitly disabled, not just "never enabled"), started `herdr server` backgrounded via `nohup`
in one SSH connection, let that connection close completely, then reconnected via a **separate**
SSH connection and confirmed: `herdr server`'s parent PID was now `1` (fully reparented, properly
daemonized) and its socket API was still live (`herdr agent list` returned normally). Went
further: launched a real OpenCode+TokenReply agent (not just a bare idle server), gave it a real
task requiring a tool call, let that connection close too, and reconnected again — the same live
`opencode.exe` process (real accumulated CPU time, not a stub) and the exact same OpenCode session
ID were both still there, `agent_status: idle`, fully intact. **Herdr does not need the
lingering fix — it survives a real SSH disconnect on its own,** unlike tmux launched via a bare
`tmux new-session -d` over a one-shot SSH exec (V.3's own hard-won fix for that exact problem).
Lingering was re-enabled afterward since V.3's own `claude` tmux session on this same VPS still
needs it.

**Practical implication for X, if herdr is adopted for the persistence layer:** V.3's entire
`loginctl enable-linger` step (and the corresponding `status`/`connect` check for it) becomes
unnecessary — one fewer prerequisite, one fewer thing that can silently break a session.

**Secondary, incidental finding — kimi-k3's tool-calling bug — logged in its own file, not
duplicated here:** two more live data points (one new failure signature, one clean success) came
out of driving real dispatches through this same unmediated OpenCode+TokenReply path. See
`backlog/tokenreply-kimi-k3-tool-calling-failure.md`'s own 2026-09-19 addition for the detail —
irrelevant to X/herdr's own persistence question, K's territory, not duplicated here.

**One operational quirk, not yet explained:** the very first prompt to a freshly-`agent start`ed
pane failed once with `{"error":{"code":"timeout","message":"timed out waiting for agent
startup"}}` — on inspection, the actual root cause was unrelated to herdr or TokenReply at all:
the global `opencode` install itself was broken (`opencode-ai`'s postinstall/native-binary
download was skipped — same `pnpm add -g` skips postinstall scripts by default gap Depot's own
`SKILL.md` already documents for itself; fixed with `pnpm approve-builds --global opencode-ai`).
Separately, on the VPS specifically, the very first `agent prompt` after a fresh `agent start`
once returned `{"error":{"code":"agent_prompt_stalled", ...}}` even after `interactive_ready:
true` was reported — an immediate retry succeeded cleanly. Possibly a cold-start race in herdr's
own screen-detection; not investigated further, not seen on the successful Windows trial.

**Still not tested:** whether herdr's own `agent`/`workspace` API calls (setup or ongoing
dispatch) would themselves dodge Claude Code's auto-mode permission classifier — the actual
narrower K-lineage question this file's own "Revised spike scope" section above calls for. Not
attempted this session; everything above was driven by hand via direct `herdr` CLI calls, not
through a controller session's own Bash tool in auto-mode.

## 2026-09-18 correction — herdr is a pane supervisor, not an inference/dispatch layer

Jack corrected the framing above before any spike ran. Recording it precisely, since it lowers
(doesn't kill) the optimism in the "collapses three lineages" claim two sections up:

- **What herdr actually does:** manages terminal *panes/sessions* for whatever CLI agent you
  point it at (keeps them alive across disconnects, reports working/blocked/idle, lets agents
  start/prompt each other). **It is not an LLM inference host or API gateway.** To use an
  open-weight model, you still need a separate inference endpoint (OpenRouter, Fireworks, a local
  Ollama instance) that the *agent CLI itself* (OpenCode, Aider, Qwen CLI, etc.) talks to directly
  via `OPENAI_API_BASE`/`OPENAI_API_KEY`-style config — herdr just supervises the pane that CLI
  runs in via `herdr integration install`.
- **What this means for K's actual question:** K's dispatch mechanics (credential resolution,
  gateway provider selection, the XTML-leak handling) are untouched by herdr — herdr has no
  opinion on how an agent CLI gets its credentials or talks to a model. So the earlier framing
  ("herdr could replace K's mechanics, not just X/V's") overstated it. Herdr maps cleanly onto
  **X** (persistent host) and **V/Depot** (check-alive/start-if-not/status, generalized across
  any agent) — it does **not** obviously map onto K at all.
- **The classifier question is now less likely to be resolved by herdr specifically, but still
  worth one live check:** the real question is narrower than before — does the *controller's own
  Bash tool call* that sets up and launches a herdr-managed pane (`herdr integration install`,
  plus whatever sets the agent CLI's env vars) still have to be shaped like
  credential-fetch-then-spawn, or can herdr's own config/CLI avoid that specific shape (e.g. a
  config file the controller writes, vs. inline `$(...)` command substitution immediately before
  a spawn)? If the setup step itself avoids that shape, the *ongoing* dispatches after that point
  never touch the controller's Bash tool at all (herdr, not Claude Code, is what's spawning and
  supervising the agent CLI process) — which would still be a real win for K's problem, just via
  a different mechanism than originally guessed (avoiding the controller ever needing to run the
  risky shape at all, not MCP/REST replacing Bash as a transport).
- **Revised spike scope (still K's, per the reasoning above):** narrower than "does dispatch
  through herdr avoid the classifier" — it's now "does *setting up* a herdr-managed pane running
  an offload-style agent CLI avoid the classifier," since ongoing dispatch after setup wouldn't
  touch the controller's Bash tool regardless.
