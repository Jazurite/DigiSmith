import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bucketStart, countRun, sessionsOfRun, transcriptIndex } from "./run-count.ts";
import { writeRun, writeSubagent, writeTranscript } from "./fixtures.test-util.ts";

let depot: string, projects: string;
const now = new Date("2026-10-24T09:00:00.000Z");
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "rc-depot-")); projects = mkdtempSync(join(tmpdir(), "rc-proj-")); });
afterEach(() => { rmSync(depot, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true }); });

const run = (dir: string) => countRun(dir, { now, index: transcriptIndex(projects) });

describe("sessionsOfRun", () => {
  it("takes run.json session_id, then started events, unique", () => {
    const events = [
      { schema: "x", seq: 1, ts: "t", run: "r", type: "started", data: { session_id: "a" } },
      { schema: "x", seq: 2, ts: "t", run: "r", type: "tool", data: { session_id: "z" } },
      { schema: "x", seq: 3, ts: "t", run: "r", type: "started", data: { session_id: "b" } },
    ];
    expect(sessionsOfRun({ session_id: "a" } as never, events)).toEqual(["a", "b"]);
    expect(sessionsOfRun({} as never, [])).toEqual([]);
  });
});

describe("countRun", () => {
  it("counts five classes per model with cost and the price version", () => {
    writeTranscript(projects, "s1", [
      { id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, w5m: 1_000_000, w1h: 1_000_000 },
    ]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const t = run(dir)!;
    expect(t.models["claude-opus-5-5"]).toMatchObject({ input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, cache_write_5m: 1_000_000, cache_write_1h: 1_000_000, responses: 1, tokens: 5_000_000 });
    expect(t.models["claude-opus-5-5"].cost_usd).toBeCloseTo(4 + 20 + 0.2 + 5 + 8, 9);
    expect(t.total).toMatchObject({ tokens: 5_000_000, responses: 1 });
    expect(t.price_table).toEqual({ source: "anthropic", version: "2026-10-18" });
    expect(JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8")).schema).toBe("oculus-tokens/v1");
  });
  it("leaves out responses before created_at, dedupes a replay and a grown stream, reads subagents", () => {
    writeTranscript(projects, "s1", [
      { id: "old", req: "r0", ts: "2026-10-24T07:00:00.000Z", output: 999 },
      { id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 },
      { id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 8 },
    ]);
    writeTranscript(projects, "s2", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 8 }, { id: "m2", req: "r2", ts: "2026-10-24T08:20:00.000Z", output: 2 }]);
    writeSubagent(projects, "s1", "ag1", [{ id: "m3", req: "r3", ts: "2026-10-24T08:30:00.000Z", output: 4, model: "claude-haiku-5-5" }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }, { ts: "2026-10-24T08:15:00.000Z", session: "s2" }] });
    const t = run(dir)!;
    expect(t.total.responses).toBe(3);
    expect(t.models["claude-opus-5-5"].output).toBe(10);
    expect(t.models["claude-haiku-5-5"].output).toBe(4);
    expect(t.sessions).toBe(2);
  });
  it("counts incrementally to the same totals as a fresh count", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    run(dir);
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 9 }, { id: "m2", req: "r2", ts: "2026-10-24T08:40:00.000Z", output: 3 }], true);
    const incremental = run(dir)!;
    unlinkSync(join(dir, "tokens.state.json"));
    const fresh = run(dir)!;
    expect(incremental.models).toEqual(fresh.models);
    expect(incremental.total).toEqual(fresh.total);
  });
  it("gives null cost for an unpriced model and names it", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5, model: "claude-mystery-9" }, { id: "m2", req: "r2", ts: "2026-10-24T08:11:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const t = run(dir)!;
    expect(t.models["claude-mystery-9"].cost_usd).toBeNull();
    expect(t.total.cost_usd).toBeNull();
    expect(t.unpriced_models).toEqual(["claude-mystery-9"]);
  });
  it("writes 5-min buckets of the last 24 hours", () => {
    expect(bucketStart("2026-10-24T08:14:59.999Z")).toBe("2026-10-24T08:10:00.000Z");
    writeTranscript(projects, "s1", [
      { id: "m0", req: "r0", ts: "2026-10-23T08:00:00.000Z", output: 1 },
      { id: "m1", req: "r1", ts: "2026-10-24T08:11:00.000Z", output: 2 },
      { id: "m2", req: "r2", ts: "2026-10-24T08:14:00.000Z", output: 3 },
    ]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-23T07:00:00.000Z", started: [{ ts: "2026-10-23T07:00:01.000Z", session: "s1" }] });
    expect(run(dir)!.buckets.map((b) => [b.start, b.tokens])).toEqual([["2026-10-24T08:10:00.000Z", 5]]);
  });
  it("marks the snapshot final once the run has ended", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:50:00.000Z" });
    expect(run(dir)!.final).toBe(true);
  });
  it("writes nothing for a run with no session id, and retries a session with no file yet", () => {
    const none = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z" });
    expect(run(none)).toBeNull();
    expect(readdirSync(none)).not.toContain("tokens.json");
    const later = writeRun(depot, "DGS-1", "builder-2", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s9" }] });
    expect(run(later)!.total.responses).toBe(0);
  });
  it("writes no message text and no folder path", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    run(dir);
    for (const f of ["tokens.json", "tokens.state.json"]) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text).not.toContain("SECRET");
      expect(text).not.toContain(projects);
    }
  });
  it("counts again from 0 when the state file is broken", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    run(dir);
    writeFileSync(join(dir, "tokens.state.json"), "{broken");
    expect(run(dir)!.total.responses).toBe(1);
  });
});
