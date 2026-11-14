import { describe, expect, it } from "vitest";
import { ALL_SPACE_IDS, DIGISMITH_SPACE_ID, KEY_PREFIXES, SPACES, isTicketKey, spaceForKey } from "./spaces.ts";
import * as lib from "./lib.ts";

describe("spaces", () => {
  it("lists DigiSmith first and Oculus second, with the live ids", () => {
    expect(SPACES.map((s) => [s.prefix, s.id])).toEqual([
      ["DGS", "1301150000001271"],
      ["OCL", "1301150000003197"],
    ]);
    expect(ALL_SPACE_IDS).toEqual(["1301150000001271", "1301150000003197"]);
    expect(KEY_PREFIXES).toBe("DGS|OCL");
  });
  it("lib still exports DIGISMITH_SPACE_ID with the same value", () => {
    expect(lib.DIGISMITH_SPACE_ID).toBe(DIGISMITH_SPACE_ID);
    expect(DIGISMITH_SPACE_ID).toBe("1301150000001271");
  });
  it("resolves a key to its space by prefix", () => {
    expect(spaceForKey("DGS-12").name).toBe("DigiSmith");
    expect(spaceForKey("OCL-105").id).toBe("1301150000003197");
  });
  it("refuses an unknown prefix and names the known ones", () => {
    expect(() => spaceForKey("ABC-1")).toThrow(/unknown key prefix "ABC".*DGS, OCL/);
  });
  it("refuses a malformed key", () => {
    for (const bad of ["", "12", "OCL-", "ocl-1", "OCL-1x", "../OCL-1", "OCL-1 "]) {
      expect(() => spaceForKey(bad)).toThrow();
      expect(isTicketKey(bad)).toBe(false);
    }
  });
  it("isTicketKey is true for a known prefix with digits", () => {
    expect(isTicketKey("DGS-546")).toBe(true);
    expect(isTicketKey("OCL-1")).toBe(true);
    expect(isTicketKey("ABC-1")).toBe(false);
  });
});
