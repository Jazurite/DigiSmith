import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendStarted } from "./steward-started.ts";
import type { EventDeps } from "../steward/event.ts";
import { FakeTracker, snapshot } from "../steward/fake-tracker.test-util.ts";

function deps(t: FakeTracker | null): EventDeps {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fst-"));
  return { tracker: t, dir, now: () => new Date("2026-11-12T05:00:00Z"), config: { releaseStage: false }, sessionIds: () => [] };
}

describe("sendStarted", () => {
  it("moves a to do ticket to in progress", async () => {
    const t = new FakeTracker(snapshot("to do"));
    expect(await sendStarted(deps(t), "DGS-1")).toEqual([]);
    expect(t.ticket.status).toBe("in progress");
  });
  it("moves a claimed ticket to in progress", async () => {
    const t = new FakeTracker(snapshot("claimed"));
    await sendStarted(deps(t), "DGS-1");
    expect(t.ticket.status).toBe("in progress");
  });
  it("returns the refusal line and does not throw from the wrong status", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const warn = await sendStarted(deps(t), "DGS-1");
    expect(warn.join("\n")).toMatch(/refused started/);
  });
  it("returns a line instead of throwing when the tracker fails", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.getTicket = async () => { throw new Error("network down"); };
    expect((await sendStarted(deps(t), "DGS-1")).join("\n")).toMatch(/network down/);
  });
  it("does nothing without a tracker", async () => {
    expect(await sendStarted(deps(null), "DGS-1")).toEqual([]);
  });
});
