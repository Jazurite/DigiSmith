# TokenReply's kimi-k3 fails tool-calling via claude-code runner (regression)

**Status:** Root-caused, and a working recovery mechanism now exists and
has been live-verified end-to-end for `kimi-k3` — distinct from the
earlier "reverted to `kimi-k2.7`, unfixed" status below. A parser
(`scripts/runners/kimi-k3-xtml-parser.ts`) detects and decodes the raw
XTML leak, detection is wired into both runners' `parseResult`, and a
documented manual-recovery procedure (`skills/offload-implementer/SKILL.md`
Step 5.5) walks decoding the leaked text, re-executing the intended
call by hand, and then **resuming the model's own session
(`--resume "<sessionID>"`) with a result summary** so it can continue
reasoning and, if needed, attempt further steps itself.

**Agentic Bridge (K.9), live-verified 2026-09-10, with an important caveat:**
a local HTTP proxy (`scripts/agentic-bridge/server.ts`) that repairs a leaked
XTML response into a real `tool_use` block before Claude Code's own agentic
loop sees it — the goal being a single ordinary `claude -p --model kimi-k3`
dispatch that just works, no `--resume`, no manual recovery. A real dispatch
through the proxy (disposable scratch worktree, single-file-create-and-commit
task, exact pattern from this file's own live tests) completed in **one
dispatch, no `--resume`**, with two genuine `tool_use` blocks executed
(`Bash` create, `Bash` commit) and a real verified commit
(`13939fa`). `parse-result.ts` showed no `xtmlLeakDetected` field at all.

**The caveat: the leak did not reproduce today, at all, in 4 separate real
`kimi-k3` dispatches** — though the four carry unequal evidentiary weight.
Two have full captured evidence (raw command, `parse-result.ts` JSON output,
and a `grep -c` marker-count, independently verified): the proxy-routed
dispatch above, and one control dispatch sent directly to TokenReply
bypassing the proxy entirely (same task pattern, zero XTML markers anywhere
in the raw event stream). The other two are narrative-only in the source
report — a commit SHA confirmed to exist but no separately pasted
`parse-result.ts` output or raw event-stream grep: a second
direct-to-TokenReply control (same task pattern, commit `2c17588`,
described as clean) and a second proxy-routed dispatch using a
heredoc-style Bash prompt (the same tool shape that leaked in this file's
own Round 2, commit `beec20b`, also described as clean). So this is the
"OR the model happened not to leak this particular time" branch, not
confirmed evidence of the proxy silently repairing a real live leak —
TokenReply's `kimi-k3` route may have been fixed upstream since this
file's 2026-09-04/05 trials (5-6 days prior), or the leak is intermittent
and today's 4 trials (2 fully evidenced, 2 narrative-only) simply didn't
hit it. The
repair path itself (`hasXtmlToolCallChannel` → `extractXtmlToolCalls` →
`applyToolCallFix`) remains verified only at the unit/integration-test level
(`scripts/agentic-bridge/server.test.ts`'s "repairs a leaked XTML response
into a real tool_use block" test, part of 31 passing tests across the
proxy's three test files, all unmodified/already-reviewed) — never observed
firing against a genuine live leak. If `kimi-k3` is used unattended at
scale and leaks resurface, the Agentic Bridge should repair them per that
tested code path, but this remains inferred from unit tests plus the
design's own correctness, not from a live-fire observation. No regressions
found: nothing about routing through the proxy broke anything relative to
going direct to TokenReply.

**Also still unverified: which response mode the proxy actually exercised.**
Task 3's SSE-wrapping path (the proxy mirrors whatever `stream` value the
client's own request specifies, wrapping a buffered response in a full
Anthropic SSE event sequence when the client asked for one) was flagged in
the design doc's "Open risks" section as a genuine unknown until a live
test: does `claude -p`'s own HTTP client actually request `stream: true`,
and does the SSE-wrapping path get exercised at all in a real dispatch, or
is it dead code in practice? Today's live dispatch went through the proxy
successfully, but this question remains open —
`scripts/agentic-bridge/server.ts` has no per-request logging (its only
`console.log` is the startup line), so nothing records which branch a
given request took, and
none was captured at dispatch time. So we know a dispatch succeeded through
the proxy, but not whether it took the streaming (SSE) branch or the
plain-JSON branch. A future live test could add a temporary `console.log`
noting which branch fired to settle this.

Two rounds of live verification exist. **Round 1** (2026-09-05) covered
decode-and-execute only — it never actually invoked `--resume`, so the
one thing this task exists to prove (that the documented resume loop
itself functions) went unverified; a task-7 fix round was dispatched
specifically to close that gap. **Round 2** (2026-09-05, fresh disposable
scratch worktree, real `kimi-k3` dispatch via TokenReply) did invoke
`--resume` for real, twice, and observed:
- The leak reproduced cleanly on the fresh dispatch (`xtmlLeakDetected:true`,
  a `Bash` heredoc call this time — a second tool shape after Round 1's
  `Write`, still a clean, no-renaming argument mapping).
- Decoded and executed that call by hand (created the file), then
  **resumed the same session** with a plain-text summary of what was
  done. `--resume` genuinely continued the original session (confirmed
  by an identical `sessionId` across all three dispatches) and the model
  correctly tracked task state, asking for exactly the one remaining step
  (`git add && git commit`) without needing to be re-told the original
  task.
- That next tool-call attempt **also leaked** (`xtmlLeakDetected:true`
  again, same session) — i.e. resuming does **not** make the underlying
  gateway tool-calling bug go away; it recurs on the next real tool-call
  attempt within the same resumed session, exactly as Step 5.5's
  recurrence-handling clause anticipates. Decoded and executed that
  leaked call by hand too (the real `git commit`), then resumed a second
  time (2 resume attempts total, within the documented cap).
- With no further action left to attempt, that second resume produced a
  clean, non-leaked final `DONE` reply — the loop terminated correctly.
- Independently verified: real commit `5316f78`
  (`5316f786699fd8a68645d872d31c8024bb9625da`) exists in the (now-deleted)
  scratch worktree, matching the exact requested file content and commit
  message.

**Important nuance, stated plainly:** every actual file/git mutation in
Round 2 was performed by the controller (Claude) manually replaying the
decoded tool call, per Step 5.5's own documented step — not by the
resumed `kimi-k3` session successfully executing a real tool call through
TokenReply's gateway. `--resume` never caused the gateway's tool-calling
to start working; its verified value is strictly session
continuity/context-tracking across the decode-execute-resume loop, and
correctly recognizing when nothing further remains to do. The underlying
TokenReply/`kimi-k3` serving bug (missing XTML-to-tool-call conversion,
see "Precise root cause identified" below) is unfixed and recurs on every
real tool-call attempt observed across both rounds — resuming does not
work around it, it only lets the documented recovery loop keep making
progress one manually-executed step at a time, **bounded by the shared
fix-round cap (3)** — every recovery cycle burns one of those 3 rounds,
so this mechanism is only viable for tasks needing roughly 3 or fewer
tool calls total; a live test creating just one file and one commit
already consumed 2 of 3, and a real task with ~10 tool calls would
exhaust the budget before completing and could never even reach a
review fix round. `kimi-k2.7` remains the shipped default in
`scripts/providers/tokenreply.ts` (`kimi-k3` still isn't safe to use
unattended) — this recovery mechanism is for when `kimi-k3` is
deliberately selected and the leak is hit, not a reason to switch the
default back yet. TokenReply's or the model's own underlying serving bug
is still unfixed upstream (outside DigiSmith's control).

**Still unverified:** multi-call-per-turn recovery remains unverified —
all four real dispatches across this whole investigation (the original
investigation's two failing trials plus both Task 7 live-test rounds)
made exactly one tool call per leaked turn, so recovery of a turn
leaking more than one call has never been exercised against a real
dispatch. Argument-shape risk (the decoded call's arguments needing
renaming to match Claude Code's own tool schema) has 4 clean real-world
data points so far — 2 `Bash`, 2 `Write`, across the original
investigation and both Task 7 live-test rounds — all clean with no
renaming needed; `Edit`/`Read`/`Grep`/`Glob` shapes remain untested.

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
