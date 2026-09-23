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
});

describe("buildStartAgentCommand", () => {
  it("starts the configured agent name running OpenCode on the default model", () => {
    const cmd = buildStartAgentCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr agent start opencode-main --kind opencode");
    expect(remote).toContain("--model tokenreply/kimi-k2.7");
  });
});

describe("buildAttachArgs", () => {
  it("builds an interactive ssh attach command for the configured agent", () => {
    expect(buildAttachArgs(CONFIG)).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
      "-t", "root@46.225.49.140",
      "herdr agent attach opencode-main",
    ]);
  });
});

describe("buildScpArgs", () => {
  it("builds an scp command copying a local file to the configured remote path", () => {
    expect(buildScpArgs(CONFIG, "/tmp/local-file", "~/.config/tokenreply.env")).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
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
