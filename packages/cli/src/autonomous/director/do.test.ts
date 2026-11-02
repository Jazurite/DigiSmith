import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenItem } from "../attention.ts";
import { FakeTracker } from "../fake-tracker.test-util.ts";
import { authorityIdOf, doMove, type DoDeps, type Effects } from "./do.ts";
import { planLoop, type PlanWorld } from "./plan.ts";
import { hasDecision, readDecisions } from "./record.ts";
import { retryRunKey, type Move } from "./unblock.ts";

let dir: string;
let tracker: FakeTracker;
let calls: string[];
let failNext: string | null;
let now: Date;
const NOW = new Date("2026-11-03T03:00:00.000Z");
const ago = (m: number): string => new Date(now.getTime() - m * 60_000).toISOString();

const effects = (): Effects => ({
  promptDriver: async (t, text) => { if (failNext === "driver") { failNext = null; throw new Error("herdr down"); } calls.push(`driver ${t}: ${text}`); },
  releaseBuild: async (t, r) => { calls.push(`release ${t}: ${r}`); },
  refineRelease: async (a) => { calls.push(`refineRelease ${a.ticket} ${a.result}`); return { code: 0, text: "released" }; },
  startRefine: async (t) => { if (failNext === "start") { failNext = null; throw new Error("limit: role 1 of 1 in use"); } calls.push(`start ${t}`); },
  promptSelf: async (r) => { calls.push(`self ${r}`); },
});
const deps = (over: Partial<DoDeps> = {}): DoDeps => ({ dir, now: () => now, tracker, effects: effects(), ...over });
const item = (over: Partial<OpenItem> = {}): OpenItem => ({ id: "r1.stalled.0", ts: ago(50), ticket: "DGS-1", run: "r1", kind: "stalled", cause: "silent-working-180-min", since: ago(50), ...over });
const world = (items: OpenItem[], over: Partial<PlanWorld> = {}): PlanWorld => ({
  items, history: { decisions: readDecisions(dir), journal: [] }, lockTicket: "DGS-1", refineLock: null, pendingComments: 0, now,
  roleOf: (run) => (run.startsWith("w") ? "other" : "builder"), ...over,
});
const idOf = (w: PlanWorld, kind: string): string => planLoop(w).moves.find((m) => m.kind === kind)!.id;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "director-"));
  tracker = new FakeTracker();
  tracker.statuses.add("concept"); tracker.statuses.add("refinement");
  tracker.add({ id: "t1", key: "DGS-1", status: "in progress" });
  calls = []; failNext = null; now = NOW;
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("doMove", () => {
  it("recomputes the plan, finds the move and runs its effect; an unknown id exits 4", async () => {
    const w = world([item()]);
    const r = await doMove(deps(), w, idOf(w, "reprompt"));
    expect(r.code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^driver DGS-1: DGS-1: Director: run r1/);
    const u = await doMove(deps(), w, "m-00000000");
    expect(u.code).toBe(4);
    expect(calls).toHaveLength(1);
  });

  it("the decision line is written BEFORE the effect; a failing effect writes outcome failed and the same move can run again; a done move is not run twice", async () => {
    const w = world([item()]);
    const id = idOf(w, "reprompt");
    let seenBefore: string | undefined;
    const e = effects();
    const orig = e.promptDriver;
    e.promptDriver = async (t, x) => { seenBefore = readDecisions(dir).at(-1)?.outcome; return orig(t, x); };
    failNext = "driver";
    const first = await doMove(deps({ effects: e }), w, id);
    expect(first.code).toBe(5);
    expect(seenBefore).toBe("started");
    expect(readDecisions(dir).map((x) => x.outcome)).toEqual(["started", "failed"]);
    // the failed line does not count as a re-prompt: the move is still in the plan
    const w2 = world([item()]);
    expect(planLoop(w2).moves.map((m) => m.id)).toEqual([id]);
    const second = await doMove(deps({ effects: e }), w2, id);
    expect(second.code).toBe(0);
    expect(readDecisions(dir).map((x) => x.outcome)).toEqual(["started", "failed", "started", "done"]);
    const third = await doMove(deps({ effects: e }), world([item()]), id);
    expect(third.code).toBe(0);
    expect(third.text).toContain("already done");
    expect(calls).toHaveLength(1);
  });

  it("a move that was started and has no outcome is not run again (uncertain), exit 5", async () => {
    const w = world([item()]);
    const id = idOf(w, "reprompt");
    const { recordDecision } = await import("./record.ts");
    await recordDecision(deps(), { ticket: "DGS-1", run: "r1", id: "reprompt-run", side: "within", what: "w", why: "y", move: id, outcome: "started" });
    const r = await doMove(deps(), w, id);
    expect(r.code).toBe(5);
    expect(calls).toEqual([]);
  });

  it("already done holds only for the SAME id: run r1 done does not block run r2", async () => {
    const w = world([item(), item({ id: "r2.stalled.0", run: "r2" })]);
    const ids = planLoop(w).moves.map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
    expect((await doMove(deps(), w, ids[0])).code).toBe(0);
    expect((await doMove(deps(), world([item(), item({ id: "r2.stalled.0", run: "r2" })]), ids[1])).code).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it("reprompt with to=driver calls promptDriver, never the worker pane; to=self calls promptSelf", async () => {
    const w = world([item()]);
    await doMove(deps(), w, idOf(w, "reprompt"));
    expect(calls.some((c) => c.startsWith("self"))).toBe(false);
    const rw = world([item({ ticket: "DGS-2", run: "w1" })], { lockTicket: null, refineLock: { ticket: "DGS-2", taskId: "t2", claimedAt: ago(10), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 } });
    calls = [];
    await doMove(deps(), rw, idOf(rw, "reprompt"));
    expect(calls).toEqual(["self w1"]);
  });

  it("retry-once asks the driver and records reprompt-run under retryRunKey(run); 31 minutes later the plan turns it into a release", async () => {
    const f = item({ kind: "failed", cause: "gateway-5xx", id: "r1.failed.0" });
    const w = world([f]);
    await doMove(deps(), w, idOf(w, "retry-once"));
    expect(calls[0]).toMatch(/^driver DGS-1/);
    expect(hasDecision(dir, "DGS-1", retryRunKey("r1"), "reprompt-run")).not.toBeNull();
    now = new Date(NOW.getTime() + 31 * 60_000);
    const later = world([{ ...f, since: ago(60) }]);
    expect(planLoop(later).moves.map((m) => m.kind)).toEqual(["release"]);
  });

  it("release lane build calls releaseBuild (stopped) and escalates via release; the refine lane calls refineRelease and never the build release", async () => {
    const f = item({ kind: "failed", cause: "classifier-block", id: "r1.failed.0" });
    const w = world([f]);
    const r = await doMove(deps(), w, idOf(w, "release"));
    expect(r.code).toBe(0);
    expect(calls).toEqual([expect.stringMatching(/^release DGS-1: failed: classifier-block/)]);
    expect(tracker.tasks.get("t1")?.status).toBe("in progress");   // --via-release: no status write
    expect(tracker.comments.some((c) => c.text.includes("classifier-block"))).toBe(true);
    calls = [];
    const rw = world([item({ ticket: "DGS-2", run: "w1", kind: "failed", cause: "classifier-block", id: "w1.failed.0" })], { lockTicket: null, refineLock: { ticket: "DGS-2", taskId: "t2", claimedAt: ago(10), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 } });
    const r2 = await doMove(deps(), rw, idOf(rw, "refine-release"));
    expect(r2.code).toBe(0);
    expect(calls).toEqual(["refineRelease DGS-2 escalated"]);
  });

  it("a refine-release that returns a non-zero code is a failed move", async () => {
    const e = effects();
    e.refineRelease = async () => ({ code: 2, text: "no refine lock" });
    const rw = world([item({ ticket: "DGS-2", run: "w1", kind: "failed", cause: "classifier-block", id: "w1.failed.0" })], { lockTicket: null, refineLock: { ticket: "DGS-2", taskId: "t2", claimedAt: ago(10), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 } });
    const r = await doMove(deps({ effects: e }), rw, idOf(rw, "refine-release"));
    expect(r.code).toBe(5);
    expect(readDecisions(dir).at(-1)?.outcome).toBe("failed");
  });

  it("start-again starts the refine worker; a refused start is recorded and the move stays", async () => {
    const lost = item({ ticket: "DGS-2", run: "w1", kind: "lost", cause: "pane-gone", id: "w1.lost.0" });
    const lock = { ticket: "DGS-2", taskId: "t2", claimedAt: ago(10), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 } as const;
    const w = world([lost], { lockTicket: null, refineLock: lock });
    failNext = "start";
    const r = await doMove(deps(), w, idOf(w, "start-again"));
    expect(r.code).toBe(5);
    expect(r.text).toContain("limit: role");
    const w2 = world([lost], { lockTicket: null, refineLock: lock });
    expect(planLoop(w2).moves.map((m) => m.kind)).toEqual(["start-again"]);
    expect((await doMove(deps(), w2, idOf(w2, "start-again"))).code).toBe(0);
    expect(calls).toEqual(["start DGS-2"]);
  });

  it("checkAuthority is applied to the move's authority id before the effect", async () => {
    const w = world([item()]);
    const asked: string[] = [];
    const r = await doMove(deps({ check: (id) => { asked.push(id); return { ok: false, code: 3, text: "outside" }; } }), w, idOf(w, "reprompt"));
    expect(r).toEqual({ code: 5, text: "outside" });
    expect(asked).toEqual(["reprompt-run"]);
    expect(calls).toEqual([]);
    expect(readDecisions(dir)).toEqual([]);
  });

  it("every move kind that has an effect maps to a within authority id", () => {
    const kinds: Move["kind"][] = ["reprompt", "retry-once", "start-again", "release", "refine-release", "gate-wait"];
    const { checkAuthority } = require("./authority.ts") as typeof import("./authority.ts");
    for (const k of kinds) expect(checkAuthority(authorityIdOf({ id: "m", kind: k } as Move) as string)).toEqual({ ok: true });
  });

  it("F2: the started line posts no ClickUp comment; the done line posts one", async () => {
    const f = item({ kind: "failed", cause: "classifier-block", id: "r1.failed.0" });
    const w = world([f]);
    const e = effects();
    let commentsAtEffect = -1;
    const orig = e.releaseBuild;
    e.releaseBuild = async (t, r) => { commentsAtEffect = tracker.comments.length; return orig(t, r); };
    await doMove(deps({ effects: e }), w, idOf(w, "release"));
    expect(commentsAtEffect).toBe(0);
    expect(tracker.comments.some((c) => c.text.includes("Director decision") && c.text.includes("stopped the ticket"))).toBe(true);
  });

  it("F1: a release whose escalate step failed is run again without a second release, and the escalation is made", async () => {
    const f = item({ kind: "failed", cause: "classifier-block", id: "r1.failed.0" });
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "escalations.jsonl"));   // an append to a directory fails: the escalate step throws
    const e = effects();
    const w = world([f]);
    const id = idOf(w, "release");
    const first = await doMove(deps({ effects: e }), w, id);
    expect(first.code).toBe(5);
    expect(calls.filter((c) => c.startsWith("release"))).toHaveLength(1);
    rmSync(join(dir, "escalations.jsonl"), { recursive: true });
    // the lock is gone now: the move left the plan, but its first line saved it
    const w2 = world([f], { lockTicket: null });
    expect(planLoop(w2).moves).toEqual([]);
    const second = await doMove(deps({ effects: e }), w2, id);
    expect(second.code).toBe(0);
    expect(calls.filter((c) => c.startsWith("release"))).toHaveLength(1);   // not released twice
    expect(tracker.comments.some((c) => c.text.includes("classifier-block") && c.text.startsWith("Director ("))).toBe(true);
    expect((await doMove(deps({ effects: e }), w2, id)).text).toContain("already done");
  });

  it("F4: a second process cannot run the same move while it runs; the marker is removed afterwards", async () => {
    const w = world([item()]);
    const id = idOf(w, "reprompt");
    const e = effects();
    let inner: { code: number; text: string } | null = null;
    e.promptDriver = async () => { inner = await doMove(deps({ effects: effects() }), world([item()]), id); };
    expect((await doMove(deps({ effects: e }), w, id)).code).toBe(0);
    expect(inner).toMatchObject({ code: 5 });
    expect(inner!.text).toContain("another process");
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(dir, "director", "moves", `${id}.running`))).toBe(false);
  });

  it("N1: a failed non-release move that left the plan is exit 4, never run from a saved payload", async () => {
    const lost = item({ ticket: "DGS-2", run: "w1", kind: "lost", cause: "pane-gone", id: "w1.lost.0" });
    const lock = { ticket: "DGS-2", taskId: "t2", claimedAt: ago(10), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 } as const;
    const w = world([lost], { lockTicket: null, refineLock: lock });
    const id = idOf(w, "start-again");
    failNext = "start";
    expect((await doMove(deps(), w, id)).code).toBe(5);
    // the refine lock is gone: the move left the plan
    const w2 = world([lost], { lockTicket: null, refineLock: null });
    const r = await doMove(deps(), w2, id);
    expect(r.code).toBe(4);
    expect(calls).toEqual([]);
    // the same for a re-prompt that failed and then left the plan
    const s = item();
    const w3 = world([s]);
    const rid = idOf(w3, "reprompt");
    failNext = "driver";
    expect((await doMove(deps(), w3, rid)).code).toBe(5);
    expect((await doMove(deps(), world([s], { lockTicket: null }), rid)).code).toBe(4);
  });

  it("N2: a move id that is not m-<8 hex> is exit 4 before any marker is made; '../x' does not throw", async () => {
    const { existsSync } = await import("node:fs");
    for (const bad of ["../x", "m-xyz", "", "m-0123456789", "a/b", "m-0000000g"]) {
      const r = await doMove(deps(), world([item()]), bad);
      expect(r.code).toBe(4);
    }
    expect(existsSync(join(dir, "director", "moves"))).toBe(false);
    expect(existsSync(join(dir, "x.running"))).toBe(false);
  });

  it("F1: after the gate-wait is done the plan no longer lists it as a move (it cannot wake again)", async () => {
    const refused = item({ kind: "refused", cause: "merge-refused: protected path", since: ago(40), id: "DGS-1.refused.0", run: "DGS-1" });
    const noRole = { roleOf: () => null };
    const w = world([refused], noRole);
    expect((await doMove(deps(), w, idOf(w, "gate-wait"))).code).toBe(0);
    const later = world([refused], noRole);
    expect(planLoop(later).moves).toEqual([]);
    expect(planLoop(later).wake).toBe(false);
  });

  it("F4: a stuck refine lock asks Jack a real question and the refine release gets it", async () => {
    const seen: { question?: string }[] = [];
    const e = effects();
    e.refineRelease = async (a) => { seen.push({ question: a.question }); return { code: 0, text: "released" }; };
    const lock = { ticket: "DGS-2", taskId: "t2", claimedAt: ago(400), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 } as const;
    const w = world([], { lockTicket: null, refineLock: lock });
    expect((await doMove(deps({ effects: e }), w, idOf(w, "refine-release"))).code).toBe(0);
    expect(seen[0].question).toBe("The refine run of DGS-2 ran more than 6 hours without a clean plan. Say how to go on.");
  });

  it("gate-wait only records", async () => {
    const w = world([item({ kind: "refused", cause: "merge-refused: protected path", since: ago(40), id: "r1.refused.0" })]);
    const r = await doMove(deps(), w, idOf(w, "gate-wait"));
    expect(r.code).toBe(0);
    expect(calls).toEqual([]);
    expect(readDecisions(dir).map((x) => x.outcome)).toEqual(["started", "done"]);
  });
});
