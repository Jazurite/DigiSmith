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
    // Send empty placeholder in content_block_start, not the full content
    let emptyPlaceholder: unknown;
    if (block.type === "text") {
      emptyPlaceholder = { type: "text", text: "" };
    } else if (block.type === "tool_use") {
      emptyPlaceholder = { type: "tool_use", id: block.id, name: block.name, input: {} };
    } else {
      emptyPlaceholder = block;
    }

    send("content_block_start", { type: "content_block_start", index, content_block: emptyPlaceholder });
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

/** Builds the proxy's request handler against a given TokenReply-compatible base URL. */
export function createRequestHandler(upstreamBaseUrl: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const rawBody = await readBody(req);
      const requestJson = rawBody ? JSON.parse(rawBody) : {};

      const upstreamUrl = new URL(req.url ?? "/messages", upstreamBaseUrl).href;
      const upstreamResponse = await fetch(upstreamUrl, {
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

      if (requestJson.stream === true) {
        writeAsSse(res, finalResponse);
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(finalResponse));
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          })
        );
      } else {
        // Headers were already sent to the client, so we can't write a new status.
        // Destroy the connection to prevent the client from hanging.
        res.destroy();
      }
    }
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
