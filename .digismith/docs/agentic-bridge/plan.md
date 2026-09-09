# Agentic Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A transparent local HTTP proxy that repairs TokenReply's `kimi-k3` XTML tool-call leak before Claude Code ever sees it, so a single ordinary `claude -p` dispatch just works — superseding the manual decode/execute/resume recovery mechanism for the `claude-code` runner.

**Architecture:** A Depot-managed, shared, persistent local server (`scripts/agentic-bridge/server.ts`) that `offload-implementer`'s `claude-code` runner points `ANTHROPIC_BASE_URL` at instead of TokenReply directly. It forwards every request to TokenReply, buffers the full response, and — only if it detects the leaked XTML — decodes it (reusing the existing `kimi-k3-xtml-parser.ts`) and converts the decoded calls into a genuine Anthropic `tool_use` response before relaying it. Everything else passes through untouched.

**Tech Stack:** TypeScript (matches `scripts/runners`/`scripts/providers`/`scripts/agentic-bridge`), Vitest, Node's built-in `node:http` and global `fetch` — no new npm dependencies.

## Global Constraints

- TypeScript throughout, ESM (`"type": "module"`, Node >=24), matching the existing `scripts/runners`/`scripts/providers` style.
- Tests use Vitest (`describe`/`it`/`expect`), matching every existing test file in these folders.
- No new npm dependencies — `node:http` and global `fetch` only.
- Buffered only: the proxy never streams partial upstream chunks to a decision point. It always requests `stream: false` from TokenReply on the outbound leg (simpler, well-understood single JSON body), regardless of what the inbound client request specified.
- On the way back to the client, the proxy mirrors whatever `stream` value the *client's own request* specified: `true` → wrap the buffered result in a genuine Anthropic SSE event sequence; `false`/absent → return the JSON body directly.
- Does not touch the `opencode` runner in any way — `opencode` dispatches to TokenReply remain unprotected, Step 5.5 stays their documented path.
- Does not modify `--allowedTools` or any dispatch's actual permission grant.
- Does not remove or functionally change Step 5.5 — only narrows its documented applicability for `claude-code`.
- Does not flip `scripts/providers/tokenreply.ts`'s default model — `kimi-k2.7` remains the shipped default; that's a deliberate follow-up decision after this ships and is live-verified, not part of this plan.
- Commit after every task.

---

### Task 1: Anthropic tool_use converter

**Files:**
- Create: `scripts/agentic-bridge/anthropic-response.ts`
- Test: `scripts/agentic-bridge/anthropic-response.test.ts`

**Interfaces:**
- Consumes: `DecodedToolCall`, `XtmlExtractionResult` (types only) from `scripts/runners/kimi-k3-xtml-parser.ts`; fixtures `BASH_CALL_FIXTURE`, `WRITE_CALL_FIXTURE`, `MULTI_CALL_FIXTURE` from `scripts/runners/kimi-k3-xtml-parser.fixtures.ts`.
- Produces:
  - `export interface AnthropicContentBlock { type: "text" | "tool_use"; text?: string; id?: string; name?: string; input?: Record<string, unknown>; }`
  - `export interface AnthropicMessagesResponse { id: string; type: "message"; role: "assistant"; content: AnthropicContentBlock[]; model: string; stop_reason: string | null; stop_sequence: string | null; usage?: Record<string, unknown>; }`
  - `export function applyToolCallFix(original: AnthropicMessagesResponse, decoded: XtmlExtractionResult): AnthropicMessagesResponse`
  - Consumed by Task 2 (`scripts/agentic-bridge/server.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agentic-bridge/anthropic-response.test.ts
import { describe, expect, it } from "vitest";
import { extractXtmlToolCalls } from "../runners/kimi-k3-xtml-parser.ts";
import {
  BASH_CALL_FIXTURE,
  WRITE_CALL_FIXTURE,
  MULTI_CALL_FIXTURE,
} from "../runners/kimi-k3-xtml-parser.fixtures.ts";
import { applyToolCallFix, type AnthropicMessagesResponse } from "./anthropic-response.ts";

const ORIGINAL: AnthropicMessagesResponse = {
  id: "msg_test123",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "<leaked xtml, replaced below>" }],
  model: "kimi-k3",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 50 },
};

describe("applyToolCallFix", () => {
  it("converts a single decoded Bash call into a real tool_use block, preserving id/model/usage", () => {
    const decoded = extractXtmlToolCalls(BASH_CALL_FIXTURE);
    const fixed = applyToolCallFix(ORIGINAL, decoded);
    expect(fixed.id).toBe("msg_test123");
    expect(fixed.model).toBe("kimi-k3");
    expect(fixed.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    expect(fixed.stop_reason).toBe("tool_use");
    expect(fixed.stop_sequence).toBeNull();
    expect(fixed.content).toHaveLength(1);
    expect(fixed.content[0].type).toBe("tool_use");
    expect(fixed.content[0].name).toBe("Bash");
    expect(fixed.content[0].input).toEqual({
      command: 'printf \'# Usage test\' > USAGE_TEST.md && git add USAGE_TEST.md && git commit -m "test: usage verification file"',
      description: "Create USAGE_TEST.md and commit it",
    });
    expect(fixed.content[0].id).toMatch(/^toolu_/);
  });

  it("converts a Write call the same way", () => {
    const decoded = extractXtmlToolCalls(WRITE_CALL_FIXTURE);
    const fixed = applyToolCallFix(ORIGINAL, decoded);
    expect(fixed.content).toHaveLength(1);
    expect(fixed.content[0].name).toBe("Write");
    expect(fixed.content[0].input).toEqual({
      content: "# Debug test\n\nIsolating a tool-calling failure.\n",
      file_path: "D:\\Workspace\\Jazurite\\DigiSmith\\.claude\\worktrees\\debug-k3-repeat\\DEBUG_TEST.md",
    });
  });

  it("converts multiple calls in one leaked turn into multiple tool_use blocks, in order", () => {
    const decoded = extractXtmlToolCalls(MULTI_CALL_FIXTURE);
    const fixed = applyToolCallFix(ORIGINAL, decoded);
    expect(fixed.content).toHaveLength(2);
    expect(fixed.content[0].name).toBe("Read");
    expect(fixed.content[1].name).toBe("Bash");
  });

  it("prepends any unwrapped content text as a leading text block before the tool_use blocks", () => {
    const decoded = extractXtmlToolCalls(BASH_CALL_FIXTURE);
    const withContent = { ...decoded, content: "Running the command now." };
    const fixed = applyToolCallFix(ORIGINAL, withContent);
    expect(fixed.content).toHaveLength(2);
    expect(fixed.content[0]).toEqual({ type: "text", text: "Running the command now." });
    expect(fixed.content[1].type).toBe("tool_use");
  });

  it("generates a unique tool_use id per call, even across two calls with the same name", () => {
    const decoded = extractXtmlToolCalls(MULTI_CALL_FIXTURE);
    const fixed = applyToolCallFix(ORIGINAL, decoded);
    const ids = fixed.content.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run scripts/agentic-bridge/anthropic-response.test.ts`
Expected: FAIL — `anthropic-response.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/agentic-bridge/anthropic-response.ts
// Converts decoded XTML tool calls into a genuine Anthropic Messages API
// response — the mirror image of vLLM's own OpenAI->Anthropic conversion
// (vllm/entrypoints/anthropic/serving.py's `messages_full_converter`,
// specifically its tool_calls handling), so Claude Code's own agentic loop
// executes the call normally instead of seeing raw leaked text.

import { randomUUID } from "node:crypto";
import type { XtmlExtractionResult } from "../runners/kimi-k3-xtml-parser.ts";

export interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface AnthropicMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage?: Record<string, unknown>;
}

/**
 * Replaces a leaked-XTML response's content with real `tool_use` blocks
 * decoded from that same text. `id`, `model`, and `usage` are preserved
 * verbatim from the original response — it's a real, already-billed
 * completion, only its content shape was wrong.
 */
export function applyToolCallFix(
  original: AnthropicMessagesResponse,
  decoded: XtmlExtractionResult,
): AnthropicMessagesResponse {
  const content: AnthropicContentBlock[] = decoded.toolCalls.map((call) => ({
    type: "tool_use",
    id: `toolu_${randomUUID()}`,
    name: call.name,
    input: call.arguments,
  }));
  if (decoded.content) {
    content.unshift({ type: "text", text: decoded.content });
  }
  return {
    ...original,
    content,
    stop_reason: "tool_use",
    stop_sequence: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/agentic-bridge/anthropic-response.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/agentic-bridge/anthropic-response.ts scripts/agentic-bridge/anthropic-response.test.ts
git commit -m "feat(agentic-bridge): convert decoded XTML tool calls into real Anthropic tool_use blocks"
```

---

### Task 2: Proxy core — forward, buffer, detect, repair (non-streaming response)

**Files:**
- Create: `scripts/agentic-bridge/server.ts`
- Test: `scripts/agentic-bridge/server.test.ts`

**Interfaces:**
- Consumes: `hasXtmlToolCallChannel`, `extractXtmlToolCalls` from `scripts/runners/kimi-k3-xtml-parser.ts`; `applyToolCallFix`, `AnthropicMessagesResponse` from `./anthropic-response.ts` (Task 1); `parseArgs`, `requireArgs` from `scripts/cli-args.ts`.
- Produces:
  - `export function createRequestHandler(upstreamBaseUrl: string): (req: IncomingMessage, res: ServerResponse) => Promise<void>`
  - `export function startServer(port: number, upstreamBaseUrl: string): import("node:http").Server`
  - A CLI entry point: `node scripts/agentic-bridge/server.ts --port <N>` (`--port 0` lets the OS assign a free port).
  - Consumed by Task 3 (adds SSE wrapping to this same handler) and Task 4 (Depot launches this CLI).

This task covers only the non-streaming response path (client sent `stream: false` or omitted it) — Task 3 adds the SSE-wrapped path for `stream: true`.

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agentic-bridge/server.test.ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequestHandler } from "./server.ts";

let fakeUpstream: ReturnType<typeof createServer>;
let fakeUpstreamUrl: string;
let fakeUpstreamResponse: unknown;
let lastUpstreamRequestBody: string;

beforeEach(async () => {
  fakeUpstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      lastUpstreamRequestBody = Buffer.concat(chunks).toString("utf-8");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(fakeUpstreamResponse));
    });
  });
  await new Promise<void>((resolve) => fakeUpstream.listen(0, "127.0.0.1", resolve));
  const { port } = fakeUpstream.address() as AddressInfo;
  fakeUpstreamUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => fakeUpstream.close(() => resolve()));
});

async function postToProxy(body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const { port } = proxy.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "test-key" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } finally {
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
}

describe("createRequestHandler — non-streaming", () => {
  it("passes a non-leaked response through unchanged", async () => {
    fakeUpstreamResponse = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "All good, no changes needed." }],
      model: "kimi-k2.7",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const { status, json } = await postToProxy({ model: "kimi-k2.7", stream: false, messages: [] });
    expect(status).toBe(200);
    expect(json).toEqual(fakeUpstreamResponse);
  });

  it("repairs a leaked XTML response into a real tool_use block", async () => {
    fakeUpstreamResponse = {
      id: "msg_2",
      type: "message",
      role: "assistant",
      content: [{
        type: "text",
        text: '<|open|>tools<|sep|><|open|>call tool="Bash" index="1"<|sep|><|open|>argument key="command" type="string"<|sep|>ls<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>',
      }],
      model: "kimi-k3",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 8 },
    };
    const { status, json } = await postToProxy({ model: "kimi-k3", stream: false, messages: [] });
    expect(status).toBe(200);
    const body = json as { content: Array<{ type: string; name?: string; input?: unknown }>; stop_reason: string };
    expect(body.stop_reason).toBe("tool_use");
    expect(body.content).toHaveLength(1);
    expect(body.content[0].type).toBe("tool_use");
    expect(body.content[0].name).toBe("Bash");
    expect(body.content[0].input).toEqual({ command: "ls" });
  });

  it("relays an upstream error response unchanged", async () => {
    fakeUpstream.close();
    fakeUpstream = createServer((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream down" }));
    });
    await new Promise<void>((resolve) => fakeUpstream.listen(0, "127.0.0.1", resolve));
    const { port } = fakeUpstream.address() as AddressInfo;
    fakeUpstreamUrl = `http://127.0.0.1:${port}`;
    const { status, json } = await postToProxy({ model: "kimi-k3", stream: false, messages: [] });
    expect(status).toBe(503);
    expect(json).toEqual({ error: "upstream down" });
  });

  it("always requests stream:false from the upstream regardless of what the client sent", async () => {
    fakeUpstreamResponse = {
      id: "msg_3", type: "message", role: "assistant",
      content: [{ type: "text", text: "ok" }], model: "kimi-k2.7",
      stop_reason: "end_turn", stop_sequence: null,
    };
    await postToProxy({ model: "kimi-k2.7", stream: true, messages: [] });
    expect(JSON.parse(lastUpstreamRequestBody).stream).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run scripts/agentic-bridge/server.test.ts`
Expected: FAIL — `server.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/agentic-bridge/server.ts
// Local proxy: forwards Anthropic Messages API traffic to TokenReply,
// buffers the full response, and repairs a leaked XTML tool-call response
// into a genuine `tool_use` block before relaying it — see
// .digismith/docs/agentic-bridge/design.html (map item K.9).

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "../cli-args.ts";
import { extractXtmlToolCalls, hasXtmlToolCallChannel } from "../runners/kimi-k3-xtml-parser.ts";
import { applyToolCallFix, type AnthropicMessagesResponse } from "./anthropic-response.ts";

const TOKENREPLY_BASE_URL = "https://api.tokenreply.com/v1";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function textOf(response: AnthropicMessagesResponse): string {
  return response.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
}

function forwardableHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string" && !["host", "content-length"].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  headers["content-type"] = "application/json";
  return headers;
}

/** Builds the proxy's request handler against a given TokenReply-compatible base URL. */
export function createRequestHandler(upstreamBaseUrl: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rawBody = await readBody(req);
    const requestJson = rawBody ? JSON.parse(rawBody) : {};

    const upstreamResponse = await fetch(`${upstreamBaseUrl}${req.url ?? "/messages"}`, {
      method: req.method,
      headers: forwardableHeaders(req),
      body: JSON.stringify({ ...requestJson, stream: false }),
    });

    if (!upstreamResponse.ok) {
      res.writeHead(upstreamResponse.status, { "content-type": "application/json" });
      res.end(await upstreamResponse.text());
      return;
    }

    const original = (await upstreamResponse.json()) as AnthropicMessagesResponse;
    const leakedText = textOf(original);
    let finalResponse = original;

    if (hasXtmlToolCallChannel(leakedText)) {
      const decoded = extractXtmlToolCalls(leakedText);
      // Empty toolCalls despite the leak marker means the text was
      // malformed beyond what the parser tolerates — relay the original
      // leaked text unchanged so the existing xtmlLeakDetected fallback
      // (Step 5.5) still catches it downstream.
      if (decoded.toolCalls.length > 0) {
        finalResponse = applyToolCallFix(original, decoded);
      }
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(finalResponse));
  };
}

export function startServer(port: number, upstreamBaseUrl: string) {
  const server = createHttpServer(createRequestHandler(upstreamBaseUrl));
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const boundPort = address && typeof address === "object" ? address.port : port;
    console.log(`agentic-bridge listening on http://127.0.0.1:${boundPort}`);
  });
  return server;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args, ["port"]);
  startServer(Number(args.port), TOKENREPLY_BASE_URL);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/agentic-bridge/server.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/agentic-bridge/server.ts scripts/agentic-bridge/server.test.ts
git commit -m "feat(agentic-bridge): proxy core forwards, buffers, and repairs a leaked kimi-k3 response"
```

---

### Task 3: SSE response wrapping for streaming clients

**Files:**
- Modify: `scripts/agentic-bridge/server.ts`
- Test: `scripts/agentic-bridge/server.test.ts`

**Interfaces:**
- Consumes: `AnthropicMessagesResponse` from `./anthropic-response.ts` (Task 1), `createRequestHandler` from Task 2 (same file, modified in place).
- Produces: `createRequestHandler`'s existing exported signature is unchanged — this task only changes its internal branching, so nothing downstream (Task 4) needs to know this task happened.

`claude -p` most likely requests `stream: true` on its outbound Anthropic API call (this is the open risk noted in the design doc — genuinely unverified until Task 6's live test). This task makes the proxy answer correctly either way: mirror whatever `stream` value the *client's own request* specified, wrapping the already-buffered result in one complete, correctly-sequenced Anthropic SSE event stream when the client asked for streaming.

- [ ] **Step 1: Write the failing test**

```typescript
// Append to scripts/agentic-bridge/server.test.ts
describe("createRequestHandler — streaming", () => {
  it("wraps the buffered result in a full Anthropic SSE event sequence when the client requests stream:true", async () => {
    fakeUpstreamResponse = {
      id: "msg_4",
      type: "message",
      role: "assistant",
      content: [{
        type: "text",
        text: '<|open|>tools<|sep|><|open|>call tool="Read" index="1"<|sep|><|open|>argument key="file_path" type="string"<|sep|>README.md<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>',
      }],
      model: "kimi-k3",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 15, output_tokens: 6 },
    };

    const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port } = proxy.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kimi-k3", stream: true, messages: [] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      const raw = await res.text();

      const events = raw
        .trim()
        .split("\n\n")
        .map((chunk) => {
          const [eventLine, dataLine] = chunk.split("\n");
          return { event: eventLine.replace("event: ", ""), data: JSON.parse(dataLine.replace("data: ", "")) };
        });

      expect(events.map((e) => e.event)).toEqual([
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      expect(events[1].data.content_block.type).toBe("tool_use");
      expect(events[1].data.content_block.name).toBe("Read");
      expect(events[2].data.delta.type).toBe("input_json_delta");
      expect(JSON.parse(events[2].data.delta.partial_json)).toEqual({ file_path: "README.md" });
      expect(events[4].data.delta.stop_reason).toBe("tool_use");
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/agentic-bridge/server.test.ts`
Expected: FAIL — the handler currently always responds with `application/json`, never `text/event-stream`.

- [ ] **Step 3: Add SSE wrapping**

```typescript
// scripts/agentic-bridge/server.ts — add this function, and change
// createRequestHandler's final branch to use it

/**
 * Emits one complete Anthropic Messages SSE event sequence for a fully
 * buffered response — not true incremental streaming (nothing consumes
 * this live), just the same event shapes a real streaming response uses,
 * so a client that requested `stream: true` gets a response its own
 * parser recognizes.
 */
function writeAsSse(res: ServerResponse, message: AnthropicMessagesResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("message_start", { type: "message_start", message: { ...message, content: [], stop_reason: null } });

  message.content.forEach((block, index) => {
    send("content_block_start", { type: "content_block_start", index, content_block: block });
    if (block.type === "text") {
      send("content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "text_delta", text: block.text ?? "" },
      });
    } else if (block.type === "tool_use") {
      send("content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) },
      });
    }
    send("content_block_stop", { type: "content_block_stop", index });
  });

  send("message_delta", {
    type: "message_delta",
    delta: { stop_reason: message.stop_reason, stop_sequence: message.stop_sequence },
    usage: message.usage,
  });
  send("message_stop", { type: "message_stop" });
  res.end();
}
```

Then replace `createRequestHandler`'s final two lines (the unconditional JSON write) with:

```typescript
    if (requestJson.stream === true) {
      writeAsSse(res, finalResponse);
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(finalResponse));
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/agentic-bridge/server.test.ts`
Expected: PASS — all tests green, including the 4 from Task 2 (non-streaming behavior unaffected) and the new SSE test.

- [ ] **Step 5: Commit**

```bash
git add scripts/agentic-bridge/server.ts scripts/agentic-bridge/server.test.ts
git commit -m "feat(agentic-bridge): emit a real Anthropic SSE sequence for streaming clients"
```

---

### Task 4: Depot gains the Agentic Bridge as a managed resource

**Files:**
- Modify: `skills/depot/SKILL.md`

**Interfaces:**
- Consumes: `scripts/agentic-bridge/server.ts`'s CLI (`node scripts/agentic-bridge/server.ts --port <N>`, `--port 0` for OS-assigned) from Tasks 2-3, and its `agentic-bridge listening on http://127.0.0.1:<port>` startup log line.
- Produces: the `ensure-agentic-bridge` / `stop-agentic-bridge` operations, consumed by Task 5 (`offload-implementer`).

Mirror the OpenCode Server resource section as closely as the shape allows — same tracked-file pattern, same alive-check, same Windows WINPID resolution, same log-line-based port extraction.

- [ ] **Step 1: Add the new resource section**

Insert a new `## Resource: Agentic Bridge Proxy` section directly after the existing `## Resource: OpenCode Server` section (before `## Resource: Claude Code Readiness`):

```markdown
## Resource: Agentic Bridge Proxy

A single, shared local HTTP proxy (map item **K.9**, `scripts/agentic-bridge/server.ts`)
backing every `digismith:offload-implementer` `claude-code`-runner dispatch to TokenReply —
it repairs `kimi-k3`'s leaked XTML tool-call format into a real `tool_use` block before
Claude Code ever sees it, so a single ordinary dispatch just works. See
`.digismith/docs/agentic-bridge/design.html`. Tracked at
`~/.digismith-depot/agentic-bridge.json` (`{"pid": ..., "port": ...}`), sibling to
`~/.digismith-depot/repo` and `~/.digismith-depot/opencode-server.json`.

This skill knows nothing about TokenReply's response shape, XTML, or tool-call formats
beyond running the CLI that already knows all of that — entirely
`digismith:offload-implementer`'s (and the proxy's own) concern.

### Which Operation

- **Invoked by `digismith:offload-implementer`**, every `claude-code`-runner dispatch (not
  just the first — same as `ensure-claude-code`, this call is cheap once the server is
  already running: a tracked-file read plus one liveness check) → always
  `ensure-agentic-bridge`.
- **Invoked directly by the user** → always `stop-agentic-bridge` ("stop the agentic
  bridge", "kill the kimi-k3 proxy"). Never automatic, never tied to any single plan
  finishing — a shared server may still be backing a different plan's in-progress
  dispatch. There is no `refresh-agentic-bridge`: refreshing a process is just
  stop-then-ensure, not a distinct operation worth naming.

### Operation: `ensure-agentic-bridge` — start if not alive

Check `~/.digismith-depot/agentic-bridge.json` for a tracked `{"pid": ..., "port": ...}`.

**Present** → confirm the process is still alive (Windows: `tasklist //FI "PID eq <pid>"`
and check the output actually lists it, not just that the command succeeded — an absent
PID still exits 0 with an empty-ish table). **Alive** → return the tracked port, done.
**Not alive** → treat as stale, continue as if the file were absent.

**Absent, or stale** → start a fresh server, letting the OS pick a free port rather than
guessing one. `<digismith-repo>` is the same path `offload-implementer` already resolved
under "Locating the Standards Library" — this operation is always invoked from within that
same resolution, never standalone:

```bash
mkdir -p ~/.digismith-depot
node --experimental-strip-types <digismith-repo>/scripts/agentic-bridge/server.ts --port 0 > ~/.digismith-depot/agentic-bridge.log 2>&1 &
SERVER_PID=$!
sleep 2
```

Read `~/.digismith-depot/agentic-bridge.log` for the line `agentic-bridge listening on
http://127.0.0.1:<port>` and extract `<port>` from it — this is the real assigned port,
not something to guess. If that line isn't present after a few seconds, this is a startup
failure (see Error Handling).

**Windows Git Bash only:** resolve the real WINPID before persisting or checking any
PID — same reasoning and same fallback as `ensure-opencode-server` above:

```bash
WINPID=$(ps -W | awk -v p="$SERVER_PID" '$1==p {print $4}')
```

If `$WINPID` comes back empty, fall back to resolving the PID by parsing `netstat -ano`
for the process listening on the captured port instead. Never persist an empty pid. On
other platforms `$!` is already the right PID — skip this lookup there.

On success, write `~/.digismith-depot/agentic-bridge.json` as `{"pid": <WINPID on
Windows, else SERVER_PID>, "port": <port>}`. Return the port.

### Operation: `stop-agentic-bridge` — explicit only

Read `~/.digismith-depot/agentic-bridge.json`. **Absent** → nothing to stop, report that
plainly. **Present** →

```bash
taskkill //PID <pid> //F
```

then delete `~/.digismith-depot/agentic-bridge.json`. If the file's PID is already dead
(process gone), still delete the tracking file — nothing to kill, but stale state should
not survive.
```

- [ ] **Step 2: Update the Error Handling table**

Add two rows to the existing `## Error Handling` table, directly after the OpenCode
server's equivalent rows:

```markdown
| Agentic Bridge fails to start (no "listening on" line in `~/.digismith-depot/agentic-bridge.log` within a few seconds) | Stop, show the log content, don't retry silently. |
| Tracked PID in `~/.digismith-depot/agentic-bridge.json` is no longer running | Treat as stale, start fresh per `ensure-agentic-bridge` above, overwrite the tracking file. |
```

- [ ] **Step 3: Update Out of Scope**

Add one bullet to the existing `## Out of Scope` list, matching the OpenCode server's
already-disclosed concurrent-start risk:

```markdown
- **Locking `ensure-agentic-bridge`'s check-then-start against a concurrent caller** —
  same accepted, disclosed risk as `ensure-opencode-server` above: two sessions calling it
  within the same few seconds can each start their own proxy process; whichever writes
  `~/.digismith-depot/agentic-bridge.json` last wins the tracking slot, the other leaks
  untracked. Not solved here, for the same reason.
```

- [ ] **Step 4: Update the Quick Reference table**

Add two rows, directly after the OpenCode server's rows:

```markdown
| Agentic Bridge proxy | `ensure-agentic-bridge` | Called by `digismith:offload-implementer`, every `claude-code`-runner dispatch | Start if not alive (resolving the real Windows PID), else return the tracked port |
| Agentic Bridge proxy | `stop-agentic-bridge` | User asks directly, any time | `taskkill` the tracked pid, delete the tracking file (no-op if absent) |
```

- [ ] **Step 5: Commit**

```bash
git add skills/depot/SKILL.md
git commit -m "docs(depot): add Agentic Bridge as a third managed shared resource (K.9)"
```

---

### Task 5: Route `claude-code` dispatches through the proxy

**Files:**
- Modify: `skills/offload-implementer/SKILL.md`

**Interfaces:**
- Consumes: `digismith:depot`'s `ensure-agentic-bridge` operation (Task 4).
- Produces: none (documentation only — this is what a controller session driving `offload-implementer` follows; no automated test covers prose instructions, live-verified in Task 6).

This is the routing change: for the `claude-code` runner, `ANTHROPIC_BASE_URL` at dispatch
time becomes the Agentic Bridge's local URL, never `provider.baseUrl` directly. TokenReply is
currently the only registered provider whose `supportsRunner` includes `"claude-code"` (see
`scripts/providers/chutes.ts` — `supportsRunner: ["opencode"]` only), so this applies
unconditionally to every `claude-code`-runner dispatch without needing any per-provider
branching.

- [ ] **Step 1: Wire `ensure-agentic-bridge` into Step 2**

In `### Step 2: Ensure the Resolved Runner Is Ready`, the existing `**claude-code`
runner:**` paragraph currently ends with:

```
If Depot's operation reports not-ready, stop here and report `BLOCKED`
rather than continuing to Step 3/4.
```

Insert a new paragraph directly after it:

```markdown
Then, also for the `claude-code` runner, invoke `digismith:depot`'s
`ensure-agentic-bridge` operation and record the port it returns — every
`claude-code`-runner dispatch (TokenReply is currently the only provider this
runner supports) routes through this local proxy instead of TokenReply
directly, so a leaked `kimi-k3` tool call is repaired before Claude Code
ever sees it (map item **K.9**, `.digismith/docs/agentic-bridge/design.html`).
If this operation doesn't return a usable port, stop here and report
`BLOCKED`, same as an unready `ensure-claude-code` check above.
```

- [ ] **Step 2: Change Step 4's dispatch commands to use the proxy's URL**

In `### Step 4: Dispatch`, both `claude-code` runner code blocks currently set
`ANTHROPIC_BASE_URL="<resolved baseUrl>"` — the value Step 1 read from
`print-config.ts`'s `baseUrl` field. Change both occurrences (fresh task and fix
round) to use the Agentic Bridge's local URL from the new Step 2 substep instead:

```markdown
ANTHROPIC_BASE_URL="http://127.0.0.1:<port from Step 2's ensure-agentic-bridge call>" \
```

(replacing `ANTHROPIC_BASE_URL="<resolved baseUrl>"` in both the fresh-task and fix-round
`claude-code` blocks). `ANTHROPIC_AUTH_TOKEN` is unchanged — still the real TokenReply
credential; the proxy relays whatever auth header it receives to the real upstream rather
than needing its own credential-reading logic.

- [ ] **Step 3: Narrow Step 5.5's applicability**

Step 5.5 (`### Step 5.5: Recover from a Detected XTML Tool-Call Leak`) currently opens
with:

```
**Only runs when Step 5's `parse-result.ts` output has `xtmlLeakDetected: true`** —
```

Insert a new paragraph directly after that opening line (before its numbered steps):

```markdown
**For the `claude-code` runner, this step should no longer trigger in practice** — the
Agentic Bridge proxy (map item K.9, wired in at Step 2/4 above) repairs the leak before
Claude Code's own agentic loop ever sees it, so a single ordinary dispatch completes
without needing this recovery procedure at all. This step remains the real, necessary
path for two cases: the `opencode` runner (out of scope for the proxy — see the design
doc's Out of Scope section) and an undecodable leak even the proxy couldn't fix (the
proxy relays those unchanged rather than guessing). If `xtmlLeakDetected: true` shows up
for a `claude-code`/TokenReply dispatch despite the proxy being in the path, treat that as
a signal something is wrong with the proxy itself, not a routine recovery case — worth
investigating rather than just working around.
```

- [ ] **Step 4: Commit**

```bash
git add skills/offload-implementer/SKILL.md
git commit -m "feat(offload-implementer): route claude-code dispatches through the Agentic Bridge (K.9)"
```

---

### Task 6: Live end-to-end verification

**Files:** none created or modified — this task exercises Tasks 1-5's shipped code and docs
against a real dispatch, following this whole investigation's own established live-testing
pattern (disposable scratch worktree, trivial task, independent verification via
`git log`/file existence, never trusting the dispatch's own self-reported status).

- [ ] **Step 1: Create a disposable worktree**

```bash
git worktree add ".claude/worktrees/agentic-bridge-live-test" -b worktree-agentic-bridge-live-test main
```

- [ ] **Step 2: Start the Agentic Bridge and confirm it's reachable**

Follow Task 4's `ensure-agentic-bridge` procedure by hand (invoking
`digismith:depot` directly, or running the same commands manually) — confirm
`~/.digismith-depot/agentic-bridge.log` shows the `agentic-bridge listening on
http://127.0.0.1:<port>` line, and that `<port>` is captured correctly.

- [ ] **Step 3: Dispatch a real trivial task via `kimi-k3` through the proxy**

Same task-prompt pattern as every earlier live test this investigation (a
single-file-create-and-commit task), `--model kimi-k3` (overriding the shipped
`kimi-k2.7` default just for this verification), pointed at the Agentic Bridge's
local URL instead of TokenReply directly:

```bash
cd ".claude/worktrees/agentic-bridge-live-test"
PROMPT=$(cat <<'PROMPT_EOF'
Create a file named AGENTIC_BRIDGE_TEST.md with the content "# Agentic Bridge live test",
then commit it with git. Reply DONE when finished, or BLOCKED if you could not complete this.
PROMPT_EOF
)
ANTHROPIC_BASE_URL="http://127.0.0.1:<port from Step 2>" \
ANTHROPIC_AUTH_TOKEN="$TOKENREPLY_API_KEY" \
claude -p "$PROMPT" --bare --model kimi-k3 \
  --permission-mode auto --output-format stream-json --verbose \
  --allowedTools "Read,Edit,Bash" > test-workspace/events.jsonl 2> test-workspace/stderr.log
```

- [ ] **Step 4: Confirm the dispatch completed with no leak reaching the controller**

```bash
node "<digismith-repo>/scripts/runners/parse-result.ts" claude-code test-workspace/events.jsonl
```

**Expected: `xtmlLeakDetected` is absent (or `undefined`) — not `true`.** If it's `true`,
this is a real finding: the proxy did not repair the leak, and this task should report
that honestly rather than proceeding to a workaround. **The critical thing to confirm: this
was a single dispatch, with no `--resume` call at any point** — that's the entire point of
this design.

- [ ] **Step 5: Independently verify the task actually completed**

```bash
git log --oneline -3
cat AGENTIC_BRIDGE_TEST.md
```

Expected: a real new commit exists, matching what the task asked for — do not trust the
dispatch's own reported status, confirm the actual file/commit exists, same discipline as
every other live test this investigation.

- [ ] **Step 6: Clean up**

```bash
cd "D:/Workspace/Jazurite/DigiSmith"
git worktree remove ".claude/worktrees/agentic-bridge-live-test" --force
git branch -D worktree-agentic-bridge-live-test
```

(If `git worktree remove` hits the Windows file-lock issue seen earlier in this
investigation, deregister with `git branch -D` regardless — the leftover physical folder
is harmless and can be deleted by hand later.)

- [ ] **Step 7: Record the result**

Update `backlog/tokenreply-kimi-k3-tool-calling-failure.md`'s status to record whether the
Agentic Bridge live-verified cleanly (a single dispatch, no leak reaching the controller,
no `--resume` needed) or surfaced something the design didn't anticipate (e.g. the SSE
open risk turning out to matter, or the proxy failing to repair a real leak). Commit this
update:

```bash
git add backlog/tokenreply-kimi-k3-tool-calling-failure.md
git commit -m "docs(backlog): record Agentic Bridge (K.9) live-verification result"
```
