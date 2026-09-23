import { describe, it, expect } from "vitest";
import type { VpsConfig } from "./config.ts";
import {
  buildBaseSshArgs,
  buildReachabilityCommand,
  buildHerdrVersionCommand,
  buildHerdrServerCheckCommand,
  buildToolchainCommand,
  buildAgentGetCommand,
  buildCredentialsCheckCommand,
  HERDR_PATH_PREFIX,
  isHerdrInstalled,
  isHerdrServerRunning,
  parseToolchainOutput,
  parseAgentGetOutput,
} from "./checks.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  workspace_label: "digismith-main",
  agent_name: "opencode-main",
};

describe("buildBaseSshArgs", () => {
  it("includes non-interactive flags, identity file, and user@host", () => {
    expect(buildBaseSshArgs(CONFIG)).toEqual([
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "IdentitiesOnly=yes",
      "-i", "~/.ssh/jazurite",
      "root@46.225.49.140",
    ]);
  });
});

describe("buildReachabilityCommand", () => {
  it("runs a bare true over ssh", () => {
    const cmd = buildReachabilityCommand(CONFIG);
    expect(cmd.command).toBe("ssh");
    expect(cmd.args[cmd.args.length - 1]).toBe("true");
  });
});

describe("HERDR_PATH_PREFIX", () => {
  it("puts herdr's install location on PATH explicitly", () => {
    expect(HERDR_PATH_PREFIX).toBe('export PATH="$HOME/.local/bin:$PATH"');
  });
});

describe("buildHerdrVersionCommand", () => {
  it("checks herdr's version after ensuring it's on PATH", () => {
    const cmd = buildHerdrVersionCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr --version");
  });
});

describe("buildHerdrServerCheckCommand", () => {
  it("lists herdr agents to confirm the server socket is reachable", () => {
    const cmd = buildHerdrServerCheckCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr agent list");
  });
});

describe("buildToolchainCommand", () => {
  it("sources nvm and pnpm before checking opencode", () => {
    const cmd = buildToolchainCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain('NVM_DIR="$HOME/.nvm"');
    expect(remote).toContain("nvm use default");
    expect(remote).toContain('PNPM_HOME="$HOME/.local/share/pnpm"');
    expect(remote).toContain("opencode --version");
    expect(remote).not.toContain("claude --version");
  });
});

describe("buildAgentGetCommand", () => {
  it("queries herdr for the configured agent's status", () => {
    const cmd = buildAgentGetCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr agent get opencode-main");
  });
});

describe("buildCredentialsCheckCommand", () => {
  it("tests for the TokenReply credential file", () => {
    const cmd = buildCredentialsCheckCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("test -f ~/.config/tokenreply.env");
  });
});

describe("isHerdrInstalled", () => {
  it("is true on a zero exit code", () => {
    expect(isHerdrInstalled(0)).toBe(true);
  });

  it("is false on a non-zero exit code", () => {
    expect(isHerdrInstalled(127)).toBe(false);
  });
});

describe("isHerdrServerRunning", () => {
  it("is true on a zero exit code", () => {
    expect(isHerdrServerRunning(0)).toBe(true);
  });

  it("is false on a non-zero exit code", () => {
    expect(isHerdrServerRunning(1)).toBe(false);
  });
});

describe("parseToolchainOutput", () => {
  it("reports ready with the version on success", () => {
    expect(parseToolchainOutput(0, "1.18.31\n")).toEqual({ ready: true, version: "1.18.31" });
  });

  it("reports which piece is missing on failure", () => {
    expect(parseToolchainOutput(1, "MISSING:pnpm\n")).toEqual({ ready: false, missing: "pnpm" });
  });

  it("falls back to unknown when the failure output doesn't match", () => {
    expect(parseToolchainOutput(1, "some other error\n")).toEqual({ ready: false, missing: "unknown" });
  });

  it("finds the MISSING marker after preceding output", () => {
    expect(parseToolchainOutput(1, "some warning line\nMISSING:opencode\n")).toEqual({ ready: false, missing: "opencode" });
  });
});

describe("parseAgentGetOutput", () => {
  it("reports alive with the parsed agent_status on success", () => {
    const stdout = JSON.stringify({
      id: "cli:agent:get",
      result: { agent: { agent_status: "idle", agent: "opencode", name: "opencode-main" } },
    });
    expect(parseAgentGetOutput(0, stdout)).toEqual({
      alive: true,
      agentStatus: "idle",
      detail: "idle",
    });
  });

  it("reports not alive on a non-zero exit code", () => {
    expect(parseAgentGetOutput(1, "")).toEqual({ alive: false, detail: "" });
  });

  it("reports not alive when stdout isn't parseable JSON despite exit 0", () => {
    expect(parseAgentGetOutput(0, "not json")).toEqual({ alive: false, detail: "not json" });
  });

  it("reports not alive when the expected fields are missing despite exit 0 and valid JSON", () => {
    expect(parseAgentGetOutput(0, JSON.stringify({ id: "cli:agent:get" }))).toEqual({
      alive: false,
      detail: JSON.stringify({ id: "cli:agent:get" }),
    });
  });
});
