import type { VpsConfig } from "./config.ts";
import {
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
import { runSshCommand } from "./run-command.ts";

export interface CheckOutcome {
  ok: boolean;
  detail: string;
}

export interface StatusReport {
  configPath: string;
  sshReachable: CheckOutcome;
  lingerEnabled: CheckOutcome;
  toolchainReady: CheckOutcome;
  tmuxAlive: CheckOutcome;
  claudeRunning: CheckOutcome;
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
    formatLine("Lingering enabled", report.lingerEnabled),
    formatLine("Toolchain on PATH", report.toolchainReady),
    formatLine("tmux session alive", report.tmuxAlive),
    formatLine("Claude process running", report.claudeRunning),
    formatLine("Credentials persisted", report.credentialsPresent),
  ].join("\n");
}

export function isFullyHealthy(report: StatusReport): boolean {
  return (
    report.sshReachable.ok &&
    report.lingerEnabled.ok &&
    report.toolchainReady.ok &&
    report.tmuxAlive.ok &&
    report.claudeRunning.ok &&
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
      lingerEnabled: skipped,
      toolchainReady: skipped,
      tmuxAlive: skipped,
      claudeRunning: skipped,
      credentialsPresent: skipped,
    };
  }

  const linger = runSshCommand(buildLingerCommand(config));
  const lingerOk = isLingerEnabled(linger.stdout);

  const toolchain = runSshCommand(buildToolchainCommand(config));
  const toolchainResult = parseToolchainOutput(toolchain.status, toolchain.stdout);

  const tmuxList = runSshCommand(buildTmuxListCommand(config));
  const tmuxOk = isTmuxSessionAlive(tmuxList.stdout, config.tmux_session);

  let claudeRunning: CheckOutcome;
  if (!tmuxOk) {
    claudeRunning = { ok: false, detail: "skipped — no tmux session" };
  } else {
    const pane = runSshCommand(buildPaneCommandQuery(config));
    const running = pane.status === 0 && isClaudeProcessRunning(pane.stdout);
    const panes = pane.stdout.trim().split("\n").map((s) => s.trim()).filter(Boolean).join(", ");
    claudeRunning = running
      ? { ok: true, detail: "claude" }
      : { ok: false, detail: `pane is running ${panes || "unknown"} (claude exited)` };
  }

  const creds = runSshCommand(buildCredentialsCheckCommand(config));

  return {
    configPath,
    sshReachable: { ok: true, detail: "" },
    lingerEnabled: { ok: lingerOk, detail: linger.stdout.trim() || linger.stderr.trim() },
    toolchainReady: {
      ok: toolchainResult.ready,
      detail: toolchainResult.ready ? toolchainResult.version ?? "" : `missing: ${toolchainResult.missing}`,
    },
    tmuxAlive: { ok: tmuxOk, detail: tmuxOk ? "session found" : `no session named ${config.tmux_session}` },
    claudeRunning,
    credentialsPresent: {
      ok: creds.status === 0,
      detail: creds.status === 0 ? "present" : "missing — one-time interactive login required",
    },
  };
}
