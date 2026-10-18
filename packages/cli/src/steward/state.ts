import { randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EventName, Signoff } from "./types.ts";

export interface GateRecord { event: EventName; answer?: "yes" | "no"; quote: string; by: string; at: string }
/** A queued move. `from` is the status the ticket had when it was queued; `statusSent` is set once the status write went through; `commented` is set once the comment is posted. */
export interface PendingWrite { to: string; from: string; start?: string; due?: string; comment?: string; commented?: boolean; statusSent?: boolean }
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

function parseFile(file: string, ticket: string): StewardState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    return isState(parsed, ticket) ? parsed : null;
  } catch {
    return null;
  }
}

/** Reads without side effects: an absent or unreadable file is null and stays where it is. */
export function peekState(dir: string, ticket: string): StewardState | null {
  const file = fileOf(dir, ticket);
  return existsSync(file) ? parseFile(file, ticket) : null;
}

/** A file that does not parse, or does not match this ticket and schema, is moved aside (never deleted, never over an earlier .bad) and reads as absent. */
export function readState(dir: string, ticket: string): StewardState | null {
  const file = fileOf(dir, ticket);
  if (!existsSync(file)) return null;
  const state = parseFile(file, ticket);
  if (state) return state;
  let target = `${file}.bad`;
  if (existsSync(target)) {
    const stamp = new Date().toISOString().replace(/:/g, "-");
    target = `${file}.bad-${stamp}`;
    for (let n = 1; existsSync(target); n += 1) target = `${file}.bad-${stamp}-${n}`;
  }
  renameSync(file, target);
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
  const token = randomBytes(8).toString("hex");
  for (;;) {
    try {
      writeFileSync(lock, token, { flag: "wx" });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      let stale = false;
      try {
        stale = Date.now() - statSync(lock).mtimeMs > opts.staleMs;
      } catch {
        continue; // the lock vanished: try to take it
      }
      if (stale) {
        // Move the stale lock to a name only this call knows; a failed rename means another waiter won.
        const aside = `${lock}.stale-${token}`;
        let moved = false;
        try {
          renameSync(lock, aside);
          moved = true;
        } catch {
          // lost the race: keep waiting
        }
        if (moved) {
          let wasStale = true;
          try { wasStale = Date.now() - statSync(aside).mtimeMs > opts.staleMs; } catch { /* gone */ }
          if (wasStale) {
            rmSync(aside, { force: true });
            continue;
          }
          // We moved a fresh lock by mistake: put it back if the name is still free.
          try { linkSync(aside, lock); } catch { /* someone else holds the name now */ }
          rmSync(aside, { force: true });
        }
      }
      if (Date.now() >= deadline) return { locked: false };
      await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
    }
  }
  try {
    return { locked: true, value: await fn() };
  } finally {
    // Free the lock only if it is still ours: a stale takeover may have replaced it.
    try {
      if (readFileSync(lock, "utf-8") === token) rmSync(lock, { force: true });
    } catch {
      // already gone
    }
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
