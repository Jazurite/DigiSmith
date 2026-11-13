import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventDeps } from "../../steward/event.ts";
import { FakeTracker, snapshot } from "../../steward/fake-tracker.test-util.ts";
import { stewardStatus } from "./status.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "director-status-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const deps = (t: FakeTracker | null): EventDeps => ({
  tracker: t, dir, now: () => new Date("2026-11-13T03:00:00Z"), config: { releaseStage: false },
  lock: { waitMs: 100, staleMs: 60_000, pollMs: 10 }, sessionIds: () => [],
});

describe("stewardStatus: the Director's status moves go through the Steward", () => {
  it("returned moves refinement to concept", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const r = await stewardStatus(() => deps(t)).send("DGS-1", { event: "returned", by: "director" });
    expect(r.ok).toBe(true);
    expect(t.ticket).toMatchObject({ status: "concept" });
  });
  it("approved --into to do moves refinement to to do with the quote", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const r = await stewardStatus(() => deps(t)).send("DGS-1", { event: "approved", by: "director", quote: "Director refinement gate: clean" });
    expect(r.ok).toBe(true);
    expect(t.ticket).toMatchObject({ status: "to do" });
  });
  it("a refusal by the Steward is reported, never thrown, and writes no status", async () => {
    const t = new FakeTracker(snapshot("in progress", { startDate: "2026-11-01" }));
    const r = await stewardStatus(() => deps(t)).send("DGS-1", { event: "returned", by: "director" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/refused returned/);
    expect(t.calls.filter((c) => c.startsWith("status:"))).toEqual([]);
  });
  it("a repeat from concept is ok and writes nothing", async () => {
    const t = new FakeTracker(snapshot("concept"));
    const r = await stewardStatus(() => deps(t)).send("DGS-1", { event: "returned", by: "director" });
    expect(r.ok).toBe(true);
    expect(t.calls.filter((c) => c.startsWith("status:"))).toEqual([]);
  });
  it("no tracker: not ok, one line, no throw", async () => {
    const r = await stewardStatus(() => deps(null)).send("DGS-1", { event: "returned", by: "director" });
    expect(r).toEqual({ ok: false, text: "no ClickUp tracker: the Steward cannot move DGS-1" });
  });
  it("a deps factory that throws is reported, not thrown", async () => {
    const r = await stewardStatus(() => { throw new Error("profile unreadable"); }).send("DGS-1", { event: "returned", by: "director" });
    expect(r).toEqual({ ok: false, text: "steward: profile unreadable" });
  });
  it("a write that fails stays pending and is reported as not ok", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    t.failWrites = 1;
    const r = await stewardStatus(() => deps(t)).send("DGS-1", { event: "returned", by: "director" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/could not move to concept/);
  });
});
