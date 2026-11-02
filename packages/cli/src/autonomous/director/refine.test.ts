import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOpen } from "../attention.ts";
import { FakeTracker } from "../fake-tracker.test-util.ts";
import { AUTHORITY_PATHS } from "./authority.ts";
import {
  acquireRefineLock, checkRefineReady, clearRefineLock, hasDoneWhen, lockAgeMinutes, readRefineLock, readVerdict, REFINE_LOCK_MAX_AGE_MINUTES,
  refineOrderPath, refineRelease, refineRound, renderRefineOrder, type RefineLock, type RefineReleaseDeps,
} from "./refine.ts";
import { hasDecision, readDecisions } from "./record.ts";
import type { LoTask } from "../types.ts";

let dir: string;
let board: string;
let tracker: FakeTracker;
let description: string;
let boardDirResult: string | null;
const NOW = new Date("2026-11-03T03:00:00.000Z");
const CLEAN = "# Report\n\n```json findings\n[]\n```\n";
const DIRTY = "# Report\n\n```json findings\n[{\"id\":\"F1\",\"severity\":\"Important\",\"what\":\"the plan has a gap\",\"path\":\"plan.md\",\"line\":3}]\n```\n";

const lock = (over: Partial<RefineLock> = {}): RefineLock => ({ ticket: "DGS-1", taskId: "t1", claimedAt: NOW.toISOString(), claimedAtUtc7: "2026-11-03 10:00:00", order: "o.md", scanId: "s", attempt: 1, round: 1, ...over });
const deps = (): RefineReleaseDeps => ({
  dir, now: () => NOW, tracker, checkReadyCtx: { repo: "/r", fileExists: () => false },
  boardDir: () => boardDirResult, readDescription: async () => description,
});
const report = (text: string): string => { const p = join(dir, "report.md"); writeFileSync(p, text); return p; };
const writeDocs = (spec: string, plan: string): void => { writeFileSync(join(board, "spec.md"), spec); writeFileSync(join(board, "plan.md"), plan); };
const toDoWrites = (): string[] => tracker.calls.filter((c) => c === "setStatus t1 to do");
const task = (over: Partial<LoTask> = {}): LoTask => ({ id: "t", key: "DGS-1", name: "n", typeId: 0, priority: 3, due: null, created: 1, attachments: [], text: "Done when: it works", signOff: "Auto", mode: "Autonomous", scheduledAt: null, milestone: null, inProjects: false, blockers: [], ...over });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "director-"));
  board = join(dir, "board");
  mkdirSync(board);
  boardDirResult = board;
  description = "Done when: it works";
  writeDocs("# Spec\nNothing special.", "# Plan\nBuild a thing.");
  tracker = new FakeTracker();
  tracker.statuses.add("concept"); tracker.statuses.add("refinement");
  tracker.add({ id: "t1", key: "DGS-1", status: "refinement", text: description });
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("hasDoneWhen and checkRefineReady", () => {
  it.each(["Done when: it works", "**Done when** it works", "## Done when\nit works", "intro\n\ndone when it works", "- Done when x", "> Done when x"])("finds %j", (t) => {
    expect(hasDoneWhen(task({ text: t }))).toBe(true);
  });
  it("rejects text without one", () => {
    expect(hasDoneWhen(task({ text: "We are done when ready" }))).toBe(false);
    expect(hasDoneWhen(task({ text: "" }))).toBe(false);
  });
  it("lists: no Done when, open blocker, Mode Manual; a clean ticket returns []", () => {
    expect(checkRefineReady(task())).toEqual([]);
    expect(checkRefineReady(task({ text: "x" }))).toHaveLength(1);
    expect(checkRefineReady(task({ blockers: [{ key: "DGS-9", done: false }] }))[0]).toContain("DGS-9");
    expect(checkRefineReady(task({ blockers: [{ key: "DGS-9", done: true }] }))).toEqual([]);
    expect(checkRefineReady(task({ mode: "Manual" }))[0]).toContain("Manual");
    expect(checkRefineReady(task({ text: "", mode: "Manual", blockers: [{ key: "A-1", done: false }] }))).toHaveLength(3);
  });
});

describe("the refine lock", () => {
  it("is exclusive; clear removes it; a corrupt file reads corrupt", () => {
    expect(acquireRefineLock(dir, lock())).toBe("acquired");
    expect(acquireRefineLock(dir, lock({ ticket: "DGS-2" }))).toBe("busy");
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
    clearRefineLock(dir);
    expect(readRefineLock(dir)).toBeNull();
    writeFileSync(join(dir, "refine-lock.json"), "{nope");
    expect(readRefineLock(dir)).toEqual({ corrupt: true });
  });
  it("lockAgeMinutes", () => {
    expect(REFINE_LOCK_MAX_AGE_MINUTES).toBe(360);
    expect(lockAgeMinutes({ claimedAt: new Date(NOW.getTime() - 361 * 60_000).toISOString() }, NOW)).toBe(361);
  });
});

describe("readVerdict", () => {
  it("no findings block is not clean", () => {
    expect(readVerdict(report("# nothing"))).toMatchObject({ clean: false });
    expect(readVerdict(join(dir, "missing.md"))).toMatchObject({ clean: false });
  });
  it("[] is clean; Minor only is clean; one Important is not; the LAST block counts", () => {
    expect(readVerdict(report(CLEAN))).toMatchObject({ clean: true, blocking: 0 });
    expect(readVerdict(report("```json findings\n[{\"severity\":\"Minor\",\"what\":\"x\"}]\n```"))).toMatchObject({ clean: true });
    expect(readVerdict(report(DIRTY))).toMatchObject({ clean: false, blocking: 1 });
    expect(readVerdict(report(`${DIRTY}\n${CLEAN}`))).toMatchObject({ clean: true });
    expect(readVerdict(report(`${CLEAN}\n${DIRTY}`))).toMatchObject({ clean: false });
  });
  it("an unparseable block is not clean", () => {
    expect(readVerdict(report("```json findings\n{oops\n```"))).toMatchObject({ clean: false });
  });
});

describe("refineRelease ready", () => {
  beforeEach(() => { acquireRefineLock(dir, lock()); });

  it("sets to do, reads it back, clears the lock, records apply-refinement-gate", async () => {
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(r.code).toBe(0);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(tracker.calls).toContain("getStatus t1");
    expect(readRefineLock(dir)).toBeNull();
    expect(hasDecision(dir, "DGS-1", null, "apply-refinement-gate")).not.toBeNull();
    expect(existsSync(join(dir, "director", "authority-approvals", "DGS-1.json"))).toBe(false);
  });

  it.each(AUTHORITY_PATHS.map((p) => [p]))("is REFUSED and escalated when the plan names %s", async (p) => {
    writeDocs("# Spec", `# Plan\nEdit ${p} to change a rule.`);
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(r.code).toBe(2);
    expect(r.text).toContain("authority");
    expect(toDoWrites()).toEqual([]);
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
    expect(tracker.comments.some((c) => c.text.includes("The plan changes the Director's own authority"))).toBe(true);
    expect(hasDecision(dir, "DGS-1", null, "apply-refinement-gate")).toBeNull();
  });

  it("a spec that names an authority path is refused too", async () => {
    writeDocs("# Spec\nChange .digismith/mandate.yml", "# Plan");
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
  });

  it("a plan that names director/refine.ts is refused when the approval lists only director/authority.ts, and passes with the folder", async () => {
    writeDocs("# Spec", "# Plan\nEdit director/refine.ts");
    description = "Done when: ok\nAuthority change approved by Jack: 2026-11-03: director/authority.ts";
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(r.code).toBe(2);
    expect(r.text).toContain("director/refine.ts");
    tracker.tasks.get("t1")!.status = "refinement";
    clearEscalations();
    description = "Done when: ok\nAuthority change approved by Jack: 2026-11-03: packages/cli/src/autonomous/director/";
    const r2 = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(r2.code).toBe(0);
  });

  it.each(["authority-backstop.ts", "merge-gate.ts", "breaker.ts"])("a plan that says to remove the check in %s is refused", async (f) => {
    writeDocs("# Spec", `# Plan\nRemove the check in ${f}.`);
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
  });

  it.each(["director/authority.ts", "autonomous/protected-paths.ts", "limit-check.ts", "nightwatch.limits"])("a plan naming the SHORT spelling %s is refused", async (s) => {
    writeDocs("# Spec", `# Plan\nTouch ${s} once.`);
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
  });

  it("passes with an approval line listing every named path, writes the approval record; refused when it lists only some", async () => {
    writeDocs("# Spec", "# Plan\nEdit director/refine.ts and .digismith/config.yml.");
    description = "Done when: ok\nAuthority change approved by Jack: 2026-11-03: director/refine.ts";
    const bad = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(bad.code).toBe(2);
    expect(bad.text).toContain(".digismith/config.yml");
    expect(bad.text).not.toContain("director/refine.ts,");
    tracker.tasks.get("t1")!.status = "refinement";
    clearEscalations();
    description = "Done when: ok\nAuthority change approved by Jack: 2026-11-03: director/refine.ts, .digismith/config.yml.";
    const ok = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(ok.code).toBe(0);
    const rec = JSON.parse(readFileSync(join(dir, "director", "authority-approvals", "DGS-1.json"), "utf8"));
    expect(rec).toMatchObject({ ticket: "DGS-1", paths: ["director/refine.ts", ".digismith/config.yml"] });
    expect(typeof rec.line).toBe("string");
    expect(typeof rec.at).toBe("string");
  });

  it("fails closed: boardDir null, spec.md missing, plan.md missing", async () => {
    boardDirResult = null;
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
    boardDirResult = board;
    rmSync(join(board, "spec.md"));
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
    writeFileSync(join(board, "spec.md"), "s");
    rmSync(join(board, "plan.md"));
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
    expect(toDoWrites()).toEqual([]);
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
    expect(readRefineLock(dir)).not.toBeNull();
  });

  it("no lock, or a lock for another ticket: refused", async () => {
    clearRefineLock(dir);
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
    acquireRefineLock(dir, lock({ ticket: "DGS-2" }));
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
  });

  it("without --report: refused", async () => {
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready" })).code).toBe(2);
  });

  it("round 1 dirty report: exit 2 'dirty: relay the confirmed findings', nothing changes", async () => {
    const before = tracker.calls.length;
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(DIRTY) });
    expect(r).toMatchObject({ code: 2 });
    expect(r.text).toContain("dirty: relay the confirmed findings");
    expect(tracker.calls.length).toBe(before);
    expect(readRefineLock(dir)).toMatchObject({ round: 1 });
  });

  it("refineRound sets round 2; round 2 clean: ready; round 2 dirty: escalated with the findings, lock cleared", async () => {
    refineRound(dir);
    expect(readRefineLock(dir)).toMatchObject({ round: 2, ticket: "DGS-1" });
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(DIRTY) });
    expect(r.code).toBe(0);
    expect(readRefineLock(dir)).toBeNull();
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    const c = tracker.comments.find((x) => x.text.startsWith("Director ("));
    expect(c?.text).toContain("the plan has a gap");
    expect(readDecisions(dir).some((x) => x.what.includes("the plan has a gap"))).toBe(true);
  });

  it("round 2 clean releases ready", async () => {
    refineRound(dir);
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(0);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
  });

  it("refineRound with no lock throws", () => {
    clearRefineLock(dir);
    expect(() => refineRound(dir)).toThrow();
  });

  it("fails with the checkReady reasons when the re-read ticket has no spec and plan; status unchanged, lock kept", async () => {
    tracker.tasks.get("t1")!.attachments = [];
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(r.code).toBe(2);
    expect(r.text).toContain("no spec and plan");
    expect(tracker.tasks.get("t1")?.status).toBe("refinement");
    expect(readRefineLock(dir)).not.toBeNull();
  });

  it("a ticket that is no longer in refinement is refused", async () => {
    tracker.tasks.get("t1")!.status = "concept";
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).code).toBe(2);
  });

  it("a status read-back mismatch throws and keeps the lock", async () => {
    tracker.getStatus = async () => "refinement";
    await expect(refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) })).rejects.toThrow();
    expect(readRefineLock(dir)).not.toBeNull();
  });
});

describe("refineRelease escalated and failed", () => {
  beforeEach(() => { acquireRefineLock(dir, lock()); });

  it("escalated calls escalate and clears the lock", async () => {
    const r = await refineRelease(deps(), { ticket: "DGS-1", result: "escalated", question: "Which name?" });
    expect(r.code).toBe(0);
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    expect(readRefineLock(dir)).toBeNull();
    expect(tracker.comments[0].text).toContain("Which name?");
  });
  it("escalated without a question is refused", async () => {
    expect((await refineRelease(deps(), { ticket: "DGS-1", result: "escalated" })).code).toBe(2);
    expect(readRefineLock(dir)).not.toBeNull();
  });
  it("failed: the first time clears the lock and records; the second failure escalates with the cause", async () => {
    const r1 = await refineRelease(deps(), { ticket: "DGS-1", result: "failed", cause: "pane-died" });
    expect(r1.code).toBe(0);
    expect(readRefineLock(dir)).toBeNull();
    expect(tracker.tasks.get("t1")?.status).toBe("refinement");
    expect(tracker.comments).toEqual([]);
    acquireRefineLock(dir, lock({ attempt: 2 }));
    const r2 = await refineRelease(deps(), { ticket: "DGS-1", result: "failed", cause: "pane-died" });
    expect(r2.code).toBe(0);
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    expect(tracker.comments[0].text).toContain("pane-died");
    expect(readRefineLock(dir)).toBeNull();
  });
  it("(ready, escalated, failed) never touch the breaker file", async () => {
    await refineRelease(deps(), { ticket: "DGS-1", result: "failed", cause: "x" });
    acquireRefineLock(dir, lock());
    await refineRelease(deps(), { ticket: "DGS-1", result: "escalated", question: "q?" });
    acquireRefineLock(dir, lock());
    tracker.tasks.get("t1")!.status = "refinement";
    await refineRelease(deps(), { ticket: "DGS-1", result: "ready", report: report(CLEAN) });
    expect(existsSync(join(dir, "breaker.json"))).toBe(false);
    expect(readOpen(dir)).toEqual([]);
  });
});

describe("the refine order", () => {
  it("names the file and the five steps", () => {
    expect(refineOrderPath("/o", "2026-11-03-1000", "DGS-1")).toBe("/o/order-ar-2026-11-03-1000-DGS-1.md");
    const t = renderRefineOrder({ key: "DGS-1", name: "Thing", taskId: "t1", claimedAtUtc7: "2026-11-03 10:00:00", stamp: "2026-11-03-1000", answer: null });
    for (const s of ["refine-brief.md", "dg director seat", "plan Reviewer", "dg director refine-round", "dg clickup upload-attachment", "dg director refine-release", "no sudo", "Never start a Reviewer"]) expect(t.toLowerCase()).toContain(s.toLowerCase());
    expect(t).not.toContain("Answer from Jack");
    expect(renderRefineOrder({ key: "DGS-1", name: "T", taskId: "t1", claimedAtUtc7: "x", stamp: "s", answer: "Use the name Forge" })).toContain("Use the name Forge");
  });
});

function clearEscalations(): void {
  rmSync(join(dir, "escalations.jsonl"), { force: true });
  acquireRefineLock(dir, lock());
}
