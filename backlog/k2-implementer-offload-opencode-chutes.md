# K.2 implementer-task offload: OpenCode + Chutes, spike passed

**Status:** Not applied. A real spike passed — a Chutes-hosted model,
driven by a real agentic harness, autonomously read a file, ran a test
suite, diagnosed a bug, fixed it correctly, and verified the fix, on its
own. Still needs an architectural brainstorm before becoming a design —
the mechanism is proven, the integration into `subagent-driven-development`
is not designed.

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
at `https://llm.chutes.ai/v1` + a model allowlist) — a real autonomous
coding agent with its own read/edit/commit loop, backend-swappable.
Aider was the first candidate tried and turned out to be a dead end in
*this* environment specifically: **Aider requires Python <3.13, and this
machine only has 3.14.5.** Every real release (up to 0.86.2 as of
2026-08-26) declares that upper bound; only ancient pre-2024 releases
(≤0.16.0, which never declared the bound) install, and those predate
most of what makes Aider usable. Getting real Aider running here would
need either installing a second Python interpreter or running it inside
a container — Docker is installed on this machine but its daemon wasn't
running and starting it wasn't pursued, since a substitute was found.

**OpenCode** (`opencode-ai` on npm, `opencode.ai`) turned out to be the
actual working substitute — same category of tool (autonomous
read/edit/commit agent, backend-swappable via an OpenAI-compatible
config), but Node-based, so it sidesteps the Python-version problem
entirely. This is what the spike below actually used.

**Install gotcha (this repo/team uses pnpm, not npm):**
`pnpm add -g opencode-ai` installs but the binary fails immediately —
pnpm skips postinstall scripts by default, and OpenCode's postinstall
step is what actually sets up the platform binary. Fix:
```
pnpm add -g --allow-build=opencode-ai opencode-ai
```
(A first attempt without `--allow-build` had already installed;
`pnpm remove -g opencode-ai` first, then the command above, to get a
clean postinstall run — reinstalling on top without removing skipped the
postinstall a second time since pnpm saw the package as already present.)

**Custom-provider config** (`opencode.json` in the working directory —
per-project, not global):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "chutes": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Chutes",
      "options": {
        "baseURL": "https://llm.chutes.ai/v1",
        "apiKey": "{env:CHUTES_API_KEY}"
      },
      "models": {
        "moonshotai/Kimi-K3-TEE": {
          "name": "Kimi K3 (Chutes)",
          "limit": { "context": 1048576, "output": 65535 }
        }
      }
    }
  }
}
```
Run non-interactively with `opencode run --auto --model
chutes/moonshotai/Kimi-K3-TEE "<task>"` — `--auto` auto-approves file
edits, required since there's no human to approve them turn-by-turn.

## Spike results (2026-08-26) — passed

Set up a disposable scratch repo (Python, pytest) with a deliberately
seeded bug: a date-matching function using `str.startswith`, which
falsely matches `"3/1"` against `"3/12"` (this is literally the real bug
found in I.1's `jira-progress-write-back` SKILL.md, reproduced as a
standalone, objectively-verifiable case rather than reused from that
real work directly). 5 tests, 1 failing (confirmed RED first).

Task given to OpenCode/Kimi K3: *"Run the tests, fix the bug in
matcher.py so all tests pass, don't weaken the tests."* No hint about
what the bug was.

**What happened, autonomously, no hand-holding:** listed the directory,
read both files, ran `pytest` itself, diagnosed the exact bug from the
failure output, edited `matcher.py` with a real diff, re-ran `pytest` to
confirm GREEN, reported back with an accurate plain-English explanation.
Independently verified after the fact (not just trusting the tool's own
report): re-ran `pytest` myself — genuinely 5/5 passing; `git diff`
confirmed the actual change matches what was reported; `test_matcher.py`
was untouched, respecting the "don't weaken the tests" instruction.

**Fix quality:** used a boundary check (next character after the matched
date must be non-digit) — the same approach Kimi proposed earlier this
session via a raw completion call on the real I.1 bug, not a fluke.
Correctly preserved the case where a heading has trailing text after the
date.

**Speed:** fast — no sign of the runaway reasoning-verbosity problem seen
with raw one-shot completion calls earlier this session. Supports the
hypothesis already noted below: a real tool-use loop (read → test result
→ decide → edit → re-verify, each step naturally bounded) is a
structurally better fit for Kimi than one giant unstructured prompt
asking for everything at once.

**Not yet tested:** anything bigger than a 2-file, single-function bug.
A real `subagent-driven-development` task (multi-file, an actual
Markdown-instruction-file target like I.1's own SKILL.md, ADF JSON
construction) is a meaningfully larger ask than this spike's scope.

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
- **Confirmed, not just inferred, by the spike below:** a real
  tool-use harness's turn-by-turn, incrementally-scoped interaction
  pattern (one file/change/test-run at a time) is a structurally better
  fit for Kimi than the one-shot mega-prompt that didn't — the spike
  ran fast with no sign of the runaway reasoning problem.
- **Cost is not the constraint.** The account is on Chutes' $10/month
  subscription (bundles $50/month of usage-value); actual spend from
  today's four Kimi calls was $0.31, comfortably inside the cap. Model
  choice and mechanism are the open questions here, not price.

## Suggested shape for a future K.2 brainstorm

The mechanism is proven at small scale; what's still undesigned is the
integration:

- **Try a real, larger task next** before trusting this in the actual
  `subagent-driven-development` loop — something closer to a real DigiSmith
  task's shape (a multi-file change, or a Markdown-instruction-file
  target like a SKILL.md, not a single Python function). This spike
  deliberately stayed tiny; scale is the next open question, not whether
  the mechanism exists at all.
- **Model choice**: today's data leans toward Kimi K3 over GLM 5.2 (GLM
  failed even a trivial one-shot completion earlier this session), but
  that's one data point per model on two very different task shapes (raw
  completion vs. tool-use loop) — worth re-testing GLM inside OpenCode
  specifically before ruling it out; the tool-use loop's bounded steps
  might suit it better than the one-shot prompt did.
- **Review/fix-loop integration**: does an OpenCode-produced diff go
  through the normal task-reviewer dispatch unchanged? Almost certainly
  yes — OpenCode replaces the implementer role only, spec-compliance/
  quality review shouldn't need to change. Worth confirming, not
  assuming.
- **Failure/fallback behavior**: K.1's `model_offload.py` pattern always
  falls back to in-session generation on any failure. Does K.2 need the
  same — if OpenCode/Kimi gets stuck or produces something wrong, does
  control silently fall back to a real Claude implementer dispatch, or
  does it surface as a failure requiring a human decision? The stakes
  are higher here than K.1's (a full implementer task, not a document
  rewrap), so silent fallback deserves real scrutiny, not just reuse of
  K.1's pattern.
- **When to prefer this over Claude at all**: cost isn't the driver
  (subscription already covers usage) — so what is? Worth being honest
  that today's evidence doesn't yet show OpenCode+Kimi is *better* than
  a Claude implementer, only that it's *viable*. The real driver might be
  something else entirely (running implementer tasks in parallel across
  providers, load-shedding, or just an interesting comparison), not a
  cost or quality win established here.
- K.1's design spec already flagged this area's real risk: "carries real
  code-quality risk and interacts with the existing review/fix-loop
  machinery." Today's spike reduces that risk (the mechanism itself
  isn't a mirage) but doesn't retire it — a five-file, well-specified fix
  is not evidence about a real multi-task plan.
