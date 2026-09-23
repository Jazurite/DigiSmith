import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CommandModule } from "yargs";
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { buildBaseSshArgs, HERDR_PATH_PREFIX, type SshCommand } from "./checks.ts";
import { runSshCommand } from "./run-command.ts";
import { runStatusChecks } from "./status.ts";
import { loadConfigOrExit } from "./shared.ts";
import { resolveDigismithRepo } from "../shared/digismith-repo.ts";

const DEFAULT_MODEL = "tokenreply/kimi-k2.7";

export const TOOLCHAIN_INSTALL_HINT = [
  "Install the missing piece by hand on the VPS, then retry:",
  "  nvm:     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && nvm install --lts",
  "  pnpm:    corepack enable",
  "  opencode: pnpm add -g opencode-ai && pnpm approve-builds --global opencode-ai",
  "  herdr:   curl -fsSL https://herdr.dev/install.sh | sh",
].join("\n");

export function buildInstallHerdrIntegrationCommand(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr integration install opencode`],
  };
}

export function buildStartHerdrServerCommand(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; nohup herdr server > ~/herdr-server.log 2>&1 &`],
  };
}

export function buildCreateWorkspaceCommand(config: VpsConfig): SshCommand {
  const remote = [
    HERDR_PATH_PREFIX,
    `herdr workspace create --cwd "$HOME" --label ${config.workspace_label} --no-focus`,
  ].join("; ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildStartAgentCommand(config: VpsConfig): SshCommand {
  const remote = [
    HERDR_PATH_PREFIX,
    `herdr agent start ${config.agent_name} --kind opencode --pane \${PANE_ID} -- --model ${DEFAULT_MODEL}`,
  ].join("; ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildAttachArgs(config: VpsConfig): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    "-t", `${config.user}@${config.host}`,
    `herdr agent attach ${config.agent_name}`,
  ];
}

export function buildScpArgs(config: VpsConfig, localPath: string, remotePath: string): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    localPath,
    `${config.user}@${config.host}:${remotePath}`,
  ];
}

export function buildPrintConfigCommand(repoPath: string): string[] {
  return [
    path.join(repoPath, "scripts", "providers", "print-config.ts"),
    "tokenreply",
    "--role", "task",
    "--runner", "opencode",
  ];
}

function scpToVps(config: VpsConfig, content: string, remotePath: string, label: string): void {
  const tmpFile = path.join(os.tmpdir(), `digismith-vps-${label}-${Date.now()}`);
  fs.writeFileSync(tmpFile, content);
  try {
    const result = spawnSync("scp", buildScpArgs(config, tmpFile, remotePath), { stdio: "pipe", encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`failed to copy ${label} to the VPS — ${(result.stderr ?? "").trim() || "scp failed"}`);
    }
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function findLocalTokenReplyKey(): string | null {
  const envPath = path.join(os.homedir(), ".digismith-depot", ".env");
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("TOKENREPLY_API_KEY="));
  if (!line) return null;
  return line.slice("TOKENREPLY_API_KEY=".length).trim();
}

export function runConnect(config: VpsConfig, configPath: string): never {
  const status = runStatusChecks(config, configPath);

  if (!status.sshReachable.ok) {
    console.error(`vps-session: SSH unreachable — ${status.sshReachable.detail}`);
    process.exit(1);
  }

  if (!status.herdrInstalled.ok) {
    console.error("vps-session: herdr is not installed on the VPS.");
    console.error(TOOLCHAIN_INSTALL_HINT);
    process.exit(1);
  }

  if (!status.toolchainReady.ok) {
    console.error(`vps-session: toolchain not ready on the VPS (${status.toolchainReady.detail}).`);
    console.error(TOOLCHAIN_INSTALL_HINT);
    process.exit(1);
  }

  if (!status.herdrServerRunning.ok) {
    console.log("vps-session: herdr server not running, starting it...");
    const start = runSshCommand(buildStartHerdrServerCommand(config));
    if (start.status !== 0) {
      console.error(`vps-session: failed to start herdr server — ${start.stderr.trim()}`);
      process.exit(1);
    }
  }

  if (!status.credentialsPresent.ok) {
    console.log("vps-session: TokenReply credential missing on the VPS, copying from local machine...");
    const key = findLocalTokenReplyKey();
    if (!key) {
      console.error(
        "vps-session: no TOKENREPLY_API_KEY found in ~/.digismith-depot/.env locally either — nothing to copy."
      );
      process.exit(1);
    }
    try {
      scpToVps(config, `export TOKENREPLY_API_KEY=${key}\n`, "~/.config/tokenreply.env", "tokenreply-env");
    } catch (err) {
      console.error(`vps-session: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // opencode.json is regenerated unconditionally — status has no way to
  // detect "malformed," and print-config.ts is cheap/pure, so there's no
  // real gain from trying to detect "already correct" first. Reuses
  // DigiSmith's own scripts/providers/print-config.ts as-is, per the
  // design's explicit "no new integration code" call — never reimplement
  // its provider-block logic here.
  let repoPath: string;
  try {
    repoPath = resolveDigismithRepo(undefined);
  } catch (err) {
    console.error(`vps-session: can't generate opencode.json — ${(err as Error).message}`);
    console.error("vps-session: run this from inside a DigiSmith checkout, or pass --repo <path>.");
    process.exit(1);
  }
  const printConfig = spawnSync("node", buildPrintConfigCommand(repoPath), { stdio: "pipe", encoding: "utf-8" });
  if (printConfig.status !== 0) {
    console.error(`vps-session: print-config.ts failed — ${(printConfig.stderr ?? "").trim()}`);
    process.exit(1);
  }
  try {
    scpToVps(config, printConfig.stdout, "~/.config/opencode/opencode.json", "opencode-config");
  } catch (err) {
    console.error(`vps-session: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!status.agentAlive.ok) {
    console.log(`vps-session: workspace/agent "${config.agent_name}" not found, creating it...`);
    const create = runSshCommand(buildCreateWorkspaceCommand(config));
    if (create.status !== 0) {
      console.error(`vps-session: failed to create the herdr workspace — ${create.stderr.trim()}`);
      process.exit(1);
    }
    // Idempotent — writes the plugin file if absent, no-ops otherwise.
    runSshCommand(buildInstallHerdrIntegrationCommand(config));
    let paneId: string | null = null;
    try {
      const parsed = JSON.parse(create.stdout) as { result?: { root_pane?: { pane_id?: string } } };
      paneId = parsed.result?.root_pane?.pane_id ?? null;
    } catch {
      paneId = null;
    }
    if (!paneId) {
      console.error(`vps-session: could not parse a pane_id from workspace creation output:\n${create.stdout}`);
      process.exit(1);
    }
    const startAgentCmd = buildStartAgentCommand(config);
    startAgentCmd.args[startAgentCmd.args.length - 1] = startAgentCmd.args[startAgentCmd.args.length - 1].replace(
      "${PANE_ID}",
      paneId
    );
    const startAgent = runSshCommand(startAgentCmd);
    if (startAgent.status !== 0) {
      console.error(`vps-session: failed to start the OpenCode agent — ${startAgent.stderr.trim()}`);
      process.exit(1);
    }
  }

  console.log("vps-session: attaching...");
  // Node has no exec(2)-style process replacement; inheriting stdio and then
  // exiting with the child's own code is the closest equivalent to the
  // design's `exec ssh -t ...`.
  const attach = spawnSync("ssh", buildAttachArgs(config), { stdio: "inherit" });
  process.exit(attach.status ?? 1);
}

export const connectCommand: CommandModule = {
  command: "connect",
  describe: "fix what's safely fixable, then attach interactively",
  builder: (y) => y,
  handler: () => {
    const config = loadConfigOrExit();
    runConnect(config, DEFAULT_VPS_CONFIG_PATH);
  },
};
