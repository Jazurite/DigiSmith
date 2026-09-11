import { describe, it, expect } from "vitest";
import { formatStatusReport, isFullyHealthy, type StatusReport } from "./status.ts";

function healthyReport(): StatusReport {
  return {
    configPath: "/home/jack/.digismith-depot/vps.json",
    sshReachable: { ok: true, detail: "" },
    lingerEnabled: { ok: true, detail: "Linger=yes" },
    toolchainReady: { ok: true, detail: "2.1.0 (Claude Code)" },
    tmuxAlive: { ok: true, detail: "session found" },
    claudeRunning: { ok: true, detail: "claude" },
    credentialsPresent: { ok: true, detail: "present" },
  };
}

describe("formatStatusReport", () => {
  it("marks every check OK when all are healthy", () => {
    const text = formatStatusReport(healthyReport());
    expect(text).toContain("[OK] SSH reachable");
    expect(text).toContain("[OK] Lingering enabled — Linger=yes");
    expect(text).toContain("[OK] Toolchain on PATH — 2.1.0 (Claude Code)");
    expect(text).toContain("[OK] tmux session alive — session found");
    expect(text).toContain("[OK] Claude process running — claude");
    expect(text).toContain("[OK] Credentials persisted — present");
  });

  it("marks a failing check as FAIL with its detail", () => {
    const report = healthyReport();
    report.tmuxAlive = { ok: false, detail: "no session named claude-main" };
    const text = formatStatusReport(report);
    expect(text).toContain("[FAIL] tmux session alive — no session named claude-main");
  });

  it("reports an alive session whose claude process has died as a distinct state", () => {
    const report = healthyReport();
    report.claudeRunning = { ok: false, detail: "pane is running bash (claude exited)" };
    const text = formatStatusReport(report);
    expect(text).toContain("[OK] tmux session alive — session found");
    expect(text).toContain("[FAIL] Claude process running — pane is running bash (claude exited)");
  });

  it("omits the detail separator when a check has no detail", () => {
    const text = formatStatusReport(healthyReport());
    expect(text).toContain("[OK] SSH reachable\n");
    expect(text).not.toContain("[OK] SSH reachable —");
  });
});

describe("isFullyHealthy", () => {
  it("is true when every check passes", () => {
    expect(isFullyHealthy(healthyReport())).toBe(true);
  });

  it("is false when any single check fails", () => {
    const report = healthyReport();
    report.credentialsPresent = { ok: false, detail: "missing" };
    expect(isFullyHealthy(report)).toBe(false);
  });

  it("is false when tmux is alive but claude itself is not running", () => {
    const report = healthyReport();
    report.claudeRunning = { ok: false, detail: "pane is running bash (claude exited)" };
    expect(isFullyHealthy(report)).toBe(false);
  });
});
