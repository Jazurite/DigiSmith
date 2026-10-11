import { describe, it, expect } from "vitest";
import { parseDateFlag, formatUtc7 } from "./parse-date.ts";

describe("parseDateFlag", () => {
  it("reads a plain date as that day at 04:00 UTC+7, without a time", () => {
    expect(parseDateFlag("2026-10-11", "--start-date")).toEqual({ ms: 1791666000000, hasTime: false });
  });

  it("accepts a leap day and refuses a day that does not exist", () => {
    expect(parseDateFlag("2028-02-29", "--due-date").hasTime).toBe(false);
    expect(() => parseDateFlag("2026-02-30", "--due-date")).toThrow(/invalid --due-date "2026-02-30"/);
  });

  it("sends a value with an offset or Z as it is, with a time", () => {
    expect(parseDateFlag("2026-10-11T04:00:00+07:00", "--start-date")).toEqual({ ms: 1791666000000, hasTime: true });
    expect(parseDateFlag("2026-10-10T21:00:00Z", "--start-date")).toEqual({ ms: 1791666000000, hasTime: true });
  });

  it("refuses a timed value on a day that does not exist", () => {
    expect(() => parseDateFlag("2026-02-30T04:00:00+07:00", "--due-date")).toThrow(/invalid --due-date.*does not exist/);
  });

  it("refuses a time without an offset", () => {
    expect(() => parseDateFlag("2026-10-11T04:00:00", "--start-date")).toThrow(/invalid --start-date.*offset/);
  });

  it("refuses anything else", () => {
    expect(() => parseDateFlag("28/08/2026", "--start-date")).toThrow(/invalid --start-date "28\/08\/2026"/);
    expect(() => parseDateFlag("", "--start-date")).toThrow(/invalid --start-date/);
  });
});

describe("formatUtc7", () => {
  it("prints an epoch in UTC+7", () => {
    expect(formatUtc7(1791666000000)).toBe("2026-10-11 04:00 UTC+7");
  });
});
