import { describe, it, expect } from "vitest";
import { orderPath, renderOrder } from "./order.ts";

const base = {
  key: "DGS-9", name: "Build the thing", taskId: "86abc", signOff: "Auto" as const,
  claimedAtUtc7: "2026-10-19 14:32", stamp: "2026-10-19-1432", specPlan: "spec.md and plan.md on the ticket",
};

describe("orderPath", () => {
  it("builds the file name", () => {
    expect(orderPath("/o", "2026-10-19-1432", "DGS-9")).toBe("/o/order-ao-2026-10-19-1432-DGS-9.md");
  });
});

describe("renderOrder", () => {
  it("has title, from line, ticket, mandate and release", () => {
    const t = renderOrder(base);
    expect(t).toContain("# Order ao-2026-10-19-1432: build DGS-9 (Autonomous Operation)");
    expect(t).toContain("From: dg autonomous scan, 2026-10-19 14:32 UTC+7");
    expect(t).toContain("Build the thing");
    expect(t).toContain("86abc");
    expect(t).toContain("Sign-off: Auto");
    expect(t).toContain("Spec and plan:");
    expect(t).toContain("spec.md and plan.md on the ticket");
    for (const w of ["sudo", "LaunchAgent", "delete", "Caddy", "Tailscale", "hooks 01-03", "report.html", "plan.md"]) expect(t).toContain(w);
    expect(t).toContain("dg autonomous release --ticket DGS-9 --result <merged|failed|stopped|awaiting-jack> [--reason \"...\"]");
    expect(t).not.toContain("Sign-off: Jack");
  });
  it("adds the awaiting-jack rule for Jack tickets", () => {
    const t = renderOrder({ ...base, signOff: "Jack" });
    expect(t).toContain("Sign-off: Jack");
    expect(t).toContain("--result awaiting-jack");
    expect(t).toContain("acceptance point");
  });
  it("states the full release command and who clears the lock", () => {
    for (const so of ["Auto", "Jack"] as const) {
      const t = renderOrder({ ...base, signOff: so });
      expect(t).toContain('dg autonomous release --ticket DGS-9 --result stopped --reason "<what is needed>"');
      expect(t).toContain("release clears the lock");
      expect(t).toContain("never remove lock.json by hand");
    }
    expect(renderOrder({ ...base, signOff: "Jack" })).toContain("dg autonomous release --ticket DGS-9 --result awaiting-jack");
  });
});
