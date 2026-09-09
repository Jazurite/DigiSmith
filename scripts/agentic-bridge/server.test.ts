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
