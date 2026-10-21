import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awayExpired, isAway, readAway, writeAway } from "./away.ts";
import type { Away } from "./types.ts";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const HOUR = 3600_000;
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "auto-away-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const base = { since: "2026-10-21T09:00:00.000Z", endedAt: null };

describe("away file", () => {
  it("reads null when there is no file, and isAway is false", () => {
    const a = readAway(dir);
    expect(a).toBeNull();
    expect(isAway(a, NOW)).toBe(false);
    expect(awayExpired(a, NOW)).toBe(false);
  });

  it("is away at any time when written with until null", () => {
    const a: Away = { ...base, away: true, until: null };
    writeAway(dir, a);
    expect(readAway(dir)).toEqual(a);
    expect(isAway(readAway(dir), NOW)).toBe(true);
    expect(isAway(readAway(dir), new Date("2099-01-01T00:00:00.000Z"))).toBe(true);
    expect(awayExpired(readAway(dir), NOW)).toBe(false);
  });

  it("is away while until is still ahead, and expires at or after until", () => {
    const until = new Date(NOW.getTime() + HOUR).toISOString();
    const a: Away = { ...base, away: true, until };
    expect(isAway(a, NOW)).toBe(true);
    expect(awayExpired(a, NOW)).toBe(false);

    const atUntil = new Date(NOW.getTime() + HOUR);
    expect(isAway(a, atUntil)).toBe(false);
    expect(awayExpired(a, atUntil)).toBe(true);

    const pastUntil = new Date(NOW.getTime() + 2 * HOUR);
    expect(isAway(a, pastUntil)).toBe(false);
    expect(awayExpired(a, pastUntil)).toBe(true);
  });

  it("is never away and never expired when away is false", () => {
    const off: Away = { ...base, away: false, until: null };
    expect(isAway(off, NOW)).toBe(false);
    expect(awayExpired(off, NOW)).toBe(false);

    const offWithUntil: Away = { ...base, away: false, until: new Date(NOW.getTime() - HOUR).toISOString() };
    expect(isAway(offWithUntil, NOW)).toBe(false);
    expect(awayExpired(offWithUntil, NOW)).toBe(false);
  });

  it("reads a corrupt file as null", () => {
    writeFileSync(join(dir, "away.json"), "{ not json");
    expect(readAway(dir)).toBeNull();
  });

  it.each(["[]", "null", "\"x\"", "42"])("reads valid non-object JSON %s as null", (text) => {
    writeFileSync(join(dir, "away.json"), text);
    expect(readAway(dir)).toBeNull();
  });

  it.each([
    ["an empty object", "{}"],
    ["a non-boolean away", JSON.stringify({ away: "yes", until: null })],
    ["a non-string since", JSON.stringify({ away: true, since: 5, until: null })],
    ["a non-string until", JSON.stringify({ away: true, since: base.since, until: 5 })],
    ["a non-string endedAt", JSON.stringify({ away: false, since: base.since, until: null, endedAt: 5 })],
  ])("reads an object with %s as null", (_label, text) => {
    writeFileSync(join(dir, "away.json"), text);
    expect(readAway(dir)).toBeNull();
  });

  it("keeps a record whose until does not parse, and treats it as expired, not away", () => {
    const a: Away = { ...base, away: true, until: "tomorrow" };
    writeAway(dir, a);
    const read = readAway(dir);
    expect(read).toEqual(a);
    expect(isAway(read, NOW)).toBe(false);
    expect(awayExpired(read, NOW)).toBe(true);
  });

  it("leaves no .tmp file behind after writeAway", () => {
    writeAway(dir, { ...base, away: true, until: null });
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps the file present when an away:false record overwrites it", () => {
    writeAway(dir, { ...base, away: true, until: null });
    const endedAt = new Date(NOW.getTime()).toISOString();
    writeAway(dir, { ...base, away: false, until: null, endedAt });
    expect(existsSync(join(dir, "away.json"))).toBe(true);
    expect(readAway(dir)).toEqual({ ...base, away: false, until: null, endedAt });
  });
});
