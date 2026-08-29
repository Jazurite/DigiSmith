import { describe, it, expect } from "vitest";
import { parseArgs, requireArgs } from "./cli.ts";

describe("parseArgs", () => {
  it("parses --flag value pairs into an object", () => {
    expect(parseArgs(["--key", "EMKT-1", "--fields", "summary,description"])).toEqual({
      key: "EMKT-1",
      fields: "summary,description",
    });
  });

  it("leaves a trailing flag with no value as undefined", () => {
    expect(parseArgs(["--key", "EMKT-1", "--fields"])).toEqual({
      key: "EMKT-1",
      fields: undefined,
    });
  });

  it("returns an empty object for no args", () => {
    expect(parseArgs([])).toEqual({});
  });
});

describe("requireArgs", () => {
  it("does not throw when every required flag is present", () => {
    expect(() => requireArgs({ key: "EMKT-1", fields: "summary" }, ["key", "fields"])).not.toThrow();
  });

  it("throws naming a single missing flag", () => {
    expect(() => requireArgs({ key: "EMKT-1" }, ["key", "fields"])).toThrow(/--fields/);
  });

  it("throws naming all missing flags when several are absent", () => {
    expect(() => requireArgs({}, ["key", "fields"])).toThrow(/--key.*--fields/);
  });

  it("treats a trailing flag with no value (undefined) as missing", () => {
    expect(() => requireArgs({ key: "EMKT-1", fields: undefined as unknown as string }, ["key", "fields"])).toThrow(
      /--fields/
    );
  });
});
