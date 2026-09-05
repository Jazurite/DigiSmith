# TokenReply's kimi-k3 fails tool-calling via claude-code runner (regression)

**Status:** Root-caused and worked around. `scripts/providers/tokenreply.ts`
reverted to `kimi-k2.7` (confirmed working, 2/2 real dispatches) — the
default provider/runner (`tokenreply`/`claude-code`) themselves were
never the problem, only the specific model. TokenReply's or the
model's own underlying bug is unfixed (outside DigiSmith's control);
this file now tracks "don't use kimi-k3 here until that's fixed
upstream," not "investigate further."

**Source:** 2026-09-04, same session that switched TokenReply's model
to `kimi-k3` and the default provider/runner to `tokenreply`/
`claude-code`. Found while investigating K.4 (token usage reporting).

## The bug

Dispatched a trivial real task (`claude -p ... --bare --model kimi-k3`,
`ANTHROPIC_BASE_URL` pointed at TokenReply) via the exact pattern
`offload-implementer` uses. The model did not emit a real tool call —
instead of Claude Code's actual tool-use format, its response content
was literal garbled text:

```
<|open|>tools<|sep|><|open|>call tool="Bash" index="1"<|sep|>...<|close|>
```

Claude Code did not recognize this as a tool invocation, so **nothing
was executed** — no file created, no git commit made. Yet the dispatch
completed normally by every visible signal: `result.is_error: false`,
`subtype: "success"`, `status_category: "review_ready"`. Nothing in the
event stream flags this as a failure. Independently verified against
the real worktree: no new file, `git log` unchanged from before the
dispatch.

This is exactly the "a status reply can lie" failure mode
`offload-implementer`'s own Error Handling section already warns about
— caught live, on the very first real dispatch since today's model
switch.

## Why this matters now

The *earlier* successful smoke test this session (real commit
`10282c6`, independently verified) used `kimi-k2.7` — **before** today's
switch to `kimi-k3`. This is the first real dispatch using `kimi-k3`,
and it failed silently. Correlation isn't proof of causation (only one
data point on each model), but it's the obvious first suspect: either
`kimi-k3` specifically has a tool-calling format incompatibility with
Claude Code's `--bare` mode via TokenReply, or this was a one-off flake
— **not yet distinguished, only one trial run so far on either model.**

## Root cause investigation (2026-09-04, later same session)

Ran a controlled series of live dispatches to isolate the failing variable:

| Dispatch | Model | Runner | Result |
|---|---|---|---|
| Original session trial | `kimi-k2.7` | `claude-code` | ✅ Real commit, verified |
| This investigation, trial 1 | `kimi-k3` | `claude-code` | ❌ Garbled `<\|open\|>tools...` text, no execution |
| This investigation, trial 2 (repeat) | `kimi-k3` | `claude-code` | ❌ Same garbled pattern, different tool (`Write`) |
| This investigation, trial 3 (control) | `kimi-k2.7` | `claude-code` | ✅ Real commit `6ca0a3d`, verified |
| This investigation, trial 4 | `kimi-k3` | **`opencode`** | ❌ **Same garbled pattern**, via a completely different client protocol |

**Conclusion: this is not a Claude-Code-specific or Anthropic-format-translation bug.** Trial 4 used
`opencode`, which talks OpenAI-format function-calling directly via `@ai-sdk/openai-compatible` —
no Anthropic Messages-format translation involved at all — and produced the *identical* garbled
pseudo-tool-call text (`<\|open\|>tools<\|sep\|>...`) as the `claude-code` trials. Since two
fundamentally different calling conventions produce the same broken output, the fault sits
upstream of any client protocol: either TokenReply's specific hosting/config of the `kimi-k3`
route doesn't have tool/function-calling wired up correctly, or the underlying model itself isn't
reliably doing real function calls in this serving setup. `kimi-k2.7` through the identical
`claude-code` pipeline continues to work correctly (2/2 across both sessions).

**Chutes was considered and explicitly ruled out as a workaround** — Chutes also serves `kimi-k3`
(`moonshotai/Kimi-K3-TEE`, its own long-standing `task`-role model) via a completely different
backend, which might not share this bug, but Jack declined that path ("no chutes"). Not tested.

**Dead end, not pursued:** TokenReply's public Models page requires a logged-in account to show
per-model capability tags (whether `kimi-k3` is flagged as tool-calling-capable at all) — didn't
create an account to check this. If revisited, check there first, logged in as an actual
TokenReply user, before any further live dispatch testing.

## Precise root cause identified (2026-09-04, later still)

The garbled text is not garbage — it's **Kimi K3's real, documented native tool-calling format**.
vLLM's own docs (`docs.vllm.ai/en/latest/api/vllm/tool_parsers/kimi_k3_tool_parser/`) describe a
custom "XTML" syntax using exactly the delimiters observed live: `<|open|>`, `<|sep|>`, `<|close|>`,
e.g. `<|open|>tools<|sep|> <|open|>call tool="python" index="1"<|sep|>...` — an exact match to both
this investigation's captured events. vLLM ships a dedicated `KimiK3ToolParser` specifically to
convert this raw format into standard OpenAI-compatible tool calls before returning a response to
the client.

**This means TokenReply's serving of `kimi-k3` is not running the model's raw output through that
conversion step.** If they're using vLLM underneath (the parser's existence as a named, maintained
vLLM component suggests this is a real, non-obscure serving path), they most likely haven't
enabled `--tool-call-parser kimi_k3` for this specific route. This is a concrete, nameable,
almost-certainly-fixable configuration gap on TokenReply's side — not a model failure, not
something wrong with DigiSmith's dispatch construction, and not an unexplainable mystery.

**Two real paths forward, neither pursued yet:**
1. **Report to TokenReply support** with this exact finding — cite the vLLM parser, note the raw
   output matches its documented input format exactly, ask them to enable it for the `kimi-k3`
   route. Likely the fastest real fix if they're responsive, since it names their exact
   misconfiguration rather than just "tool calls don't work."
2. **Build a local translation shim** — DigiSmith could implement the same XTML→tool-call
   conversion vLLM's parser does (the format is simple and regex-parseable per vLLM's own docs) as
   a proxy sitting between Claude Code/OpenCode and TokenReply. Real engineering work: needs a new
   local HTTP proxy layer, since neither `claude -p` nor `opencode` expose a hook to intercept and
   re-parse a response mid-dispatch — this isn't a small patch to `parse-result.ts`, it's new
   infrastructure. Not scoped or estimated.

## Fix applied

`scripts/providers/tokenreply.ts`'s `model()` reverted to `kimi-k2.7` (confirmed working, 2/2).
The default provider/runner choice (`tokenreply`/`claude-code`) was never the problem — only the
specific model — so those defaults stand unchanged. This is a config revert, not a code fix: the
actual bug is external (TokenReply's or the model's own serving setup), outside DigiSmith's
control to fix directly.

## Why not root-caused further

Investigation stopped after four controlled live dispatches gave a confident, consistent signal
(same failure across two different client protocols) — going further (e.g. testing via Chutes, or
logging into TokenReply's dashboard to check model capability flags) needs either Jack's explicit
opt-in on cost/scope (Chutes) or an account he'd need to create himself (TokenReply login). Revisit
by trying `kimi-k3` again after some time (TokenReply may fix their `kimi-k3` route), or by
checking TokenReply's own Models page while logged in for an explicit tool-calling capability flag.
