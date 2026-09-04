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

## Why not applied yet

Idea only, captured verbatim per Jack's request rather than
brainstormed. Depends conceptually on K.3 (shipped) and probably wants
K.4's real-cost data and K.7's benchmark results to exist before
routing criteria can be chosen with any confidence — designing the
mechanism before there's real data to route on risks guessing.
