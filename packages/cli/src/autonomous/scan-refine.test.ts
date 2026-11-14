import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOpen } from "./attention.ts";
import { recordRelease } from "./breaker.ts";
import type { Exec } from "./conductor.ts";
import { escalate } from "./director/escalate.ts";
import { readDecisions } from "./director/record.ts";
import { fakeStatus } from "./director/status.test-util.ts";
import { DONE_WHEN_QUESTION, readRefineLock, acquireRefineLock, clearRefineLock } from "./director/refine.ts";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { runScan, type ScanDeps } from "./scan.ts";
import { acquireLock, readEvents, readLock } from "./state.ts";

const NIGHT = new Date("2026-10-20T17:00:00.000Z");
let root: string;
let dir: string;
let ordersDir: string;
let conductorsJson: string;
let tracker: FakeTracker;
let prompts: string[];
let promptFails: boolean;
let roleFullText: string | null;
let now: Date;

const exec: Exec = async () => ({ code: 0, stderr: "" });
const mk = (over: Partial<ScanDeps> = {}): ScanDeps => ({
  tracker, dir, ordersDir, conductorsJson, repo: "/repo", now: () => now, scanId: "scan-1", exec, fileExists: () => false, dryRun: false,
  nexus: { baseUrl: "http://fake", tokenFile: join(root, "token"), fetch: (async () => new Response("{}", { status: 202 })) as unknown as typeof fetch },
  refine: { prompt: async (m) => { if (promptFails) throw new Error("prompt down"); prompts.push(m); }, roleFull: () => roleFullText, status: fakeStatus(tracker) },
  ...over,
});
const events = () => readEvents(dir, now.getTime() - 48 * 3600_000, now.getTime() + 1000);
const kinds = () => events().map((e) => e.kind);
const orders = () => (existsSync(ordersDir) ? readdirSync(ordersDir) : []);
const addRefine = (id: string, over: Record<string, unknown> = {}) => tracker.add({ id, key: id.toUpperCase().replace(/^T/, "DGS-"), status: "refinement", text: "Done when: it works", ...over });
const setStatuses = () => tracker.calls.filter((c) => c.startsWith("setStatus"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "auto-scan-refine-"));
  dir = join(root, "autonomous");
  ordersDir = join(root, "orders");
  conductorsJson = join(root, "conductors.json");
  writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1, workspace: "w2" } }));
  writeFileSync(join(root, "token"), "tok\n");
  tracker = new FakeTracker();
  tracker.statuses.add("concept"); tracker.statuses.add("refinement");
  prompts = [];
  promptFails = false;
  roleFullText = null;
  now = NIGHT;
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("the refine lane: switch and claim", () => {
  it("is off when deps.refine is absent: scan behaves as before", async () => {
    addRefine("t1");
    tracker.add({ id: "t2", key: "DGS-2" });
    const r = await runScan(mk({ refine: undefined }));
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-2" });
    expect(tracker.calls).toEqual(["hasStatus claimed", "listByStatus to do", "setStatus t2 claimed", "getStatus t2"]);
    expect(readRefineLock(dir)).toBeNull();
  });

  it("claims the first ready refinement ticket in priority, due, age order and prompts the Director", async () => {
    addRefine("t1", { priority: 2 });
    addRefine("t2", { priority: 1 });
    addRefine("t3", { priority: null });
    const r = await runScan(mk());
    expect(r.outcome).toBe("none");
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-2", taskId: "t2", attempt: 1, round: 1, scanId: "scan-1" });
    expect(orders()).toHaveLength(1);
    expect(orders()[0]).toMatch(/^order-ar-.*-DGS-2\.md$/);
    expect(prompts).toEqual([`Director: refine DGS-2, read ${join(ordersDir, orders()[0])}`]);
    expect(kinds()).toContain("refine-claim");
    expect(readDecisions(dir)).toMatchObject([{ ticket: "DGS-2", id: "claim-refine", side: "within" }]);
    expect(readFileSync(join(ordersDir, orders()[0]), "utf8")).toContain("refine DGS-2");
  });

  it("OCL-105: an OCL refinement ticket is picked like a DGS one, in the same rank order", async () => {
    addRefine("t1", { priority: 1 });
    addRefine("t2", { key: "OCL-9", priority: 2 });
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
    clearRefineLock(dir);
    tracker.tasks.get("t1")!.status = "concept";
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "OCL-9", taskId: "t2" });
    expect(orders().some((o) => /-OCL-9\.md$/.test(o))).toBe(true);
    expect(readDecisions(dir).map((d) => d.ticket)).toEqual(["DGS-1", "OCL-9"]);
  });

  it("a refine claim never writes a ClickUp status", async () => {
    addRefine("t1");
    await runScan(mk());
    expect(setStatuses()).toEqual([]);
    expect(tracker.tasks.get("t1")?.status).toBe("refinement");
  });

  it("skips Mode Manual, a type other than Task or Bug, and a ticket with an open blocker", async () => {
    addRefine("t1", { mode: "Manual" });
    addRefine("t2", { typeId: 7 });
    addRefine("t3", { blockers: [{ key: "DGS-9", done: false }] });
    await runScan(mk());
    expect(readRefineLock(dir)).toBeNull();
    expect(prompts).toEqual([]);
    expect(tracker.comments).toHaveLength(1);
    expect(tracker.comments[0]).toMatchObject({ ref: "t3" });
    await runScan(mk());
    expect(tracker.comments).toHaveLength(1);   // one comment per reason hash
  });

  it("claims the next ticket when the first is not ready", async () => {
    addRefine("t1", { priority: 1, mode: "Manual" });
    addRefine("t2", { priority: 2 });
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-2" });
  });
});

describe("the refine lane: Done when", () => {
  it("no Done when line: escalated to concept at once with the question, once", async () => {
    addRefine("t1", { text: "nothing here" });
    await runScan(mk());
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    expect(tracker.comments).toHaveLength(1);
    expect(tracker.comments[0].text).toContain(DONE_WHEN_QUESTION);
    expect(readRefineLock(dir)).toBeNull();
    expect(prompts).toEqual([]);
    await runScan(mk());
    expect(tracker.comments).toHaveLength(1);
  });

  it("back in refinement WITH the line: no refusal, claimed", async () => {
    addRefine("t1", { text: "nothing here" });
    await runScan(mk());
    const t = tracker.tasks.get("t1")!;
    t.status = "refinement";
    t.text = "Done when: it works";
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
    expect(readOpen(dir).filter((i) => i.cause === "question-already-asked")).toEqual([]);
    expect(tracker.comments.filter((c) => !c.text.startsWith("Director decision"))).toHaveLength(1);   // the claim decision is the only other comment
  });

  it("back WITHOUT the line: attention item question-already-asked, no second comment, no claim", async () => {
    addRefine("t1", { text: "nothing here" });
    await runScan(mk());
    tracker.tasks.get("t1")!.status = "refinement";
    await runScan(mk());
    await runScan(mk());
    expect(readRefineLock(dir)).toBeNull();
    expect(tracker.comments).toHaveLength(1);
    const items = readOpen(dir).filter((i) => i.cause === "question-already-asked");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ run: "DGS-1/escalation", kind: "unknown" });
  });

  it("DGS-739: a Steward refusal of the done-when move to concept is an event, never an error out of the scan", async () => {
    addRefine("t1", { text: "no condition here" });
    const status = fakeStatus(tracker);
    status.refuse = "steward: refused returned";
    const r = await runScan(mk({ refine: { prompt: async () => {}, roleFull: () => null, status } }));
    expect(r.outcome).toBe("none");
    expect(readRefineLock(dir)).toBeNull();
    expect(events().find((e) => e.kind === "refine-failed")).toMatchObject({ ticket: "DGS-1" });
    expect(tracker.comments).toEqual([]);
  });

  it("a ticket that returned from concept puts Jack's text in the order", async () => {
    addRefine("t1", { text: "Done when: ok\nJack says: call it Forge" });
    await escalate({ dir, now: () => now, tracker, status: fakeStatus(tracker) }, { ticket: "DGS-1", taskId: "t1", id: "product-taste-names-scope", question: "Name?", viaRelease: false });
    tracker.tasks.get("t1")!.status = "refinement";
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
    const order = readFileSync(join(ordersDir, orders()[0]), "utf8");
    expect(order).toContain("Answer from Jack");
    expect(order).toContain("call it Forge");
  });
});

describe("the refine lane: when it runs", () => {
  it("no refine claim while the breaker is open", async () => {
    recordRelease(dir, { ticket: "DGS-1", result: "failed" }, now);
    recordRelease(dir, { ticket: "DGS-2", result: "failed" }, now);
    addRefine("t1");
    expect((await runScan(mk())).outcome).toBe("breaker");
    expect(readRefineLock(dir)).toBeNull();
    expect(prompts).toEqual([]);
  });
  it("no refine claim on bad guardrails", async () => {
    addRefine("t1");
    const r = await runScan(mk({ guard: { guardrailProblems: () => ["bad"], alreadyDone: () => null } }));
    expect(r.outcome).toBe("guardrail-config");
    expect(readRefineLock(dir)).toBeNull();
  });
  it("no refine claim on a bad conductors.json (conductor-config)", async () => {
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1 } }));
    addRefine("t1");
    expect((await runScan(mk())).outcome).toBe("conductor-config");
    expect(readRefineLock(dir)).toBeNull();
  });
  it("a refine claim IS made while the build lock is held", async () => {
    acquireLock(dir, { ticket: "DGS-9", taskId: "t9", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "x" });
    addRefine("t1");
    const r = await runScan(mk());
    expect(r.outcome).toBe("busy");
    expect(readLock(dir)?.ticket).toBe("DGS-9");
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
  });
  it("a refine claim IS made while the builder limit is full", async () => {
    addRefine("t1");
    tracker.add({ id: "t2", key: "DGS-2" });
    const r = await runScan(mk({ builderFull: () => "builders full" }));
    expect(r.outcome).toBe("busy");
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
  });
  it("the build result is unchanged by the lane; a lane exception is logged as refine-failed", async () => {
    tracker.add({ id: "t2", key: "DGS-2" });
    const orig = tracker.listByStatus.bind(tracker);
    tracker.listByStatus = async (n) => { if (n === "refinement") throw new Error("clickup down"); return orig(n); };
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-2" });
    expect(events().find((e) => e.kind === "refine-failed")).toMatchObject({ error: "clickup down" });
  });
  it("does not claim when refine-lock.json exists, or when the role slot is full", async () => {
    addRefine("t1");
    acquireRefineLock(dir, { ticket: "DGS-7", taskId: "t7", claimedAt: now.toISOString(), claimedAtUtc7: "x", order: "o", scanId: "s", attempt: 1, round: 1 });
    tracker.add({ id: "t7", key: "DGS-7", status: "refinement" });
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-7" });
    expect(prompts).toEqual([]);
    rmSync(join(dir, "refine-lock.json"));
    roleFullText = "role slot full";
    await runScan(mk());
    expect(readRefineLock(dir)).toBeNull();
    expect(prompts).toEqual([]);
  });
  it("a corrupt refine lock keeps the lane busy", async () => {
    addRefine("t1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "refine-lock.json"), "{nope");
    await runScan(mk());
    expect(prompts).toEqual([]);
  });
  it("a stale refine lock (its ticket is no longer in refinement) is cleared with event refine-release", async () => {
    tracker.add({ id: "t7", key: "DGS-7", status: "to do" });
    acquireRefineLock(dir, { ticket: "DGS-7", taskId: "t7", claimedAt: now.toISOString(), claimedAtUtc7: "x", order: "o", scanId: "s", attempt: 1, round: 1 });
    await runScan(mk());
    expect(readRefineLock(dir)).toBeNull();
    expect(events().find((e) => e.kind === "refine-release")).toMatchObject({ ticket: "DGS-7", reason: "stale" });
  });
  it("F1: a lock kept after a refused gate is cleared when the ticket comes back from concept, and the lane claims again", async () => {
    addRefine("t1");
    acquireRefineLock(dir, { ticket: "DGS-1", taskId: "t1", claimedAt: now.toISOString(), claimedAtUtc7: "x", order: "o", scanId: "s", attempt: 1, round: 1 });
    await escalate({ dir, now: () => now, tracker, status: fakeStatus(tracker) }, { ticket: "DGS-1", taskId: "t1", id: "change-authority", question: "Approve director/x.ts?", viaRelease: false });
    tracker.tasks.get("t1")!.status = "refinement";   // Jack answered and moved it back before the next scan
    await runScan(mk());
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1", scanId: "scan-1" });
    expect(prompts).toHaveLength(1);
    expect(events().filter((e) => e.kind === "refine-release").some((e) => e.reason === "stale")).toBe(true);
  });
  it("a failed prompt clears the lock, removes its order and appends claim-failed", async () => {
    addRefine("t1");
    promptFails = true;
    await runScan(mk());
    expect(readRefineLock(dir)).toBeNull();
    expect(orders()).toEqual([]);
    expect(events().find((e) => e.kind === "claim-failed")).toMatchObject({ ticket: "DGS-1", error: "prompt down" });
    promptFails = false;
    await runScan(mk());   // retried on the next scan
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
  });
});

describe("the refine lane: status and dry run", () => {
  it("status 'refinement' missing: attention item, no refine claim; a clean read closes it", async () => {
    tracker.statuses.delete("refinement");
    addRefine("t1");
    await runScan(mk());
    expect(readRefineLock(dir)).toBeNull();
    expect(readOpen(dir).filter((i) => i.cause === "refine-status-missing")).toHaveLength(1);
    await runScan(mk());
    expect(readOpen(dir).filter((i) => i.cause === "refine-status-missing")).toHaveLength(1);
    tracker.statuses.add("refinement");
    await runScan(mk());
    expect(readOpen(dir).filter((i) => i.cause === "refine-status-missing")).toHaveLength(0);
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-1" });
  });
  it("a dry run lists refine verdicts and writes nothing", async () => {
    addRefine("t1");
    addRefine("t2", { text: "nope" });
    const r = await runScan(mk({ dryRun: true }));
    expect(r.verdicts).toEqual(expect.arrayContaining([{ key: "DGS-1", reasons: [] }, { key: "DGS-2", reasons: ["no Done when line in the ticket description"] }]));
    expect(readRefineLock(dir)).toBeNull();
    expect(orders()).toEqual([]);
    expect(prompts).toEqual([]);
    expect(setStatuses()).toEqual([]);
    expect(tracker.comments).toEqual([]);
  });
});

describe("the wake", () => {
  it("the wake runs once per scan on every outcome and its failure changes nothing", async () => {
    let n = 0;
    const base = await runScan(mk());
    expect(n).toBe(0);
    await runScan(mk({ wake: async () => { n++; } }));
    expect(n).toBe(1);
    tracker.add({ id: "t2", key: "DGS-2" });
    const r = await runScan(mk({ wake: async () => { n++; throw new Error("herdr down") } }));
    expect(n).toBe(2);
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-2" });
    expect(base.outcome).toBe("none");
  });
  it("the wake also runs on a safety stop (breaker) and never on a dry run", async () => {
    let n = 0;
    recordRelease(dir, { ticket: "DGS-1", result: "failed" }, now);
    recordRelease(dir, { ticket: "DGS-2", result: "failed" }, now);
    expect((await runScan(mk({ wake: async () => { n++; } }))).outcome).toBe("breaker");
    expect(n).toBe(1);
    await runScan(mk({ dryRun: true, wake: async () => { n++; } }));
    expect(n).toBe(1);
  });
});
