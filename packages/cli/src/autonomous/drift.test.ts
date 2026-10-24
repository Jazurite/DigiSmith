import { describe, expect, it } from "vitest";
import { driftLines, gatherDrift, type DriftFacts } from "./drift.ts";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import type { Git } from "./gitx.ts";

const f = (o: Partial<DriftFacts>): DriftFacts => ({ status: "in progress", mergedSha: null, branchEmpty: false, gitOk: true, ...o });
const one = (o: Partial<DriftFacts>) => driftLines([{ ticket: "DGS-1", taskId: "t1" }], new Map([["DGS-1", f(o)]]));

describe("driftLines", () => {
  it("unreadable status", () => expect(one({ status: null })).toEqual(["DGS-1: status unreadable"]));
  it("done in ClickUp, nothing on main", () => {
    for (const s of ["complete", "Done", "CLOSED"]) expect(one({ status: s })).toEqual(["DGS-1: done in ClickUp, nothing on main"]);
  });
  it("not done but merged", () => expect(one({ mergedSha: "abc1234" })).toEqual(["DGS-1: in progress in ClickUp, merged on main (abc1234)"]));
  it("empty branch adds its own line", () => {
    expect(one({ branchEmpty: true })).toEqual(["DGS-1: branch has no commits"]);
    expect(one({ status: "complete", branchEmpty: true })).toEqual(["DGS-1: done in ClickUp, nothing on main", "DGS-1: branch has no commits"]);
  });
  it("no drift", () => {
    expect(one({})).toEqual([]);
    expect(one({ status: "complete", mergedSha: "abc1234" })).toEqual([]);
  });
  it("git unreadable shows its own line and skips the git rules", () => {
    expect(one({ gitOk: false })).toEqual(["DGS-1: git facts unreadable"]);
    expect(one({ gitOk: false, status: "complete" })).toEqual(["DGS-1: git facts unreadable"]);
    expect(one({ gitOk: false, status: null })).toEqual(["DGS-1: status unreadable", "DGS-1: git facts unreadable"]);
  });
  it("a ticket without facts is skipped", () => expect(driftLines([{ ticket: "DGS-1", taskId: "t1" }], new Map())).toEqual([]));
});

const fakeGit = (log: string, branches: Record<string, string> = {}, count = "3\n"): Git => (_cwd, args) => {
  if (args[0] === "log") return log;
  if (args[0] === "branch") {
    const pat = args.find((a) => a.includes("__*")) ?? "";
    const key = pat.replace("__*", "").replace("origin/", "");
    return branches[key] ?? "";
  }
  if (args[0] === "rev-list") return count;
  throw new Error(`unexpected git ${args.join(" ")}`);
};

describe("gatherDrift", () => {
  const claimed = [{ ticket: "DGS-1", taskId: "t1" }, { ticket: "DGS-2", taskId: "t2" }];
  it("reads the status and the main log", async () => {
    const tracker = new FakeTracker();
    tracker.add({ id: "t1", status: "complete" });
    tracker.add({ id: "t2", status: "to do" });
    const git = fakeGit("abc1234\tfeat(dgs-2): thing\n");
    const facts = await gatherDrift({ tracker, git, repo: "/r" }, claimed);
    expect(facts.get("DGS-1")).toEqual({ status: "complete", mergedSha: null, branchEmpty: false, gitOk: true });
    expect(facts.get("DGS-2")).toEqual({ status: "to do", mergedSha: "abc1234", branchEmpty: false, gitOk: true });
    expect(driftLines(claimed, facts)).toEqual(["DGS-1: done in ClickUp, nothing on main", "DGS-2: to do in ClickUp, merged on main (abc1234)"]);
  });
  it("a throwing getStatus gives status null", async () => {
    const tracker = new FakeTracker(); // t1 unknown: getStatus throws
    const facts = await gatherDrift({ tracker, git: fakeGit(""), repo: "/r" }, [claimed[0]]);
    expect(facts.get("DGS-1")?.status).toBeNull();
  });
  it("a single branch with no commits of its own is empty", async () => {
    const tracker = new FakeTracker();
    tracker.add({ id: "t1" });
    const git = fakeGit("", { "DGS-1": "DGS-1__x\n" }, "0\n");
    const facts = await gatherDrift({ tracker, git, repo: "/r" }, [claimed[0]]);
    expect(facts.get("DGS-1")?.branchEmpty).toBe(true);
  });
  it("git fails and the status is readable: git facts unreadable", async () => {
    const tracker = new FakeTracker();
    tracker.add({ id: "t1", status: "complete" });
    const git: Git = () => { throw new Error("git down"); };
    const facts = await gatherDrift({ tracker, git, repo: "/r" }, [claimed[0]]);
    expect(driftLines([claimed[0]], facts)).toEqual(["DGS-1: git facts unreadable"]);
  });
  it("git fails and the status is unreadable: both lines", async () => {
    const git: Git = () => { throw new Error("git down"); };
    const facts = await gatherDrift({ tracker: new FakeTracker(), git, repo: "/r" }, [claimed[0]]);
    expect(driftLines([claimed[0]], facts)).toEqual(["DGS-1: status unreadable", "DGS-1: git facts unreadable"]);
  });
});
