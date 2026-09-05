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

## Open questions, not yet investigated

- Does this reproduce consistently on `kimi-k3`, or was it a one-off?
  Needs repeat trials.
- Does `kimi-k2.7` still work reliably now, or would a repeat trial
  against it also fail (i.e. is this a TokenReply-side or Claude-Code-
  side regression unrelated to which model is named)?
- Does the same failure happen via the `opencode` runner instead of
  `claude-code`, or is this specific to how `claude -p --bare` sends
  its tool schema?
- Is this a known TokenReply issue (e.g. their proxy not translating
  tool-call format correctly for this specific upstream model), or a
  Claude Code / kimi-k3 native incompatibility that would reproduce
  even hitting Moonshot's own API directly?

## Why not fixed yet

Found during an unrelated K.4 investigation, at the end of a long
session. Jack's call: document it and move on rather than debug now —
"we'll come back and fix whatever problem with TokenReply." **Until
this is resolved, treat the current shipped default
(`tokenreply`/`claude-code`/`kimi-k3`) as unverified for real work** —
the one real dispatch made against it failed silently. Revisit
`profiles/*.yml` and `scripts/providers/tokenreply.ts` once root-caused;
reverting to `kimi-k2.7` (last confirmed-working combination) is the
obvious first fallback if repeat trials confirm this is model-specific.
