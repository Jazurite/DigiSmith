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
