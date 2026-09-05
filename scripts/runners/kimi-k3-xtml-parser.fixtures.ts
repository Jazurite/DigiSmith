// scripts/runners/kimi-k3-xtml-parser.fixtures.ts

// Adapted from a real live dispatch (kimi-k3 via TokenReply, claude-code runner,
// 2026-09-04) — the model attempted a Bash call but TokenReply returned this raw,
// unconverted XTML instead of a real tool_use block.
export const BASH_CALL_FIXTURE = `<|open|>tools<|sep|><|open|>call tool="Bash" index="1"<|sep|><|open|>argument key="command" type="string"<|sep|>printf '# Usage test' > USAGE_TEST.md && git add USAGE_TEST.md && git commit -m "test: usage verification file"<|close|>argument<|sep|><|open|>argument key="description" type="string"<|sep|>Create USAGE_TEST.md and commit it<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;

// Adapted from a second real live dispatch (same session, repeat trial) — the model
// attempted a Write call instead, same garbled pattern.
export const WRITE_CALL_FIXTURE = `<|open|>tools<|sep|><|open|>call tool="Write" index="1"<|sep|><|open|>argument key="content" type="string"<|sep|># Debug test

Isolating a tool-calling failure.
<|close|>argument<|sep|><|open|>argument key="file_path" type="string"<|sep|>D:\\Workspace\\Jazurite\\DigiSmith\\.claude\\worktrees\\debug-k3-repeat\\DEBUG_TEST.md<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;

// Synthetic — no real multi-call example was captured live this session (every
// observed dispatch made exactly one call). Constructed to match the documented
// format for two calls in one tools channel, for the parser's own robustness test.
export const MULTI_CALL_FIXTURE = `<|open|>tools<|sep|><|open|>call tool="Read" index="1"<|sep|><|open|>argument key="file_path" type="string"<|sep|>README.md<|close|>argument<|sep|><|close|>call<|sep|><|open|>call tool="Bash" index="2"<|sep|><|open|>argument key="command" type="string"<|sep|>ls<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;

// A normal, non-leaked response — must NOT be detected as a tool-call leak.
export const NORMAL_TEXT_FIXTURE = `I've reviewed the file and everything looks correct. No changes needed.`;
