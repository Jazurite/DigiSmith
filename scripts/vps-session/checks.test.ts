import { describe, it, expect } from "vitest";
import type { VpsConfig } from "./config.ts";
import {
  buildBaseSshArgs,
  buildReachabilityCommand,
  buildLingerCommand,
  buildToolchainCommand,
  buildTmuxListCommand,
  buildCredentialsCheckCommand,
  buildPaneCommandQuery,
  isLingerEnabled,
  parseToolchainOutput,
  isTmuxSessionAlive,
  isClaudeProcessRunning,
} from "./checks.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  tmux_session: "claude-main",
};

describe("buildBaseSshArgs", () => {
  it("includes non-interactive flags, identity file, and user@host", () => {
    expect(buildBaseSshArgs(CONFIG)).toEqual([
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
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

describe("buildLingerCommand", () => {
  it("queries loginctl for the configured user", () => {
    const cmd = buildLingerCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("loginctl show-user root -p Linger");
  });
});

describe("buildToolchainCommand", () => {
  it("sources nvm and pnpm before checking claude", () => {
    const cmd = buildToolchainCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain('NVM_DIR="$HOME/.nvm"');
    expect(remote).toContain('PNPM_HOME="$HOME/.local/share/pnpm"');
    expect(remote).toContain("claude --version");
  });
});

describe("buildTmuxListCommand", () => {
  it("lists tmux sessions", () => {
    const cmd = buildTmuxListCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("tmux list-sessions");
  });
});

describe("buildCredentialsCheckCommand", () => {
  it("tests for the credentials file", () => {
    const cmd = buildCredentialsCheckCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("test -f ~/.claude/.credentials.json");
  });
});

describe("buildPaneCommandQuery", () => {
  it("queries the configured tmux session's current pane command", () => {
    const cmd = buildPaneCommandQuery(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe(
      'tmux list-panes -t claude-main -F "#{pane_current_command}"'
    );
  });
});

describe("isLingerEnabled", () => {
  it("is true only for an exact Linger=yes", () => {
    expect(isLingerEnabled("Linger=yes\n")).toBe(true);
    expect(isLingerEnabled("Linger=no\n")).toBe(false);
    expect(isLingerEnabled("")).toBe(false);
  });
});

describe("parseToolchainOutput", () => {
  it("reports ready with the version on success", () => {
    expect(parseToolchainOutput(0, "2.1.0 (Claude Code)\n")).toEqual({
      ready: true,
      version: "2.1.0 (Claude Code)",
    });
  });

  it("reports which piece is missing on failure", () => {
    expect(parseToolchainOutput(1, "MISSING:pnpm\n")).toEqual({ ready: false, missing: "pnpm" });
  });

  it("falls back to unknown when the failure output doesn't match", () => {
    expect(parseToolchainOutput(1, "some other error\n")).toEqual({ ready: false, missing: "unknown" });
  });
});

describe("isTmuxSessionAlive", () => {
  it("finds an exact session name among multiple listed sessions", () => {
    const stdout = "other-session: 1 windows\nclaude-main: 2 windows (created ...)\n";
    expect(isTmuxSessionAlive(stdout, "claude-main")).toBe(true);
  });

  it("returns false when the session isn't listed", () => {
    expect(isTmuxSessionAlive("other-session: 1 windows\n", "claude-main")).toBe(false);
  });
});

describe("isClaudeProcessRunning", () => {
  it("is true when the pane's current command is claude", () => {
    expect(isClaudeProcessRunning("claude\n")).toBe(true);
  });

  it("is false when the pane fell back to a shell", () => {
    expect(isClaudeProcessRunning("bash\n")).toBe(false);
  });
});
