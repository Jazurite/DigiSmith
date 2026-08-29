// scripts/runners/opencode.test.ts
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { opencode } from "./opencode.ts";
import { chutes } from "../providers/chutes.ts";
import { buildOpencodeProviderBlock } from "../providers/print-config.ts";

describe("opencode.buildConfig", () => {
  it("delegates to buildOpencodeProviderBlock unchanged", () => {
    expect(opencode.buildConfig(chutes, "task")).toEqual(
      buildOpencodeProviderBlock(chutes, "task"),
    );
  });
});

describe("opencode.parseResult", () => {
  function writeEvents(lines: Record<string, unknown>[]): string {
    const dir = mkdtempSync(join(tmpdir(), "opencode-events-"));
    const path = join(dir, "events.jsonl");
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
    return path;
  }

  it("extracts the last text event's nested part.text and top-level sessionID", () => {
    const path = writeEvents([
      { type: "step-start", sessionID: "ses_abc" },
      {
        type: "text",
        sessionID: "ses_abc",
        part: { id: "prt_1", type: "text", text: "first reply" },
      },
      {
        type: "text",
        sessionID: "ses_abc",
        part: { id: "prt_2", type: "text", text: "final reply" },
      },
    ]);
    expect(opencode.parseResult(path)).toEqual({
      status: "success",
      resultText: "final reply",
      sessionId: "ses_abc",
      costUsd: undefined,
    });
  });

  it("returns status error when no text event exists", () => {
    const path = writeEvents([{ type: "step-start", sessionID: "ses_xyz" }]);
    expect(opencode.parseResult(path)).toEqual({
      status: "error",
      resultText: null,
      sessionId: "ses_xyz",
      costUsd: undefined,
    });
  });
});
