// packages/cli/src/run/schema.ts
// The run record types and the small helpers the hook path needs. node:fs and node:path only.
import * as fs from "node:fs";
import * as path from "node:path";

export const RUN_SCHEMA = "nightwatch-run/v1";
export const ROLES = ["builder", "reviewer", "scout", "maestro", "conductor", "other"] as const;
export type Role = (typeof ROLES)[number];
export type RunSource = "auto" | "start";
export type RoleFrom = "herdr" | "identity" | "pending" | "none" | "start";

export type RunRecord = {
  schema: typeof RUN_SCHEMA;
  run: string;
  ticket: string | null;
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
  source: RunSource;
  project: string | null;
  session_id: string | null;
  role_from: RoleFrom | null;
};

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

// A name or id, or null. Anything with spaces or text in it is dropped.
export function plainName(v: unknown): string | null {
  return typeof v === "string" && NAME_RE.test(v) ? v : null;
}

const MANIFEST = path.join(import.meta.dirname, "..", "..", "..", "..", ".claude-plugin", "plugin.json");

export function pluginVersion(): string | null {
  try {
    const v = (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { version?: unknown }).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
