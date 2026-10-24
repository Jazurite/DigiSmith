import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readProbeSeats, writeSeats } from "./seats.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "seats-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const probe = { at: 1792829385, rate_limits: { five_hour: { used_percentage: 7, resets_at: 1792844400 }, seven_day: { used_percentage: 32, resets_at: 1793163600 } }, claude_version: "2.1.310", token: "MUST-NOT-COPY" };

describe("seats", () => {
  it("reads out-<seat>.json, skips out.json and unsafe names, drops extra fields", () => {
    writeFileSync(join(dir, "out-jack.json"), JSON.stringify(probe));
    writeFileSync(join(dir, "out-emma.json"), JSON.stringify({ at: 1792829000, rate_limits: null }));
    writeFileSync(join(dir, "out.json"), JSON.stringify(probe));
    writeFileSync(join(dir, "out-..json"), JSON.stringify(probe));
    writeFileSync(join(dir, "out-bad.json"), "{nope");
    expect(readProbeSeats(dir)).toEqual([
      { seat: "emma", read_at: new Date(1792829000_000).toISOString(), five_hour: null, weekly: null },
      { seat: "jack", read_at: new Date(1792829385_000).toISOString(), five_hour: { used_pct: 7, resets_at: new Date(1792844400_000).toISOString() }, weekly: { used_pct: 32, resets_at: new Date(1793163600_000).toISOString() } },
    ]);
  });
  it("writes seats.json atomically with no token or version", () => {
    writeFileSync(join(dir, "out-jack.json"), JSON.stringify(probe));
    const f = writeSeats(dir, new Date("2026-10-24T09:00:00.000Z"));
    const text = readFileSync(join(dir, "seats.json"), "utf8");
    expect(JSON.parse(text)).toEqual(f);
    expect(f.schema).toBe("oculus-seats/v1");
    expect(text).not.toContain("MUST-NOT-COPY");
    expect(text).not.toContain("claude_version");
  });
  it("gives a window null when its numbers are not valid", () => {
    writeFileSync(join(dir, "out-dev0.json"), JSON.stringify({ at: 1792829385, rate_limits: { five_hour: { used_percentage: "7", resets_at: 1 }, seven_day: { used_percentage: 120, resets_at: 1793163600 } } }));
    expect(readProbeSeats(dir)[0]).toMatchObject({ five_hour: null, weekly: null });
  });
});
