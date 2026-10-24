import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { isSafe, runsDir } from "./paths.ts";
import { pluginVersion, ROLES, RUN_SCHEMA, type Role, type RunRecord } from "./schema.ts";
import { repoInfo } from "./repo-info.ts";

export { ROLES, RUN_SCHEMA };
export type { Role, RunRecord };

export type StartInput = {
  ticket: string;
  role: string;
  order: string;
  seat?: string;
  model?: string;
  worktree?: string;
  branch?: string;
  baseSha?: string;
  workspace?: string;
  tab?: string;
  pane?: string;
  budget?: string;
};

function git(cwd: string, ...args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

function currentBranch(cwd: string): string | null {
  const b = git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  return b === "HEAD" ? null : b;
}

function parseBudget(raw: string | undefined): Record<string, unknown> | null {
  if (raw === undefined) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error("budget must be a JSON object");
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("budget must be a JSON object");
  return v as Record<string, unknown>;
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
}

// Writes run.json once and returns the record. The id is new for every call: the directory is made without
// recursive, so an id that exists is never taken again.
export function createRun(input: StartInput, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): RunRecord {
  if (!isSafe(input.ticket)) throw new Error(`ticket "${input.ticket}" is not a safe key`);
  if (!(ROLES as readonly string[]).includes(input.role)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
  const budget = parseBudget(input.budget);
  const wt = input.worktree && fs.existsSync(input.worktree) ? input.worktree : null;
  const base: Pick<RunRecord, "schema" | "ticket" | "role"> = { schema: RUN_SCHEMA, ticket: input.ticket, role: input.role as Role };
  const rest = {
    order: input.order,
    seat: input.seat ?? null,
    model: input.model ?? null,
    plugin_version: pluginVersion(),
    base_sha: input.baseSha ?? (wt ? git(wt, "rev-parse", "HEAD") : null),
    branch: input.branch ?? (wt ? currentBranch(wt) : null),
    worktree: input.worktree ?? null,
    herdr: { workspace: input.workspace ?? null, tab: input.tab ?? null, pane: input.pane ?? null },
    budget,
    created_at: now.toISOString(),
    source: "start" as const,
    project: repoInfo(input.worktree ?? process.cwd()).project,
    session_id: null,
    role_from: "start" as const,
  };
  const ticketDir = path.join(runsDir(env), input.ticket);
  fs.mkdirSync(ticketDir, { recursive: true });
  for (let attempt = 0; attempt < 20; attempt++) {
    const run = `${input.role}-${stamp(now)}-${crypto.randomBytes(3).toString("hex")}`;
    const dir = path.join(ticketDir, run);
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    const record: RunRecord = { ...base, run, ...rest };
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    return record;
  }
  throw new Error("could not find a free run id");
}

const DEFAULTS = { source: "start", project: null, session_id: null, role_from: null } as const;

// An old record has no source, project, session_id or role_from: they read as start, null, null, null.
export function readRun(runDir: string): RunRecord {
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")) as RunRecord;
  return { ...DEFAULTS, ...raw };
}

// The labeller's one edit of an automatic run: a temp file, then an atomic rename, so a reader sees the old or the new file.
export function rewriteRun(runDir: string, record: RunRecord): void {
  const tmp = path.join(runDir, `run.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
  fs.renameSync(tmp, path.join(runDir, "run.json"));
}
