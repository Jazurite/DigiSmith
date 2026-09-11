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
