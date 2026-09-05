import { describe, expect, it } from "vitest";
import { extractXtmlToolCalls, hasXtmlToolCallChannel } from "./kimi-k3-xtml-parser.ts";
import {
  BASH_CALL_FIXTURE,
  WRITE_CALL_FIXTURE,
  MULTI_CALL_FIXTURE,
  NORMAL_TEXT_FIXTURE,
} from "./kimi-k3-xtml-parser.fixtures.ts";

describe("hasXtmlToolCallChannel", () => {
  it("detects a real leaked tools channel", () => {
    expect(hasXtmlToolCallChannel(BASH_CALL_FIXTURE)).toBe(true);
  });

  it("returns false for normal text", () => {
    expect(hasXtmlToolCallChannel(NORMAL_TEXT_FIXTURE)).toBe(false);
  });

  it("does not false-positive on a lone <|sep|> with no channel marker", () => {
    expect(hasXtmlToolCallChannel("some text <|sep|> more text, no real marker")).toBe(false);
  });
});

describe("extractXtmlToolCalls", () => {
  it("decodes a single Bash call with string arguments", () => {
    const result = extractXtmlToolCalls(BASH_CALL_FIXTURE);
    expect(result.toolCalls).toEqual([
      {
        name: "Bash",
        arguments: {
          command: 'printf \'# Usage test\' > USAGE_TEST.md && git add USAGE_TEST.md && git commit -m "test: usage verification file"',
          description: "Create USAGE_TEST.md and commit it",
        },
      },
    ]);
  });

  it("decodes a single Write call with string arguments, including multi-line content", () => {
    const result = extractXtmlToolCalls(WRITE_CALL_FIXTURE);
    expect(result.toolCalls).toEqual([
      {
        name: "Write",
        arguments: {
          content: "# Debug test\n\nIsolating a tool-calling failure.\n",
          file_path: "D:\\Workspace\\Jazurite\\DigiSmith\\.claude\\worktrees\\debug-k3-repeat\\DEBUG_TEST.md",
        },
      },
    ]);
  });

  it("decodes multiple calls in one tools channel, in order", () => {
    const result = extractXtmlToolCalls(MULTI_CALL_FIXTURE);
    expect(result.toolCalls).toEqual([
      { name: "Read", arguments: { file_path: "README.md" } },
      { name: "Bash", arguments: { command: "ls" } },
    ]);
  });

  it("returns no tool calls for normal text, with the text as content", () => {
    const result = extractXtmlToolCalls(NORMAL_TEXT_FIXTURE);
    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe(NORMAL_TEXT_FIXTURE);
  });

  it("JSON-decodes a non-string-typed argument", () => {
    const text = `<|open|>tools<|sep|><|open|>call tool="Configure" index="1"<|sep|><|open|>argument key="opts" type="object"<|sep|>{"a":1,"b":true}<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([
      { name: "Configure", arguments: { opts: { a: 1, b: true } } },
    ]);
  });

  it("falls back to raw text when a non-string-typed argument is malformed JSON", () => {
    const text = `<|open|>tools<|sep|><|open|>call tool="Configure" index="1"<|sep|><|open|>argument key="opts" type="object"<|sep|>not json<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([
      { name: "Configure", arguments: { opts: "not json" } },
    ]);
  });

  it("reverse-decodes HTML-entity-escaped attribute values (&quot; before &amp;)", () => {
    const text = `<|open|>tools<|sep|><|open|>call tool="Bash" index="1"<|sep|><|open|>argument key="cmd&quot;arg" type="string"<|sep|>echo &quot;a &amp; b&quot;<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([
      { name: "Bash", arguments: { "cmd\"arg": "echo &quot;a &amp; b&quot;" } },
    ]);
  });

  it("drops a call block with no tool name", () => {
    const text = `<|open|>tools<|sep|><|open|>call index="1"<|sep|><|open|>argument key="x" type="string"<|sep|>y<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([]);
  });

  it("unwraps a sibling response channel into content when no tools channel is present", () => {
    const text = `<|open|>response<|sep|>Hello there<|close|>response<|sep|>`;
    const result = extractXtmlToolCalls(text);
    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe("Hello there");
  });
});

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(new URL("./kimi-k3-xtml-parser.ts", import.meta.url));

describe("kimi-k3-xtml-parser CLI", () => {
  it("prints extracted tool calls as JSON given a text file argument", () => {
    const dir = mkdtempSync(join(tmpdir(), "xtml-cli-test-"));
    const textFile = join(dir, "raw.txt");
    writeFileSync(textFile, BASH_CALL_FIXTURE);

    const stdout = execFileSync("node", [SCRIPT_PATH, textFile], { encoding: "utf-8" });
    const parsed = JSON.parse(stdout);
    expect(parsed.toolCalls).toEqual([
      {
        name: "Bash",
        arguments: {
          command: 'printf \'# Usage test\' > USAGE_TEST.md && git add USAGE_TEST.md && git commit -m "test: usage verification file"',
          description: "Create USAGE_TEST.md and commit it",
        },
      },
    ]);
  });

  it("exits non-zero when the file argument is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }),
    ).toThrow();
  });
});
