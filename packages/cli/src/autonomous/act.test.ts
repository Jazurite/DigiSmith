import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, orderText, ORDER_TEXTS, PromptError, type ActDeps } from "./act.ts";
import { readPhaseState } from "./phase-state.ts";
import { resultsOf, readJournal } from "./journal.ts";
import { writeLock } from "./fakes.test-util.ts";
import type { TicketState } from "./phase-types.ts";

const T = new Date("2026-10-21T04:00:00.000Z");
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "nw-act-")); writeLock(d, { phase: "merge-ready", runs: { builder: "builder-1" } }); return d; };
const state = (o: Partial<TicketState> = {}): TicketState => ({ ticket: "DGS-1", claimedAt: "2026-10-21T00:00:00.000Z", phase: "merge-ready", phaseStartedAt: "x", attempt: 1, runs: { builder: "builder-1" }, ...o });
const deps = (dir: string, o: Partial<ActDeps> = {}): ActDeps & { sent: string[] } => {
  const sent: string[] = [];
  return { dir, now: () => T, prompt: async (t) => { sent.push(t); }, writeMarker: async () => {}, setStatus: async () => {}, sent, ...o };
};

describe("orderText", () => {
  it("is a fixed template with the key and nothing else", () => {
    expect(orderText("merge", "DGS-1", 1)).toBe("DGS-1: merge per hooks 01-03, then release merged");
    expect(orderText("restart", "DGS-1", 1)).toBe("DGS-1: restart the builder, its pane is gone");
  });
  it("F12: has exactly the merge and restart forms; fix is refused", () => {
    expect(Object.keys(ORDER_TEXTS).sort()).toEqual(["merge", "restart"]);
    // @ts-expect-error "fix" is not an order any more
    expect(() => orderText("fix", "DGS-1", 2)).toThrow(/unknown order/);
  });
  it("refuses a key that is not a ticket key", () => {
    expect(() => orderText("merge", "DGS-1; rm -rf /", 1)).toThrow(/ticket key/);
  });
});

describe("act move to merge-ready", () => {
  it("F7: records mergeHead in lock.json", async () => {
    const d = tmp(); writeLock(d, { phase: "review", runs: { builder: "builder-1" } });
    await act(deps(d), state({ phase: "review" }), { kind: "move", to: "merge-ready", proof: "p", head: "aaaaaaa1" });
    expect(JSON.parse(readFileSync(join(d, "lock.json"), "utf8"))).toMatchObject({ phase: "merge-ready", mergeHead: "aaaaaaa1" });
  });
});

describe("act", () => {
  it("an order: planned, sent once, settled succeeded", async () => {
    const d = tmp(); const x = deps(d);
    await act(x, state(), { kind: "order", order: "merge", head: "aaaaaaa1" });
    expect(x.sent).toEqual(["DGS-1: merge per hooks 01-03, then release merged"]);
    expect(resultsOf(d)["DGS-1:merge-ready:1:order-merge"]).toBe("succeeded");
    expect(readJournal(d).map((l) => l.status)).toEqual(["planned", "settled"]);
  });
  it("the planned line is on disk before the prompt runs", async () => {
    const d = tmp(); let seen: string | undefined;
    const x = deps(d, { prompt: async () => { seen = resultsOf(d)["DGS-1:merge-ready:1:order-merge"]; } });
    await act(x, state(), { kind: "order", order: "merge", head: "a" });
    expect(seen).toBe("open");
  });
  it("a prompt that did not go out is retryable; one that may have gone out is uncertain with a note", async () => {
    const d = tmp();
    await act(deps(d, { prompt: async () => { throw new PromptError("exit 1", "no"); } }), state(), { kind: "order", order: "merge", head: "a" });
    expect(resultsOf(d)["DGS-1:merge-ready:1:order-merge"]).toBe("retryable");
    const d2 = tmp();
    await act(deps(d2, { prompt: async () => { throw new Error("timeout"); } }), state(), { kind: "order", order: "merge", head: "a" });
    expect(resultsOf(d2)["DGS-1:merge-ready:1:order-merge"]).toBe("uncertain");
    expect(readFileSync(join(d2, "attention.jsonl"), "utf8")).toContain("journal-uncertain-order-merge");
  });
  it("a move rewrites the lock and settles", async () => {
    const d = tmp(); writeLock(d, { phase: "claimed" });
    await act(deps(d), state({ phase: "claimed", runs: { builder: null } }), { kind: "move", to: "building", proof: "p", builder: "builder-7" });
    const r = readPhaseState(d);
    expect(r.kind === "ok" && [r.state.phase, r.state.runs.builder, r.state.phaseStartedAt]).toEqual(["building", "builder-7", T.toISOString()]);
    expect(resultsOf(d)["DGS-1:claimed:1:move-to-building"]).toBe("succeeded");
  });
  it("a marker calls writeMarker with the run and phase", async () => {
    const d = tmp(); const calls: [string, string][] = [];
    await act(deps(d, { writeMarker: async (r, p) => { calls.push([r, p]); } }), state(), { kind: "marker", phase: "merge", run: "builder-1" });
    expect(calls).toEqual([["builder-1", "merge"]]);
    expect(resultsOf(d)["DGS-1:merge-ready:1:phase-marker"]).toBe("succeeded");
  });
  it("a status write is journaled and a throw is retryable", async () => {
    const d = tmp();
    await act(deps(d, { setStatus: async () => { throw new Error("401"); } }), state(), { kind: "status", status: "in progress" });
    expect(resultsOf(d)["DGS-1:merge-ready:1:status-write"]).toBe("retryable");
  });
  it("attention writes a note with the builder run id; wait writes nothing", async () => {
    const d = tmp();
    await act(deps(d), state(), { kind: "attention", cause: "obs-git-failed", attKind: "unknown" });
    expect(readFileSync(join(d, "attention.jsonl"), "utf8")).toContain("\"run\":\"builder-1\"");
    const d2 = tmp();
    await act(deps(d2), state(), { kind: "wait", reason: "x" });
    expect(() => readFileSync(join(d2, "journal.jsonl"))).toThrow();
  });

  // Extra cases added for the plan's review.
  it("a PromptError marked maybe settles uncertain with a note", async () => {
    const d = tmp();
    const r = await act(deps(d, { prompt: async () => { throw new PromptError("socket hang up", "maybe"); } }), state(), { kind: "order", order: "merge", head: "a" });
    expect(r.result).toBe("uncertain");
    expect(resultsOf(d)["DGS-1:merge-ready:1:order-merge"]).toBe("uncertain");
    expect(readFileSync(join(d, "attention.jsonl"), "utf8")).toContain("journal-uncertain-order-merge");
  });
  it("a move whose lock write fails settles retryable and does not throw", async () => {
    const d = mkdtempSync(join(tmpdir(), "nw-act-")); // no lock.json
    const r = await act(deps(d), state({ phase: "claimed", runs: { builder: null } }), { kind: "move", to: "building", proof: "p" });
    expect(r.result).toBe("retryable");
    expect(resultsOf(d)["DGS-1:claimed:1:move-to-building"]).toBe("retryable");
  });
  it("an order runs the prompt once per call, and never again while its key is open or uncertain", async () => {
    const d = tmp(); let n = 0;
    await act(deps(d, { prompt: async () => { n++; throw new PromptError("x", "no"); } }), state(), { kind: "order", order: "merge", head: "a" });
    expect(n).toBe(1);
    await act(deps(d, { prompt: async () => { n++; } }), state(), { kind: "order", order: "merge", head: "a" });
    expect(n).toBe(2);
    expect(readJournal(d).filter((l) => l.status === "planned").map((l) => l.try)).toEqual([1, 2]);
    const d2 = tmp(); let m = 0;
    await act(deps(d2, { prompt: async () => { m++; throw new Error("timeout"); } }), state(), { kind: "order", order: "merge", head: "a" });
    await expect(act(deps(d2, { prompt: async () => { m++; } }), state(), { kind: "order", order: "merge", head: "a" })).rejects.toThrow(/already used/);
    expect(m).toBe(1);
  });
  it("a retryable order that keeps failing ends permanent with a failed note", async () => {
    const d = tmp();
    const fail = () => deps(d, { prompt: async () => { throw new PromptError("exit 1", "no"); } });
    await act(fail(), state(), { kind: "order", order: "merge", head: "a" });
    await act(fail(), state(), { kind: "order", order: "merge", head: "a" });
    const r = await act(fail(), state(), { kind: "order", order: "merge", head: "a" });
    expect(r.result).toBe("permanent");
    expect(readFileSync(join(d, "attention.jsonl"), "utf8")).toContain("journal-permanent-order-merge");
  });
  it("the order text never contains the head", async () => {
    const d = tmp(); const x = deps(d);
    const head = "a\"b\\c\n$(rm -rf /)`x`";
    await act(x, state(), { kind: "order", order: "merge", head });
    expect(x.sent[0]).not.toContain(head);
    expect(x.sent[0]).not.toContain("rm -rf");
  });
  it("an order with an invalid ticket key is refused before the journal, with no prompt", async () => {
    const d = tmp(); const x = deps(d);
    const r = await act(x, state({ ticket: "DGS-1; rm -rf /" }), { kind: "order", order: "merge", head: "a" });
    expect(r.result).toBeNull();
    expect(x.sent).toEqual([]);
    expect(readJournal(d)).toEqual([]);
    expect(readFileSync(join(d, "attention.jsonl"), "utf8")).toContain("order-refused-bad-ticket-key");
  });
  it("the planned line for an order carries detail.head", async () => {
    const d = tmp();
    await act(deps(d), state(), { kind: "order", order: "merge", head: "abc1234" });
    const planned = readJournal(d).find((l) => l.status === "planned");
    expect(planned?.detail).toEqual({ head: "abc1234" });
  });
});
