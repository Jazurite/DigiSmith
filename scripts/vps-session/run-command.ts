import { spawnSync } from "node:child_process";
import type { SshCommand } from "./checks.ts";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runSshCommand(cmd: SshCommand): CommandResult {
  const result = spawnSync(cmd.command, cmd.args, { encoding: "utf-8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
