import { describe, expect, it } from "vitest";
import { makeScanGuard } from "./scan-guard.ts";
import type { Git } from "./gitx.ts";
import type { LoTask } from "./types.ts";

const task = (over: Partial<LoTask> = {}): LoTask => ({
  id: "t1", key: "DGS-1", name: "n", typeId: 0, priority: 3, due: null, created: 1, attachments: [], text: "",
  signOff: "Auto", milestone: null, blockers: [], ...over,
});

interface Fx { config?: string | Error; fetch?: Error; log?: string; branches?: string; ancestors?: string[]; branchLog?: string }
function fake(fx: Fx = {}): { git: Git; calls: string[][] } {
  const calls: string[][] = [];
  const git: Git = (_cwd, args) => {
    calls.push(args);
    if (args[0] === "show") { if (fx.config instanceof Error) throw fx.config; return fx.config ?? ""; }
    if (args[0] === "fetch") { if (fx.fetch) throw fx.fetch; return ""; }
    if (args[0] === "log") return args[1] === "origin/main" ? (fx.log ?? "") : (fx.branchLog ?? "");
    if (args[0] === "branch") {
      const pats = args.slice(3, -1);
      const lines = (fx.branches ?? "").split("\n").filter(Boolean);
      return lines.filter((l) => pats.some((p) => new RegExp(`^${p.replace(/\*/g, ".*")}$`).test(l))).join("\n");
    }
    if (args[0] === "merge-base") { if ((fx.ancestors ?? []).includes(args[2])) return ""; throw new Error("exit 1"); }
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  return { git, calls };
}

describe("guardrailProblems", () => {
  it("returns the problems of a bad config", () => {
    const { git } = fake({ config: "nightwatch:\n  nope: 1\n" });
    const p = makeScanGuard(git, "/r").guardrailProblems();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/unknown guardrail key/);
  });
  it("is empty for a clean config", () => {
    expect(makeScanGuard(fake({ config: "" }).git, "/r").guardrailProblems()).toEqual([]);
  });
  it("returns the read failure when git show throws", () => {
    const p = makeScanGuard(fake({ config: new Error("fatal: bad object") }).git, "/r").guardrailProblems();
    expect(p).toEqual(["cannot read .digismith/config.yml from main: fatal: bad object"]);
  });
});

describe("alreadyDone", () => {
  it("reports work merged on main with the attention cause", () => {
    const { git } = fake({ log: "abc123\tfeat(dgs-1): x\n" });
    expect(makeScanGuard(git, "/r").alreadyDone(task())).toEqual({ reason: "already-merged: abc123", attention: "already-merged-but-open" });
  });
  it("returns null for a clean ticket", () => {
    expect(makeScanGuard(fake().git, "/r").alreadyDone(task())).toBeNull();
  });
  it("a done blocker with an unmerged branch gives blocker-not-on-main", () => {
    const { git } = fake({ branches: "DGS-3__a", ancestors: [] });
    const r = makeScanGuard(git, "/r").alreadyDone(task({ blockers: [{ key: "DGS-3", done: true }] }));
    expect(r).toEqual({ reason: "blocker-not-on-main: DGS-3" });
  });
  it("a done blocker with a rescue branch only gives blocker-not-on-main", () => {
    const { git } = fake({ branches: "origin/rescue/DGS-3" });
    expect(makeScanGuard(git, "/r").alreadyDone(task({ blockers: [{ key: "DGS-3", done: true }] }))).toEqual({ reason: "blocker-not-on-main: DGS-3" });
  });
  it("a merged done blocker passes", () => {
    const { git } = fake({ branches: "DGS-3__a", ancestors: ["DGS-3__a"], branchLog: "wip(dgs-3): x" });
    expect(makeScanGuard(git, "/r").alreadyDone(task({ blockers: [{ key: "DGS-3", done: true }] }))).toBeNull();
  });
  it("a blocker that is not done is ignored here", () => {
    const { git, calls } = fake({ branches: "DGS-3__a" });
    expect(makeScanGuard(git, "/r").alreadyDone(task({ blockers: [{ key: "DGS-3", done: false }] }))).toBeNull();
    expect(calls.some((c) => c.join(" ").includes("DGS-3"))).toBe(false);
  });
  it("a failed fetch gives the cannot-check reason and leaves guardrailProblems alone", () => {
    const g = makeScanGuard(fake({ fetch: new Error("network down\nmore"), config: "" }).git, "/r");
    expect(g.alreadyDone(task())).toEqual({ reason: "cannot check origin/main: network down" });
    expect(g.guardrailProblems()).toEqual([]);
  });
  it("a git failure while checking is a skip, not a claim", () => {
    const git: Git = (_c, a) => { if (a[0] === "log") throw new Error("boom"); return ""; };
    expect(makeScanGuard(git, "/r").alreadyDone(task())).toEqual({ reason: "cannot check origin/main: boom" });
  });
  it("reads the main log once across two tickets and a done blocker", () => {
    const { git, calls } = fake({ branches: "DGS-3__a", ancestors: ["DGS-3__a"], branchLog: "wip(dgs-3): x" });
    const g = makeScanGuard(git, "/r");
    g.alreadyDone(task({ blockers: [{ key: "DGS-3", done: true }] }));
    g.alreadyDone(task({ id: "t2", key: "DGS-2", blockers: [{ key: "DGS-3", done: true }] }));
    expect(calls.filter((c) => c[0] === "log" && c[1] === "origin/main")).toHaveLength(1);
  });
  it("fetches once for two calls", () => {
    const { git, calls } = fake();
    const g = makeScanGuard(git, "/r");
    g.alreadyDone(task());
    g.alreadyDone(task({ id: "t2", key: "DGS-2" }));
    expect(calls.filter((c) => c[0] === "fetch")).toHaveLength(1);
  });
});
