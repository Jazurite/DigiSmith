import type { VpsConfig } from "./config.ts";

export interface SshCommand {
  command: string;
  args: string[];
}

const SSH_CONNECT_FLAGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "IdentitiesOnly=yes"];

export function buildBaseSshArgs(config: VpsConfig): string[] {
  return [...SSH_CONNECT_FLAGS, "-i", config.identity_file, `${config.user}@${config.host}`];
}

export function buildReachabilityCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "true"] };
}

// herdr's own Unix installer does not add ~/.local/bin to ~/.bashrc, and a
// non-interactive SSH shell doesn't source ~/.bashrc regardless — every
// herdr-related remote command must export this itself.
export const HERDR_PATH_PREFIX = 'export PATH="$HOME/.local/bin:$PATH"';

export function buildHerdrVersionCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr --version`] };
}

export function buildHerdrServerCheckCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr agent list`] };
}

// A plain `ssh host "opencode --version"` sees no opencode on PATH: a
// non-interactive, non-login shell never sources ~/.bashrc, so nvm/pnpm's
// PATH additions are invisible unless sourced explicitly here.
const TOOLCHAIN_REMOTE_SCRIPT = [
  'export NVM_DIR="$HOME/.nvm"',
  'if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; else echo "MISSING:nvm"; exit 1; fi',
  'nvm use default >/dev/null 2>&1 || { echo "MISSING:node"; exit 1; }',
  'export PNPM_HOME="$HOME/.local/share/pnpm"',
  'export PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"',
  'command -v node >/dev/null 2>&1 || { echo "MISSING:node"; exit 1; }',
  'command -v pnpm >/dev/null 2>&1 || { echo "MISSING:pnpm"; exit 1; }',
  'command -v opencode >/dev/null 2>&1 || { echo "MISSING:opencode"; exit 1; }',
  "opencode --version",
].join("; ");

export function buildToolchainCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), TOOLCHAIN_REMOTE_SCRIPT] };
}

export function buildAgentGetCommand(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr agent get ${config.agent_name}`],
  };
}

export function buildCredentialsCheckCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "test -f ~/.config/tokenreply.env"] };
}

export function buildWorkspaceListCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr workspace list`] };
}

export function buildPaneListCommand(config: VpsConfig, workspaceId: string): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr pane list --workspace ${workspaceId}`],
  };
}

export function isHerdrInstalled(exitCode: number): boolean {
  return exitCode === 0;
}

export function isHerdrServerRunning(exitCode: number): boolean {
  return exitCode === 0;
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

export interface AgentGetResult {
  alive: boolean;
  agentStatus?: string;
  detail: string;
}

interface HerdrAgentGetResponse {
  result?: { agent?: { agent_status?: unknown } };
}

export function parseAgentGetOutput(exitCode: number, stdout: string): AgentGetResult {
  const trimmed = stdout.trim();
  if (exitCode !== 0) {
    return { alive: false, detail: trimmed };
  }
  let parsed: HerdrAgentGetResponse;
  try {
    parsed = JSON.parse(trimmed) as HerdrAgentGetResponse;
  } catch {
    return { alive: false, detail: trimmed };
  }
  const status = parsed.result?.agent?.agent_status;
  if (typeof status !== "string") {
    return { alive: false, detail: trimmed };
  }
  return { alive: true, agentStatus: status, detail: status };
}

export interface WorkspaceInfo {
  workspaceId: string;
  label: string;
}

interface HerdrWorkspaceListResponse {
  result?: { workspaces?: Array<{ workspace_id?: unknown; label?: unknown }> };
}

// Soft-fail by design: any exit-code or parse failure reads as "no reusable
// candidates," never as a reason to abort connect — this is a leak-reduction
// optimization on top of an already-working recovery path, not a
// correctness requirement.
export function parseWorkspaceListOutput(exitCode: number, stdout: string): WorkspaceInfo[] {
  if (exitCode !== 0) return [];
  let parsed: HerdrWorkspaceListResponse;
  try {
    parsed = JSON.parse(stdout) as HerdrWorkspaceListResponse;
  } catch {
    return [];
  }
  const workspaces = parsed?.result?.workspaces;
  if (!Array.isArray(workspaces)) return [];
  const result: WorkspaceInfo[] = [];
  for (const w of workspaces) {
    if (typeof w !== "object" || w === null) continue;
    if (typeof w.workspace_id === "string" && typeof w.label === "string") {
      result.push({ workspaceId: w.workspace_id, label: w.label });
    }
  }
  return result;
}

interface HerdrPaneListResponse {
  result?: { panes?: Array<{ pane_id?: unknown }> };
}

export function parsePaneListOutput(exitCode: number, stdout: string): string[] {
  if (exitCode !== 0) return [];
  let parsed: HerdrPaneListResponse;
  try {
    parsed = JSON.parse(stdout) as HerdrPaneListResponse;
  } catch {
    return [];
  }
  const panes = parsed?.result?.panes;
  if (!Array.isArray(panes)) return [];
  const result: string[] = [];
  for (const p of panes) {
    if (typeof p !== "object" || p === null) continue;
    if (typeof p.pane_id === "string") result.push(p.pane_id);
  }
  return result;
}

interface HerdrErrorResponse {
  error?: { code?: unknown };
}

export function isAgentPaneBusyError(exitCode: number, stdout: string): boolean {
  if (exitCode === 0) return false;
  let parsed: HerdrErrorResponse;
  try {
    parsed = JSON.parse(stdout) as HerdrErrorResponse;
  } catch {
    return false;
  }
  return parsed?.error?.code === "agent_pane_busy";
}
