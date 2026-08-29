import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pickMostRecentDir, resolveUpstreamSkillsDir } from "./check_vendored_skills.ts";

describe("pickMostRecentDir", () => {
  it("returns the path with the highest mtimeMs", () => {
    const result = pickMostRecentDir([
      { path: "/a/old", mtimeMs: 100 },
      { path: "/a/new", mtimeMs: 300 },
      { path: "/a/mid", mtimeMs: 200 },
    ]);
    expect(result).toBe("/a/new");
  });

  it("throws on an empty list", () => {
    expect(() => pickMostRecentDir([])).toThrow("no directories found");
  });
});

describe("resolveUpstreamSkillsDir", () => {
  it("picks the most-recently-modified hash directory under superpowers/ and appends skills/", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-"));
    const cacheRoot = path.join(tmpBase, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers");
    const oldHash = path.join(cacheRoot, "oldhash111");
    const newHash = path.join(cacheRoot, "newhash222");
    fs.mkdirSync(oldHash, { recursive: true });
    fs.mkdirSync(newHash, { recursive: true });
    // Force newHash to have a strictly later mtime than oldHash.
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(oldHash, past, past);
    fs.utimesSync(newHash, future, future);

    const result = resolveUpstreamSkillsDir(tmpBase);

    expect(result).toBe(path.join(newHash, "skills"));
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("throws a clear error when the superpowers cache directory doesn't exist", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-empty-"));
    expect(() => resolveUpstreamSkillsDir(tmpBase)).toThrow("Superpowers plugin cache not found");
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });
});
