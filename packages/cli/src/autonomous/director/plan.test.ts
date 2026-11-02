import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "../act.ts";
import type { OpenItem } from "../attention.ts";
import { readJournal } from "../journal.ts";
import type { TicketState } from "../phase-types.ts";
import { planLoop, type PlanWorld } from "./plan.ts";
import type { RefineLock } from "./refine.ts";
import { movesFor } from "./unblock.ts";

const NOW = new Date("2026-11-03T03:00:00.000Z");
const ago = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString();
const world = (over: Partial<PlanWorld> = {}): PlanWorld => ({
  items: [], history: { decisions: [], journal: [] }, lockTicket: "DGS-1", refineLock: null, pendingComments: 0, now: NOW,
  roleOf: (run) => (run.startsWith("w") ? "other" : "builder"), ...over,
});
const item = (over: Partial<OpenItem> = {}): OpenItem => ({ id: "r1.stalled.0", ts: ago(50), ticket: "DGS-1", run: "r1", kind: "stalled", cause: "silent-working-180-min", since: ago(50), ...over });
const lock = (min: number): RefineLock => ({ ticket: "DGS-2", taskId: "t2", claimedAt: ago(min), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 });

describe("planLoop", () => {
  it("no open items, no stuck lock and no pending comments: no moves", () => {
    const p = planLoop(world());
    expect(p).toEqual({ moves: [], shown: [], wake: false, hash: "" });
  });
  it("one move per open item, oldest first, from movesFor; the stuck refine lock adds stuckLockMove", () => {
    const newer = item({ id: "r2.stalled.0", run: "r2", since: ago(10) });
    const older = item({ id: "r1.stalled.0", run: "r1", since: ago(100) });
    const p = planLoop(world({ items: [newer, older] }));
    expect(p.moves.map((m) => m.kind)).toEqual(["reprompt", "reprompt"]);
    expect(p.moves.map((m) => (m as { run: string }).run)).toEqual(["r1", "r2"]);
    expect(p.moves[0]).toEqual(movesFor(older, world().history, { lockTicket: "DGS-1", refineTicket: null, now: NOW, roleOf: world().roleOf }));
    const q = planLoop(world({ items: [older], refineLock: lock(400) }));
    expect(q.moves.map((m) => m.kind)).toEqual(["refine-release", "reprompt"]);
    expect(planLoop(world({ refineLock: lock(100) })).moves).toEqual([]);
  });
  it("list-only items are shown but never wake the Director; a wait (none) is not shown", () => {
    const listOnly = item({ ticket: "DGS-9" });
    const waiting = item({ id: "x", run: "r5", kind: "lost", cause: "pane-gone", retryEligible: true });
    const p = planLoop(world({ items: [listOnly, waiting] }));
    expect(p.shown.map((m) => m.kind)).toEqual(["list-only"]);
    expect(p.moves).toEqual([]);
    expect(p.wake).toBe(false);
    expect(p.hash).toBe("");
  });
  it("the same world gives the same plan, the same hash and the same move ids; plan records nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "director-"));
    try {
      const w = world({ items: [item()] });
      const a = planLoop(w);
      const b = planLoop(w);
      expect(a).toEqual(b);
      expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(a.wake).toBe(true);
      expect(readdirSync(dir)).toEqual([]);
      expect(planLoop(world({ items: [item({ run: "r9", id: "r9.stalled.0" })] })).hash).not.toBe(a.hash);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("two items that give the same move are listed once (ids dedupe)", () => {
    const a = item({ id: "a.0", run: "r1", kind: "failed", cause: "classifier-block" });
    const b = item({ id: "a.1", run: "r1", kind: "failed", cause: "classifier-block" });
    expect(planLoop(world({ items: [a, b] })).moves).toHaveLength(1);
  });
  it("F1: a gate-wait with a done line is dropped from moves (shown list-only) and does not wake; before it is done it wakes", () => {
    const refused = item({ id: "DGS-1.refused.0", run: "DGS-1", ticket: "DGS-1", kind: "refused", cause: "merge-refused: protected path", since: ago(40) });
    const noRole = { roleOf: () => null };
    const first = planLoop(world({ items: [refused], ...noRole }));
    expect(first.moves.map((m) => m.kind)).toEqual(["gate-wait"]);
    expect(first.wake).toBe(true);
    const id = first.moves[0].id;
    const done = { ts: ago(5), tsUtc7: "", ticket: "DGS-1", run: id, id: "record-decision", side: "within" as const, what: "w", why: "y", by: "director" as const, move: id, outcome: "done" as const };
    const again = planLoop(world({ items: [refused], history: { decisions: [done], journal: [] }, ...noRole }));
    expect(again.moves).toEqual([]);
    expect(again.wake).toBe(false);
    expect(again.hash).toBe("");
    expect(again.shown).toMatchObject([{ kind: "list-only" }]);
    // a failed line does not count as done
    const failed = { ...done, outcome: "failed" as const };
    expect(planLoop(world({ items: [refused], history: { decisions: [done, failed], journal: [] }, ...noRole })).moves.map((m) => m.kind)).toEqual(["gate-wait"]);
  });
  it("F5: a done id of the first stuck lock does not hide the second stuck lock of the same ticket", () => {
    const first = planLoop(world({ lockTicket: null, refineLock: lock(500) }));
    expect(first.moves.map((m) => m.kind)).toEqual(["refine-release"]);
    const id = first.moves[0].id;
    const done = { ts: ago(5), tsUtc7: "", ticket: "DGS-2", run: id, id: "release-stopped", side: "within" as const, what: "w", why: "y", by: "director" as const, move: id, outcome: "done" as const };
    const hist = { decisions: [done], journal: [] };
    // the same lock again: finished, no wake
    expect(planLoop(world({ lockTicket: null, refineLock: lock(500), history: hist })).wake).toBe(false);
    // a new lock of the same ticket, stuck again later: a new move, actionable, wakes
    const second = planLoop(world({ lockTicket: null, refineLock: lock(400), history: hist }));
    expect(second.moves.map((m) => m.kind)).toEqual(["refine-release"]);
    expect(second.moves[0].id).not.toBe(id);
    expect(second.wake).toBe(true);
  });
  it("pending comments alone do not wake the Director", () => {
    expect(planLoop(world({ pendingComments: 3 })).wake).toBe(false);
  });
});

describe("carried from the T4 review: real tick retry journal lines carry detail.run and detail.item", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "director-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  it("act() writes the retry line with detail.item and detail.run, and the unblock table reads it", async () => {
    const state: TicketState = { ticket: "DGS-1", claimedAt: "2026-11-03T00:00:00.000Z", phase: "building", phaseStartedAt: "x", attempt: 1, runs: { builder: "builder-1" } };
    await act({ dir, now: () => new Date(NOW.getTime() - 40 * 60_000), prompt: async () => {}, writeMarker: async () => {}, setStatus: async () => {} }, state, { kind: "retry", item: "builder-1.lost.0", run: "builder-1" });
    const line = readJournal(dir).find((l) => l.status === "planned" && l.action === "retry");
    expect(line?.detail).toEqual({ item: "builder-1.lost.0", run: "builder-1" });
    const lost = item({ id: "builder-1.lost.0", run: "builder-1", kind: "lost", cause: "pane-gone", retryEligible: true, since: ago(300) });
    const m = movesFor(lost, { decisions: [], journal: readJournal(dir) }, { lockTicket: "DGS-1", refineTicket: null, now: NOW, roleOf: () => "builder" });
    expect(m.kind).toBe("release");   // the tick retried 40 minutes ago and the item is still open
  });
});
