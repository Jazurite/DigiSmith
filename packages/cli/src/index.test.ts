import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GROUPS, resolveGroup, usage, readVersion } from "./index.ts";

const ownPackageJson = new URL("../package.json", import.meta.url);
const ownVersion = (JSON.parse(fs.readFileSync(ownPackageJson, "utf-8")) as { version: string }).version;

describe("resolveGroup", () => {
  it("returns the vps runner for 'vps'", () => {
    expect(resolveGroup("vps")).toBe(GROUPS.vps);
  });

  it("returns undefined for an unknown group", () => {
    expect(resolveGroup("foo")).toBeUndefined();
  });

  it("returns undefined when no group is given", () => {
    expect(resolveGroup(undefined)).toBeUndefined();
  });

  it("does not resolve Object.prototype members as groups", () => {
    expect(resolveGroup("toString")).toBeUndefined();
  });
});

describe("usage", () => {
  it("names the binary and every registered group", () => {
    const text = usage();
    expect(text).toContain("digismith");
    expect(text).toContain("--version");
    for (const name of Object.keys(GROUPS)) {
      expect(text).toContain(name);
    }
  });
});

describe("readVersion", () => {
  it("reads the version from the package's own package.json by default", () => {
    expect(readVersion()).toBe(ownVersion);
  });

  it("returns unknown when the file is missing", () => {
    expect(readVersion(path.join(os.tmpdir(), "digismith-cli-does-not-exist.json"))).toBe("unknown");
  });

  it("returns unknown when the file has no string version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-cli-version-"));
    const file = path.join(dir, "package.json");
    fs.writeFileSync(file, JSON.stringify({ name: "x" }));
    try {
      expect(readVersion(file)).toBe("unknown");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
