import { execFile } from "node:child_process";
import { tmpdir } from "node:os";

export const MODEL_ID = "claude-haiku-5-5";
const TIMEOUT_MS = 60_000;

export type ExecFn = (cmd: string, args: string[], opts: { input: string; cwd: string; timeout: number }) => Promise<{ stdout: string }>;

const realExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: 4_000_000 }, (err, stdout) =>
      err ? reject(err) : resolve({ stdout: String(stdout) }));
    child.stdin?.end(opts.input);
  });

/** One headless call to the small model. No tools; the working directory is the temp folder so no project file loads. */
export function claudeRunner(exec: ExecFn = realExec): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const { stdout } = await exec("claude", ["-p", "--model", MODEL_ID, "--output-format", "json", "--tools", ""], {
      input: prompt, cwd: tmpdir(), timeout: TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout) as { result?: unknown; is_error?: unknown };
    if (parsed.is_error === true) throw new Error(`claude reported an error: ${String(parsed.result)}`);
    if (typeof parsed.result !== "string") throw new Error("claude output has no result string");
    return parsed.result;
  };
}
