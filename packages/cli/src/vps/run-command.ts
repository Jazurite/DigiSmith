import { spawnSync } from "node:child_process";
import type { SshCommand } from "./checks.ts";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

// ssh reserves exit 255 for its own connection-level failures, which it
// reports on stderr. Any other non-zero status came from the remote command,
// and herdr prints its JSON errors to stdout — preferring stderr there could
// surface an unrelated non-fatal ssh warning instead of the real error.
export function describeSshFailure(result: CommandResult): string {
  if (result.status === 255) {
    return result.stderr.trim() || "ssh connection failed";
  }
  return result.stdout.trim() || result.stderr.trim() || "unknown error";
}

export function runSshCommand(cmd: SshCommand): CommandResult {
  const result = spawnSync(cmd.command, cmd.args, { encoding: "utf-8", timeout: 30_000 });
  const stderr = result.stderr ?? (result.error ? result.error.message : "");
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr };
}
