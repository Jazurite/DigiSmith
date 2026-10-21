import { describe, it, expect } from "vitest";
import { inNightWindow, dayOf, stampOf, fmtUtc7, nextClock } from "./clock.ts";

describe("inNightWindow", () => {
  it("is true from 23:00 UTC+7 and false one millisecond before", () => {
    expect(inNightWindow(new Date("2026-10-18T16:00:00Z"))).toBe(true);
    expect(inNightWindow(new Date("2026-10-18T15:59:59.999Z"))).toBe(false);
  });
  it("is true at 05:59:59 UTC+7 and false at 06:00", () => {
    expect(inNightWindow(new Date("2026-10-18T22:59:59Z"))).toBe(true);
    expect(inNightWindow(new Date("2026-10-18T23:00:00Z"))).toBe(false);
  });
  it("is false at 19:00 UTC+7", () => {
    expect(inNightWindow(new Date("2026-10-18T12:00:00Z"))).toBe(false);
  });
});

describe("dayOf", () => {
  it("uses the UTC+7 date", () => {
    expect(dayOf(new Date("2026-10-18T16:30:00Z"))).toBe("2026-10-18");
    expect(dayOf(new Date("2026-10-18T17:00:00Z"))).toBe("2026-10-19");
  });
  it("rolls over a month end", () => {
    expect(dayOf(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-01");
  });
});

describe("stampOf", () => {
  it("formats the UTC+7 minute", () => {
    expect(stampOf(new Date("2026-10-19T07:32:00Z"))).toBe("2026-10-19-1432");
  });
});

describe("fmtUtc7", () => {
  it("formats the UTC+7 second", () => {
    expect(fmtUtc7(new Date("2026-10-18T16:19:47Z"))).toBe("2026-10-18 23:19:47");
  });
});

describe("nextClock", () => {
  const now = new Date("2026-10-19T07:32:00Z"); // 14:32 UTC+7
  it("returns the next later clock time today", () => {
    expect(nextClock(now, "18:00").toISOString()).toBe("2026-10-19T11:00:00.000Z");
  });
  it("rolls to the next day when the time has passed", () => {
    expect(nextClock(now, "14:00").toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });
  it("is strictly after now, so an equal time means the next day", () => {
    expect(nextClock(now, "14:32").toISOString()).toBe("2026-10-20T07:32:00.000Z");
  });
  it("throws on a bad HH:MM", () => {
    expect(() => nextClock(now, "25:00")).toThrow();
    expect(() => nextClock(now, "9:5")).toThrow();
  });
});
