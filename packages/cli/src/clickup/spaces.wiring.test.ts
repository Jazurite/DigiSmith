import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** Matches `new <ctor>(createClient(), ALL_SPACE_IDS)`, tolerant of line breaks, extra spaces and a trailing comma. */
const wiringPattern = (ctor: string) =>
  new RegExp(`new\\s+${ctor}\\s*\\(\\s*createClient\\s*\\(\\s*\\)\\s*,\\s*ALL_SPACE_IDS\\s*,?\\s*\\)`);

describe("the production trackers read every space", () => {
  for (const [label, rel, ctor] of [
    ["scan", "../autonomous/index.ts", "ClickUpLoTracker"],
    ["Director", "../autonomous/director/command.ts", "ClickUpLoTracker"],
    ["Steward", "../steward/index.ts", "ClickUpTracker"],
  ] as const) {
    it(`${label} builds ${ctor} with ALL_SPACE_IDS`, () => {
      const src = read(rel);
      expect(src).toMatch(wiringPattern(ctor));
      expect(src).not.toMatch(/DIGISMITH_SPACE_ID/);
    });
  }

  it("the matcher tolerates line breaks and a trailing comma", () => {
    expect("new ClickUpLoTracker(\n  createClient(),\n  ALL_SPACE_IDS,\n)").toMatch(wiringPattern("ClickUpLoTracker"));
    expect("new ClickUpLoTracker( createClient() ,  ALL_SPACE_IDS )").toMatch(wiringPattern("ClickUpLoTracker"));
    expect("new ClickUpLoTracker(createClient())").not.toMatch(wiringPattern("ClickUpLoTracker"));
  });
});
