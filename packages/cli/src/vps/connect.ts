import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CommandModule } from "yargs";
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { buildBaseSshArgs, buildHerdrServerCheckCommand, HERDR_PATH_PREFIX, type SshCommand } from "./checks.ts";
import { describeSshFailure, runSshCommand } from "./run-command.ts";
import { runStatusChecks } from "./status.ts";
import { loadConfigOrExit } from "./shared.ts";
import { resolveDigismithRepo } from "../shared/digismith-repo.ts";

const DEFAULT_MODEL = "tokenreply/kimi-k2.7";
const REMOTE_OPENCODE_CONFIG_PATH = "~/.config/opencode/opencode.json";

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
    ". ~/.config/tokenreply.env",
    `herdr workspace create --cwd "$HOME" --label ${config.workspace_label} --env "TOKENREPLY_API_KEY=$TOKENREPLY_API_KEY" --no-focus`,
  ].join("; ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildStartAgentCommand(config: VpsConfig, paneId: string): SshCommand {
  const remote = [
    HERDR_PATH_PREFIX,
    `herdr agent start ${config.agent_name} --kind opencode --pane ${paneId} -- --model ${DEFAULT_MODEL}`,
  ].join("; ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildAttachArgs(config: VpsConfig): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    "-t", `${config.user}@${config.host}`,
    `${HERDR_PATH_PREFIX}; herdr agent attach ${config.agent_name}`,
  ];
}

export function buildScpArgs(config: VpsConfig, localPath: string, remotePath: string): string[] {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "IdentitiesOnly=yes",
    "-i", config.identity_file,
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

export function hasValidTokenreplyProvider(config: Record<string, unknown>): boolean {
  const provider = config.provider;
  if (typeof provider !== "object" || provider === null) return false;
  const tokenreply = (provider as Record<string, unknown>).tokenreply;
  return typeof tokenreply === "object" && tokenreply !== null;
}

export function mergeOpencodeConfig(
  existingConfig: Record<string, unknown>,
  providerBlock: Record<string, unknown>
): Record<string, unknown> {
  const existingProvider =
    typeof existingConfig.provider === "object" && existingConfig.provider !== null
      ? (existingConfig.provider as Record<string, unknown>)
      : {};
  return {
    ...existingConfig,
    $schema: "https://opencode.ai/config.json",
    provider: { ...existingProvider, ...providerBlock },
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function scpToVps(config: VpsConfig, content: string, remotePath: string, label: string): void {
  const tmpFile = path.join(os.tmpdir(), `digismith-vps-${label}-${Date.now()}`);
  fs.writeFileSync(tmpFile, content, { mode: 0o600 });
  try {
    const result = spawnSync("scp", buildScpArgs(config, tmpFile, remotePath), {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 30_000,
    });
    if (result.status !== 0) {
      throw new Error(`failed to copy ${label} to the VPS — ${(result.stderr ?? "").trim() || "scp failed"}`);
    }
    const chmod = runSshCommand({ command: "ssh", args: [...buildBaseSshArgs(config), `chmod 600 ${remotePath}`] });
    if (chmod.status !== 0) {
      throw new Error(`copied ${label} but failed to restrict its permissions on the VPS — ${describeSshFailure(chmod)}`);
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

export function runConnect(config: VpsConfig, configPath: string, repoOverride?: string): never {
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
      console.error(`vps-session: failed to start herdr server — ${describeSshFailure(start)}`);
      process.exit(1);
    }
    // nohup-backgrounding exits 0 immediately whether or not the server
    // actually comes up, so only a successful check proves it started.
    let serverUp = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (runSshCommand(buildHerdrServerCheckCommand(config)).status === 0) {
        serverUp = true;
        break;
      }
      if (attempt < 4) sleepSync(1000);
    }
    if (!serverUp) {
      const log = runSshCommand({
        command: "ssh",
        args: [...buildBaseSshArgs(config), "tail -n 50 ~/herdr-server.log 2>&1"],
      });
      console.error("vps-session: herdr server did not come up after starting. Log:");
      console.error(log.stdout || log.stderr || "(no log output)");
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

  // The remote `|| echo '{}'` absorbs a missing file, so a non-zero status
  // here can only be ssh itself failing — treating that as "empty config"
  // would overwrite any other providers already configured on the VPS.
  const existingRead = runSshCommand({
    command: "ssh",
    args: [...buildBaseSshArgs(config), `cat ${REMOTE_OPENCODE_CONFIG_PATH} 2>/dev/null || echo '{}'`],
  });
  if (existingRead.status !== 0) {
    console.error(`vps-session: failed to read opencode.json from the VPS — ${describeSshFailure(existingRead)}`);
    process.exit(1);
  }
  const existingConfig = parseJsonObject(existingRead.stdout) ?? {};

  if (!hasValidTokenreplyProvider(existingConfig)) {
    console.log("vps-session: opencode.json has no tokenreply provider, regenerating it...");
    // Reuses DigiSmith's own print-config.ts as-is, per the design's "no new
    // integration code" call — never reimplement its provider-block logic here.
    let repoPath: string;
    try {
      repoPath = resolveDigismithRepo(repoOverride);
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
    const providerBlock = parseJsonObject(printConfig.stdout);
    if (!providerBlock) {
      console.error("vps-session: print-config.ts did not print a JSON provider block:");
      console.error(printConfig.stdout);
      process.exit(1);
    }
    const merged = mergeOpencodeConfig(existingConfig, providerBlock);
    try {
      scpToVps(config, JSON.stringify(merged, null, 2), REMOTE_OPENCODE_CONFIG_PATH, "opencode-config");
    } catch (err) {
      console.error(`vps-session: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  if (!status.agentAlive.ok) {
    console.log(`vps-session: workspace/agent "${config.agent_name}" not found, creating it...`);
    const create = runSshCommand(buildCreateWorkspaceCommand(config));
    if (create.status !== 0) {
      console.error(`vps-session: failed to create the herdr workspace — ${describeSshFailure(create)}`);
      process.exit(1);
    }
    // Idempotent — writes the plugin file if absent, no-ops otherwise.
    const integrationInstall = runSshCommand(buildInstallHerdrIntegrationCommand(config));
    if (integrationInstall.status !== 0) {
      console.error(
        `vps-session: warning — herdr integration install failed: ${describeSshFailure(integrationInstall)}`
      );
    }
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
    const startAgent = runSshCommand(buildStartAgentCommand(config, paneId));
    if (startAgent.status !== 0) {
      console.error(`vps-session: failed to start the OpenCode agent — ${describeSshFailure(startAgent)}`);
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
  builder: (y) =>
    y.option("repo", {
      type: "string",
      requiresArg: true,
      describe: "path to a DigiSmith checkout (only needed to regenerate opencode.json)",
    }),
  handler: (argv) => {
    const config = loadConfigOrExit();
    runConnect(config, DEFAULT_VPS_CONFIG_PATH, argv.repo as string | undefined);
  },
};
