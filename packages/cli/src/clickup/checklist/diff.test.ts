import { describe, it, expect } from "vitest";
import { diffChecklist, flattenItems, type CurrentItem } from "./diff.ts";
import { wantedItems } from "./want.ts";

const plan = [{ n: 1, name: "Task 1: One" }];
const none = { keys: new Set<string>(), noneNeeded: new Set<string>() };
const item = (id: string, name: string, parent: string | null = null, resolved = false): CurrentItem => ({ id, name, resolved, parent });
/** The checklist that matches wantedItems(plan, none) exactly. */
const full = () => [
  item("t1", "Task 1: One"),
  item("c1", "Implement", "t1"),
  item("c2", "Review", "t1"),
  item("c3", "Fix", "t1"),
  item("fr", "Whole-branch review"),
  item("ff", "Whole-branch fixes"),
];

describe("flattenItems", () => {
  it("reads flat items with parent and nested children objects, each id once", () => {
    const raw = [
      { id: "t1", name: "Task 1: One", orderindex: 0, resolved: false, parent: null, children: [{ id: "c1", name: "Implement", orderindex: 0, resolved: true, children: [] }] },
      { id: "c1", name: "Implement", orderindex: 1, resolved: true, parent: "t1", children: [] },
      { id: "c2", name: "Review", orderindex: 2, resolved: false, parent: "t1" },
    ];
    expect(flattenItems(raw)).toEqual([
      { id: "t1", name: "Task 1: One", resolved: false, parent: null },
      { id: "c1", name: "Implement", resolved: true, parent: "t1" },
      { id: "c2", name: "Review", resolved: false, parent: "t1" },
    ]);
  });
  it("ignores children given as plain id strings", () => {
    expect(flattenItems([{ id: "t1", name: "x", orderindex: 0, resolved: false, children: ["c9"] }])).toEqual([{ id: "t1", name: "x", resolved: false, parent: null }]);
  });
});

describe("diffChecklist", () => {
  it("an empty checklist gets every wanted item added, children with their parent key", () => {
    const d = diffChecklist([], wantedItems(plan, none));
    expect(d.ops.map((o) => (o.kind === "add" ? `${o.key}<${o.parentKey ?? ""}` : o.kind))).toEqual([
      "1<", "1.implement<1", "1.review<1", "1.fix<1", "final.review<", "final.fix<",
    ]);
    expect(d.counts).toEqual({ add: 6, rename: 0, remove: 0, tick: 0, untick: 0 });
  });

  it("a matching checklist needs no op and maps every key", () => {
    const d = diffChecklist(full(), wantedItems(plan, none));
    expect(d.ops).toEqual([]);
    expect(d.matched.get("1.fix")).toBe("c3");
  });

  it("matching survives a rename to Fix (none needed) and back", () => {
    const cur = full();
    cur[3] = item("c3", "Fix (none needed)", "t1", true);
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([{ kind: "edit", id: "c3", key: "1.fix", name: "Fix", resolved: false }]);
    expect(d.counts).toMatchObject({ rename: 1, untick: 1 });
  });

  it("ticks children and the task item from the done state", () => {
    const want = wantedItems(plan, { keys: new Set(["1.implement", "1.review", "1.fix"]), noneNeeded: new Set(["1.fix"]) });
    const d = diffChecklist(full(), want);
    expect(d.ops).toEqual([
      { kind: "edit", id: "t1", key: "1", resolved: true },
      { kind: "edit", id: "c1", key: "1.implement", resolved: true },
      { kind: "edit", id: "c2", key: "1.review", resolved: true },
      { kind: "edit", id: "c3", key: "1.fix", name: "Fix (none needed)", resolved: true },
    ]);
    expect(d.counts).toEqual({ add: 0, rename: 1, remove: 0, tick: 4, untick: 0 });
  });

  it("removes a dropped task with its known children first, and duplicates", () => {
    const cur = [
      ...full(),
      item("t2", "Task 2: Dropped"),
      item("d1", "Implement", "t2"),
      item("dx", "Ask Jack", "t2"),
      item("t1b", "Task 1: Again"),
      item("c1b", "Implement", "t1"),
    ];
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([
      { kind: "remove", id: "d1", name: "Implement" },
      { kind: "remove", id: "c1b", name: "Implement" },
      { kind: "remove", id: "t2", name: "Task 2: Dropped" },
      { kind: "remove", id: "t1b", name: "Task 1: Again" },
    ]);
    expect(d.foreign).toBe(1);
  });

  it("leaves foreign items alone: other names, unknown children, a top-level Implement", () => {
    const cur = [...full(), item("x", "Buy milk"), item("y", "Notes", "t1"), item("z", "Implement")];
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([]);
    expect(d.foreign).toBe(3);
  });

  it("adds a missing child under the existing task item", () => {
    const cur = full().filter((i) => i.id !== "c2");
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([{ kind: "add", key: "1.review", name: "Review", resolved: false, parentKey: "1" }]);
  });
});
