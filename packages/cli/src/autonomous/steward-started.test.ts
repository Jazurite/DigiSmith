import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendStarted, startViaSteward } from "./steward-started.ts";
import { readStewardProfile } from "../steward/profile.ts";
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

describe("startViaSteward", () => {
  it("skips an empty ticket without building deps", async () => {
    const make = vi.fn();
    await startViaSteward("", "/repo", make, () => {});
    expect(make).not.toHaveBeenCalled();
  });
  it("builds the deps from the tick's repo, quiet, and sends started", async () => {
    const t = new FakeTracker(snapshot("claimed"));
    const make = vi.fn((_o: { quiet?: boolean; cwd?: string }) => deps(t));
    const lines: string[] = [];
    await startViaSteward("DGS-1", "/the/tick/repo", make, (l) => lines.push(l));
    expect(make).toHaveBeenCalledWith({ quiet: true, cwd: "/the/tick/repo" });
    expect(t.ticket.status).toBe("in progress");
    expect(lines).toEqual([]);
  });
  it("prints one warning when the repo has no tracker, and goes on", async () => {
    const lines: string[] = [];
    await startViaSteward("DGS-1", "/the/tick/repo", () => deps(null), (l) => lines.push(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/no ClickUp tracker/);
    expect(lines[0]).toContain("/the/tick/repo");
  });
  it("prints a refusal line", async () => {
    const lines: string[] = [];
    await startViaSteward("DGS-1", "/r", () => deps(new FakeTracker(snapshot("refinement"))), (l) => lines.push(l));
    expect(lines.join("\n")).toMatch(/refused started/);
  });
  it("a repo without .digismith/config.yml reads as no tracker and does not throw", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "stnoconf-"));
    expect(readStewardProfile(cwd).tracker).toBe("none");
  });
});
