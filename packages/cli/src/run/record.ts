import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { isSafe, runsDir } from "./paths.ts";

export const RUN_SCHEMA = "nightwatch-run/v1";
export const ROLES = ["builder", "reviewer", "scout", "other"] as const;
export type Role = (typeof ROLES)[number];

export type RunRecord = {
  schema: typeof RUN_SCHEMA;
  run: string;
  ticket: string;
  role: Role;
  order: string | null;
  seat: string | null;
  model: string | null;
  plugin_version: string | null;
  base_sha: string | null;
  branch: string | null;
  worktree: string | null;
  herdr: { workspace: string | null; tab: string | null; pane: string | null };
  budget: Record<string, unknown> | null;
  created_at: string;
};

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

const MANIFEST = path.join(import.meta.dirname, "..", "..", "..", "..", ".claude-plugin", "plugin.json");

function pluginVersion(): string | null {
  try {
    const v = (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { version?: unknown }).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

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

export function readRun(runDir: string): RunRecord {
  return JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")) as RunRecord;
}
