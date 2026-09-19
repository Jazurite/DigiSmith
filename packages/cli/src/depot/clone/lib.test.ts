import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { cloneExists, ensureClone, refreshClone } from "./lib.ts";

function git(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
}

function makeBareRemoteWithPackagesFile(dir: string, fileContent: string): { remote: string; workPath: string } {
  const barePath = path.join(dir, "remote.git");
  const workPath = path.join(dir, "work");
  fs.mkdirSync(barePath, { recursive: true });
  fs.mkdirSync(workPath, { recursive: true });
  git(["init", "--bare", "-b", "main", barePath], dir);
  git(["init", "-b", "main", workPath], dir);
  git(["config", "user.email", "test@example.com"], workPath);
  git(["config", "user.name", "Test"], workPath);
  fs.mkdirSync(path.join(workPath, "packages"), { recursive: true });
  fs.writeFileSync(path.join(workPath, "packages", "marker.txt"), fileContent);
  fs.writeFileSync(path.join(workPath, "root-only.txt"), "not in sparse scope");
  git(["add", "."], workPath);
  git(["commit", "-m", "initial"], workPath);
  git(["remote", "add", "origin", barePath], workPath);
  git(["push", "origin", "main"], workPath);
  return { remote: barePath, workPath };
}

describe("clone", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clones a fresh sparse checkout of packages/ only", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");

    expect(cloneExists(target)).toBe(false);
    const result = ensureClone(target, remote);

    expect(result.status).toBe(0);
    expect(cloneExists(target)).toBe(true);
    expect(fs.readFileSync(path.join(target, "packages", "marker.txt"), "utf-8")).toBe("v1");
    expect(fs.existsSync(path.join(target, "root-only.txt"))).toBe(false);
  });

  it("is a no-op when the clone already exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");
    ensureClone(target, remote);

    fs.writeFileSync(path.join(target, "packages", "marker.txt"), "locally-modified");
    const result = ensureClone(target, remote);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(target, "packages", "marker.txt"), "utf-8")).toBe("locally-modified");
  });

  it("refresh pulls new commits and discards local modifications", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote, workPath } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");
    ensureClone(target, remote);

    fs.writeFileSync(path.join(target, "packages", "marker.txt"), "locally-modified");

    fs.writeFileSync(path.join(workPath, "packages", "marker.txt"), "v2");
    git(["add", "."], workPath);
    git(["commit", "-m", "update"], workPath);
    git(["push", "origin", "main"], workPath);

    const result = refreshClone(target, remote);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(target, "packages", "marker.txt"), "utf-8")).toBe("v2");
  });

  it("refresh runs ensure's sequence when the clone doesn't exist yet", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");

    const result = refreshClone(target, remote);

    expect(result.status).toBe(0);
    expect(cloneExists(target)).toBe(true);
  });
});
