import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { depotDir } from "./depot-dir.ts";

describe("depotDir", () => {
  it("honours DIGISMITH_DEPOT_DIR", () => {
    expect(depotDir({ DIGISMITH_DEPOT_DIR: "/tmp/x-depot" })).toBe("/tmp/x-depot");
  });
  it("defaults to ~/.digismith-depot", () => {
    expect(depotDir({})).toBe(path.join(os.homedir(), ".digismith-depot"));
  });
  it("treats an empty value as unset", () => {
    expect(depotDir({ DIGISMITH_DEPOT_DIR: "" })).toBe(path.join(os.homedir(), ".digismith-depot"));
  });
  it("reads process.env by default", () => {
    const old = process.env.DIGISMITH_DEPOT_DIR;
    process.env.DIGISMITH_DEPOT_DIR = "/tmp/from-proc";
    try {
      expect(depotDir()).toBe("/tmp/from-proc");
    } finally {
      if (old === undefined) delete process.env.DIGISMITH_DEPOT_DIR;
      else process.env.DIGISMITH_DEPOT_DIR = old;
    }
  });
});
