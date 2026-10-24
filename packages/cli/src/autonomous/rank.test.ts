import { describe, it, expect } from "vitest";
import { rankTasks } from "./rank.ts";
import type { LoTask } from "./types.ts";

const task = (id: string, over: Partial<LoTask> = {}): LoTask => ({
  id, key: null, name: id, typeId: 0, priority: null, due: null, created: 0,
  attachments: [], text: "", signOff: null, mode: "Autonomous", scheduledAt: null, milestone: null, blockers: [], ...over,
});
const ids = (ts: LoTask[]) => ts.map((t) => t.id);

describe("rankTasks", () => {
  it("orders priority ascending with no priority last", () => {
    const out = rankTasks([task("none"), task("p3", { priority: 3 }), task("p2", { priority: 2 })]);
    expect(ids(out)).toEqual(["p2", "p3", "none"]);
  });
  it("breaks priority ties by earlier due first, no due last", () => {
    const out = rankTasks([
      task("nodue", { priority: 2 }),
      task("late", { priority: 2, due: 200 }),
      task("early", { priority: 2, due: 100 }),
    ]);
    expect(ids(out)).toEqual(["early", "late", "nodue"]);
  });
  it("breaks equal priority and due by older created first", () => {
    const out = rankTasks([task("new", { created: 20 }), task("old", { created: 10 })]);
    expect(ids(out)).toEqual(["old", "new"]);
  });
  it("breaks equal priority and equal due by older created first", () => {
    const out = rankTasks([
      task("newer", { priority: 2, due: 100, created: 30 }),
      task("older", { priority: 2, due: 100, created: 10 }),
    ]);
    expect(ids(out)).toEqual(["older", "newer"]);
  });
  it("falls through to due when both have no priority", () => {
    const out = rankTasks([task("nodueB", { created: 1 }), task("dueA", { due: 5, created: 9 }), task("dueB", { due: 7, created: 2 })]);
    expect(ids(out)).toEqual(["dueA", "dueB", "nodueB"]);
  });
  it("does not mutate the input array", () => {
    const input = [task("b", { priority: 3 }), task("a", { priority: 1 })];
    const before = ids(input);
    const out = rankTasks(input);
    expect(ids(input)).toEqual(before);
    expect(ids(out)).toEqual(["a", "b"]);
  });
});
