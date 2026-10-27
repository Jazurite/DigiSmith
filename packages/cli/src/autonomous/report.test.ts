import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { buildReport, runReport } from "./report.ts";
import type { Git } from "./gitx.ts";
import { appendEvent, readEvents, readLastReport, writeLastReport } from "./state.ts";

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
const read = async (from: Date, to: Date) => readEvents(dir, from.getTime(), to.getTime());

describe("buildReport", () => {
  it("renders every section with the right keys", async () => {
    seed();
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-4", result: "awaiting-jack", reason: "needs review" });
    const text = buildReport(FROM, TO, await read(FROM, TO), lockAt("2026-10-20T19:00:00Z"));
    expect(text).toContain("# Autonomous Operation report, 2026-10-20 17:00:00 to 2026-10-21 03:00:00 UTC+7");
    expect(text).toMatch(/Away:[\s\S]*2026-10-20 17:30:00 to 2026-10-20 22:00:00/);
    expect(text).toMatch(/Scans: 2/);
    expect(text).toMatch(/DGS-1[^\n]*abc1234[^\n]*59/);
    expect(text).toContain("DGS-1: commit abc1234, 59 min");
    expect(text).not.toContain("commit unknown");
    expect(text).toMatch(/Failed or stopped[\s\S]*DGS-2[^\n]*failed[^\n]*tests red/);
    expect(text).toMatch(/Waiting for Jack[\s\S]*DGS-4[^\n]*needs review/);
    expect(text).toMatch(/Skipped[\s\S]*DGS-9[^\n]*no plan/);
    expect(text).toMatch(/Still building[\s\S]*DGS-3/);
    expect(text).not.toContain("lock older than 8 h");
  });

  it("lists stopped under Waiting for Jack as well as under Failed or stopped", async () => {
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-5", result: "stopped", reason: "needs sudo" });
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    const failed = text.split("Failed or stopped")[1].split("Waiting for Jack")[0];
    const waiting = text.split("Waiting for Jack")[1].split("Skipped")[0];
    expect(failed).toMatch(/DGS-5[^\n]*stopped[^\n]*needs sudo/);
    expect(waiting).toMatch(/DGS-5[^\n]*needs sudo/);
  });

  it("a proof release shows under Proofs and in neither Failed or stopped nor Waiting for Jack", async () => {
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-642", result: "proof", reason: "first-use proof" });
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    const failed = text.split("Failed or stopped")[1].split("Waiting for Jack")[0];
    const waiting = text.split("Waiting for Jack")[1].split("Proofs")[0];
    const proofs = text.split("Proofs")[1].split("Skipped")[0];
    expect(proofs).toContain("DGS-642: first-use proof");
    expect(failed).toContain("none");
    expect(failed).not.toContain("DGS-642");
    expect(waiting).toContain("none");
    expect(waiting).not.toContain("DGS-642");
  });

  it("Proofs reads none when there is no proof", async () => {
    seed();
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text.split("Proofs")[1].split("Skipped")[0]).toContain("none");
  });

  it("a proof without a reason prints only the key", async () => {
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-7", result: "proof" });
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text.split("Proofs")[1].split("Skipped")[0]).toMatch(/DGS-7(?!:)/);
    expect(text).not.toContain("DGS-7:");
  });

  it("every merged release shows its commit", async () => {
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-8", result: "merged", commit: "aaa1111", minutes: 5 });
    appendEvent(dir, at("2026-10-20T17:00:00Z"), "release", { ticket: "DGS-9", result: "merged", commit: "bbb2222", minutes: 6 });
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text).toContain("DGS-8: commit aaa1111, 5 min");
    expect(text).toContain("DGS-9: commit bbb2222, 6 min");
    expect(text).not.toContain("unknown");
  });

  it("a merged release without a commit reads \"commit unknown (none given at release)\"", async () => {
    appendEvent(dir, at("2026-10-20T16:00:00Z"), "release", { ticket: "DGS-8", result: "merged", minutes: 5 });
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text).toContain("DGS-8: commit unknown (none given at release), 5 min");
  });

  it("does not count or list off events", async () => {
    seed();
    const text = buildReport(FROM, TO, await read(FROM, TO), null);
    expect(text.split("\n").find((l) => l.startsWith("Scans:"))).toBe("Scans: 2, 0 busy");
    expect(text).not.toMatch(/14:10|21:10/);
  });

  it("renders an empty period as Scans: 0 and none sections", () => {
    const text = buildReport(FROM, TO, [], null);
    expect(text).toContain("Scans: 0");
    expect(text.match(/none/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("renders Attention: with each open item or none", () => {
    const item = { id: "a1", ts: "2026-10-20T10:00:00Z", ticket: "DGS-7", run: "r1", kind: "blocked" as const, cause: "needs sudo", since: "2026-10-20T10:00:00Z" };
    const text = buildReport(FROM, TO, [], null, [item]);
    expect(text).toMatch(/Attention:[\s\S]*a1[^\n]*DGS-7[^\n]*needs sudo/);
    expect(text.indexOf("Still building")).toBeLessThan(text.indexOf("Attention:"));
    expect(buildReport(FROM, TO, [], null)).toContain("Attention:\nnone");
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

  it("skips an unreadable events file when it looks for the first event", async () => {
    mkdirSync(join(dir, "events-2026-09-01.jsonl"));
    appendEvent(dir, at("2026-10-20T10:00:00Z"), "scan", { candidates: 0, skipped: 0, claimed: null });
    const r = await runReport({ tracker, dir, now: () => TO });
    const text = readFileSync(r.file, "utf-8");
    expect(text).toContain("report, 2026-10-20 17:00:00 to");
    expect(text).toContain("Scans: 1");
  });

  it("with no events at all, starts at now", async () => {
    const r = await runReport({ tracker, dir, now: () => TO });
    expect(readFileSync(r.file, "utf-8")).toContain("Scans: 0");
  });

  it("keeps the file and updates last-report.json when the comment fails", async () => {
    tracker.comment = async () => { throw new Error("boom"); };
    const lines: string[] = [];
    const orig = process.stderr.write;
    process.stderr.write = ((c: string | Uint8Array) => { lines.push(String(c)); return true; }) as typeof process.stderr.write;
    let r;
    try {
      r = await runReport({ tracker, dir, now: () => TO });
    } finally {
      process.stderr.write = orig;
    }
    expect(lines.join("")).toContain("autonomous report: comment failed: boom");
    expect(r.commented).toBe(false);
    expect(existsSync(r.file)).toBe(true);
    expect(readdirSync(join(dir, "reports")).every((f) => f.endsWith(".md"))).toBe(true);
    expect(readLastReport(dir)?.toISOString()).toBe(TO.toISOString());
  });

  it("never overwrites: a second report in the same minute gets a -2 suffix", async () => {
    appendEvent(dir, at("2026-10-20T12:00:00Z"), "release", { ticket: "DGS-A", result: "merged", commit: "a", minutes: 1 });
    const r1 = await runReport({ tracker, dir, now: () => TO });
    appendEvent(dir, at("2026-10-20T20:00:00.500Z"), "release", { ticket: "DGS-B", result: "merged", commit: "b", minutes: 1 });
    const r2 = await runReport({ tracker, dir, now: () => new Date(TO.getTime() + 1000) });
    const r3 = await runReport({ tracker, dir, now: () => new Date(TO.getTime() + 2000) });
    expect(r2.file).toBe(r1.file.replace(/\.md$/, "-2.md"));
    expect(r3.file).toBe(r1.file.replace(/\.md$/, "-3.md"));
    expect(readFileSync(r1.file, "utf-8")).toContain("DGS-A");
    expect(readFileSync(r2.file, "utf-8")).toContain("DGS-B");
  });

  it("shows an away that began before the period", async () => {
    appendEvent(dir, at("2026-10-19T10:00:00Z"), "away-on");
    writeLastReport(dir, FROM);
    const open = await runReport({ tracker, dir, now: () => TO });
    expect(readFileSync(open.file, "utf-8")).toContain("away since 2026-10-19 17:00:00, still away");
    appendEvent(dir, at("2026-10-20T15:00:00Z"), "away-off");
    writeLastReport(dir, FROM);
    const closed = await runReport({ tracker, dir, now: () => new Date(TO.getTime() + 3600_000) });
    const text = readFileSync(closed.file, "utf-8");
    expect(text).toContain("away ended 2026-10-20 22:00:00");
    expect(text).not.toContain("still away");
  });

  it("hides an away that ended before the period", async () => {
    appendEvent(dir, at("2026-10-18T10:00:00Z"), "away-on");
    appendEvent(dir, at("2026-10-19T10:00:00Z"), "away-off");
    writeLastReport(dir, FROM);
    const r = await runReport({ tracker, dir, now: () => TO });
    const text = readFileSync(r.file, "utf-8");
    expect(text).not.toContain("away ended");
    expect(text).toMatch(/Away:\nnone/);
  });

  it("pins the 30-day look-back: an older open away is not shown", async () => {
    appendEvent(dir, at("2026-09-01T10:00:00Z"), "away-on");
    writeLastReport(dir, FROM);
    const r = await runReport({ tracker, dir, now: () => TO });
    expect(readFileSync(r.file, "utf-8")).toMatch(/Away:\nnone/);
  });
});

describe("drift section", () => {
  it("prints none with no drift, after Still building", async () => {
    const text = buildReport(FROM, TO, [], null);
    expect(text).toContain("Drift\nnone");
    expect(text.indexOf("Still building")).toBeLessThan(text.indexOf("Drift"));
    expect(text.indexOf("Drift")).toBeLessThan(text.indexOf("Attention:"));
  });
  it("prints drift lines as bullets", () => {
    const text = buildReport(FROM, TO, [], null, [], TO.getTime(), ["DGS-1: status unreadable", "DGS-2: branch has no commits"]);
    expect(text).toContain("Drift\n- DGS-1: status unreadable\n- DGS-2: branch has no commits");
  });
  it("runReport gathers drift from claim events and puts it in the comment", async () => {
    appendEvent(dir, at("2026-10-20T11:00:00Z"), "claim", { ticket: "DGS-1", order: "o", taskId: "t1" });
    appendEvent(dir, at("2026-10-20T12:00:00Z"), "claim", { ticket: "DGS-1", order: "o", taskId: "t1" });
    appendEvent(dir, at("2026-10-20T12:30:00Z"), "claim", { ticket: "DGS-2", order: "o", taskId: "nope" });
    tracker.add({ id: "t1", status: "complete" });
    writeLastReport(dir, FROM);
    const git: Git = () => "";
    const r = await runReport({ tracker, dir, now: () => TO, git, repo: "/r" });
    const text = readFileSync(r.file, "utf8");
    expect(text).toContain("- DGS-1: done in ClickUp, nothing on main");
    expect(text.match(/DGS-1: done in ClickUp/g)).toHaveLength(1);
    expect(text).toContain("- DGS-2: status unreadable");
    expect(tracker.comments[0].text).toBe(text);
  });
  it("runReport without git prints none", async () => {
    appendEvent(dir, at("2026-10-20T11:00:00Z"), "claim", { ticket: "DGS-1", order: "o", taskId: "t1" });
    writeLastReport(dir, FROM);
    const r = await runReport({ tracker, dir, now: () => TO });
    expect(readFileSync(r.file, "utf8")).toContain("Drift\nnone");
  });
  it("a throwing git still writes the report and shows the gap", async () => {
    appendEvent(dir, at("2026-10-20T11:00:00Z"), "claim", { ticket: "DGS-1", order: "o", taskId: "t1" });
    tracker.add({ id: "t1", status: "complete" });
    writeLastReport(dir, FROM);
    const git: Git = () => { throw new Error("git down"); };
    const r = await runReport({ tracker, dir, now: () => TO, git, repo: "/r" });
    expect(readFileSync(r.file, "utf8")).toContain("- DGS-1: git facts unreadable");
    expect(r.commented).toBe(true);
  });
});
