# Kimi K3 XTML Tool-Call Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `digismith:offload-implementer` recover from TokenReply's `kimi-k3` route emitting raw, unconverted XTML tool-call text instead of a real tool call — by decoding it deterministically and re-driving the same session, so `kimi-k3` becomes usable without a standing proxy server, an LLM-based decoder, or a replacement agent loop.

**Architecture:** A new TypeScript module ports vLLM's real `KimiK3ToolParser.extract_tool_calls` logic (regex-based XTML extraction, non-streaming only). Both existing runners flag when their captured text contains the leak. `offload-implementer` gains one new conditional step between its existing Step 5 and Step 6: decode, execute the decoded call(s) with the controller's own tools, then resume the same session with a result summary and re-check.

**Tech Stack:** TypeScript (matches `scripts/providers`/`scripts/runners`), Vitest for tests, no new npm dependencies (pure regex + `JSON.parse`, nothing external needed).

## Global Constraints

- TypeScript throughout, matching the existing `scripts/runners`/`scripts/providers` style.
- Tests use Vitest (`describe`/`it`/`expect`), matching every existing test file in these folders.
- No new npm dependencies — the parser is pure regex + `JSON.parse`, nothing external.
- Non-streaming only. `offload-implementer` never consumes a live stream (it reads a completed dispatch's captured events file), so vLLM's streaming/buffering variant and its `adjust_request` step (a server-side vLLM concern) are explicitly out of scope — do not port them.
- Do not build a standing proxy server, an LLM/subagent-based decoder, a replacement agentic loop, or anything for Chutes — all explicitly ruled out in `.digismith/docs/kimi-k3-xtml-tool-call-recovery/design.html`'s "Out of scope" section.
- Commit after every task.

---

### Task 1: Capture real XTML fixtures

**Files:**
- Create: `scripts/runners/kimi-k3-xtml-parser.fixtures.ts`

**Interfaces:**
- Produces: `BASH_CALL_FIXTURE: string`, `WRITE_CALL_FIXTURE: string`, `MULTI_CALL_FIXTURE: string`, `NORMAL_TEXT_FIXTURE: string` — exported string constants, consumed by Task 2's tests.

- [ ] **Step 1: Write the fixtures file**

These are adapted from this session's real live-captured dispatch failures (structure, tool names, and argument keys/types are exactly as observed; the shell-command body text is simplified for fixture clarity since the parser treats a `type="string"` argument's body as opaque raw text regardless of its content).

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/runners/kimi-k3-xtml-parser.fixtures.ts
git commit -m "test(kimi-k3-xtml-parser): capture real XTML fixtures from live dispatches"
```

---

### Task 2: Implement the XTML tool-call parser module

**Files:**
- Create: `scripts/runners/kimi-k3-xtml-parser.ts`
- Test: `scripts/runners/kimi-k3-xtml-parser.test.ts`

**Interfaces:**
- Consumes: fixtures from Task 1 (`scripts/runners/kimi-k3-xtml-parser.fixtures.ts`).
- Produces:
  - `export interface DecodedToolCall { name: string; arguments: Record<string, unknown>; }`
  - `export interface XtmlExtractionResult { toolCalls: DecodedToolCall[]; content: string | null; }`
  - `export function hasXtmlToolCallChannel(text: string): boolean`
  - `export function extractXtmlToolCalls(text: string): XtmlExtractionResult`
  - Consumed by Task 4/5 (runner detection) and Task 3 (CLI wrapper).

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/runners/kimi-k3-xtml-parser.test.ts
import { describe, expect, it } from "vitest";
import { extractXtmlToolCalls, hasXtmlToolCallChannel } from "./kimi-k3-xtml-parser.ts";
import {
  BASH_CALL_FIXTURE,
  WRITE_CALL_FIXTURE,
  MULTI_CALL_FIXTURE,
  NORMAL_TEXT_FIXTURE,
} from "./kimi-k3-xtml-parser.fixtures.ts";

describe("hasXtmlToolCallChannel", () => {
  it("detects a real leaked tools channel", () => {
    expect(hasXtmlToolCallChannel(BASH_CALL_FIXTURE)).toBe(true);
  });

  it("returns false for normal text", () => {
    expect(hasXtmlToolCallChannel(NORMAL_TEXT_FIXTURE)).toBe(false);
  });

  it("does not false-positive on a lone <|sep|> with no channel marker", () => {
    expect(hasXtmlToolCallChannel("some text <|sep|> more text, no real marker")).toBe(false);
  });
});

describe("extractXtmlToolCalls", () => {
  it("decodes a single Bash call with string arguments", () => {
    const result = extractXtmlToolCalls(BASH_CALL_FIXTURE);
    expect(result.toolCalls).toEqual([
      {
        name: "Bash",
        arguments: {
          command: 'printf \'# Usage test\' > USAGE_TEST.md && git add USAGE_TEST.md && git commit -m "test: usage verification file"',
          description: "Create USAGE_TEST.md and commit it",
        },
      },
    ]);
  });

  it("decodes a single Write call with string arguments, including multi-line content", () => {
    const result = extractXtmlToolCalls(WRITE_CALL_FIXTURE);
    expect(result.toolCalls).toEqual([
      {
        name: "Write",
        arguments: {
          content: "# Debug test\n\nIsolating a tool-calling failure.\n",
          file_path: "D:\\Workspace\\Jazurite\\DigiSmith\\.claude\\worktrees\\debug-k3-repeat\\DEBUG_TEST.md",
        },
      },
    ]);
  });

  it("decodes multiple calls in one tools channel, in order", () => {
    const result = extractXtmlToolCalls(MULTI_CALL_FIXTURE);
    expect(result.toolCalls).toEqual([
      { name: "Read", arguments: { file_path: "README.md" } },
      { name: "Bash", arguments: { command: "ls" } },
    ]);
  });

  it("returns no tool calls for normal text, with the text as content", () => {
    const result = extractXtmlToolCalls(NORMAL_TEXT_FIXTURE);
    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe(NORMAL_TEXT_FIXTURE);
  });

  it("JSON-decodes a non-string-typed argument", () => {
    const text = `<|open|>tools<|sep|><|open|>call tool="Configure" index="1"<|sep|><|open|>argument key="opts" type="object"<|sep|>{"a":1,"b":true}<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([
      { name: "Configure", arguments: { opts: { a: 1, b: true } } },
    ]);
  });

  it("falls back to raw text when a non-string-typed argument is malformed JSON", () => {
    const text = `<|open|>tools<|sep|><|open|>call tool="Configure" index="1"<|sep|><|open|>argument key="opts" type="object"<|sep|>not json<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([
      { name: "Configure", arguments: { opts: "not json" } },
    ]);
  });

  it("reverse-decodes HTML-entity-escaped attribute values (&quot; before &amp;)", () => {
    const text = `<|open|>tools<|sep|><|open|>call tool="Bash" index="1"<|sep|><|open|>argument key="command" type="string"<|sep|>echo &quot;a &amp; b&quot;<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([
      { name: "Bash", arguments: { command: 'echo "a & b"' } },
    ]);
  });

  it("drops a call block with no tool name", () => {
    const text = `<|open|>tools<|sep|><|open|>call index="1"<|sep|><|open|>argument key="x" type="string"<|sep|>y<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([]);
  });

  it("unwraps a sibling response channel into content when no tools channel is present", () => {
    const text = `<|open|>response<|sep|>Hello there<|close|>response<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe("Hello there");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run scripts/runners/kimi-k3-xtml-parser.test.ts`
Expected: FAIL — `kimi-k3-xtml-parser.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/runners/kimi-k3-xtml-parser.ts
// TypeScript port of vLLM's KimiK3ToolParser.extract_tool_calls (non-streaming path
// only). Reference: vllm/tool_parsers/kimi_k3_tool_parser.py in the vLLM project.
// Deliberately does NOT port the streaming variant or adjust_request — those are
// vLLM server-side concerns; offload-implementer only ever reads a completed
// dispatch's captured text.

export interface DecodedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface XtmlExtractionResult {
  toolCalls: DecodedToolCall[];
  content: string | null;
}

const O = String.raw`<\|open\|>`;
const C = String.raw`<\|close\|>`;
const S = String.raw`<\|sep\|>`;
const TEXT_UNTIL_SEP = `(?:(?!${S}).)*?`;

const TOOLS_OPEN_RE = new RegExp(`${O}\\s*tools\\s*${S}`);
const TOOLS_CLOSE_RE = new RegExp(`${C}\\s*tools\\s*${S}`);
const RESPONSE_OPEN_RE = new RegExp(`${O}\\s*response\\s*${S}`);
const RESPONSE_CLOSE_RE = new RegExp(`${C}\\s*response\\s*${S}`, "g");
const MESSAGE_CLOSE_RE = new RegExp(`${C}\\s*message\\s*${S}`, "g");
const RESPONSE_RE = new RegExp(`${O}\\s*response\\s*${S}(?<c>.*?)${C}\\s*response\\s*${S}`, "s");
const CALL_RE = new RegExp(
  `${O}\\s*call\\s+(?<attrs>${TEXT_UNTIL_SEP})${S}(?<body>.*?)${C}\\s*call\\s*${S}`,
  "gs",
);
const ARG_RE = new RegExp(
  `${O}\\s*argument\\s+(?<attrs>${TEXT_UNTIL_SEP})${S}(?<val>.*?)${C}\\s*argument\\s*${S}`,
  "gs",
);
const ATTR_RE = /(?<k>\w+)="(?<v>[^"]*)"/g;

/** Detects the leaked-XTML tool-call channel marker, without decoding anything. */
export function hasXtmlToolCallChannel(text: string): boolean {
  return TOOLS_OPEN_RE.test(text);
}

function decodeAttrs(s: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) {
    const k = m.groups!.k;
    const v = m.groups!.v.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    result[k] = v;
  }
  return result;
}

function decodeCall(attrsText: string, body: string): DecodedToolCall | null {
  const callAttrs = decodeAttrs(attrsText);
  const toolName = callAttrs.tool ?? "";
  const args: Record<string, unknown> = {};
  for (const m of body.matchAll(ARG_RE)) {
    const argAttrs = decodeAttrs(m.groups!.attrs);
    const key = argAttrs.key ?? "";
    const argType = argAttrs.type ?? "string";
    const rawValue = m.groups!.val;
    if (argType === "string") {
      args[key] = rawValue;
    } else {
      try {
        args[key] = JSON.parse(rawValue);
      } catch {
        args[key] = rawValue;
      }
    }
  }
  if (!toolName) return null;
  return { name: toolName, arguments: args };
}

function stripResponseContent(text: string): string | null {
  const mOpen = RESPONSE_OPEN_RE.exec(text);
  let result: string;
  if (mOpen) {
    const start = mOpen.index + mOpen[0].length;
    const mClose = RESPONSE_CLOSE_RE.exec(text.slice(start));
    result = mClose ? text.slice(start, start + mClose.index) : text.slice(start);
  } else {
    result = text.replace(RESPONSE_CLOSE_RE, "");
  }
  result = result.replace(MESSAGE_CLOSE_RE, "");
  return result || null;
}

function extractContent(fullText: string, before: string): string | null {
  const m = RESPONSE_RE.exec(fullText);
  if (m) return m.groups!.c || null;
  return stripResponseContent(before);
}

/** Extracts decoded tool calls and unwrapped content from a raw XTML response. */
export function extractXtmlToolCalls(text: string): XtmlExtractionResult {
  const mOpen = TOOLS_OPEN_RE.exec(text);
  if (!mOpen) {
    return { toolCalls: [], content: extractContent(text, text) };
  }
  const before = text.slice(0, mOpen.index);
  const start = mOpen.index + mOpen[0].length;
  const mClose = TOOLS_CLOSE_RE.exec(text.slice(start));
  const section = mClose ? text.slice(start, start + mClose.index) : text.slice(start);

  const toolCalls: DecodedToolCall[] = [];
  for (const m of section.matchAll(CALL_RE)) {
    const decoded = decodeCall(m.groups!.attrs, m.groups!.body);
    if (decoded) toolCalls.push(decoded);
  }
  return { toolCalls, content: extractContent(text, before) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/runners/kimi-k3-xtml-parser.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/runners/kimi-k3-xtml-parser.ts scripts/runners/kimi-k3-xtml-parser.test.ts
git commit -m "feat(kimi-k3-xtml-parser): port vLLM's XTML tool-call extraction logic"
```

---

### Task 3: Add a CLI entry point to the parser module

**Files:**
- Modify: `scripts/runners/kimi-k3-xtml-parser.ts`
- Test: `scripts/runners/kimi-k3-xtml-parser.test.ts`

**Interfaces:**
- Consumes: `extractXtmlToolCalls` from Task 2 (same file).
- Produces: a CLI usable as `node scripts/runners/kimi-k3-xtml-parser.ts <text-file>`, printing `XtmlExtractionResult` as JSON to stdout — this is how `offload-implementer`'s controller (Step 5.5, Task 6) invokes it directly, matching `parse-result.ts`'s own existing CLI convention.

- [ ] **Step 1: Write the failing test**

```typescript
// Append to scripts/runners/kimi-k3-xtml-parser.test.ts
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(new URL("./kimi-k3-xtml-parser.ts", import.meta.url));

describe("kimi-k3-xtml-parser CLI", () => {
  it("prints extracted tool calls as JSON given a text file argument", () => {
    const dir = mkdtempSync(join(tmpdir(), "xtml-cli-test-"));
    const textFile = join(dir, "raw.txt");
    writeFileSync(textFile, BASH_CALL_FIXTURE);

    const stdout = execFileSync("node", [SCRIPT_PATH, textFile], { encoding: "utf-8" });
    const parsed = JSON.parse(stdout);
    expect(parsed.toolCalls).toEqual([
      {
        name: "Bash",
        arguments: {
          command: 'printf \'# Usage test\' > USAGE_TEST.md && git add USAGE_TEST.md && git commit -m "test: usage verification file"',
          description: "Create USAGE_TEST.md and commit it",
        },
      },
    ]);
  });

  it("exits non-zero when the file argument is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/runners/kimi-k3-xtml-parser.test.ts`
Expected: FAIL — no CLI entry point exists yet, `execFileSync` gets no matching stdout or the process exits 0 with empty output.

- [ ] **Step 3: Add the CLI entry point**

```typescript
// Append to scripts/runners/kimi-k3-xtml-parser.ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function main(): void {
  const [textFile] = process.argv.slice(2);
  if (!textFile) {
    console.error("kimi-k3-xtml-parser: missing required positional argument <text-file>");
    process.exitCode = 1;
    return;
  }
  try {
    const text = readFileSync(textFile, "utf-8");
    const result = extractXtmlToolCalls(text);
    console.log(JSON.stringify(result));
    process.exitCode = 0;
  } catch (err) {
    console.error(`kimi-k3-xtml-parser: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/runners/kimi-k3-xtml-parser.test.ts`
Expected: PASS — all tests green, including the two new CLI tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/runners/kimi-k3-xtml-parser.ts scripts/runners/kimi-k3-xtml-parser.test.ts
git commit -m "feat(kimi-k3-xtml-parser): add CLI entry point for controller invocation"
```

---

### Task 4: Flag the XTML leak in claude-code.ts's parseResult

**Files:**
- Modify: `scripts/runners/claude-code.ts`
- Modify: `scripts/runners/types.ts`
- Modify: `scripts/runners/claude-code.test.ts`

**Interfaces:**
- Consumes: `hasXtmlToolCallChannel` from Task 2 (`scripts/runners/kimi-k3-xtml-parser.ts`).
- Produces: `ParsedResult` gains `xtmlLeakDetected?: boolean` — consumed by Task 6 (`offload-implementer`'s new conditional step) and Task 5 (opencode.ts, same field).

- [ ] **Step 1: Write the failing test**

```typescript
// Append to scripts/runners/claude-code.test.ts
import { BASH_CALL_FIXTURE } from "./kimi-k3-xtml-parser.fixtures.ts";

describe("claudeCode.parseResult XTML leak detection", () => {
  it("flags xtmlLeakDetected when the result text contains a leaked tools channel", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: BASH_CALL_FIXTURE,
        session_id: "sess_7",
        total_cost_usd: 0.01,
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "success",
      resultText: BASH_CALL_FIXTURE,
      sessionId: "sess_7",
      costUsd: 0.01,
      xtmlLeakDetected: true,
    });
  });

  it("does not set xtmlLeakDetected on a normal successful result", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "All good, no changes needed.",
        session_id: "sess_8",
        total_cost_usd: 0.01,
      },
    ]);
    expect(claudeCode.parseResult(path).xtmlLeakDetected).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/runners/claude-code.test.ts`
Expected: FAIL — `xtmlLeakDetected` is not set (property missing / `undefined` where `true` expected).

- [ ] **Step 3: Add the field and detection**

```typescript
// scripts/runners/types.ts — add one field to the existing interface
export interface ParsedResult {
  status: "success" | "error" | "interrupted";
  resultText: string | null;
  sessionId: string | null;
  costUsd?: number;
  /** True when resultText contains TokenReply/kimi-k3's leaked raw XTML tool-call
   * format instead of a real tool call — see backlog/tokenreply-kimi-k3-tool-calling-failure.md.
   * offload-implementer's controller checks this to run the recovery step. */
  xtmlLeakDetected?: boolean;
}
```

```typescript
// scripts/runners/claude-code.ts — add the import and the check
import { hasXtmlToolCallChannel } from "./kimi-k3-xtml-parser.ts";

// Inside parseResult, just before the final `return { ... }`:
  const resultText = last.result ?? null;
  return {
    status,
    resultText,
    sessionId: last.session_id ?? null,
    costUsd: last.total_cost_usd ?? last.cost?.total_cost_usd,
    ...(resultText && hasXtmlToolCallChannel(resultText) ? { xtmlLeakDetected: true } : {}),
  };
```

(The existing `return` statement's `resultText: last.result ?? null` line is replaced by the `const resultText = ...` extraction above it, reusing the same value in both the object and the detection check.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/runners/claude-code.test.ts`
Expected: PASS — all tests green, including the two new ones and every pre-existing test (the spread only adds a key when true, so no existing assertion using plain object equality without the field breaks — recheck any existing `toEqual` assertions still pass, since `toEqual` treats a missing key and an `undefined`-valued key as equal).

- [ ] **Step 5: Commit**

```bash
git add scripts/runners/types.ts scripts/runners/claude-code.ts scripts/runners/claude-code.test.ts
git commit -m "feat(claude-code-runner): flag detected XTML tool-call leaks in ParsedResult"
```

---

### Task 5: Flag the XTML leak in opencode.ts's parseResult

**Files:**
- Modify: `scripts/runners/opencode.ts`
- Modify: `scripts/runners/opencode.test.ts`

**Interfaces:**
- Consumes: `hasXtmlToolCallChannel` (Task 2), `ParsedResult.xtmlLeakDetected` (Task 4, same shared type).
- Produces: same field, populated for the `opencode` runner too — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

```typescript
// Append to scripts/runners/opencode.test.ts
import { WRITE_CALL_FIXTURE } from "./kimi-k3-xtml-parser.fixtures.ts";

it("flags xtmlLeakDetected when the text part contains a leaked tools channel", () => {
  const path = writeEvents([
    { type: "text", sessionID: "ses_leak", part: { type: "text", text: WRITE_CALL_FIXTURE } },
  ]);
  expect(opencode.parseResult(path)).toEqual({
    status: "success",
    resultText: WRITE_CALL_FIXTURE,
    sessionId: "ses_leak",
    xtmlLeakDetected: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/runners/opencode.test.ts`
Expected: FAIL — `xtmlLeakDetected` missing.

- [ ] **Step 3: Add the detection**

```typescript
// scripts/runners/opencode.ts — add the import and the check
import { hasXtmlToolCallChannel } from "./kimi-k3-xtml-parser.ts";

// Replace the final successful-path return:
  const text = lastText.part.text;
  return {
    status: "success",
    resultText: text,
    sessionId,
    ...(hasXtmlToolCallChannel(text) ? { xtmlLeakDetected: true } : {}),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/runners/opencode.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/runners/opencode.ts scripts/runners/opencode.test.ts
git commit -m "feat(opencode-runner): flag detected XTML tool-call leaks in ParsedResult"
```

---

### Task 6: Document the recovery step in offload-implementer

**Files:**
- Modify: `skills/offload-implementer/SKILL.md`

**Interfaces:**
- Consumes: `xtmlLeakDetected` (Tasks 4/5), the `kimi-k3-xtml-parser.ts` CLI (Task 3).
- Produces: none (documentation only — this is what a controller session driving `offload-implementer` follows; no automated test covers prose instructions, verified live in Task 7).

- [ ] **Step 1: Insert the new conditional step**

Insert a new `### Step 5.5: Recover from a Detected XTML Tool-Call Leak` section between the
existing Step 5 ("Extract the Session ID and the Status Contract") and Step 6 ("Hand Back to the
Normal Flow"):

```markdown
### Step 5.5: Recover from a Detected XTML Tool-Call Leak

**Only runs when Step 5's `parse-result.ts` output has `xtmlLeakDetected: true`** — TokenReply's
`kimi-k3` route returned raw, unconverted tool-call text instead of executing anything (see
`backlog/tokenreply-kimi-k3-tool-calling-failure.md`). Skip this step entirely otherwise.

1. Write `resultText` to a temp file, then decode it:

   ```bash
   node <digismith-repo>/scripts/runners/kimi-k3-xtml-parser.ts <temp-text-file>
   ```

   Prints `{toolCalls: [{name, arguments}, ...], content}` as JSON.

2. **No tool calls decoded** (`toolCalls` is empty despite the leak flag) → the raw text was
   malformed beyond what the parser tolerates. Treat as a genuine BLOCKED failure — do not loop,
   do not guess; fall through to Step 6 reporting `BLOCKED` same as any other unrecoverable
   failure.

3. **One or more tool calls decoded** → execute each, **in order**, using your own Read/Edit/Bash
   tools (the same tools this dispatch's `--allowedTools` already grants — no broader access is
   introduced). Map the decoded `name` directly to the matching tool (`Bash` → `Bash`, `Write` →
   `Write`, `Edit` → `Edit`, `Read` → `Read`) and its `arguments` directly to that tool's own
   parameters. Record each call's real outcome (success + output, or the real error) — do not
   fabricate a result.

4. Build a plain-text summary of what was executed and each result, then re-dispatch via the
   **same resume mechanism a fix round already uses** — `--resume "<sessionID>"`
   (`claude-code` runner) or `--session "<sessionID>"` (`opencode` runner) — with that summary as
   the new prompt, e.g.: `"I executed your attempted tool call(s) directly since the gateway
   didn't return them in a usable format. Results: <summary>. Please continue."` Events go to a
   new file (same `-round<R>`-suffixed convention Step 4 already uses for fix rounds — increment
   the round number for this recovery re-dispatch).

5. Loop back to Step 5 against this new events file. If the fresh result *also* has
   `xtmlLeakDetected: true`, repeat this step again for that turn's newly-decoded call(s). This
   does not introduce a separate retry budget — it still counts toward the plan's existing
   fix-round cap (3); if recovery is still looping when that cap is hit, stop and report per the
   existing "Fix round hits the round cap" disposition in Error Handling below, unmodified.
```

- [ ] **Step 2: Update the Quick Reference table**

Change the Step 5 row and add a new row directly after it:

```markdown
| 5 | Run `parse-result.ts <runner> <events-file>` for a uniform `{status, resultText, sessionId, costUsd?, xtmlLeakDetected?}`; capture `sessionId` into `opencode-sessions.jsonl` only on a fresh task, never re-appended on a fix round |
| 5.5 | Only if `xtmlLeakDetected: true` — decode via `kimi-k3-xtml-parser.ts`, execute each decoded call with the controller's own tools, resume the session with a result summary, loop back to Step 5. Counts toward the existing fix-round cap. |
```

- [ ] **Step 3: Commit**

```bash
git add skills/offload-implementer/SKILL.md
git commit -m "docs(offload-implementer): add XTML tool-call-leak recovery step"
```

---

### Task 7: Live end-to-end verification

**Files:** none created or modified — this task exercises Tasks 1-6's shipped code and docs against a real dispatch, following this session's own established live-testing pattern (disposable scratch worktree, trivial task, independent verification via `git log`/file existence, never trusting the dispatch's own self-reported status).

- [ ] **Step 1: Create a disposable worktree**

```bash
git worktree add ".claude/worktrees/xtml-recovery-live-test" -b worktree-xtml-recovery-live-test main
```

- [ ] **Step 2: Dispatch a real trivial task via kimi-k3 + TokenReply + claude-code runner**

Same pattern as this session's earlier live tests: a single-file-create-and-commit task, `--model
kimi-k3` (overriding the shipped `kimi-k2.7` default just for this verification — `kimi-k3` is
confirmed to reliably reproduce the leak), `--output-format stream-json --verbose`,
`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` pointed at TokenReply.

- [ ] **Step 3: Confirm the leak is flagged**

```bash
node scripts/runners/parse-result.ts claude-code <events-file>
```

Expected: `xtmlLeakDetected: true` in the printed JSON — confirms Task 4 works against a fresh,
real dispatch, not just the captured fixtures.

- [ ] **Step 4: Manually walk through Step 5.5 exactly as documented**

Follow Task 6's new SKILL.md section by hand: decode via the CLI, execute the decoded call(s)
with your own tools, resume the session with a result summary.

- [ ] **Step 5: Independently verify the task actually completed**

```bash
cd ".claude/worktrees/xtml-recovery-live-test" && git log --oneline -3
```

Expected: a real new commit exists, matching what the task asked for — **do not trust the
resumed session's own reported status**, confirm the actual file/commit exists, same discipline
as every other live test this session.

- [ ] **Step 6: Clean up**

```bash
cd "D:/Workspace/Jazurite/DigiSmith"
git worktree remove ".claude/worktrees/xtml-recovery-live-test" --force
git branch -D worktree-xtml-recovery-live-test
```

(If `git worktree remove` hits the Windows file-lock issue seen earlier this session, deregister
with `git branch -D` regardless — the leftover physical folder is harmless and can be deleted by
hand later.)

- [ ] **Step 7: Record the result**

Update `backlog/tokenreply-kimi-k3-tool-calling-failure.md`'s status to reflect that a working
recovery mechanism now exists for `kimi-k3`, distinct from the earlier "reverted to `kimi-k2.7`,
unfixed" status — note whether this verification passed cleanly or surfaced anything the design
didn't anticipate (e.g. an argument-shape mismatch, per the design doc's own "Open risks"
section). Commit this update.

```bash
git add backlog/tokenreply-kimi-k3-tool-calling-failure.md
git commit -m "docs(backlog): record kimi-k3 XTML recovery mechanism live-verified"
```
