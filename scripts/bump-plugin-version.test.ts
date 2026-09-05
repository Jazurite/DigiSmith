import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  computeNextVersion,
  readPluginVersion,
  bumpVersionInFile,
  versionChangedSince,
} from "./bump-plugin-version.ts";

function initVersionFixtureRepo(dir: string, version: string): void {
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith", version }));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

describe("computeNextVersion", () => {
  it("increments the minor field by 1 and resets patch to 0, keeping the prerelease suffix", () => {
    expect(computeNextVersion("0.23.0-beta")).toBe("0.24.0-beta");
  });

  it("handles a version with no prerelease suffix", () => {
    expect(computeNextVersion("1.2.3")).toBe("1.3.0");
  });

  it("throws a clear error for a malformed version string", () => {
    expect(() => computeNextVersion("not-a-version")).toThrow("Cannot parse version");
  });
});

describe("readPluginVersion", () => {
  it("reads the version field from a plugin.json-shaped file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith", version: "0.5.0-beta" }));

    expect(readPluginVersion(tmpFile)).toBe("0.5.0-beta");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws a clear error when the version field is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith" }));

    expect(() => readPluginVersion(tmpFile)).toThrow('No "version" field found');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("bumpVersionInFile", () => {
  it("replaces the version field in place, leaving the rest of the file untouched", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    const original = '{\n  "name": "digismith",\n  "version": "0.23.0-beta",\n  "keywords": ["a"]\n}\n';
    fs.writeFileSync(tmpFile, original);

    bumpVersionInFile(tmpFile, "0.24.0-beta");

    expect(fs.readFileSync(tmpFile, "utf8")).toBe(
      '{\n  "name": "digismith",\n  "version": "0.24.0-beta",\n  "keywords": ["a"]\n}\n',
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws a clear error when no version field exists to replace", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith" }));

    expect(() => bumpVersionInFile(tmpFile, "0.24.0-beta")).toThrow('No "version" field found to replace');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("versionChangedSince", () => {
  it("returns false when the version is unchanged since the base commit", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();

      expect(versionChangedSince(baseSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns true when the working tree's version differs from the base commit's", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      fs.writeFileSync(path.join(repoDir, "plugin.json"), JSON.stringify({ name: "digismith", version: "0.24.0-beta" }));

      expect(versionChangedSince(baseSha, "plugin.json", repoDir)).toBe(true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
