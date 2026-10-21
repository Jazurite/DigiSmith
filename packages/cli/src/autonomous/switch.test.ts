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
});
