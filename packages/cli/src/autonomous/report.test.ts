import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { buildReport, runReport } from "./report.ts";
import { appendEvent, readLastReport, writeLastReport } from "./state.ts";

const at = (iso: string) => new Date(iso);
const FROM = at("2026-10-20T10:00:00.000Z");
const TO = at("2026-10-20T20:00:00.000Z");

let dir: string;
let tracker: FakeTracker;

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "auto-report-")), "autonomous");
  mkdirSync(dir, { recursive: true });
  tracker = new FakeTracker();
});

const seed = () => {
  appendEvent(dir, at("2026-10-20T10:30:00Z"), "away-on");
  appendEvent(dir, at("2026-10-20T11:00:00Z"), "scan", { candidates: 3, skipped: 2, claimed: "DGS-1" });
  appendEvent(dir, at("2026-10-20T11:01:00Z"), "skip", { key: "DGS-9", reason: "no plan" });
  appendEvent(dir, at("2026-10-20T12:00:00Z"), "release", { ticket: "DGS-1", result: "merged", commit: "abc1234", minutes: 59 });
  appendEvent(dir, at("2026-10-20T13:00:00Z"), "scan", { candidates: 1, skipped: 0, claimed: "DGS-2" });
  appendEvent(dir, at("2026-10-20T14:00:00Z"), "release", { ticket: "DGS-2", result: "failed", reason: "tests red" });
  appendEvent(dir, at("2026-10-20T14:10:00Z"), "off");
  appendEvent(dir, at("2026-10-20T14:20:00Z"), "off");
  appendEvent(dir, at("2026-10-20T15:00:00Z"), "away-off");
};
const lockAt = (iso: string) => ({ ticket: "DGS-3", taskId: "t3", claimedAt: iso, claimedAtUtc7: "x", order: "o.md", scanId: "s" });
const read = (from: Date, to: Date) => {
  // helper: events from the temp dir
  return import("./state.ts").then((s) => s.readEvents(dir, from.getTime(), to.getTime()));
};

describe("buildReport", () => {
  it("renders every section with the right keys", async () => {
    seed();
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-4", result: "awaiting-jack", reason: "needs review" });
    const text = buildReport(FROM, TO, await read(FROM, TO), lockAt("2026-10-20T19:00:00Z"));
    expect(text).toContain("# Autonomous Operation report, 2026-10-20 17:00:00 to 2026-10-21 03:00:00 UTC+7");
    expect(text).toMatch(/Away:[\s\S]*2026-10-20 17:30:00 to 2026-10-20 22:00:00/);
    expect(text).toMatch(/Scans: 2/);
    expect(text).toMatch(/DGS-1[^\n]*abc1234[^\n]*59/);
    expect(text).toMatch(/Failed or stopped[\s\S]*DGS-2[^\n]*failed[^\n]*tests red/);
    expect(text).toMatch(/Waiting for Jack[\s\S]*DGS-4[^\n]*needs review/);
    expect(text).toMatch(/Skipped[\s\S]*DGS-9[^\n]*no plan/);
    expect(text).toMatch(/Still building[\s\S]*DGS-3/);
    expect(text).not.toContain("lock older than 8 h");
  });

  it("counts off events and does not list them", async () => {
    seed();
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text).toMatch(/2 off/);
    expect(text.match(/\boff\b/g)?.length).toBe(1);
  });

  it("renders an empty period as Scans: 0 and none sections", () => {
    const text = buildReport(FROM, TO, [], null);
    expect(text).toContain("Scans: 0");
    expect(text.match(/none/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("warns when the lock is older than 8 h", () => {
    const text = buildReport(FROM, TO, [], lockAt("2026-10-20T11:00:00Z"));
    expect(text).toContain("lock older than 8 h: release it with dg autonomous release --ticket DGS-3 --result stopped");
  });

  it("shows still away for an open away-on", async () => {
    appendEvent(dir, at("2026-10-20T10:30:00Z"), "away-on");
    expect(buildReport(FROM, TO, await read(FROM, TO), null)).toContain("still away");
  });

  it("pairs away-on with away-expired", async () => {
    appendEvent(dir, at("2026-10-20T10:30:00Z"), "away-on");
    appendEvent(dir, at("2026-10-20T12:30:00Z"), "away-expired");
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text).not.toContain("still away");
    expect(text).toContain("2026-10-20 19:30:00");
  });
});

describe("runReport", () => {
  it("covers only the time since the previous report", async () => {
    appendEvent(dir, at("2026-10-20T10:00:00Z"), "release", { ticket: "DGS-OLD", result: "merged", commit: "old", minutes: 1 });
    writeLastReport(dir, at("2026-10-20T11:00:00Z"));
    appendEvent(dir, at("2026-10-20T12:00:00Z"), "release", { ticket: "DGS-NEW", result: "merged", commit: "new", minutes: 2 });
    const r = await runReport({ tracker, dir, now: () => TO });
    const text = readFileSync(r.file, "utf-8");
    expect(text).toContain("DGS-NEW");
    expect(text).not.toContain("DGS-OLD");
    expect(readLastReport(dir)?.toISOString()).toBe(TO.toISOString());
    expect(r.commented).toBe(true);
    expect(tracker.comments).toEqual([{ ref: "DGS-548", text }]);
    expect(r.file).toBe(join(dir, "reports", "2026-10-21-0300.md"));
  });

  it("starts at the first event when there is no last-report.json", async () => {
    appendEvent(dir, at("2026-10-18T10:00:00Z"), "release", { ticket: "DGS-FIRST", result: "merged", commit: "c", minutes: 1 });
    appendEvent(dir, at("2026-10-19T10:00:00Z"), "scan", { candidates: 0, skipped: 0, claimed: null });
    const r = await runReport({ tracker, dir, now: () => TO });
    const text = readFileSync(r.file, "utf-8");
    expect(text).toContain("DGS-FIRST");
    expect(text).toContain("Scans: 1");
  });

  it("with no events at all, starts at now", async () => {
    const r = await runReport({ tracker, dir, now: () => TO });
    expect(readFileSync(r.file, "utf-8")).toContain("Scans: 0");
  });

  it("keeps the file and updates last-report.json when the comment fails", async () => {
    tracker.comment = async () => { throw new Error("boom"); };
    const r = await runReport({ tracker, dir, now: () => TO });
    expect(r.commented).toBe(false);
    expect(existsSync(r.file)).toBe(true);
    expect(readdirSync(join(dir, "reports")).every((f) => f.endsWith(".md"))).toBe(true);
    expect(readLastReport(dir)?.toISOString()).toBe(TO.toISOString());
  });
});
