import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAway } from "./away.ts";
import { readEvents } from "./state.ts";
import { runAway, runBack, type SwitchDeps } from "./switch.ts";

const NOW = new Date("2026-10-21T10:00:00.000Z"); // 17:00 UTC+7
let dir: string;
let calls: { url: string; init: RequestInit }[];
let respond: number;
const mk = (): SwitchDeps => ({
  dir,
  now: () => NOW,
  nexus: {
    baseUrl: "http://fake",
    tokenFile: join(dir, "token"),
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: respond }); }) as unknown as typeof fetch,
  },
});
const kinds = () => readEvents(dir, NOW.getTime() - 3600_000, NOW.getTime() + 1000).map((e) => e.kind);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auto-switch-"));
  writeFileSync(join(dir, "token"), "tok\n");
  calls = [];
  respond = 202;
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("runAway", () => {
  it("writes away with until, logs away-on, runs the scan once", async () => {
    const r = await runAway(mk(), { until: "18:00" });
    expect(r.until).toBe("2026-10-21T11:00:00.000Z");
    expect(r.runNow).toEqual({ ok: true });
    expect(readAway(dir)).toEqual({ away: true, since: NOW.toISOString(), until: "2026-10-21T11:00:00.000Z", endedAt: null });
    expect(kinds()).toEqual(["away-on", "run-now"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://fake/api/v1/jobs/autonomous-scan/run");
  });
  it("writes until null with no argument", async () => {
    const r = await runAway(mk(), {});
    expect(r.until).toBeNull();
    expect(readAway(dir)?.until).toBeNull();
  });
  it("throws on a bad time before any write or call", async () => {
    await expect(runAway(mk(), { until: "7pm" })).rejects.toThrow();
    expect(existsSync(join(dir, "away.json"))).toBe(false);
    expect(calls).toHaveLength(0);
    expect(readdirSync(dir).filter((f) => f.startsWith("events"))).toEqual([]);
  });
  it("a second runAway replaces until", async () => {
    await runAway(mk(), { until: "18:00" });
    await runAway(mk(), { until: "20:00" });
    expect(readAway(dir)?.until).toBe("2026-10-21T13:00:00.000Z");
  });
  it("returns the 409 and still writes the file", async () => {
    respond = 409;
    const r = await runAway(mk(), {});
    expect(r.runNow).toMatchObject({ ok: false, status: 409 });
    expect(readAway(dir)?.away).toBe(true);
  });
});

describe("runBack", () => {
  it("keeps the file with away false and endedAt, runs the report", async () => {
    await runAway(mk(), { until: "18:00" });
    calls = [];
    const r = await runBack(mk());
    expect(r.runNow).toEqual({ ok: true });
    expect(readAway(dir)).toMatchObject({ away: false, endedAt: NOW.toISOString() });
    expect(kinds()).toContain("away-off");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://fake/api/v1/jobs/autonomous-report/run");
    expect(JSON.parse(readFileSync(join(dir, "away.json"), "utf-8")).away).toBe(false);
  });
  it("writes a fresh file when none exists, and logs away-expired", async () => {
    await runBack(mk(), "away-expired");
    expect(readAway(dir)?.away).toBe(false);
    expect(kinds()).toContain("away-expired");
  });
  it("sets since to now when no file exists", async () => {
    await runBack(mk());
    expect(readAway(dir)?.since).toBe(NOW.toISOString());
  });
  it("returns the 409 without throwing and still writes the file", async () => {
    respond = 409;
    const r = await runBack(mk());
    expect(r.runNow).toMatchObject({ ok: false, status: 409 });
    expect(readAway(dir)?.away).toBe(false);
  });
});

describe("runBack and the breaker", () => {
  it("away-expired leaves the breaker and its item open", async () => {
    const { recordRelease, readBreaker } = await import("./breaker.ts");
    const { appendOpen, readOpen } = await import("./attention.ts");
    recordRelease(dir, { ticket: "DGS-1", result: "failed" }, NOW);
    recordRelease(dir, { ticket: "DGS-2", result: "failed" }, NOW);
    appendOpen(dir, { ticket: "DGS-2", run: "breaker", kind: "failed", cause: "circuit-breaker-open", since: NOW.toISOString(), ts: NOW.toISOString() });
    await runBack(mk(), "away-expired");
    expect(readBreaker(dir).open).toBe(true);
    expect(readOpen(dir)).toHaveLength(1);
  });
  it("closeBreakerAsJack also resolves the breaker-file-unreadable item", async () => {
    const { closeBreakerAsJack } = await import("./switch.ts");
    const { appendOpen, readOpen } = await import("./attention.ts");
    writeFileSync(join(dir, "breaker.json"), "{nope");
    appendOpen(dir, { ticket: null, run: "breaker", kind: "unknown", cause: "breaker-file-unreadable: breaker.json does not parse", since: NOW.toISOString(), ts: NOW.toISOString() });
    expect(closeBreakerAsJack(dir, NOW, "resume")).toBe(true);
    expect(readOpen(dir)).toEqual([]);
  });
  it("closes an open breaker, resolves the circuit-breaker-open item as jack, still calls run-now", async () => {
    const { recordRelease, readBreaker } = await import("./breaker.ts");
    const { appendOpen, readOpen } = await import("./attention.ts");
    recordRelease(dir, { ticket: "DGS-1", result: "failed" }, NOW);
    recordRelease(dir, { ticket: "DGS-2", result: "failed" }, NOW);
    appendOpen(dir, { ticket: null, run: "breaker", kind: "failed", cause: "circuit-breaker-open", since: NOW.toISOString(), ts: NOW.toISOString() });
    await runBack(mk());
    expect(readBreaker(dir).open).toBe(false);
    expect(readOpen(dir)).toEqual([]);
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain('"by":"jack"');
    expect(calls).toHaveLength(1);
  });
});
