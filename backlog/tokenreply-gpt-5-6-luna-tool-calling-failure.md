# TokenReply's gpt-5.6-luna also fails tool-calling via claude-code runner

**Status:** Confirmed live, unfixed. Distinct bug from
`tokenreply-kimi-k3-tool-calling-failure.md` — different vendor, different
failure signature, same underlying symptom class (TokenReply's proxy not
correctly translating a model family's native tool-calling output into
the format the calling client expects).

**Source:** 2026-09-05. Found while live-testing `gpt-5.6-luna`
(scripts/providers/tokenreply.ts's documented "available but not default"
option — 100% availability, cheapest of the gpt-5.6 family, "cursor"-tagged
as coding-agent-suitable per TokenReply's own catalog) via the same
disposable-worktree live-test pattern used throughout this project's
TokenReply investigation.

## The bug

Two live dispatches, same trivial create-file-and-commit task, same
pipeline (`claude -p --bare --model gpt-5.6-luna`, `ANTHROPIC_BASE_URL`
pointed at TokenReply, `claude-code` runner) — **two different failure
signatures, neither one a working tool call:**

**Trial 1** — silently claimed success while doing nothing. The final
`result` text was a JSON-stringified array containing a text block plus a
bare, empty `{"type":"tool_use"}` stub — no `id`, no `name`, no `input`,
nothing. `is_error: false`, `subtype: "success"`. No file created, no
commit made, independently verified via `git log`/`cat`. Cost: $0.011855,
5 turns.

**Trial 2 (repeat)** — the model itself replied `Status: BLOCKED\nCommits:
none` — an honest failure report this time, not a lie. Still 0 commits, 0
file, across 2 turns. Cost: $0.019195.

Neither trial produced a working outcome. The failure signature is not
consistent between runs (silent-fake-success once, honest BLOCKED once),
which matters practically: **a detector built around Kimi K3's specific
XTML marker pattern (`<|open|>tools<|sep|>`) would not catch this at
all** — this looks like a different translation gap entirely (most likely
TokenReply's proxy failing to correctly accumulate/finalize GPT's own
native streamed tool-call format into Anthropic's `tool_use` block shape,
producing an empty stub instead), not the same root cause as the Kimi
bug, even though the end-user-visible category (broken tool-calling
through this gateway) is the same.

## Likely root cause, same shape as Kimi's (2026-09-05)

Checked vLLM's own tool-parser catalog (same reference clone used for the
Kimi K3 investigation, `D:/Workspace/Library/vllm/vllm/tool_parsers/`) for
a GPT-family entry: `gptoss_tool_parser.py` exists, but `GptOssToolParser`
is a **stub that raises `NotImplementedError`** if actually invoked — its
own docstring says real parsing for OpenAI's `gpt-oss` family is handled
by a separate `HarmonyParser`, not the generic tool-parser mechanism at
all. "Harmony" is OpenAI's own structured response format (distinct
channels, not a simple tool_use block) — a second, independent
confirmation of the same general pattern found with Kimi: **a GPT-family
model has its own non-trivial native output format requiring a dedicated
decoder, and the malformed stub captured live is consistent with
TokenReply passing raw, undecoded Harmony-formatted content straight
through**, the same "no transformation happening" failure shape as the
Kimi bug, just a different native format underneath. Not proven (no raw
Harmony sample was captured to compare byte-for-byte, unlike Kimi's exact
XTML match), but a strong, evidence-backed hypothesis.

**Broader implication, raised directly by Jack:** if TokenReply's actual
architecture is "thin proxy, no real transformation" rather than a real
gateway, this isn't a per-model bug to individually root-cause and
fix — it's a structural property of the vendor. Any future multi-model
routing work (see `native-model-router-z.md`) needs its own
transformation layer per model family (Kimi's XTML, GPT's Harmony,
whatever else), not an assumption that the gateway normalizes anything.

## Why this matters

`gpt-5.6-luna` was noted as an available, cheap, coding-agent-suitable
option (see `scripts/providers/tokenreply.ts`'s own comment) but is
**not currently usable for real offloaded implementer work** — the same
practical conclusion as `kimi-k3`. Unlike `kimi-k3`, there's no known
working fallback model in the same "family" confirmed yet (kimi-k3's
sibling `kimi-k2.7` is confirmed working; no equivalent check has been
done for a different GPT-family model or a non-`luna` gpt-5.6 route like
`sol`/`terra`, which the same code comment notes as "same underlying
GPT-5.6 generation routed differently").

## Open questions, not yet investigated

- Does this reproduce via the `opencode` runner too (OpenAI-format
  function-calling, no Anthropic-format translation involved), the same
  isolation test that was done for kimi-k3? Not yet tried for this model.
- Does `sol` or `terra` (same GPT-5.6 generation, different route per
  TokenReply) fail the same way, or is this `luna`-route-specific?
- Is there a working non-GPT, non-Kimi model on TokenReply confirmed
  reliable for tool-calling, or is `kimi-k2.7` currently the only
  confirmed-working option through this gateway?
- Given `kimi-k3-xtml-tool-call-recovery`'s parser/detection approach was
  built specifically around Kimi's documented XTML format, would a
  similar recovery mechanism even be buildable here? The malformed
  `{"type":"tool_use"}` stub carries no recoverable information (no tool
  name, no arguments) — unlike Kimi's leak, which at least contains the
  full intended call in a parseable (if wrong-format) shape. This may be
  a case where recovery isn't possible at all, only detection-and-BLOCKED.

## Why not fixed yet

Found live during exploratory testing, not yet root-caused to the same
depth as the Kimi K3 bug (no vLLM-equivalent reference implementation
checked for GPT-5.6's own native tool-call format, if TokenReply is evens
running an OpenAI-compatible serving stack with a similar
translation-layer gap). Revisit if `gpt-5.6-luna` (or another
TokenReply-hosted GPT model) becomes something you actually want to use
for real work — right now `kimi-k2.7` remains the only confirmed-reliable
option on this gateway.
