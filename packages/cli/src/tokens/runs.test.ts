import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { burnOf, runTokensPass, runsInScope } from "./runs.ts";
import { writeRun, writeTranscript } from "./fixtures.test-util.ts";
import type { RunTokens } from "./run-types.ts";

let depot: string, projects: string;
const now = new Date("2026-10-24T09:02:00.000Z");
const env = () => ({ DIGISMITH_DEPOT_DIR: depot });
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "rt-depot-")); projects = mkdtempSync(join(tmpdir(), "rt-proj-")); });
afterEach(() => { rmSync(depot, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true }); });

const snap = (buckets: RunTokens["buckets"], unpriced: string[] = []): RunTokens => ({ schema: "oculus-tokens/v1", run: "r", generated_at: now.toISOString(), final: false, price_table: { source: "anthropic", version: "2026-10-18" }, models: {}, total: { tokens: 0, responses: 0, cost_usd: 0 }, unpriced_models: unpriced, sessions: 1, buckets });

describe("burnOf", () => {
  it("sums the 12 full buckets before now across runs", () => {
    const b = burnOf([
      snap([{ start: "2026-10-24T07:55:00.000Z", tokens: 1000, cost_usd: 1 }, { start: "2026-10-24T08:00:00.000Z", tokens: 10, cost_usd: 0.5 }, { start: "2026-10-24T09:00:00.000Z", tokens: 7, cost_usd: 7 }]),
      snap([{ start: "2026-10-24T08:55:00.000Z", tokens: 5, cost_usd: 0.25 }]),
    ], now);
    expect(b).toMatchObject({ schema: "oculus-burn/v1", window_min: 60, tokens: 15, cost_usd: 0.75, runs: 2 });
  });
  it("gives a null cost when a bucket in the window is unpriced", () => {
    expect(burnOf([snap([{ start: "2026-10-24T08:30:00.000Z", tokens: 5, cost_usd: null }], ["x"])], now)).toMatchObject({ tokens: 5, cost_usd: null, unpriced_models: ["x"] });
  });
});

describe("runsInScope", () => {
  it("keeps active runs, skips final and dot folders and old untouched runs", () => {
    const active = writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z" });
    const final = writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z" });
    writeFileSync(join(final, "tokens.json"), JSON.stringify({ final: true }));
    const old = writeRun(depot, "DGS-2", "builder-c", { created: "2026-10-01T08:00:00.000Z" });
    const t = new Date("2026-10-01T09:00:00.000Z");
    utimesSync(join(old, "events.jsonl"), t, t); utimesSync(join(old, "run.json"), t, t);
    writeRun(depot, ".tokens", "x", { created: "2026-10-24T08:00:00.000Z" });
    expect(runsInScope(env(), now.getTime())).toEqual([active]);
  });
});

describe("runTokensPass", () => {
  it("writes tokens.json per run, the burn file and seats.json", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const r = runTokensPass({ env: env(), now, projectsDir: projects });
    expect(r).toMatchObject({ updated: 1, failed: 0 });
    expect(JSON.parse(readFileSync(join(depot, "runs", ".tokens", "burn.json"), "utf8")).tokens).toBe(5);
    expect(existsSync(join(depot, "usage-probe", "seats.json"))).toBe(true);
  });
  it("writes nothing on a dry run", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    runTokensPass({ env: env(), now, projectsDir: projects, dryRun: true });
    expect(existsSync(join(dir, "tokens.json"))).toBe(false);
    expect(existsSync(join(depot, "runs", ".tokens"))).toBe(false);
    expect(existsSync(join(depot, "usage-probe", "seats.json"))).toBe(false);
  });
  it("keeps going when one run fails, and logs only the run id and a code", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const bad = writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z" });
    writeFileSync(join(bad, "run.json"), "{broken");
    const logs: string[] = [];
    const r = runTokensPass({ env: env(), now, projectsDir: projects, log: (l) => logs.push(l) });
    expect(r).toMatchObject({ updated: 1, failed: 1 });
    expect(logs.join("\n")).toMatch(/builder-b/);
    expect(logs.join("\n")).not.toContain(depot);
  });
  it("gives an ended run one final pass, then skips it", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:40:00.000Z" });
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(1);
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(0);
  });
  it("updates one run with --run", () => {
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s2" }] });
    expect(runTokensPass({ env: env(), now, projectsDir: projects, run: "builder-b" }).updated).toBe(1);
  });
  it("matches --run on the whole run id", () => {
    writeRun(depot, "DGS-1", "xbuilder-b", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s2" }] });
    expect(runTokensPass({ env: env(), now, projectsDir: projects, run: "builder-b" }).updated).toBe(0);
  });
  it("leaves burn.json alone on a --run pass", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeTranscript(projects, "s2", [{ id: "m2", req: "r2", ts: "2026-10-24T08:31:00.000Z", output: 7 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s2" }] });
    runTokensPass({ env: env(), now, projectsDir: projects });
    const file = join(depot, "runs", ".tokens", "burn.json");
    const before = readFileSync(file, "utf8");
    expect(JSON.parse(before).tokens).toBe(12);
    runTokensPass({ env: env(), now: new Date(now.getTime() + 60_000), projectsDir: projects, run: "builder-a" });
    expect(readFileSync(file, "utf8")).toBe(before);
  });
  it("keeps an ended run in the burn on a later pass (F1)", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeTranscript(projects, "s2", [{ id: "m2", req: "r2", ts: "2026-10-24T08:31:00.000Z", output: 7 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:40:00.000Z" });
    writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s2" }] });
    const first = runTokensPass({ env: env(), now, projectsDir: projects });
    expect(first.burn).toMatchObject({ tokens: 12, runs: 2 });
    const second = runTokensPass({ env: env(), now: new Date(now.getTime() + 60_000), projectsDir: projects });
    expect(second.updated).toBe(1); // only builder-b; builder-a is final
    expect(second.burn).toMatchObject({ tokens: 12, runs: 2 });
    expect(JSON.parse(readFileSync(join(depot, "runs", ".tokens", "burn.json"), "utf8"))).toMatchObject({ tokens: 12, runs: 2 });
  });
  it("skips a stored tokens.json that does not parse when it builds the burn (F1)", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const bad = writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z" });
    writeFileSync(join(bad, "tokens.json"), "{broken");
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).burn).toMatchObject({ tokens: 5, runs: 1 });
  });
  it("recounts an ended run that started again, and clears final (F2)", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:40:00.000Z" });
    runTokensPass({ env: env(), now, projectsDir: projects });
    expect(JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8"))).toMatchObject({ final: true });
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(0);
    appendFileSync(join(dir, "events.jsonl"), JSON.stringify({ schema: "nightwatch-event/v1", seq: 3, ts: "2026-10-24T08:50:00.000Z", run: "builder-a", type: "started", data: { source: "resume", session_id: "s1" } }) + "\n");
    const past = new Date(Date.now() - 60_000), later = new Date(Date.now() + 60_000);
    utimesSync(join(dir, "tokens.json"), past, past); utimesSync(join(dir, "events.jsonl"), later, later);
    writeTranscript(projects, "s1", [{ id: "m2", req: "r2", ts: "2026-10-24T08:55:00.000Z", output: 7 }], true);
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(1);
    const t = JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8"));
    expect(t).toMatchObject({ final: false, total: { responses: 2, tokens: 12 } });
  });
  it("counts a final run named with --run (F4)", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:40:00.000Z" });
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(1);
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(0);
    expect(runTokensPass({ env: env(), now, projectsDir: projects, run: "builder-a" }).updated).toBe(1);
  });
  it("gives no burn on a dry run (F3)", () => {
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    expect(runTokensPass({ env: env(), now, projectsDir: projects, dryRun: true }).burn).toBeNull();
  });
});
