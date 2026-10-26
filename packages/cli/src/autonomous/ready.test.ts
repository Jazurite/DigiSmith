import { describe, it, expect } from "vitest";
import { checkReady, REASON, TYPE_TASK, TYPE_BUG } from "./ready.ts";
import type { LoTask } from "./types.ts";

const base: LoTask = {
  id: "1", key: "DGS-1", name: "t", typeId: 0, priority: null, due: null, created: 0,
  attachments: ["design.html", "plan.md"], text: "", signOff: "Auto", mode: "Autonomous", scheduledAt: null, milestone: "Dawn", inProjects: false, blockers: [],
};
const ctx = { repo: "/r", fileExists: () => false };

describe("checkReady", () => {
  it("pins the type ids", () => {
    expect([TYPE_TASK, TYPE_BUG]).toEqual([0, 1022]);
  });
  it("passes a complete ticket", () => {
    expect(checkReady(base, ctx)).toEqual([]);
  });
  it("each check fails alone", () => {
    expect(checkReady({ ...base, attachments: [] }, ctx)).toEqual([REASON.specPlan]);
    expect(checkReady({ ...base, blockers: [{ key: "DGS-2", done: false }] }, ctx)).toEqual([REASON.blocked(["DGS-2"])]);
  });
  it("a Projects ticket without a milestone passes (as does a clan ticket)", () => {
    expect(checkReady({ ...base, milestone: null, inProjects: true }, ctx)).toEqual([]);
  });
  it("lists spec and plan, then blockers, in order", () => {
    const t = { ...base, attachments: [], blockers: [{ key: "DGS-2", done: false }, { key: "DGS-3", done: false }] };
    expect(checkReady(t, ctx)).toEqual([REASON.specPlan, "blocked by open ticket(s): DGS-2, DGS-3"]);
  });
  it("an empty Sign-off passes", () => {
    expect(checkReady({ ...base, signOff: null }, ctx)).toEqual([]);
  });
  it("no milestone passes", () => {
    expect(checkReady({ ...base, milestone: null }, ctx)).toEqual([]);
  });
  it("an explicit Sign-off Jack passes (the run stops at acceptance)", () => {
    expect(checkReady({ ...base, signOff: "Jack" }, ctx)).toEqual([]);
  });
  it("Mode Manual fails with the Mode reason only", () => {
    expect(checkReady({ ...base, mode: "Manual" }, ctx)).toEqual([REASON.mode]);
  });
  it("an empty Mode passes (Autonomous)", () => {
    expect(checkReady({ ...base, mode: null }, ctx)).toEqual([]);
  });
  it("lists all three in order", () => {
    const t = { ...base, attachments: [], text: "", blockers: [{ key: "DGS-1", done: false }], mode: "Manual" as const };
    expect(checkReady(t, ctx)).toEqual([REASON.specPlan, REASON.blocked(["DGS-1"]), REASON.mode]);
  });
  it("pins the Mode reason text", () => {
    expect(REASON.mode).toBe("Mode is Manual");
  });
  it("attachments: plan alone fails, spec works", () => {
    expect(checkReady({ ...base, attachments: ["plan.md"] }, ctx)).toEqual([REASON.specPlan]);
    expect(checkReady({ ...base, attachments: ["Spec.md", "PLAN.md"] }, ctx)).toEqual([]);
  });
  it("board link passes only with plan and a design file", () => {
    const t = { ...base, attachments: [], text: "see .digismith/board/DGS-9—thing/ ok" };
    const dir = "/r/.digismith/board/DGS-9—thing/";
    expect(checkReady(t, { repo: "/r", fileExists: (p) => p === dir + "plan.md" })).toEqual([REASON.specPlan]);
    expect(checkReady(t, { repo: "/r", fileExists: (p) => p === dir + "design.md" })).toEqual([REASON.specPlan]);
    expect(checkReady(t, { repo: "/r", fileExists: (p) => p === dir + "plan.md" || p === dir + "spec.md" })).toEqual([]);
    expect(checkReady(t, { repo: "/r", fileExists: (p) => p === dir + "plan.md" || p === dir + "design.html" })).toEqual([]);
  });
  it("checks every board link", () => {
    const good = "/r/.digismith/board/DGS-2—good/";
    const fe = (p: string) => p === good + "plan.md" || p === good + "design.md";
    const two = { ...base, attachments: [], text: ".digismith/board/DGS-1—bad/ then .digismith/board/DGS-2—good/" };
    expect(checkReady(two, { repo: "/r", fileExists: fe })).toEqual([]);
    const bad = { ...base, attachments: [], text: ".digismith/board/DGS-1—bad/ and .digismith/board/DGS-3—bad/" };
    expect(checkReady(bad, { repo: "/r", fileExists: fe })).toEqual([REASON.specPlan]);
  });
  it("done blocker does not block", () => {
    expect(checkReady({ ...base, blockers: [{ key: "DGS-2", done: true }] }, ctx)).toEqual([]);
  });
});
