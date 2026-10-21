import { execFileSync } from "node:child_process";

/** Runs git in cwd and returns stdout. Throws on a non-zero exit. */
export type Git = (cwd: string, args: string[]) => string;

export const realGit: Git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
