# K.2 implementer-task offload: Aider + Chutes is the real mechanism, not Chutes MCP

**Status:** Not applied. Raw findings from a live experiment, not a spec —
needs its own brainstorm before becoming a design.

**Source:** 2026-08-26 session, while fixing map item I.1
(`jira-progress-write-back`). Tried using Kimi K3 (Chutes) as an
alternative implementer for I.1's Task 1, hit real limits, and traced
the actual mechanism that would work. K.1's own design spec already
named "implementer-task offload" as K.2, deliberately unscoped — this
is real evidence toward actually designing it, not a duplicate idea.

## What was actually tried, and why it doesn't work as a drop-in

- **Claude Code's `Agent` tool has no non-Anthropic model routing** —
  already known from K.1's own feasibility spike, re-confirmed here.
- **A raw Chutes chat-completion call (what K.1's `model_offload.py`
  already does) has no tool access.** It's single-shot text in, text
  out — no `Read`/`Edit`/`Bash`/`git commit`, no persistent session. Every
  "implementation" attempt required the controller to hand-build the
  prompt, call the API, and apply the result itself. This is fine for
  K.1's actual scope (rewrap a document, render a report) but cannot
  play the implementer role in `subagent-driven-development`, which
  needs autonomous tool use and a resumable context across fix rounds.
- **"Chutes MCP" (the `chutes-mcp-portability` skill's MCP server) is
  the same limitation in a cleaner wrapper.** Its `chutes_chat_complete`
  tool lets an MCP client (including Claude Code) *call* a Chutes model
  as a tool — it does not give the Chutes model itself any tool-calling
  loop. Worth knowing this explicitly: it's easy to assume "Chutes has
  an MCP integration" means the tool-access gap is solved. It isn't.
  This was the direction initially assumed and had to be corrected.

## What would actually work

`chutes-mcp-portability`'s **OpenAI-compat target list** includes
**Aider**, configured via `~/.aider.conf.yml` (`openai-api-base` pointed
at `https://llm.chutes.ai/v1` + a model allowlist). Aider is a real
autonomous coding agent — its own read/edit/commit loop — that runs on
any OpenAI-compatible backend. Pointing it at a Chutes model would make
that model a genuine implementer with real file/git access, driven by
Aider's harness rather than a hand-relayed completion call.

**Not yet verified:**
- Aider isn't installed in this environment (`aider --version` → not
  found).
- The `chutes-mcp-portability` skill's own doc marks the Aider target
  `[BETA] until a completion round-trip is exercised through that
  specific client` — nobody has confirmed Aider's edit-application logic
  actually works cleanly against a Chutes model's output style, Kimi K3
  included.
- Claude Code itself is not a target for custom backend routing (only
  external tools — Cursor, Cline, Aider, Claude Desktop, Hermes). Driving
  Aider would mean shelling out to it as a subprocess (something this
  session already has the access to do directly — no need for a second
  Claude Desktop hop in between, that was floated and clarified away
  mid-session).

## Supporting data (from this session's Kimi K3 / GLM 5.2 experiments)

Relevant to whether Aider+Chutes would actually be *pleasant* to use, not
just technically wired up:

- **Reasoning verbosity is a real cost, not a rate problem.** Kimi K3
  averaged ~25-48 tokens/sec across three real calls (not slow in
  absolute terms — reasonable for TEE-hosted inference on decentralized
  GPU infra) but burned ~14,600+ tokens of visible chain-of-thought on a
  large one-shot prompt before producing any of the actual requested
  content. A bounded, single-question ask (find the bug in one ~15-line
  snippet) finished cleanly in 45s / ~1,100 output tokens and
  **independently found the same real bug a Claude reviewer had already
  found** (a date-prefix string-match collision), with an arguably
  *better* fix (boundary check vs. full-string equality). GLM 5.2 did
  markedly worse on an even smaller ask — burned its entire budget on
  elaborate structured reasoning for a one-sentence question and hit
  `finish_reason: "length"` without ever answering.
- **Implication for Aider specifically:** Aider's turn-by-turn,
  incrementally-scoped interaction pattern (one file/change at a time)
  is structurally closer to the bounded asks that worked well today than
  to the one-shot mega-prompt that didn't. That's a point in favor of
  this path, not just a caveat — but it's an inference, not something
  confirmed by an actual Aider session yet.
- **Cost is not the constraint.** The account is on Chutes' $10/month
  subscription (bundles $50/month of usage-value); actual spend from
  today's four Kimi calls was $0.31, comfortably inside the cap. Model
  choice and mechanism are the open questions here, not price.

## Suggested shape for a future K.2 brainstorm

- Install and configure Aider against Chutes (pick a model — Kimi K3 and
  GLM 5.2 are both live and tool-capable per today's `/v1/models` query;
  today's data leans toward Kimi given GLM's poor showing even on a
  trivial ask, but that's one data point per model, not a real
  comparison).
- Validate on a small, bounded, already-scoped task first — mirroring
  today's own methodology (smoke test → bounded single-question test →
  only then something larger) — rather than trusting it on a real
  `subagent-driven-development` task cold.
- Decide how this interacts with the existing review/fix-loop machinery:
  does an Aider-produced diff still go through the normal task-reviewer
  dispatch? Almost certainly yes, unchanged — Aider replaces the
  implementer role, nothing about spec-compliance/quality review changes.
- K.1's design spec already flagged this exact area's real risk:
  "carries real code-quality risk and interacts with the existing
  review/fix-loop machinery." Nothing found today reduces that risk —
  if anything, GLM 5.2's result is a concrete example of it (a capable
  model producing nothing usable on an easy task because of unmanaged
  reasoning verbosity).
