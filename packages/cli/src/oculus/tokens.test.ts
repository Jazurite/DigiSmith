import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBurn, readRunTokens, readSeatsView, rowTokensOf } from "./tokens.ts";

let depot: string;
const now = Date.parse("2026-10-24T09:00:00.000Z");
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "oc-tok-")); });
afterEach(() => rmSync(depot, { recursive: true, force: true }));

const runTokens = (generated: string, final: boolean, unpriced: string[] = []) => ({
  schema: "oculus-tokens/v1", run: "r1", generated_at: generated, final, price_table: { source: "anthropic", version: "2026-10-18" },
  models: { "claude-opus-5-5": { input: 1, output: 2, cache_read: 3, cache_write_5m: 4, cache_write_1h: 5, responses: 1, tokens: 15, cost_usd: unpriced.length ? null : 0.5 } },
  total: { tokens: 15, responses: 1, cost_usd: unpriced.length ? null : 0.5 }, unpriced_models: unpriced, sessions: 1, buckets: [],
});
const put = (rel: string, v: unknown) => { const p = join(depot, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, JSON.stringify(v)); };

describe("readRunTokens", () => {
  it("reads a fresh snapshot into camelCase", () => {
    put("runs/DGS-1/r1/tokens.json", runTokens("2026-10-24T08:55:00.000Z", false));
    const r = readRunTokens(join(depot, "runs/DGS-1/r1"), now);
    expect(r.value?.models[0]).toEqual({ model: "claude-opus-5-5", input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5, responses: 1, tokens: 15, costUsd: 0.5 });
    expect(rowTokensOf(r.value)).toEqual({ total: 15, costUsd: 0.5, unpriced: [] });
  });
  it("gives null for a stale live snapshot but keeps a final one", () => {
    put("runs/DGS-1/r1/tokens.json", runTokens("2026-10-24T08:40:00.000Z", false));
    expect(readRunTokens(join(depot, "runs/DGS-1/r1"), now)).toEqual({ value: null, asOf: "2026-10-24T08:40:00.000Z" });
    put("runs/DGS-1/r1/tokens.json", runTokens("2026-10-20T08:40:00.000Z", true));
    expect(readRunTokens(join(depot, "runs/DGS-1/r1"), now).value?.final).toBe(true);
  });
  it("gives null for a missing or foreign file", () => {
    expect(readRunTokens(join(depot, "runs/DGS-1/none"), now)).toEqual({ value: null, asOf: null });
    put("runs/DGS-1/r2/tokens.json", { schema: "other" });
    expect(readRunTokens(join(depot, "runs/DGS-1/r2"), now)).toEqual({ value: null, asOf: null });
  });
});

describe("readBurn", () => {
  it("reads a fresh burn file and refuses a stale one", () => {
    put("runs/.tokens/burn.json", { schema: "oculus-burn/v1", generated_at: "2026-10-24T08:50:00.000Z", window_min: 60, tokens: 4_100_000, cost_usd: 12.3, runs: 2, unpriced_models: [] });
    expect(readBurn({ DIGISMITH_DEPOT_DIR: depot }, now)).toEqual({ tokensPerH: 4_100_000, usdPerH: 12.3, asOf: "2026-10-24T08:50:00.000Z" });
    expect(readBurn({ DIGISMITH_DEPOT_DIR: depot }, now + 20 * 60_000)).toBeNull();
  });
});

describe("readSeatsView", () => {
  it("marks old readings stale and drops a window past its reset", () => {
    put("usage-probe/seats.json", { schema: "oculus-seats/v1", generated_at: "2026-10-24T08:58:00.000Z", seats: [
      { seat: "jack", read_at: "2026-10-24T08:09:00.000Z", five_hour: { used_pct: 7, resets_at: "2026-10-24T08:30:00.000Z" }, weekly: { used_pct: 32, resets_at: "2026-10-28T05:00:00.000Z" } },
      { seat: "dev0", read_at: "2026-10-24T08:55:00.000Z", five_hour: { used_pct: 3, resets_at: "2026-10-24T12:00:00.000Z" }, weekly: null },
    ] });
    expect(readSeatsView({ DIGISMITH_DEPOT_DIR: depot }, now)).toEqual({ asOf: "2026-10-24T08:58:00.000Z", seats: [
      { seat: "jack", readAt: "2026-10-24T08:09:00.000Z", stale: true, fiveHour: null, weekly: { usedPct: 32, resetsAt: "2026-10-28T05:00:00.000Z" } },
      { seat: "dev0", readAt: "2026-10-24T08:55:00.000Z", stale: false, fiveHour: { usedPct: 3, resetsAt: "2026-10-24T12:00:00.000Z" }, weekly: null },
    ] });
    expect(readSeatsView({ DIGISMITH_DEPOT_DIR: depot }, now + 30 * 60_000)).toBeNull();
  });
});
