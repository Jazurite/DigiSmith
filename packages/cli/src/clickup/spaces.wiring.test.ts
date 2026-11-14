import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the production trackers read every space", () => {
  for (const [label, rel, ctor] of [
    ["scan", "../autonomous/index.ts", "ClickUpLoTracker"],
    ["Director", "../autonomous/director/command.ts", "ClickUpLoTracker"],
    ["Steward", "../steward/index.ts", "ClickUpTracker"],
  ] as const) {
    it(`${label} builds ${ctor} with ALL_SPACE_IDS`, () => {
      const src = read(rel);
      expect(src).toMatch(new RegExp(`new ${ctor}\\(createClient\\(\\), ALL_SPACE_IDS\\)`));
      expect(src).not.toMatch(/DIGISMITH_SPACE_ID/);
    });
  }
});
