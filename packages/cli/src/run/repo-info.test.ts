import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { repoInfo, safeName, ticketOfBranch } from "./repo-info.ts";

let tmp: string;
beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nw-repo-"))); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function mainRepo(name: string, branch: string | null): string {
  const root = path.join(tmp, name);
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "HEAD"), branch ? `ref: refs/heads/${branch}\n` : "0123456789abcdef0123456789abcdef01234567\n");
  return root;
}

describe("repoInfo", () => {
  it("reads a main checkout from a sub folder", () => {
    const root = mainRepo("DigiSmith", "main");
    fs.mkdirSync(path.join(root, "packages", "cli"), { recursive: true });
    expect(repoInfo(path.join(root, "packages", "cli"))).toEqual({ project: "DigiSmith", root, branch: "main", worktree: null });
  });
  it("reads a linked worktree: project from the main root, branch from the worktree HEAD", () => {
    const root = mainRepo("DigiSmith", "main");
    const gitDir = path.join(root, ".git", "worktrees", "dgs-598");
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/DGS-598__every-session-a-run\n");
    const wt = path.join(root, ".worktrees", "dgs-598");
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
    expect(repoInfo(wt)).toEqual({ project: "DigiSmith", root, branch: "DGS-598__every-session-a-run", worktree: wt });
  });
  it("gives a null branch on a detached HEAD", () => {
    const root = mainRepo("emma-theme", null);
    expect(repoInfo(root).branch).toBeNull();
  });
  it("uses the folder name when there is no .git, and makes it safe", () => {
    const dir = path.join(tmp, "My Notes (old)");
    fs.mkdirSync(dir);
    expect(repoInfo(dir)).toEqual({ project: "My-Notes-old-", root: null, branch: null, worktree: null });
  });
  it("gives project unknown for a missing or relative cwd", () => {
    expect(repoInfo(undefined).project).toBe("unknown");
    expect(repoInfo("relative/path").project).toBe("unknown");
    expect(repoInfo(42).project).toBe("unknown");
  });
});

describe("safeName", () => {
  it("keeps safe names and repairs others", () => {
    expect(safeName("DigiSmith")).toBe("DigiSmith");
    expect(safeName("a b/c")).toBe("a-b-c");
    expect(safeName("..hidden")).toBe("hidden");
    expect(safeName("")).toBe("unknown");
  });
});

describe("ticketOfBranch", () => {
  it("takes the key before __", () => {
    expect(ticketOfBranch("DGS-598__every-session-a-run")).toBe("DGS-598");
    expect(ticketOfBranch("EMKT-9001__fix")).toBe("EMKT-9001");
    expect(ticketOfBranch("main")).toBeNull();
    expect(ticketOfBranch("dgs-598__x")).toBeNull();
    expect(ticketOfBranch(null)).toBeNull();
  });
});
