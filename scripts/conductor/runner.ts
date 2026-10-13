// All herdr, git and ssh calls of the consult go through one Runner, and the read-only guard sits in front of it.
import { execFile } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (cmd: string, args: string[], opts?: { timeoutMs?: number; cwd?: string }) => Promise<RunResult>;

export function execRunner(cmd: string, args: string[], opts: { timeoutMs?: number; cwd?: string } = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf-8" }, (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, stdout, stderr });
      const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
      if (e.code === "ENOENT") return resolve({ code: 127, stdout: "", stderr: `ENOENT: ${cmd} not found` });
      if (e.killed) return resolve({ code: 124, stdout, stderr: `timed out after ${timeoutMs} ms` });
      resolve({ code: typeof e.code === "number" ? e.code : 1, stdout, stderr });
    });
  });
}

const refuse = (what: string): never => {
  throw new Error(`refused: ${what}`);
};

const TARGET = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;
const REPO = /^(\$HOME|~)?(\/[A-Za-z0-9._-]+)+$/;
const NAME = /^[A-Za-z0-9._-]+$/;
const SINCE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const LABEL = /^[A-Za-z0-9._-]+$/;

export interface SshStateOpts {
  target: string;
  repo: string;
  project: string;
  conductor: string;
  since?: string;
}

/** The ONE ssh command the consult may run: the same read-only state script on the Workbox. */
export function sshStateArgs(o: SshStateOpts): string[] {
  if (!TARGET.test(o.target)) refuse(`ssh target ${JSON.stringify(o.target)}`);
  if (!REPO.test(o.repo)) refuse(`remote repo path ${JSON.stringify(o.repo)}`);
  if (!NAME.test(o.project)) refuse(`project ${JSON.stringify(o.project)}`);
  if (!NAME.test(o.conductor)) refuse(`conductor ${JSON.stringify(o.conductor)}`);
  if (o.since !== undefined && !SINCE.test(o.since)) refuse(`since ${JSON.stringify(o.since)}`);
  return [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", o.target,
    "node", "--experimental-strip-types", `${o.repo}/scripts/conductor/cli.ts`,
    "state", "--json", "--project", o.project, "--conductor", o.conductor,
    ...(o.since ? ["--since", o.since] : []),
  ];
}

function sameArgs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function checkSsh(args: string[]): void {
  const target = args[4] ?? "";
  const script = args[7] ?? "";
  const suffix = "/scripts/conductor/cli.ts";
  const repo = script.endsWith(suffix) ? script.slice(0, -suffix.length) : "";
  const opt = (flag: string) => {
    const i = args.indexOf(flag, 8);
    return i >= 0 ? args[i + 1] : undefined;
  };
  let rebuilt: string[] = [];
  try {
    rebuilt = sshStateArgs({ target, repo, project: opt("--project") ?? "", conductor: opt("--conductor") ?? "", since: opt("--since") });
  } catch {
    refuse("ssh command is not the fixed state form");
  }
  if (!sameArgs(args, rebuilt)) refuse("ssh command is not the fixed state form");
}

function checkHerdr(args: string[]): void {
  let a = args;
  while (a[0] === "--session" || a[0] === "--machine") {
    if (!a[1] || !LABEL.test(a[1])) refuse(`herdr ${a[0]} value`);
    a = a.slice(2);
  }
  const [group, verb] = a;
  if (group === "status") return;
  if (group === "agent" && ["list", "get", "read"].includes(verb)) return;
  if (group === "pane" && ["list", "get", "read"].includes(verb)) return;
  if (group === "tab" && verb === "list") return;
  refuse(`herdr ${a.slice(0, 2).join(" ")} (not read-only)`);
}

/** Observer-grade guard: only reads can pass; a refusal happens before anything runs. */
export function readOnlyRunner(inner: Runner): Runner {
  return async (cmd, args, opts) => {
    if (cmd === "herdr") checkHerdr(args);
    else if (cmd === "git") {
      if (!["log", "rev-parse"].includes(args[0])) refuse(`git ${args[0] ?? ""} (not read-only)`);
    } else if (cmd === "ssh") checkSsh(args);
    else refuse(`command ${cmd}`);
    return inner(cmd, args, opts);
  };
}
