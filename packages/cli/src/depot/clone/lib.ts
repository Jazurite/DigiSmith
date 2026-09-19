import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_DEPOT_REPO_PATH = path.join(os.homedir(), ".digismith-depot", "repo");
export const DEFAULT_DEPOT_REMOTE = "git@github.com:Jazurite/DigiSmith.git";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runGit(args: string[], cwd?: string): CommandResult {
  const result = spawnSync("git", args, { encoding: "utf-8", cwd });
  const stderr = result.stderr ?? (result.error ? result.error.message : "");
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr };
}

export function cloneExists(repoPath: string = DEFAULT_DEPOT_REPO_PATH): boolean {
  return fs.existsSync(path.join(repoPath, ".git"));
}

export function ensureClone(
  repoPath: string = DEFAULT_DEPOT_REPO_PATH,
  remote: string = DEFAULT_DEPOT_REMOTE
): CommandResult {
  if (cloneExists(repoPath)) {
    return { status: 0, stdout: "already present", stderr: "" };
  }
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  const clone = runGit(["clone", "--filter=blob:none", "--no-checkout", remote, repoPath]);
  if (clone.status !== 0) return clone;

  // Use gitignore-style sparse-checkout (not cone mode) to support simple directory patterns
  const init = runGit(["sparse-checkout", "init", "--no-cone"], repoPath);
  if (init.status !== 0) return init;

  // Direct file write is more portable than git sparse-checkout set across git versions
  const gitDir = path.join(repoPath, ".git");
  const sparseCheckoutFile = path.join(gitDir, "info", "sparse-checkout");
  fs.mkdirSync(path.dirname(sparseCheckoutFile), { recursive: true });
  fs.writeFileSync(sparseCheckoutFile, "packages\n");

  return runGit(["checkout", "main"], repoPath);
}

export function refreshClone(
  repoPath: string = DEFAULT_DEPOT_REPO_PATH,
  remote: string = DEFAULT_DEPOT_REMOTE
): CommandResult {
  if (!cloneExists(repoPath)) {
    return ensureClone(repoPath, remote);
  }
  const fetch = runGit(["fetch", "--all", "--prune", "--tags", "-q"], repoPath);
  if (fetch.status !== 0) return fetch;
  const checkout = runGit(["checkout", "main"], repoPath);
  if (checkout.status !== 0) return checkout;
  return runGit(["reset", "--hard", "origin/main"], repoPath);
}
