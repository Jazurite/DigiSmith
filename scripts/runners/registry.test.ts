// scripts/runners/registry.test.ts
import { describe, expect, it } from "vitest";
import { opencode } from "./opencode.ts";
import { claudeCode } from "./claude-code.ts";
import { resolveRunner } from "./registry.ts";
import type { Runner } from "./types.ts";

function assertConforms(runner: Runner) {
  expect(typeof runner.name).toBe("string");
  expect(runner.name.length).toBeGreaterThan(0);
  expect(typeof runner.buildConfig).toBe("function");
  expect(typeof runner.parseResult).toBe("function");
}

describe("opencode", () => {
  it("conforms to Runner", () => assertConforms(opencode));
});

describe("claudeCode", () => {
  it("conforms to Runner", () => assertConforms(claudeCode));
});

describe("resolveRunner", () => {
  it("resolves a known runner by name", () => {
    expect(resolveRunner("opencode")).toBe(opencode);
    expect(resolveRunner("claude-code")).toBe(claudeCode);
  });

  it("returns undefined for an unknown runner", () => {
    expect(resolveRunner("codex")).toBeUndefined();
    expect(resolveRunner("")).toBeUndefined();
  });
});
