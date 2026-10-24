import { describe, it, expect } from "vitest";
import { checkReady, REASON, TYPE_TASK, TYPE_BUG } from "./ready.ts";
import type { LoTask } from "./types.ts";

const base: LoTask = {
  id: "1", key: "DGS-1", name: "t", typeId: 0, priority: null, due: null, created: 0,
  attachments: ["design.html", "plan.md"], text: "", signOff: "Auto", mode: "Autonomous", milestone: "Dawn", blockers: [],
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
    expect(checkReady({ ...base, signOff: null }, ctx)).toEqual([REASON.signOff]);
    expect(checkReady({ ...base, milestone: null }, ctx)).toEqual([REASON.milestone]);
    expect(checkReady({ ...base, blockers: [{ key: "DGS-2", done: false }] }, ctx)).toEqual([REASON.blocked(["DGS-2"])]);
  });
  it("lists all four in order", () => {
    const t = { ...base, attachments: [], signOff: null, milestone: null, blockers: [{ key: "DGS-2", done: false }, { key: "DGS-3", done: false }] };
    expect(checkReady(t, ctx)).toEqual([REASON.specPlan, REASON.signOff, REASON.milestone, "blocked by open ticket(s): DGS-2, DGS-3"]);
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
