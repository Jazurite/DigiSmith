import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EventName, Signoff } from "./types.ts";

export interface GateRecord { event: EventName; answer?: "yes" | "no"; quote: string; by: string; at: string }
export interface PendingWrite { to: string; start?: string; due?: string; comment?: string }
export interface LogEntry { at: string; event: string; by: string; outcome: "applied" | "refused" | "noop" | "pending" | "recorded"; note: string }

export interface StewardState {
  schema_version: 1;
  ticket: string;
  tracker: string;
  status_written: string | null;
  status_seen: string | null;
  start_written: string | null;
  due_written: string | null;
  signoff: Signoff;
  merged: { sha: string | null; at: string } | null;
  gates: GateRecord[];
  applied: string[];
  pending: PendingWrite[];
  sessions: string[];
  log: LogEntry[];
  closed_at: string | null;
}

const TICKET_PATTERN = /^[A-Za-z0-9_-]+$/;
const AFTER_REVIEW = ["acceptance", "release", "done", "documented"];

export function stewardDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DIGISMITH_STEWARD_DIR) return env.DIGISMITH_STEWARD_DIR;
  return join(env.DIGISMITH_DEPOT_DIR || join(homedir(), ".digismith-depot"), "steward");
}

function fileOf(dir: string, ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(dir, `${ticket}.json`);
}

export function newState(ticket: string, tracker: string): StewardState {
  return {
    schema_version: 1, ticket, tracker, status_written: null, status_seen: null, start_written: null,
    due_written: null, signoff: null, merged: null, gates: [], applied: [], pending: [], sessions: [], log: [], closed_at: null,
  };
}

function isState(v: unknown, ticket: string): v is StewardState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return s.schema_version === 1 && s.ticket === ticket && Array.isArray(s.gates) && Array.isArray(s.applied)
    && Array.isArray(s.pending) && Array.isArray(s.sessions) && Array.isArray(s.log);
}

/** A file that does not parse, or does not match this ticket and schema, is moved aside (never deleted) and reads as absent. */
export function readState(dir: string, ticket: string): StewardState | null {
  const file = fileOf(dir, ticket);
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    if (isState(parsed, ticket)) return parsed;
  } catch {
    // falls through to the move-aside below
  }
  renameSync(file, `${file}.bad`);
  return null;
}

export function writeState(dir: string, state: StewardState): void {
  const file = fileOf(dir, state.ticket);
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file);
}

export interface LockOptions { waitMs: number; staleMs: number; pollMs: number }
export const DEFAULT_LOCK: LockOptions = { waitMs: 5000, staleMs: 60_000, pollMs: 50 };

/** One call at a time per ticket. The lock file is the Steward's own file, so a stale one may be taken over. */
export async function withLock<T>(
  dir: string, ticket: string, fn: () => Promise<T>, opts: LockOptions = DEFAULT_LOCK,
): Promise<{ locked: true; value: T } | { locked: false }> {
  mkdirSync(dir, { recursive: true });
  const lock = `${fileOf(dir, ticket)}.lock`;
  const deadline = Date.now() + opts.waitMs;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > opts.staleMs) {
          rmSync(lock, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) return { locked: false };
      await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
    }
  }
  try {
    return { locked: true, value: await fn() };
  } finally {
    rmSync(lock, { force: true });
  }
}

/** ClickUp wins. A ticket already past review gets a placeholder merge, because the real sha is unknown. */
export function rebuildState(
  ticket: string, tracker: string,
  snap: { status: string; signoff: Signoff; startDate: string | null; dueDate: string | null },
  sessionIds: string[],
): StewardState {
  const s = newState(ticket, tracker);
  s.status_written = snap.status;
  s.status_seen = snap.status;
  s.start_written = snap.startDate;
  s.due_written = snap.dueDate;
  s.signoff = snap.signoff;
  s.sessions = [...sessionIds];
  if (AFTER_REVIEW.includes(snap.status)) s.merged = { sha: null, at: "rebuilt" };
  return s;
}
