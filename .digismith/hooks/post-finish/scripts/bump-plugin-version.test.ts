import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  computeNextVersion,
  readPluginVersion,
  bumpVersionInFile,
  versionChangedSince,
  bumpTypeSince,
} from "./bump-plugin-version.ts";

function initVersionFixtureRepo(dir: string, version: string): void {
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith", version }));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

function commitMessage(dir: string, message: string): void {
  spawnSync("git", ["commit", "--allow-empty", "-q", "-m", message], { cwd: dir });
}

function revParseHead(dir: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

function commitVersion(dir: string, version: string, message: string): void {
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith", version }));
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

// Fixture shaped like DigiSmith's real repo root, for exercising main() end to end.
function initPluginFixtureRepo(dir: string, version: string): void {
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "digismith", version }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "jazurite", version }, null, 2) + "\n",
  );
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

function commitPluginVersion(dir: string, version: string, message: string): void {
  const pluginPath = path.join(dir, ".claude-plugin", "plugin.json");
  const updated = fs.readFileSync(pluginPath, "utf8").replace(/"version": "[^"]+"/, `"version": "${version}"`);
  fs.writeFileSync(pluginPath, updated);
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

const SCRIPT_PATH = fileURLToPath(new URL("./bump-plugin-version.ts", import.meta.url));

function runScript(cwd: string, args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
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

  it("bumps only the patch field when bumpType is \"patch\"", () => {
    expect(computeNextVersion("0.29.0-beta", "patch")).toBe("0.29.1-beta");
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
  it("returns false when plugin.json is identical at base and head", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "docs: unrelated change");
      const headSha = revParseHead(repoDir);

      expect(versionChangedSince(baseSha, headSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns true when a commit inside base..head changed the version", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);
      commitVersion(repoDir, "0.24.0-beta", "chore: bump plugin version");
      const headSha = revParseHead(repoDir);

      expect(versionChangedSince(baseSha, headSha, "plugin.json", repoDir)).toBe(true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns false when the version changed only after head — the delayed-hook case", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "docs: this merge's own commit");
      const headSha = revParseHead(repoDir);
      commitVersion(repoDir, "0.24.0-beta", "chore: bump plugin version (another session's later merge)");

      expect(versionChangedSince(baseSha, headSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("ignores the live working tree — an uncommitted version edit is not a change in base..head", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const sha = revParseHead(repoDir);
      fs.writeFileSync(path.join(repoDir, "plugin.json"), JSON.stringify({ name: "digismith", version: "0.24.0-beta" }));

      expect(versionChangedSince(sha, sha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("throws a clear error when head does not exist", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);

      expect(() =>
        versionChangedSince(baseSha, "0000000000000000000000000000000000000000", "plugin.json", repoDir),
      ).toThrow("git show failed");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("bumpTypeSince", () => {
  it("returns patch when every commit since base is a conventional fix", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "fix(hooks): flush superseded plugin cache versions on reinstall");
      commitMessage(repoDir, "fix(bootstrap,adopt): check Jira credentials at ticket start");

      expect(bumpTypeSince(baseSha, revParseHead(repoDir), repoDir)).toBe("patch");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor when a feat commit is mixed in", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "fix(hooks): flush superseded plugin cache versions");
      commitMessage(repoDir, "feat(preferences): add get/set/clear CLI");

      expect(bumpTypeSince(baseSha, revParseHead(repoDir), repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor when a docs or chore commit is mixed in", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "fix(hooks): flush superseded plugin cache versions");
      commitMessage(repoDir, "docs(backlog): record a finding");

      expect(bumpTypeSince(baseSha, revParseHead(repoDir), repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor for a fixup! commit, not patch", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "fixup! fix(hooks): flush superseded plugin cache versions");

      expect(bumpTypeSince(baseSha, revParseHead(repoDir), repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor for an empty commit range", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);

      expect(bumpTypeSince(baseSha, revParseHead(repoDir), repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("ignores commits after head — a later merge's feat does not change this merge's bump type", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "fix(hooks): this merge's only commit");
      const headSha = revParseHead(repoDir);
      commitMessage(repoDir, "feat(other): another session's later merge");

      expect(bumpTypeSince(baseSha, headSha, repoDir)).toBe("patch");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("main (CLI)", () => {
  it("rejects --base without --head", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      const result = runScript(dir, ["--base", "abc1234"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cannot bump plugin version: missing required flag: --head");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects --head without --base", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      const result = runScript(dir, ["--head", "abc1234"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cannot bump plugin version: missing required flag: --base");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bumps patch when the pinned range is fix-only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const baseSha = revParseHead(dir);
      commitMessage(dir, "fix(hooks): something small");
      const headSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BUMPED 0.23.0-beta -> 0.23.1-beta");
      expect(readPluginVersion(path.join(dir, ".claude-plugin", "plugin.json"))).toBe("0.23.1-beta");
      expect(readPluginVersion(path.join(dir, ".claude-plugin", "marketplace.json"))).toBe("0.23.1-beta");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a delayed run still bumps exactly once, from the version the branch is at now", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const baseSha = revParseHead(dir);
      commitMessage(dir, "fix(hooks): this merge's only commit");
      const headSha = revParseHead(dir);
      // Another session merged and bumped after this merge's head, before this hook ran.
      commitPluginVersion(dir, "0.24.0-beta", "chore: bump plugin version");

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BUMPED 0.24.0-beta -> 0.24.1-beta");
      expect(result.stdout).not.toContain("SKIPPED");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips when this merge's own commits already changed plugin.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const baseSha = revParseHead(dir);
      commitPluginVersion(dir, "0.30.0-beta", "feat: manual version bump inside the branch");
      const headSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^SKIPPED this merge's own commits already changed plugin\.json/);
      expect(readPluginVersion(path.join(dir, ".claude-plugin", "plugin.json"))).toBe("0.30.0-beta");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bumps minor, never skips, when base and head are the same commit — an empty pinned range", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const sha = revParseHead(dir);

      const result = runScript(dir, ["--base", sha, "--head", sha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BUMPED 0.23.0-beta -> 0.24.0-beta");
      expect(result.stdout).not.toContain("SKIPPED");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
