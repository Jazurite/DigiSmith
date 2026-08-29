// scripts/runners/claude-code.test.ts
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCode } from "./claude-code.ts";
import { tokenreply } from "../providers/tokenreply.ts";

describe("claudeCode.buildConfig", () => {
  it("returns the base URL and credential env var, not an opencode.json block", () => {
    expect(claudeCode.buildConfig(tokenreply, "task")).toEqual({
      baseUrl: "https://api.tokenreply.com/v1",
      credentialEnv: "TOKENREPLY_API_KEY",
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
});
