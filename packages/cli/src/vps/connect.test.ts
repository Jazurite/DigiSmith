import { describe, it, expect } from "vitest";
import * as path from "node:path";
import type { VpsConfig } from "./config.ts";
import { HERDR_PATH_PREFIX } from "./checks.ts";
import {
  TOOLCHAIN_INSTALL_HINT,
  buildInstallHerdrIntegrationCommand,
  buildStartHerdrServerCommand,
  buildCreateWorkspaceCommand,
  buildStartAgentCommand,
  buildAttachArgs,
  buildScpArgs,
  buildPrintConfigCommand,
  hasValidTokenreplyProvider,
  mergeOpencodeConfig,
} from "./connect.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  workspace_label: "digismith-main",
  agent_name: "opencode-main",
};

describe("TOOLCHAIN_INSTALL_HINT", () => {
  it("names every manual install step the design points at", () => {
    expect(TOOLCHAIN_INSTALL_HINT).toContain("nvm");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("corepack enable");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm add -g opencode-ai");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm approve-builds --global opencode-ai");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("herdr.dev");
  });
});

describe("buildInstallHerdrIntegrationCommand", () => {
  it("installs herdr's opencode integration plugin", () => {
    const cmd = buildInstallHerdrIntegrationCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr integration install opencode");
  });
});

describe("buildStartHerdrServerCommand", () => {
  it("starts herdr's server detached and backgrounded", () => {
    const cmd = buildStartHerdrServerCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("nohup herdr server");
    expect(remote).toContain("&");
  });
});

describe("buildCreateWorkspaceCommand", () => {
  it("creates a herdr workspace with the configured label, unfocused", () => {
    const cmd = buildCreateWorkspaceCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr workspace create");
    expect(remote).toContain("--label digismith-main");
    expect(remote).toContain("--no-focus");
  });

  it("sources the TokenReply credential on the VPS and passes it through via the remote shell, never locally", () => {
    const cmd = buildCreateWorkspaceCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(". ~/.config/tokenreply.env");
    expect(remote).toContain('--env "TOKENREPLY_API_KEY=$TOKENREPLY_API_KEY"');
    expect(remote.indexOf(". ~/.config/tokenreply.env")).toBeLessThan(remote.indexOf("herdr workspace create"));
  });
});

describe("buildStartAgentCommand", () => {
  it("starts the configured agent name running OpenCode on the default model in the given pane", () => {
    const cmd = buildStartAgentCommand(CONFIG, "w2:p1");
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr agent start opencode-main --kind opencode");
    expect(remote).toContain("--pane w2:p1");
    expect(remote).toContain("--model tokenreply/kimi-k2.7");
  });
});

describe("buildAttachArgs", () => {
  it("builds an interactive ssh attach command for the configured agent, with herdr on PATH", () => {
    expect(buildAttachArgs(CONFIG)).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
      "-t", "root@46.225.49.140",
      `${HERDR_PATH_PREFIX}; herdr agent attach opencode-main`,
    ]);
  });
});

describe("buildScpArgs", () => {
  it("builds a non-interactive, time-bounded scp command copying a local file to the configured remote path", () => {
    expect(buildScpArgs(CONFIG, "/tmp/local-file", "~/.config/tokenreply.env")).toEqual([
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "IdentitiesOnly=yes",
      "-i", "~/.ssh/jazurite",
      "/tmp/local-file",
      "root@46.225.49.140:~/.config/tokenreply.env",
    ]);
  });
});

describe("buildPrintConfigCommand", () => {
  it("builds the node args to resolve tokenreply's opencode provider block via the source repo's script", () => {
    const args = buildPrintConfigCommand("/home/jack/digismith");
    expect(args).toEqual([
      path.join("/home/jack/digismith", "scripts", "providers", "print-config.ts"),
      "tokenreply",
      "--role", "task",
      "--runner", "opencode",
    ]);
  });
});

const TOKENREPLY_BLOCK = {
  tokenreply: {
    npm: "@ai-sdk/openai-compatible",
    name: "TokenReply",
    options: { baseURL: "https://api.tokenreply.com/v1", apiKey: "{env:TOKENREPLY_API_KEY}" },
    models: { "kimi-k2.7": { name: "TokenReply", limit: { context: 200000, output: 65535 } } },
  },
};

describe("hasValidTokenreplyProvider", () => {
  it("is false for an empty config", () => {
    expect(hasValidTokenreplyProvider({})).toBe(false);
  });

  it("is false when the provider block sits at the top level instead of under provider", () => {
    expect(hasValidTokenreplyProvider({ ...TOKENREPLY_BLOCK })).toBe(false);
  });

  it("is false when provider holds only an unrelated provider", () => {
    expect(hasValidTokenreplyProvider({ provider: { anthropic: { options: {} } } })).toBe(false);
  });

  it("is false when provider or provider.tokenreply is not an object", () => {
    expect(hasValidTokenreplyProvider({ provider: null })).toBe(false);
    expect(hasValidTokenreplyProvider({ provider: "tokenreply" })).toBe(false);
    expect(hasValidTokenreplyProvider({ provider: { tokenreply: null } })).toBe(false);
    expect(hasValidTokenreplyProvider({ provider: { tokenreply: true } })).toBe(false);
  });

  it("is true when provider.tokenreply is already configured", () => {
    expect(hasValidTokenreplyProvider({ $schema: "https://opencode.ai/config.json", provider: TOKENREPLY_BLOCK })).toBe(
      true
    );
  });
});

describe("mergeOpencodeConfig", () => {
  it("wraps the provider block under provider with the schema, starting from an empty config", () => {
    const merged = mergeOpencodeConfig({}, TOKENREPLY_BLOCK);
    expect(merged).toEqual({ $schema: "https://opencode.ai/config.json", provider: TOKENREPLY_BLOCK });
    expect(hasValidTokenreplyProvider(merged)).toBe(true);
  });

  it("keeps an unrelated provider and other top-level settings alongside tokenreply", () => {
    const anthropic = { options: { apiKey: "{env:ANTHROPIC_API_KEY}" } };
    const merged = mergeOpencodeConfig({ theme: "dark", provider: { anthropic } }, TOKENREPLY_BLOCK);
    expect(merged).toEqual({
      theme: "dark",
      $schema: "https://opencode.ai/config.json",
      provider: { anthropic, tokenreply: TOKENREPLY_BLOCK.tokenreply },
    });
  });

  it("replaces a stale tokenreply entry with the freshly generated one", () => {
    const merged = mergeOpencodeConfig({ provider: { tokenreply: { name: "stale" } } }, TOKENREPLY_BLOCK);
    expect(merged.provider).toEqual(TOKENREPLY_BLOCK);
  });

  it("does not mutate the existing config", () => {
    const existing = { provider: { anthropic: {} } };
    mergeOpencodeConfig(existing, TOKENREPLY_BLOCK);
    expect(existing).toEqual({ provider: { anthropic: {} } });
  });
});
