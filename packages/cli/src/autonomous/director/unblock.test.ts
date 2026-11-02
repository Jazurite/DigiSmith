import { describe, expect, it } from "vitest";
import type { OpenItem } from "../attention.ts";
import type { AttentionKind } from "../attention-write.ts";
import { CAUSES } from "../causes.ts";
import type { JournalLine } from "../journal.ts";
import type { Decision } from "./record.ts";
import type { RefineLock } from "./refine.ts";
import { movesFor, retryRunKey, stuckLockMove, type History, type Move } from "./unblock.ts";

const NOW = new Date("2026-11-03T03:00:00.000Z");
const MIN = 60_000;
const ago = (m: number): string => new Date(NOW.getTime() - m * MIN).toISOString();
const ROLE: Record<string, string> = { "lock": "builder", "refine": "other" };
const ctx = (over: Partial<{ lockTicket: string | null; refineTicket: string | null; roleOf: (run: string) => string | null }> = {}) => ({
  lockTicket: "DGS-1", refineTicket: null as string | null, now: NOW,
  roleOf: (run: string): string | null => (run.startsWith("w") ? ROLE.refine : run.startsWith("rev") ? "reviewer" : ROLE.lock),
  ...over,
});
const hist = (over: Partial<History> = {}): History => ({ decisions: [], journal: [], ...over });
let n = 0;
const item = (over: Partial<OpenItem> = {}): OpenItem => ({ id: `r1.lost.${n++}`, ts: ago(50), ticket: "DGS-1", run: "r1", kind: "lost", cause: "pane-gone", since: ago(50), ...over });
const dec = (over: Partial<Decision>): Decision => ({ ts: ago(5), tsUtc7: "", ticket: "DGS-1", run: "r1", id: "reprompt-run", side: "within", what: "w", why: "y", by: "director", ...over });
const retryLine = (ticket: string, itemId: string, minutesAgo: number): JournalLine => ({ schema: "nightwatch-journal/v1", ts: ago(minutesAgo), key: `${ticket}:building:1:retry`, status: "planned", ticket, phase: "building", attempt: 1, action: "retry", try: 1, detail: { item: itemId, run: "r1" } });
const settled = (key: string, result: JournalLine["result"]): JournalLine => ({ schema: "nightwatch-journal/v1", ts: ago(1), key, status: "settled", result });
const kind = (m: Move): string => m.kind;

describe("lost builder", () => {
  it("pane-gone, retryEligible, no retry line in the journal: none (the tick restarts it)", () => {
    expect(kind(movesFor(item({ retryEligible: true }), hist(), ctx()))).toBe("none");
  });
  it("F1: a retry line of an EARLIER run does not count for a later run of the same ticket", () => {
    const old = retryLine("DGS-1", "r1.lost.old", 300);   // detail.run is r1 and the item is another
    const r2 = item({ run: "r2", retryEligible: true, since: ago(40) });
    expect(kind(movesFor(r2, hist({ journal: [old] }), ctx()))).toBe("none");   // the tick still restarts r2
    const failed = item({ run: "r2", kind: "failed", cause: "gateway-5xx" });
    expect(movesFor(failed, hist({ journal: [old] }), ctx())).toMatchObject({ kind: "retry-once", run: "r2" });
    // the line of the same run (by item id, or by run) does count
    expect(kind(movesFor(r2, hist({ journal: [retryLine("DGS-1", r2.id, 40)] }), ctx()))).toBe("release");
    expect(kind(movesFor(item({ run: "r1", retryEligible: true }), hist({ journal: [old] }), ctx()))).toBe("release");
  });
  it("F2: an unknown role fails closed (list-only), never a release; a Builder role on the refine ticket is list-only too", () => {
    const unknownRole = ctx({ roleOf: () => null });
    for (const k of ["lost", "stalled", "failed"] as AttentionKind[]) {
      expect(kind(movesFor(item({ kind: k, cause: k === "failed" ? "classifier-block" : "pane-gone", retryEligible: false, since: ago(100) }), hist(), unknownRole))).toBe("list-only");
    }
    expect(kind(movesFor(item({ ticket: "DGS-2", kind: "lost" }), hist(), ctx({ lockTicket: null, refineTicket: "DGS-2", roleOf: () => "builder" })))).toBe("list-only");
    expect(kind(movesFor(item({ kind: "failed", cause: "classifier-block" }), hist(), ctx({ roleOf: () => "reviewer" })))).toBe("list-only");
  });
  it("the tick's retry is in the journal and the item is still open 30 minutes later: release build stopped with escalate; at 29: none", () => {
    const it = item({ retryEligible: true });
    const m = movesFor(it, hist({ journal: [retryLine("DGS-1", it.id, 30)] }), ctx());
    expect(m).toMatchObject({ kind: "release", lane: "build", ticket: "DGS-1", result: "stopped" });
    expect((m as { escalate: { id: string; question: string } | null }).escalate?.question).toContain("r1");
    expect(kind(movesFor(it, hist({ journal: [retryLine("DGS-1", it.id, 29)] }), ctx()))).toBe("none");
  });
  it("a retry the journal settled as retryable was never delivered: it does not count", () => {
    const it = item({ retryEligible: true });
    const j = [retryLine("DGS-1", it.id, 90), settled("DGS-1:building:1:retry", "retryable")];
    expect(kind(movesFor(it, hist({ journal: j }), ctx()))).toBe("none");
  });
  it("a lost builder the tick will not restart (not retryEligible) is released after 30 minutes", () => {
    expect(kind(movesFor(item({ retryEligible: false, since: ago(31) }), hist(), ctx()))).toBe("release");
    expect(kind(movesFor(item({ retryEligible: false, since: ago(10) }), hist(), ctx()))).toBe("none");
  });
  it("a lost Reviewer, and any run of a ticket that is not the lock ticket: list-only", () => {
    expect(kind(movesFor(item({ run: "rev1" }), hist(), ctx({ roleOf: () => "reviewer" })))).toBe("list-only");
    expect(movesFor(item({ ticket: "DGS-7" }), hist(), ctx())).toMatchObject({ kind: "list-only" });
    expect(kind(movesFor(item({ ticket: "DGS-7", kind: "stalled", cause: "silent-working-180-min" }), hist(), ctx()))).toBe("list-only");
  });
});

describe("lost refine worker", () => {
  const rc = () => ctx({ lockTicket: null, refineTicket: "DGS-2" });
  it("first time: start-again; the same run again: none; a later loss: refine-release failed; then escalated", () => {
    const a = item({ ticket: "DGS-2", run: "w1" });
    expect(movesFor(a, hist(), rc())).toMatchObject({ kind: "start-again", ticket: "DGS-2", run: "w1" });
    const h1 = hist({ decisions: [dec({ ticket: "DGS-2", run: "w1", id: "restart-run" })] });
    expect(kind(movesFor(a, h1, rc()))).toBe("none");
    const b = item({ ticket: "DGS-2", run: "w2" });
    expect(movesFor(b, h1, rc())).toMatchObject({ kind: "refine-release", lane: "refine", result: "failed" });
    const h2 = hist({ decisions: [dec({ ticket: "DGS-2", run: "w1", id: "restart-run" }), dec({ ticket: "DGS-2", run: "w2", id: "restart-run" })] });
    const c = item({ ticket: "DGS-2", run: "w3" });
    expect(movesFor(c, h2, rc())).toMatchObject({ kind: "refine-release", lane: "refine", result: "escalated" });
  });
  it("a release move on a refine-lane ticket is a refine-release with lane refine, never the build release", () => {
    const m = movesFor(item({ ticket: "DGS-2", run: "w1", kind: "failed", cause: "classifier-block" }), hist(), rc());
    expect(m).toMatchObject({ kind: "refine-release", lane: "refine" });
    expect(movesFor(item({ kind: "failed", cause: "classifier-block" }), hist(), ctx())).toMatchObject({ kind: "release", lane: "build" });
  });
  it("a refine worker stalled: reprompt to self, then after 30 minutes treated as lost", () => {
    const s = item({ ticket: "DGS-2", run: "w1", kind: "stalled", cause: "silent-working-180-min" });
    expect(movesFor(s, hist(), rc())).toMatchObject({ kind: "reprompt", to: "self", run: "w1" });
    expect(kind(movesFor(s, hist({ decisions: [dec({ ticket: "DGS-2", run: "w1", ts: ago(31) })] }), rc()))).toBe("start-again");
    expect(kind(movesFor(s, hist({ decisions: [dec({ ticket: "DGS-2", run: "w1", ts: ago(29) })] }), rc()))).toBe("none");
  });
});

describe("stalled builder", () => {
  const s = (cause = "silent-working-180-min") => item({ kind: "stalled", cause });
  it("silent-working-180-min without a reprompt decision for this run: reprompt, to driver", () => {
    expect(movesFor(s(), hist(), ctx())).toMatchObject({ kind: "reprompt", ticket: "DGS-1", run: "r1", to: "driver" });
    expect(movesFor(s("building-over-180-min"), hist(), ctx())).toMatchObject({ kind: "reprompt", to: "driver" });
  });
  it("with a reprompt decision for the same run 31 minutes ago: treated as lost (release); 29 minutes: none", () => {
    expect(movesFor(s(), hist({ decisions: [dec({ ts: ago(31) })] }), ctx())).toMatchObject({ kind: "release", lane: "build" });
    expect(kind(movesFor(s(), hist({ decisions: [dec({ ts: ago(29) })] }), ctx()))).toBe("none");
  });
  it("waiting-240-min: reprompt via the driver; 30 minutes later release stopped", () => {
    expect(movesFor(s("waiting-240-min"), hist(), ctx())).toMatchObject({ kind: "reprompt", to: "driver" });
    expect(movesFor(s("waiting-240-min"), hist({ decisions: [dec({ ts: ago(30) })] }), ctx())).toMatchObject({ kind: "release", result: "stopped" });
  });
  it("history is keyed on ticket + run + id: a reprompt for run A does not suppress a move for run B of the same ticket", () => {
    const b = item({ kind: "stalled", cause: "silent-working-180-min", run: "r2" });
    expect(movesFor(b, hist({ decisions: [dec({ run: "r1", ts: ago(90) })] }), ctx())).toMatchObject({ kind: "reprompt", run: "r2" });
  });
});

describe("blocked, failed, refused, others", () => {
  it("blocked (permission prompt and pane-blocked): list-only; no question on the ticket", () => {
    for (const cause of ["waiting-for-answer", "pane-blocked"]) {
      const m = movesFor(item({ kind: "blocked", cause }), hist(), ctx());
      expect(m).toMatchObject({ kind: "list-only" });
    }
  });
  it("failed transient: none if the tick retried, else retry-once via the driver; retry used: release stopped + escalate", () => {
    const f = item({ kind: "failed", cause: "gateway-5xx" });
    expect(movesFor(f, hist(), ctx())).toMatchObject({ kind: "retry-once", to: "driver", run: "r1" });
    expect(kind(movesFor(f, hist({ journal: [retryLine("DGS-1", f.id, 5)] }), ctx()))).toBe("none");
    const used = hist({ decisions: [dec({ run: retryRunKey("r1"), ts: ago(31) })] });
    expect(kind(movesFor(f, hist({ decisions: [dec({ run: retryRunKey("r1"), ts: ago(5) })] }), ctx()))).toBe("none");   // the retry has had no time yet
    expect(movesFor(f, used, ctx())).toMatchObject({ kind: "release", result: "stopped", escalate: expect.objectContaining({ question: expect.stringContaining("gateway-5xx") }) });
  });
  it("failed durable (every durable cause in CAUSES): release stopped + escalate with the cause text", () => {
    const durable = Object.entries(CAUSES).filter(([, c]) => c === "durable").map(([k]) => k);
    expect(durable.length).toBeGreaterThan(3);
    for (const cause of durable) {
      const m = movesFor(item({ kind: "failed", cause }), hist(), ctx());
      expect(m).toMatchObject({ kind: "release", lane: "build", result: "stopped" });
      expect((m as { escalate: { question: string } }).escalate.question).toContain(cause);
    }
  });
  it("failed with cause class unknown: list-only with the reason 'cause class unknown'", () => {
    expect(movesFor(item({ kind: "failed", cause: "unknown" }), hist(), ctx())).toMatchObject({ kind: "list-only", why: "cause class unknown" });
    expect(movesFor(item({ kind: "failed", cause: "something-new" }), hist(), ctx())).toMatchObject({ kind: "list-only", why: "cause class unknown" });
    expect(movesFor(item({ kind: "failed", cause: "something-new", causeClass: "durable" }), hist(), ctx())).toMatchObject({ kind: "release" });
  });
  it("the other kinds with cause 'unknown' follow their own rows (spec 7 applies 'unknown' to failed items; pane-gone and the stalled causes are not in CAUSES)", () => {
    expect(movesFor(item({ kind: "lost", cause: "unknown", retryEligible: true }), hist(), ctx())).toMatchObject({ kind: "none" });
    expect(movesFor(item({ kind: "stalled", cause: "unknown" }), hist(), ctx())).toMatchObject({ kind: "reprompt" });
    expect(movesFor(item({ kind: "refused", cause: "unknown" }), hist(), ctx())).toMatchObject({ kind: "list-only", why: "refused for another cause" });
    expect(movesFor(item({ kind: "blocked", cause: "unknown" }), hist(), ctx())).toMatchObject({ kind: "list-only" });
  });
  it("refused merge-refused: list-only; gate-wait after 30 minutes", () => {
    expect(movesFor(item({ kind: "refused", cause: "merge-refused: protected path", since: ago(10) }), hist(), ctx())).toMatchObject({ kind: "list-only" });
    expect(movesFor(item({ kind: "refused", cause: "merge-refused: protected path", since: ago(31) }), hist(), ctx())).toMatchObject({ kind: "gate-wait", ticket: "DGS-1", ageMin: 31 });
  });
  it("breaker item: list-only; item with no ticket: list-only", () => {
    expect(movesFor(item({ run: "breaker", ticket: null, kind: "unknown", cause: "x" }), hist(), ctx())).toMatchObject({ kind: "list-only" });
    expect(movesFor(item({ ticket: null }), hist(), ctx())).toMatchObject({ kind: "list-only" });
    expect(movesFor(item({ ticket: "DGS-1", run: "breaker", kind: "failed", cause: "gateway-5xx" }), hist(), ctx())).toMatchObject({ kind: "list-only" });
  });
});

describe("the stuck refine lock", () => {
  const lock = (min: number): RefineLock => ({ ticket: "DGS-2", taskId: "t2", claimedAt: ago(min), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 });
  it("older than 360 minutes: refine-release escalated; younger or none: null", () => {
    expect(stuckLockMove(lock(361), NOW)).toMatchObject({ kind: "refine-release", lane: "refine", ticket: "DGS-2", result: "escalated" });
    expect(stuckLockMove(lock(359), NOW)).toBeNull();
    expect(stuckLockMove(null, NOW)).toBeNull();
  });
});

describe("ids and the property", () => {
  it("movesFor is idempotent; every move has a stable id m-<sha1(kind|ticket|run)[:8]>", () => {
    const it = item({ kind: "stalled", cause: "silent-working-180-min" });
    const a = movesFor(it, hist(), ctx());
    const b = movesFor(it, hist(), ctx());
    expect(a).toEqual(b);
    expect(a.id).toMatch(/^m-[0-9a-f]{8}$/);
    expect(movesFor(item({ kind: "stalled", cause: "silent-working-180-min", run: "r9" }), hist(), ctx()).id).not.toBe(a.id);
  });
  it("F3: releases of different runs, and failed vs escalated refine-releases, have different ids; a repeat of the same move has the same id", () => {
    const a = movesFor(item({ run: "r1", kind: "failed", cause: "classifier-block" }), hist(), ctx());
    const b = movesFor(item({ run: "r2", kind: "failed", cause: "classifier-block" }), hist(), ctx());
    expect(a.id).not.toBe(b.id);
    expect(movesFor(item({ run: "r1", kind: "failed", cause: "classifier-block" }), hist(), ctx()).id).toBe(a.id);
    const rc = ctx({ lockTicket: null, refineTicket: "DGS-2" });
    const failed = movesFor(item({ ticket: "DGS-2", run: "w2" }), hist({ decisions: [dec({ ticket: "DGS-2", run: "w1", id: "restart-run" })] }), rc);
    const escalated = movesFor(item({ ticket: "DGS-2", run: "w2" }), hist({ decisions: [dec({ ticket: "DGS-2", run: "w1", id: "restart-run" }), dec({ ticket: "DGS-2", run: "w9", id: "restart-run" })] }), rc);
    expect(failed).toMatchObject({ result: "failed" });
    expect(escalated).toMatchObject({ result: "escalated" });
    expect(failed.id).not.toBe(escalated.id);
    const g1 = movesFor(item({ kind: "refused", cause: "merge-refused: protected path", since: ago(31), run: "r1" }), hist(), ctx());
    const g2 = movesFor(item({ kind: "refused", cause: "merge-refused: protected path", since: ago(31), run: "r2" }), hist(), ctx());
    expect(g1.id).not.toBe(g2.id);
  });
  it("over every cause and every attention kind no build-lane release has a result other than stopped, and no move answers a prompt or closes the breaker", () => {
    const kinds: AttentionKind[] = ["blocked", "stalled", "lost", "refused", "failed", "unknown"];
    const causes = [...Object.keys(CAUSES), "waiting-for-answer", "pane-blocked", "pane-gone", "silent-working-180-min", "waiting-240-min", "building-over-180-min", "merge-refused: protected path", "weird"];
    const histories = [hist(), hist({ decisions: [dec({ ts: ago(90) }), dec({ ts: ago(90), run: retryRunKey("r1") })] })];
    for (const k of kinds) for (const cause of causes) for (const h of histories) for (const since of [ago(5), ago(100)]) {
      for (const c of [ctx(), ctx({ lockTicket: null, refineTicket: "DGS-1" })]) {
        const m = movesFor(item({ kind: k, cause, since, retryEligible: true }), h, c);
        if (m.kind === "release") expect(m.result).toBe("stopped");
        expect(["answer-prompt", "close-breaker"]).not.toContain(m.kind);
      }
    }
  });
});
