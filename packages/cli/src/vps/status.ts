import type { CommandModule } from "yargs";
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { loadConfigOrExit } from "./shared.ts";
import {
  buildReachabilityCommand,
  buildHerdrVersionCommand,
  buildHerdrServerCheckCommand,
  buildToolchainCommand,
  buildAgentGetCommand,
  buildCredentialsCheckCommand,
  isHerdrInstalled,
  isHerdrServerRunning,
  parseToolchainOutput,
  parseAgentGetOutput,
} from "./checks.ts";
import { runSshCommand } from "./run-command.ts";

export interface CheckOutcome {
  ok: boolean;
  detail: string;
}

export interface StatusReport {
  configPath: string;
  sshReachable: CheckOutcome;
  herdrInstalled: CheckOutcome;
  herdrServerRunning: CheckOutcome;
  toolchainReady: CheckOutcome;
  agentAlive: CheckOutcome;
  openCodeRunning: CheckOutcome;
  credentialsPresent: CheckOutcome;
}

function formatLine(label: string, outcome: CheckOutcome): string {
  const mark = outcome.ok ? "OK" : "FAIL";
  return `[${mark}] ${label}${outcome.detail ? ` — ${outcome.detail}` : ""}`;
}

export function formatStatusReport(report: StatusReport): string {
  return [
    `VPS config: ${report.configPath}`,
    formatLine("SSH reachable", report.sshReachable),
    formatLine("herdr installed", report.herdrInstalled),
    formatLine("herdr server running", report.herdrServerRunning),
    formatLine("Toolchain on PATH", report.toolchainReady),
    formatLine("Workspace/agent alive", report.agentAlive),
    formatLine("OpenCode running", report.openCodeRunning),
    formatLine("Credentials persisted", report.credentialsPresent),
  ].join("\n");
}

export function isFullyHealthy(report: StatusReport): boolean {
  return (
    report.sshReachable.ok &&
    report.herdrInstalled.ok &&
    report.herdrServerRunning.ok &&
    report.toolchainReady.ok &&
    report.agentAlive.ok &&
    report.openCodeRunning.ok &&
    report.credentialsPresent.ok
  );
}

export function runStatusChecks(config: VpsConfig, configPath: string): StatusReport {
  const reach = runSshCommand(buildReachabilityCommand(config));
  if (reach.status !== 0) {
    const skipped: CheckOutcome = { ok: false, detail: "skipped — SSH unreachable" };
    return {
      configPath,
      sshReachable: { ok: false, detail: reach.stderr.trim() || "connection failed" },
      herdrInstalled: skipped,
      herdrServerRunning: skipped,
      toolchainReady: skipped,
      agentAlive: skipped,
      openCodeRunning: skipped,
      credentialsPresent: skipped,
    };
  }

  const herdrVersion = runSshCommand(buildHerdrVersionCommand(config));
  const herdrInstalledOk = isHerdrInstalled(herdrVersion.status);

  const skippedNoHerdr: CheckOutcome = { ok: false, detail: "skipped — herdr not installed" };
  const herdrServerRunning = herdrInstalledOk
    ? (() => {
        const check = runSshCommand(buildHerdrServerCheckCommand(config));
        return { ok: isHerdrServerRunning(check.status), detail: check.status === 0 ? "" : check.stderr.trim() };
      })()
    : skippedNoHerdr;

  const toolchain = runSshCommand(buildToolchainCommand(config));
  const toolchainResult = parseToolchainOutput(toolchain.status, toolchain.stdout);

  let agentAlive: CheckOutcome;
  let openCodeRunning: CheckOutcome;
  if (!herdrServerRunning.ok) {
    agentAlive = { ok: false, detail: "skipped — herdr server not running" };
    openCodeRunning = { ok: false, detail: "skipped — herdr server not running" };
  } else {
    const agentGet = runSshCommand(buildAgentGetCommand(config));
    const parsed = parseAgentGetOutput(agentGet.status, agentGet.stdout);
    agentAlive = { ok: parsed.alive, detail: parsed.detail };
    openCodeRunning = { ok: parsed.alive, detail: parsed.detail };
  }

  const creds = runSshCommand(buildCredentialsCheckCommand(config));

  return {
    configPath,
    sshReachable: { ok: true, detail: "" },
    herdrInstalled: { ok: herdrInstalledOk, detail: herdrInstalledOk ? herdrVersion.stdout.trim() : "not found" },
    herdrServerRunning,
    toolchainReady: {
      ok: toolchainResult.ready,
      detail: toolchainResult.ready ? toolchainResult.version ?? "" : `missing: ${toolchainResult.missing}`,
    },
    agentAlive,
    openCodeRunning,
    credentialsPresent: {
      ok: creds.status === 0,
      detail: creds.status === 0 ? "present" : "missing",
    },
  };
}

export const statusCommand: CommandModule = {
  command: "status",
  describe: "read-only health report of the VPS OpenCode session",
  handler: () => {
    const config = loadConfigOrExit();
    const report = runStatusChecks(config, DEFAULT_VPS_CONFIG_PATH);
    console.log(formatStatusReport(report));
    process.exitCode = isFullyHealthy(report) ? 0 : 1;
  },
};
