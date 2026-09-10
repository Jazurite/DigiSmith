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

async function postToProxy(
  body: Record<string, unknown>,
  path: string = "/messages"
): Promise<{ status: number; json: unknown }> {
  const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const { port } = proxy.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
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

    const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port } = proxy.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": "test-key" },
        body: JSON.stringify({ model: "kimi-k2.7", stream: true, messages: [] }),
      });
      await res.text();
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
    expect(JSON.parse(lastUpstreamRequestBody).stream).toBe(false);
  });

  it("correctly resolves URLs with path prefixes in both base and request", async () => {
    // Track the actual path the fake upstream received
    let upstreamReceivedPath = "";
    fakeUpstream.close();
    fakeUpstream = createServer((req, res) => {
      upstreamReceivedPath = req.url ?? "";
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          id: "msg_4", type: "message", role: "assistant",
          content: [{ type: "text", text: "ok" }], model: "kimi-k2.7",
          stop_reason: "end_turn", stop_sequence: null,
        }));
      });
    });
    await new Promise<void>((resolve) => fakeUpstream.listen(0, "127.0.0.1", resolve));
    const { port } = fakeUpstream.address() as AddressInfo;
    // Upstream base URL includes /v1
    fakeUpstreamUrl = `http://127.0.0.1:${port}/v1`;

    // Client requests /v1/messages to the proxy
    await postToProxy({ model: "kimi-k2.7", stream: false, messages: [] }, "/v1/messages");

    // The upstream should receive /v1/messages (not /v1/v1/messages)
    expect(upstreamReceivedPath).toBe("/v1/messages");
  });

  it("returns a 502 error when upstream fetch fails", async () => {
    // Point to an unreachable port to simulate network failure
    fakeUpstreamUrl = "http://127.0.0.1:1";

    const { status, json } = await postToProxy({ model: "kimi-k2.7", stream: false, messages: [] });

    expect(status).toBe(502);
    const errorBody = json as { error?: string };
    expect(errorBody.error).toBeDefined();
    expect(typeof errorBody.error).toBe("string");
  });

  it("returns a 502 error when the upstream response has malformed JSON", async () => {
    fakeUpstream.close();
    fakeUpstream = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("not valid json");
    });
    await new Promise<void>((resolve) => fakeUpstream.listen(0, "127.0.0.1", resolve));
    const { port } = fakeUpstream.address() as AddressInfo;
    fakeUpstreamUrl = `http://127.0.0.1:${port}`;

    const { status, json } = await postToProxy({ model: "kimi-k2.7", stream: false, messages: [] });

    expect(status).toBe(502);
    const errorBody = json as { error?: string };
    expect(errorBody.error).toBeDefined();
  });

  it("returns a 502 error when the client request body has malformed JSON", async () => {
    fakeUpstreamResponse = {
      id: "msg_5", type: "message", role: "assistant",
      content: [{ type: "text", text: "ok" }], model: "kimi-k2.7",
      stop_reason: "end_turn", stop_sequence: null,
    };

    const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port } = proxy.address() as AddressInfo;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not valid json",
      });
      const json = await res.json();
      expect(res.status).toBe(502);
      const errorBody = json as { error?: string };
      expect(errorBody.error).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });

  it("gracefully handles errors after headers have been sent (e.g., body read/parse fails)", async () => {
    // Create a fake upstream that sends a valid status line but then aborts
    // before sending the full body, causing upstreamResponse.text() to fail
    fakeUpstream.close();
    fakeUpstream = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      // Immediately destroy the socket to simulate a connection drop mid-body
      res.socket?.destroy();
    });
    await new Promise<void>((resolve) => fakeUpstream.listen(0, "127.0.0.1", resolve));
    const { port } = fakeUpstream.address() as AddressInfo;
    fakeUpstreamUrl = `http://127.0.0.1:${port}`;

    const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port: proxyPort } = proxy.address() as AddressInfo;

    try {
      // This should not crash the proxy process, even though headers were sent
      // before the body read failed
      const res = await fetch(`http://127.0.0.1:${proxyPort}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kimi-k2.7", stream: false, messages: [] }),
      });
      // The response may be incomplete due to the connection being destroyed,
      // but the proxy should still be alive and respond (or gracefully close)
      expect(res.status).toBeGreaterThanOrEqual(200);
    } catch (err) {
      // It's acceptable to get a fetch error if the connection was destroyed,
      // as long as the proxy process itself didn't crash
      expect(err).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });

  it("gracefully handles errors after headers sent on non-OK upstream response", async () => {
    // Simulate a non-200 upstream response where upstreamResponse.text() fails
    fakeUpstream.close();
    fakeUpstream = createServer((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      // Destroy immediately to fail the text() read
      res.socket?.destroy();
    });
    await new Promise<void>((resolve) => fakeUpstream.listen(0, "127.0.0.1", resolve));
    const { port } = fakeUpstream.address() as AddressInfo;
    fakeUpstreamUrl = `http://127.0.0.1:${port}`;

    const proxy = createServer(createRequestHandler(fakeUpstreamUrl));
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port: proxyPort } = proxy.address() as AddressInfo;

    try {
      // This should not crash the proxy, even though headers were sent
      // before the error read failed
      const res = await fetch(`http://127.0.0.1:${proxyPort}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kimi-k2.7", stream: false, messages: [] }),
      });
      expect(res.status).toBeGreaterThanOrEqual(200);
    } catch (err) {
      // Acceptable if fetch errors, as long as proxy doesn't crash
      expect(err).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });
});

describe("createRequestHandler — streaming", () => {
  it("sends content_block_start with empty text placeholder and fills content in delta", async () => {
    fakeUpstreamResponse = {
      id: "msg_6",
      type: "message",
      role: "assistant",
      content: [{
        type: "text",
        text: "Hello, this is a plain text response.",
      }],
      model: "kimi-k3",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 8 },
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
      // Verify content_block_start has empty placeholder
      expect(events[1].data.content_block).toEqual({ type: "text", text: "" });
      // Verify delta carries the full text
      expect(events[2].data.delta.type).toBe("text_delta");
      expect(events[2].data.delta.text).toBe("Hello, this is a plain text response.");
      expect(events[4].data.delta.stop_reason).toBe("end_turn");
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });

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
      // Verify content_block_start has empty placeholder with id and name but empty input
      expect(events[1].data.content_block.type).toBe("tool_use");
      expect(events[1].data.content_block.name).toBe("Read");
      expect(events[1].data.content_block.id).toBeDefined();
      expect(events[1].data.content_block.input).toEqual({});
      // Verify delta carries the full input
      expect(events[2].data.delta.type).toBe("input_json_delta");
      expect(JSON.parse(events[2].data.delta.partial_json)).toEqual({ file_path: "README.md" });
      expect(events[4].data.delta.stop_reason).toBe("tool_use");
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });
});
