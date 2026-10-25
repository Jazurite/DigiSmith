import { describe, it, expect } from "vitest";
import { wantedItems, keysOutsidePlan } from "./want.ts";

const plan = [{ n: 1, name: "Task 1: One" }, { n: 2, name: "Task 2: Two" }];
const done = (keys: string[], none: string[] = []) => ({ keys: new Set(keys), noneNeeded: new Set(none) });

describe("wantedItems", () => {
  it("lays out tasks with three children, then the two whole-branch items", () => {
    expect(wantedItems(plan, done([]))).toEqual([
      { key: "1", name: "Task 1: One", resolved: false },
      { key: "1.implement", name: "Implement", resolved: false, parentKey: "1" },
      { key: "1.review", name: "Review", resolved: false, parentKey: "1" },
      { key: "1.fix", name: "Fix", resolved: false, parentKey: "1" },
      { key: "2", name: "Task 2: Two", resolved: false },
      { key: "2.implement", name: "Implement", resolved: false, parentKey: "2" },
      { key: "2.review", name: "Review", resolved: false, parentKey: "2" },
      { key: "2.fix", name: "Fix", resolved: false, parentKey: "2" },
      { key: "final.review", name: "Whole-branch review", resolved: false },
      { key: "final.fix", name: "Whole-branch fixes", resolved: false },
    ]);
  });

  it("ticks a task when its three children are done and names none-needed fixes", () => {
    const w = wantedItems(plan, done(["1.implement", "1.review", "1.fix", "2.implement", "final.review", "final.fix"], ["1.fix", "final.fix"]));
    const by = Object.fromEntries(w.map((i) => [i.key, i]));
    expect(by["1"].resolved).toBe(true);
    expect(by["1.fix"]).toEqual({ key: "1.fix", name: "Fix (none needed)", resolved: true, parentKey: "1" });
    expect(by["2"].resolved).toBe(false);
    expect(by["2.implement"].resolved).toBe(true);
    expect(by["final.fix"].name).toBe("Whole-branch fixes (none needed)");
  });

  it("key N alone ticks the task item", () => {
    expect(wantedItems(plan, done(["2"])).find((i) => i.key === "2")!.resolved).toBe(true);
  });
});

describe("keysOutsidePlan", () => {
  it("lists done keys whose task is not in the plan", () => {
    expect(keysOutsidePlan(plan, done(["1.fix", "3", "5.review", "final.fix"]))).toEqual(["3", "5.review"]);
  });
});
