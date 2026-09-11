import type { VpsConfig } from "./config.ts";

export interface SshCommand {
  command: string;
  args: string[];
}

const SSH_CONNECT_FLAGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];

export function buildBaseSshArgs(config: VpsConfig): string[] {
  return [...SSH_CONNECT_FLAGS, "-i", config.identity_file, `${config.user}@${config.host}`];
}

export function buildReachabilityCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "true"] };
}

export function buildLingerCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `loginctl show-user ${config.user} -p Linger`] };
}

// A plain `ssh host "claude --version"` sees no claude on PATH: a
// non-interactive, non-login shell never sources ~/.bashrc, so nvm/pnpm's
// PATH additions are invisible unless sourced explicitly here.
const TOOLCHAIN_REMOTE_SCRIPT = [
  'export NVM_DIR="$HOME/.nvm"',
  'if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; else echo "MISSING:nvm"; exit 1; fi',
  'export PNPM_HOME="$HOME/.local/share/pnpm"',
  'export PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"',
  'command -v node >/dev/null 2>&1 || { echo "MISSING:node"; exit 1; }',
  'command -v pnpm >/dev/null 2>&1 || { echo "MISSING:pnpm"; exit 1; }',
  'command -v claude >/dev/null 2>&1 || { echo "MISSING:claude"; exit 1; }',
  "claude --version",
].join("; ");

export function buildToolchainCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), TOOLCHAIN_REMOTE_SCRIPT] };
}

export function buildTmuxListCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "tmux list-sessions"] };
}

export function buildCredentialsCheckCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "test -f ~/.claude/.credentials.json"] };
}

export function buildPaneCommandQuery(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [
      ...buildBaseSshArgs(config),
      `tmux list-panes -t ${config.tmux_session} -F "#{pane_current_command}"`,
    ],
  };
}

export function isLingerEnabled(stdout: string): boolean {
  return stdout.trim() === "Linger=yes";
}

export interface ToolchainCheckResult {
  ready: boolean;
  missing?: string;
  version?: string;
}

export function parseToolchainOutput(exitCode: number, stdout: string): ToolchainCheckResult {
  const trimmed = stdout.trim();
  if (exitCode !== 0) {
    const match = trimmed.match(/^MISSING:(\w+)/m);
    return { ready: false, missing: match ? match[1] : "unknown" };
  }
  return { ready: true, version: trimmed };
}

export function isTmuxSessionAlive(stdout: string, sessionName: string): boolean {
  return stdout.split("\n").some((line) => line.trim().startsWith(`${sessionName}:`));
}

export function isClaudeProcessRunning(paneCommandOutput: string): boolean {
  return paneCommandOutput
    .trim()
    .split("\n")
    .some((line) => line.trim() === "claude");
}
