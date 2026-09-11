import { describe, it, expect } from "vitest";
import type { VpsConfig } from "./config.ts";
import {
  START_CLAUDE_SCRIPT,
  TOOLCHAIN_INSTALL_HINT,
  buildEnableLingerCommand,
  buildWriteStartScriptCommand,
  buildStartTmuxSessionCommand,
  buildAttachArgs,
} from "./connect.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  tmux_session: "claude-main",
};

describe("START_CLAUDE_SCRIPT", () => {
  it("ends in exec bash, never exec claude, so a claude crash doesn't kill the session", () => {
    const lines = START_CLAUDE_SCRIPT.trim().split("\n");
    expect(lines[lines.length - 1].trim()).toBe("exec bash");
    expect(START_CLAUDE_SCRIPT).not.toContain("exec claude");
    expect(START_CLAUDE_SCRIPT).toContain("claude");
  });
});

describe("buildEnableLingerCommand", () => {
  it("enables lingering for the configured user", () => {
    const cmd = buildEnableLingerCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("loginctl enable-linger root");
  });
});

describe("buildWriteStartScriptCommand", () => {
  it("writes the start script via a quoted heredoc and makes it executable", () => {
    const cmd = buildWriteStartScriptCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain("cat > ~/start-claude.sh <<'DIGISMITH_EOF'");
    expect(remote).toContain("DIGISMITH_EOF");
    expect(remote).toContain("chmod +x ~/start-claude.sh");
    expect(remote).toContain("exec bash");
  });
});

describe("buildStartTmuxSessionCommand", () => {
  it("creates the configured tmux session and pipes its output to a log", () => {
    const cmd = buildStartTmuxSessionCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain('tmux new-session -d -s claude-main "$HOME/start-claude.sh"');
    expect(remote).toContain('tmux pipe-pane -o -t claude-main "cat >> $HOME/claude-session.log"');
  });
});

describe("TOOLCHAIN_INSTALL_HINT", () => {
  it("names every manual install step the design points at", () => {
    expect(TOOLCHAIN_INSTALL_HINT).toContain("nvm");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("corepack enable");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm add -g @anthropic-ai/claude-code");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm approve-builds --global @anthropic-ai/claude-code");
  });
});

describe("buildAttachArgs", () => {
  it("builds an interactive ssh attach command for the configured session", () => {
    expect(buildAttachArgs(CONFIG)).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
      "-t", "root@46.225.49.140",
      "tmux attach -t claude-main",
    ]);
  });
});
