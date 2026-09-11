import { spawnSync } from "node:child_process";
import type { SshCommand } from "./checks.ts";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runSshCommand(cmd: SshCommand): CommandResult {
  const result = spawnSync(cmd.command, cmd.args, { encoding: "utf-8", timeout: 30_000 });
  const stderr = result.stderr ?? (result.error ? result.error.message : "");
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr };
}
