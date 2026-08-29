import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOpencodeProviderBlock } from "./print-config.ts";
import { chutes } from "./chutes.ts";
import { tokenreply } from "./tokenreply.ts";

const SCRIPT_PATH = fileURLToPath(new URL("./print-config.ts", import.meta.url));

describe("buildOpencodeProviderBlock", () => {
  it("builds the chutes task-role block", () => {
    expect(buildOpencodeProviderBlock(chutes, "task")).toEqual({
      chutes: {
        npm: "@ai-sdk/openai-compatible",
        name: "Chutes",
        options: {
          baseURL: "https://llm.chutes.ai/v1",
          apiKey: "{env:CHUTES_API_KEY}",
        },
        models: {
          "moonshotai/Kimi-K3-TEE": {
            name: "Chutes",
            limit: { context: 1_048_576, output: 65535 },
          },
        },
      },
    });
  });

  it("builds the chutes mechanical-role block with the mechanical model", () => {
    const block = buildOpencodeProviderBlock(chutes, "mechanical");
    const models = (block.chutes as Record<string, unknown>).models as Record<string, unknown>;
    expect(Object.keys(models)).toEqual(["google/gemma-4-31B-turbo-TEE"]);
  });

  it("builds the tokenreply task-role block", () => {
    expect(buildOpencodeProviderBlock(tokenreply, "task")).toEqual({
      tokenreply: {
        npm: "@ai-sdk/openai-compatible",
        name: "TokenReply",
        options: {
          baseURL: "https://api.tokenreply.com/v1",
          apiKey: "{env:TOKENREPLY_API_KEY}",
        },
        models: {
          "kimi-k2.7": {
            name: "TokenReply",
            limit: { context: 200_000, output: 65535 },
          },
        },
      },
    });
  });
});

describe("print-config CLI", () => {
  it("prints valid provider JSON and exits 0 for a known provider", () => {
    const stdout = execFileSync("node", [SCRIPT_PATH, "chutes", "--role", "task"], {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(stdout);
    expect(Object.keys(parsed)).toEqual(["chutes"]);
  });

  it("exits non-zero for an unknown provider", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "does-not-exist", "--role", "task"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("exits non-zero when --role is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "chutes"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("supports --runner claude-code, returning {baseUrl, credentialEnv} instead of an opencode block", () => {
    const stdout = execFileSync(
      "node",
      [SCRIPT_PATH, "tokenreply", "--role", "task", "--runner", "claude-code"],
      { encoding: "utf-8" },
    );
    expect(JSON.parse(stdout)).toEqual({
      baseUrl: "https://api.tokenreply.com/v1",
      credentialEnv: "TOKENREPLY_API_KEY",
    });
  });

  it("defaults --runner to opencode when omitted, output unchanged from before", () => {
    const stdout = execFileSync("node", [SCRIPT_PATH, "chutes", "--role", "task"], {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(stdout);
    expect(Object.keys(parsed)).toEqual(["chutes"]);
  });
});
