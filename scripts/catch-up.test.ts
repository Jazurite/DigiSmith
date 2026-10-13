import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { renderCatchUp, formatTime, type CatchUp } from "./catch-up.ts";

const EMPTY: CatchUp = {
  conductor: "digismith-conductor",
  window: { from: "2026-10-13T06:00:00Z", to: "2026-10-13T08:30:00Z" },
  identity: "digismith-maestro",
  askedBy: "s-42",
  done: [],
  running: [],
  waiting: [],
  decided: [],
  parked: [],
  next: [],
  health: { seats: [], server: "", tabs: [] },
};

const FULL: CatchUp = {
  ...EMPTY,
  done: [
    { key: "DGS-417", line: "card format merged", report: "https://example.test/r.html" },
    { key: "DGS-418", line: "hooks merged" },
  ],
  running: [{ worker: "dgs-427", key: "DGS-427", stage: "build", since: "2026-10-13T06:30:00Z" }],
  waiting: [{ question: "Merge now?", since: { at: "2026-10-13T07:00:00Z", fromTool: true }, pane: "w2:3" }],
  decided: [{ decision: "use dev0", why: "spread load", allowedBy: "order-roles" }],
  parked: [{ what: "DGS-430", why: "later", next: "ticket" }],
  next: ["a", "b", "c", "d"],
  health: {
    seats: [
      { seat: "jack", fiveHourPct: 19, weeklyPct: 59 },
      { seat: "dev0", fiveHourPct: 12, weeklyPct: 36 },
    ],
    server: "herdr up",
    tabs: ["w2:1 conductor", "w2:2 dgs-427"],
  },
};

const HEADINGS = [
  "## Done",
  "## Running",
  "## Waiting for Jack",
  "## Decided under the mandate",
  "## Parked or failed",
  "## Next",
  "## Health",
];

describe("renderCatchUp", () => {
  it("renders the full layout", () => {
    expect(renderCatchUp(FULL)).toBe(`# Catch-up: digismith-conductor
Window: 2026-10-13 13:00 UTC+7 to 2026-10-13 15:30 UTC+7 (UTC+7)   Maestro identity: digismith-maestro   Asked by: s-42

## Done
- DGS-417: card format merged. Report: https://example.test/r.html
- DGS-418: hooks merged.

## Running
- dgs-427 | DGS-427 | build | since 2026-10-13 13:30 UTC+7

## Waiting for Jack
- Merge now? | since 2026-10-13 14:00 UTC+7 [07:00 UTC] | pane w2:3

## Decided under the mandate
- use dev0 | why: spread load | allowed by: order-roles

## Parked or failed
- DGS-430 | why: later | next step: ticket

## Next
1. a
2. b
3. c

## Health
- Seats and usage: jack: 5h 19%, weekly 59%; dev0: 5h 12%, weekly 36%
- Server: herdr up
- Open tabs: 2: w2:1 conductor, w2:2 dgs-427`);
  });

  it("says none for every empty section and keeps all seven headings", () => {
    const out = renderCatchUp(EMPTY);
    for (const h of HEADINGS) expect(out).toContain(h);
    expect(out).toContain("## Done\nnone\n");
    expect(out).toContain("## Next\nnone\n");
    expect(out).toContain("- Seats and usage: none");
    expect(out).toContain("- Server: none");
    expect(out).toContain("- Open tabs: none");
  });

  it("keeps the seven headings in the fixed order", () => {
    for (const data of [EMPTY, FULL]) {
      const out = renderCatchUp(data);
      const pos = HEADINGS.map((h) => out.indexOf(`\n${h}\n`));
      expect(pos.every((p) => p > 0)).toBe(true);
      expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    }
  });

  it("does not re-substitute a placeholder inside a value", () => {
    const out = renderCatchUp({
      ...EMPTY,
      done: [{ key: "DGS-1", line: "mentions <running> and <health>" }],
      running: [{ worker: "w", key: "K", stage: "s", since: "2026-10-13T06:00:00Z" }],
    });
    expect(out).toContain("- DGS-1: mentions <running> and <health>.");
  });

  it("throws on an invalid time", () => {
    expect(() => renderCatchUp({ ...EMPTY, window: { from: "nope", to: "x" } })).toThrow();
  });
});

describe("renderCatchUp shape checks", () => {
  it("names a missing section", () => {
    const bad = { ...EMPTY } as Partial<CatchUp>;
    delete bad.running;
    expect(() => renderCatchUp(bad as CatchUp)).toThrow("running must be an array");
  });
  it("refuses a missing health block", () => {
    const bad = { ...EMPTY } as Partial<CatchUp>;
    delete bad.health;
    expect(() => renderCatchUp(bad as CatchUp)).toThrow(/health/);
  });
  it("refuses non-finite seat usage", () => {
    const bad = { ...EMPTY, health: { ...EMPTY.health, seats: [{ seat: "x", fiveHourPct: NaN, weeklyPct: 1 }] } };
    expect(() => renderCatchUp(bad)).toThrow(/finite/);
  });
  it("refuses an empty conductor name", () => {
    expect(() => renderCatchUp({ ...EMPTY, conductor: "" })).toThrow(/conductor/);
  });
});

describe("formatTime", () => {
  it("renders UTC+7", () => {
    expect(formatTime("2026-10-13T06:00:00Z")).toBe("2026-10-13 13:00 UTC+7");
  });
  it("rolls the day over", () => {
    expect(formatTime("2026-10-13T18:00:00Z")).toBe("2026-10-14 01:00 UTC+7");
  });
  it("accepts any offset", () => {
    expect(formatTime("2026-10-13T13:00:00+07:00")).toBe("2026-10-13 13:00 UTC+7");
  });
  it("adds UTC in brackets for a tool time", () => {
    expect(formatTime({ at: "2026-10-13T18:00:00Z", fromTool: true })).toBe(
      "2026-10-14 01:00 UTC+7 [18:00 UTC]",
    );
  });
  it("refuses a time without Z or an offset", () => {
    expect(() => formatTime("2026-10-13T10:00:00")).toThrow(/invalid time/);
    expect(() => formatTime("2026-10-13")).toThrow(/invalid time/);
  });
  it("throws on an invalid time", () => {
    expect(() => formatTime("nope")).toThrow(/invalid time/);
  });
});

describe("catch-up CLI", () => {
  it("prints the same text as renderCatchUp", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catch-up-"));
    const file = path.join(dir, "data.json");
    fs.writeFileSync(file, JSON.stringify(FULL));
    const out = execFileSync(
      "node",
      ["--experimental-strip-types", "scripts/catch-up.ts", "--data", file],
      { encoding: "utf-8" },
    );
    expect(out.trimEnd()).toBe(renderCatchUp(FULL));
  });
});
