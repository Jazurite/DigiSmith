import { spawnSync } from "node:child_process";
import type { VpsConfig } from "./config.ts";
import { buildBaseSshArgs, buildLingerCommand, isLingerEnabled, type SshCommand } from "./checks.ts";
import { runSshCommand } from "./run-command.ts";
import { runStatusChecks } from "./status.ts";

// Deliberately not `exec claude` as the last line: if claude exits for any
// reason, `exec bash` keeps the pane (and therefore the tmux session, and
// therefore the whole persistent session) alive instead of vanishing.
export const START_CLAUDE_SCRIPT = `#!/bin/bash
source ~/.config/claude-code.env 2>/dev/null
cd ~
claude
echo "=== claude exited with code $? ==="
exec bash
`;

export const TOOLCHAIN_INSTALL_HINT = [
  "Install the missing piece by hand on the VPS, then retry:",
  "  nvm:    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && nvm install --lts",
  "  pnpm:   corepack enable",
  "  claude: pnpm add -g @anthropic-ai/claude-code && pnpm approve-builds --global @anthropic-ai/claude-code",
].join("\n");

export function buildEnableLingerCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `loginctl enable-linger ${config.user}`] };
}

export function buildWriteStartScriptCommand(config: VpsConfig): SshCommand {
  const remote = [
    "cat > ~/start-claude.sh <<'DIGISMITH_EOF'",
    START_CLAUDE_SCRIPT.trimEnd(),
    "DIGISMITH_EOF",
    "chmod +x ~/start-claude.sh",
  ].join("\n");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

// `$HOME` rather than `~` inside the double quotes: bash never tilde-expands
// inside double quotes, so a quoted `~/...` would reach tmux literally.
export function buildStartTmuxSessionCommand(config: VpsConfig): SshCommand {
  const remote = [
    `tmux new-session -d -s ${config.tmux_session} "$HOME/start-claude.sh"`,
    `tmux pipe-pane -o -t ${config.tmux_session} "cat >> $HOME/claude-session.log"`,
  ].join(" && ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildAttachArgs(config: VpsConfig): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    "-t", `${config.user}@${config.host}`,
    `tmux attach -t ${config.tmux_session}`,
  ];
}

export function runConnect(config: VpsConfig, configPath: string): never {
  const status = runStatusChecks(config, configPath);

  if (!status.sshReachable.ok) {
    console.error(`vps-session: SSH unreachable — ${status.sshReachable.detail}`);
    process.exit(1);
  }

  if (!status.lingerEnabled.ok) {
    console.log("vps-session: lingering not enabled, enabling now...");
    const fix = runSshCommand(buildEnableLingerCommand(config));
    if (fix.status !== 0) {
      console.error(`vps-session: could not enable lingering — ${fix.stderr.trim()}`);
      process.exit(1);
    }
    const recheck = runSshCommand(buildLingerCommand(config));
    if (!isLingerEnabled(recheck.stdout)) {
      console.error(
        `vps-session: enable-linger reported success but Linger is still not "yes" (got: ${recheck.stdout.trim() || "no output"})`
      );
      process.exit(1);
    }
  }

  if (!status.toolchainReady.ok) {
    console.error(`vps-session: toolchain not ready on the VPS (${status.toolchainReady.detail}).`);
    console.error(TOOLCHAIN_INSTALL_HINT);
    process.exit(1);
  }

  if (!status.tmuxAlive.ok) {
    console.log(`vps-session: tmux session "${config.tmux_session}" not found, creating it...`);
    const writeResult = runSshCommand(buildWriteStartScriptCommand(config));
    if (writeResult.status !== 0) {
      console.error(`vps-session: failed to write start-claude.sh — ${writeResult.stderr.trim()}`);
      process.exit(1);
    }
    const startResult = runSshCommand(buildStartTmuxSessionCommand(config));
    if (startResult.status !== 0) {
      console.error(`vps-session: failed to start the tmux session — ${startResult.stderr.trim()}`);
      process.exit(1);
    }
  }

  if (!status.credentialsPresent.ok) {
    console.log(
      "vps-session: warning — no ~/.claude/.credentials.json on the VPS yet; complete the interactive login once attached."
    );
  }

  console.log("vps-session: attaching...");
  // Node has no exec(2)-style process replacement; inheriting stdio and then
  // exiting with the child's own code is the closest equivalent to the
  // design's `exec ssh -t ...`.
  const attach = spawnSync("ssh", buildAttachArgs(config), { stdio: "inherit" });
  process.exit(attach.status ?? 1);
}
