import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(new URL("./parse-result.ts", import.meta.url));

function writeEvents(lines: Record<string, unknown>[]): string {
  const dir = mkdtempSync(join(tmpdir(), "parse-result-events-"));
  const path = join(dir, "events.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
  return path;
}

describe("parse-result CLI", () => {
  it("prints a ParsedResult for a known opencode runner and exits 0", () => {
    const eventsFile = writeEvents([
      { type: "text", sessionID: "ses_1", part: { type: "text", text: "hello" } },
    ]);
    const stdout = execFileSync("node", [SCRIPT_PATH, "opencode", eventsFile], {
      encoding: "utf-8",
    });
    expect(JSON.parse(stdout)).toEqual({
      status: "success",
      resultText: "hello",
      sessionId: "ses_1",
    });
  });

  it("prints a ParsedResult for a known claude-code runner and exits 0", () => {
    const eventsFile = writeEvents([
      { type: "result", subtype: "success", result: "hi", session_id: "sess_1", cost: { total_cost_usd: 0.01 } },
    ]);
    const stdout = execFileSync("node", [SCRIPT_PATH, "claude-code", eventsFile], {
      encoding: "utf-8",
    });
    expect(JSON.parse(stdout)).toEqual({
      status: "success",
      resultText: "hi",
      sessionId: "sess_1",
      costUsd: 0.01,
    });
  });

  it("exits non-zero for an unknown runner", () => {
    const eventsFile = writeEvents([{ type: "text", sessionID: "x", part: { type: "text", text: "x" } }]);
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "codex", eventsFile], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("exits non-zero when the events file is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "opencode", "/does/not/exist.jsonl"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("exits non-zero when a positional argument is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "opencode"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });
});
