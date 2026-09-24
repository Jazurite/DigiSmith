import { describe, it, expect } from "vitest";
import { formatStatusReport, isFullyHealthy, type StatusReport } from "./status.ts";

function healthyReport(): StatusReport {
  return {
    configPath: "/home/jack/.digismith-depot/vps.json",
    sshReachable: { ok: true, detail: "" },
    herdrInstalled: { ok: true, detail: "0.9.1" },
    herdrServerRunning: { ok: true, detail: "" },
    toolchainReady: { ok: true, detail: "1.18.31" },
    agentAlive: { ok: true, detail: "idle" },
    openCodeRunning: { ok: true, detail: "idle" },
    credentialsPresent: { ok: true, detail: "present" },
  };
}

describe("formatStatusReport", () => {
  it("marks every check OK when all are healthy", () => {
    const text = formatStatusReport(healthyReport());
    expect(text).toContain("[OK] SSH reachable");
    expect(text).toContain("[OK] herdr installed — 0.9.1");
    expect(text).toContain("[OK] herdr server running");
    expect(text).toContain("[OK] Toolchain on PATH — 1.18.31");
    expect(text).toContain("[OK] Workspace/agent alive — idle");
    expect(text).toContain("[OK] OpenCode running — idle");
    expect(text).toContain("[OK] Credentials persisted — present");
    expect(text).not.toContain("Lingering");
  });

  it("marks a failing check as FAIL with its detail", () => {
    const report = healthyReport();
    report.agentAlive = { ok: false, detail: "no such agent" };
    const text = formatStatusReport(report);
    expect(text).toContain("[FAIL] Workspace/agent alive — no such agent");
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
});
