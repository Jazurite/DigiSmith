// scripts/runners/claude-code.test.ts
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCode } from "./claude-code.ts";
import { tokenreply } from "../providers/tokenreply.ts";
import { BASH_CALL_FIXTURE } from "./kimi-k3-xtml-parser.fixtures.ts";

describe("claudeCode.buildConfig", () => {
  it("returns the base URL, credential env var, and resolved model — not an opencode.json block", () => {
    expect(claudeCode.buildConfig(tokenreply, "task")).toEqual({
      baseUrl: "https://api.tokenreply.com/v1",
      credentialEnv: "TOKENREPLY_API_KEY",
      model: "kimi-k2.7",
    });
  });
});

describe("claudeCode.parseResult", () => {
  function writeEvents(lines: Record<string, unknown>[]): string {
    const dir = mkdtempSync(join(tmpdir(), "claude-code-events-"));
    const path = join(dir, "events.jsonl");
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
    return path;
  }

  it("parses a success result line", () => {
    const path = writeEvents([
      { type: "system", subtype: "init", session_id: "sess_1" },
      {
        type: "result",
        subtype: "success",
        result: "the actual reply content",
        session_id: "sess_1",
        cost: { total_cost_usd: 0.0123 },
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "success",
      resultText: "the actual reply content",
      sessionId: "sess_1",
      costUsd: 0.0123,
    });
  });

  it("parses an error result line", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "error",
        result: null,
        session_id: "sess_2",
        cost: { total_cost_usd: 0.001 },
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "error",
      resultText: null,
      sessionId: "sess_2",
      costUsd: 0.001,
    });
  });

  it("parses an interrupted result line", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "interrupted",
        result: null,
        session_id: "sess_3",
        cost: { total_cost_usd: 0 },
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "interrupted",
      resultText: null,
      sessionId: "sess_3",
      costUsd: 0,
    });
  });

  it("returns status error with no sessionId when no result event exists", () => {
    const path = writeEvents([{ type: "system", subtype: "init", session_id: "sess_x" }]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "error",
      resultText: null,
      sessionId: null,
    });
  });

  it("maps an unrecognized subtype to status error, preserving sessionId", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "error_max_turns",
        result: null,
        session_id: "sess_4",
        total_cost_usd: 0.05,
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "error",
      resultText: null,
      sessionId: "sess_4",
      costUsd: 0.05,
    });
  });

  it("reads a top-level total_cost_usd field", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "success",
        result: "ok",
        session_id: "sess_5",
        total_cost_usd: 0.2,
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "success",
      resultText: "ok",
      sessionId: "sess_5",
      costUsd: 0.2,
    });
  });

  it("treats is_error:true as status error even when subtype says success (confirmed live: an auth failure returns exactly this shape)", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "success",
        is_error: true,
        result: "Failed to authenticate. API Error: 401 Invalid bearer token",
        session_id: "sess_6",
        total_cost_usd: 0,
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "error",
      resultText: "Failed to authenticate. API Error: 401 Invalid bearer token",
      sessionId: "sess_6",
      costUsd: 0,
    });
  });

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
