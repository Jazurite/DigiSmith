import { describe, expect, it } from "vitest";
import { parseArgs, requireArgs } from "./cli-args.ts";

describe("parseArgs", () => {
  it("parses a single flag", () => {
    expect(parseArgs(["--role", "task"])).toEqual({ role: "task" });
  });

  it("parses multiple flags", () => {
    expect(parseArgs(["--provider", "chutes", "--role", "task"])).toEqual({
      provider: "chutes",
      role: "task",
    });
  });

  it("returns an empty object for no flags", () => {
    expect(parseArgs([])).toEqual({});
  });
});

describe("requireArgs", () => {
  it("does not throw when all required flags are present", () => {
    expect(() => requireArgs({ role: "task" }, ["role"])).not.toThrow();
  });

  it("throws naming a single missing flag", () => {
    expect(() => requireArgs({}, ["role"])).toThrow("missing required flag: --role");
  });

  it("throws naming multiple missing flags, pluralized", () => {
    expect(() => requireArgs({}, ["role", "provider"])).toThrow(
      "missing required flags: --role, --provider",
    );
  });
});
