# Automatic model/vendor routing (K.9)

**Status:** Idea only, not scoped. Depends on K.3 (shipped).

**Map item:** **K.9**, sibling to K.2–K.8 under **K** ("Model tiering").

**Source:** 2026-09-04, same session as K.8, the TokenReply → `kimi-k3`
model switch, and switching the default provider/runner to
`tokenreply`/`claude-code`. Surfaced when Jack asked "have we discussed
the model router?" — the answer was no, only adjacent pieces.

## The idea

K.3 built a **static, manual choice**: each profile's
`task_offload_provider` field names exactly one gateway (`chutes` or
`tokenreply`), and `scripts/providers/registry.ts` is a plain
name-to-object lookup — no logic, no criteria, no decision-making.
Whatever the profile says is what runs, every time, for every task,
regardless of that task's size, cost sensitivity, latency needs, or
which model is actually best/cheapest/fastest for it right then.

A real **model router** would pick the vendor/model per task
automatically, based on some criteria, instead of a fixed profile
setting. The map's own **K** entry already names this exact gap —
"multi-provider routing beyond the single hardcoded Chutes provider" —
as explicitly left undesigned once K.1/K.2 shipped. It has a home on
the map; it was just never turned into a real, numbered item until now.

## Why this isn't the same as K.5, K.7, or K.8

Easy to conflate with three existing K-lineage ideas — worth being
explicit about the difference:

- **K.5** (run the same task through two gateways simultaneously) is a
  **comparison** mechanism — both dispatches happen, for A/B evaluation.
  A router picks **one**, deciding, not comparing.
- **K.7** (vendor benchmark) is an **offline evaluation** exercise —
  producing numbers to inform a human's choice. A router acts on
  criteria **at dispatch time**, live, with no human in the loop.
- **K.8** (persistent worker pool) is **concurrency infrastructure** —
  how many workers are warm and how a dispatch claims one. It says
  nothing about *which vendor/model* a given dispatch should use; a
  router could plausibly sit on top of K.8's pool once both exist, but
  neither depends on the other to be built first.

## Open questions, not yet scoped

- What criteria would actually drive a routing decision? Candidates,
  none evaluated: task/prompt size vs. a vendor's context window (K.3's
  `contextWindow` field already exists per-provider, currently unused
  for any decision), real-time cost (K.4's job, once it exists),
  observed latency or error rate (nothing currently tracks this),
  static task-type hints (e.g. "this is a fix round, always cheap").
- Is a human override still required, or fully automatic? Given this is
  a personal, single-operator tool, a fully automatic router with no
  visibility into *why* it picked what it picked could be harder to
  debug than today's static, explicit profile setting — worth weighing
  against the value of automation before designing this for real.
- Where would this actually live — a new step inside
  `offload-implementer`'s existing Step 1 (replacing the plain profile
  read with a decision), or a separate resolution layer `registry.ts`
  grows into? `registry.ts` today is intentionally dumb; making it
  smart is a real scope change to something else currently depends on
  staying simple.

## Expanded framing (2026-09-04, later same session)

Jack's actual vision is bigger than routing inside
`digismith:offload-implementer` alone: he wants per-task model
selection built into **`subagent-driven-development` itself** — so any
implementer task in a plan could route to an open-weight model, OpenAI,
or xAI, not just Claude — rather than that capability living only in a
separate, explicitly-invoked side-channel the way K.2 does today. "We
don't need to limit onto just Claude Code models" — his words.

**A real technical wall, already documented in this project's own
history:** K.1's original design doc found that **Claude Code's `Agent`
tool has no per-subagent non-Anthropic routing at all**. That finding is
*why* K.2 was built as a side-channel in the first place — the
controller drives an external CLI (`opencode`/`claude -p`) directly,
bypassing the `Agent` tool entirely, for exactly one explicitly-offloaded
task at a time. Making this native to `subagent-driven-development`
itself would mean the primitive's own dispatch loop needs the same kind
of bypass, generalized across *every* task in a plan, decided
automatically rather than opted into per-task by name.

**This sits at a real boundary between two map letters, not just K:**
the motivation is K (model tiering), but the actual mechanism is
modifying `subagent-driven-development` — a **vendored Superpowers
primitive**, squarely map item **W**'s territory (primitive ownership,
content activation). W.4 (2026-09-04, same day) already activated
`finishing-a-development-branch` with real content divergence from
upstream — this would be the same kind of move, applied to a much more
central primitive. Captured here in K.9 for now per Jack's own choice,
*not yet raised with whichever session/thread is driving W* — flag this
explicitly before actually designing the mechanism, so W's own
activation work and this don't collide or duplicate effort.

## Reference implementations found (2026-09-04, later same session)

Two concrete pieces of prior art surfaced, both outside DigiSmith's own
repo — worth designing from rather than starting blind:

**`chutes-routing` skill** (`~/.claude/skills/chutes-routing`, a general
personal Chutes tool, no DigiSmith connection). Its "Intents → recipes"
table maps a named intent (`interactive-fast`, `cheap-background`,
`agent-coder`, etc.) to a filter + ranking + routing-strategy suffix
against Chutes' live `/v1/models`, with a `build_pool.py` script that
turns an intent into an inline routing string or a pinned alias. A
real, working example of intent-based selection — scoped to one
vendor's own routing feature, not cross-vendor.

**`agentic-flow`** (github.com/ruvnet/agentic-flow, cloned for reference
to `D:/Workspace/Library/agentic-flow`). The top-level project is a much
larger, heavily-marketed multi-agent swarm framework (self-learning
hooks, a custom vector DB, custom attention kernels) that DigiSmith has
no use for — but its router subsystem specifically
(`agentic-flow/src/router/`) is real, working code, not just marketing:

- **`ModelRouter`** (`src/router/router.ts`) — pluggable providers
  (Anthropic, OpenRouter, Ollama, Gemini, ONNX-local), config loaded
  from file or env vars with a documented fallback-path chain, metrics
  tracking built in.
- **`CostOptimalRouter`** (`src/router/cost-optimal-router.ts`) —
  embedding-based k-NN provider selection with a bounded LRU embedding
  cache, not just a static lookup — genuinely closer to the "Request
  Analyzer" tier of the general multi-tier routing pattern than
  anything DigiSmith has today.
- **`LLMProvider` interface** (`src/router/types.ts`) — `chat()`,
  `stream()`, `validateCapabilities()`, capability flags
  (`supportsStreaming`/`supportsTools`/`supportsMCP`) — structurally
  close to K.3's own `GatewayProvider` interface, just more developed.
- Design rationale written up in
  `agentic-flow/docs/architecture/MULTI_MODEL_ROUTER_PLAN.md`.

**Real gaps against what Jack actually wants:** no Chutes or TokenReply
provider exists in it (would need to be added, following its own
`LLMProvider` shape); no xAI provider either, though OpenRouter itself
can proxy to many models including some open-weight ones. Its
self-contained-ness under `src/router/` (i.e. whether it has zero real
coupling to the swarm/AgentDB parts of the codebase) has not been
verified — check before assuming it can be lifted out cleanly.

**RouteLLM** (github.com/lm-sys/RouteLLM, cloned for reference to
`D:/Workspace/Library/RouteLLM`). The most credibly-validated find so
far — built by the LMSYS/Chatbot Arena team, backed by a published
paper (arxiv.org/abs/2406.18665) and blog post, not just marketing
copy. Real, distinct architecture from both finds above:

- **Binary strong/weak routing, not N-way.** RouteLLM routes each query
  to exactly one of two models — a designated "strong" (expensive) and
  "weak" (cheap) model — via a trained classifier that scores the query
  against a calibrated *cost threshold* (`python -m
  routellm.calibrate_threshold` tunes this against real usage data,
  e.g. Chatbot Arena preference data). This is narrower than
  `agentic-flow`'s N-provider `ModelRouter`, but it maps directly onto
  the "Orchestration & Escalation" tier of the general 3-tier pattern
  Jack found earlier — it's a working example of *that one tier*
  specifically, not a full router.
- **Four real router implementations**, not one heuristic:
  `MatrixFactorizationRouter` (`mf`, the recommended default),
  `CausalLLMRouter`, `BERTRouter`, `SWRankingRouter` — plus a
  `RandomRouter` baseline for comparison. (`routellm/routers/routers.py`)
- **Published, credible numbers:** up to 85% cost reduction while
  maintaining ~95% GPT-4-level quality on MT Bench, per their own
  benchmarks — a real evaluation methodology exists here, unlike
  `agentic-flow`'s unsubstantiated percentage claims.
- **Built on LiteLLM** for the actual model calls — ties directly back
  to LiteLLM being independently identified as the leading gateway
  candidate in the earlier web research.

**Real constraints against DigiSmith's stack:** it's a **Python**
package (`pip install routellm`), not TypeScript — a real integration
mismatch against `scripts/providers/*.ts`'s existing all-TypeScript
shape. It also **requires an `OPENAI_API_KEY` regardless of which
strong/weak models are actually used** — the `mf` and `sw_ranking`
routers need OpenAI's embeddings API to analyze each query, so this
dependency exists even if neither the strong nor weak model is
OpenAI's. Worth weighing against a Chutes/TokenReply-only setup with no
other OpenAI access.

## References

Running collection of external resources found while researching K.9 —
articles, repos, papers. Add to this list as more surface; don't fold
new ones into the narrative sections above unless they change the
actual design direction.

- [chutes-routing skill](file:///C:/Users/jazurite/.claude/skills/chutes-routing) — local, personal, general Chutes tool (no URL); intent → recipe table
- [agentic-flow](https://github.com/ruvnet/agentic-flow) — cloned to `D:/Workspace/Library/agentic-flow`; router subsystem is real, rest of the framework is overscoped
- [RouteLLM](https://github.com/lm-sys/RouteLLM) — cloned to `D:/Workspace/Library/RouteLLM`; LMSYS/Chatbot Arena team
  - [Paper](https://arxiv.org/abs/2406.18665)
  - [Blog post](http://lmsys.org/blog/2024-07-01-routellm/)
- [Stop Paying GPT-4 Prices for "Hello World": Build an Intelligent Multi-LLM Router with Agno v2, FastAPI & Docker](https://medium.com/@nomannayeem/stop-paying-gpt-4-prices-for-hello-world-build-an-intelligent-multi-llm-router-with-agno-v2-09ed15a2755b) — Nayeem Islam, Mar 2026. Assigns each query a required "capability score" (0-1: a greeting ≈0.1, complex debugging ≈0.85) and picks the cheapest model clearing that threshold — an ER-triage metaphor (admin staff vs. the specialist) for the same escalation idea RouteLLM's cost-threshold does more rigorously. Built on **Agno** (a Python agent framework) + FastAPI + Docker. Not yet inspected beyond this summary — worth a closer look for the capability-score framing specifically, less for Agno itself.
- [Best LLM routers and model routing platforms in 2026 — Braintrust](https://www.braintrust.dev/articles/best-llm-routers-2026)
- [LiteLLM vs OpenRouter (2026) — TrueFoundry](https://www.truefoundry.com/blog/litellm-vs-openrouter)
- [LLM Gateways Compared 2026 — Wavect](https://wavect.io/blog/llm-gateway-router-comparison-2026/)
- [Best Open-Source LLM Router 2026 — ClawRouters](https://www.clawrouters.com/blog/best-open-source-llm-router)
- [Multi-Tier LLM Routing — Emergent Mind](https://www.emergentmind.com/topics/multi-tier-llm-routing)
- [Intelligent LLM Routing: Cost & Quality-Aware Selection — TrueFoundry](https://www.truefoundry.com/blog/llm-routing-cost-quality-aware-model-selection)
- [LLM Routing and Model Cascades — TianPan.co](https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades)

## Why not applied yet

Idea only, captured verbatim per Jack's request rather than
brainstormed. Depends conceptually on K.3 (shipped) and probably wants
K.4's real-cost data and K.7's benchmark results to exist before
routing criteria can be chosen with any confidence — designing the
mechanism before there's real data to route on risks guessing. The
expanded framing above additionally depends on W's own activation
mechanism (W.2) and precedent (W.4) existing first, since the real
build here is a `subagent-driven-development` content activation, not
a DigiSmith-only feature.
