import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const EVENT_SCHEMA = "nightwatch-event/v1";
export const HOOK_TYPES = ["started", "blocked", "tool", "turn_end", "ended"] as const;
export const CONDUCTOR_TYPES = ["review_ready", "merged", "pushed", "lost"] as const;
export type EventType = (typeof HOOK_TYPES)[number] | (typeof CONDUCTOR_TYPES)[number];

export type EventLine = { schema: string; seq: number; ts: string; run: string; type: string; data: Record<string, unknown> };

// A holder keeps the lock for a few milliseconds; a lock this old was left behind by a crash.
const STALE_MS = 1000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Returns the owner token on success, null on timeout.
function acquire(lockDir: string, waitMs: number): string | null {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      const token = randomBytes(8).toString("hex");
      fs.writeFileSync(path.join(lockDir, "owner"), token);
      return token;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    try {
      if (Date.now() - fs.statSync(lockDir).mtimeMs > STALE_MS) {
        // Only one waiter wins the rename; the others throw and loop again.
        const aside = `${lockDir}.stale-${process.pid}-${randomBytes(4).toString("hex")}`;
        fs.renameSync(lockDir, aside);
        if (Date.now() - fs.statSync(aside).mtimeMs > STALE_MS) {
          fs.rmSync(aside, { recursive: true, force: true });
        } else {
          // Another waiter broke the stale lock and took a fresh one between our stat and our rename: put it back.
          try {
            fs.renameSync(aside, lockDir);
          } catch {
            /* the name is taken again: the moved lock is dead, drop it */
            fs.rmSync(aside, { recursive: true, force: true });
          }
        }
        continue;
      }
    } catch {
      /* the holder released it, or another waiter broke it first: try again */
    }
    if (Date.now() >= deadline) return null;
    sleep(5);
  }
}

// Removes the lock only when it still carries our token.
function release(lockDir: string, token: string): void {
  try {
    if (fs.readFileSync(path.join(lockDir, "owner"), "utf8") === token) fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* already gone, or now owned by someone else */
  }
}

function lastSeq(runDir: string): number {
  try {
    const n = Number.parseInt(fs.readFileSync(path.join(runDir, "seq"), "utf8"), 10);
    if (Number.isInteger(n) && n >= 0) return n;
  } catch {
    /* fall through to counting lines */
  }
  try {
    return fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").length;
  } catch {
    return 0;
  }
}

// Appends one event under the run's lock and returns the line. Throws Error("lock timeout") when the lock stays taken.
export function appendEvent(runDir: string, run: string, type: string, data: Record<string, unknown>, waitMs: number): EventLine {
  const lockDir = path.join(runDir, "lock");
  const token = acquire(lockDir, waitMs);
  if (token === null) throw new Error("lock timeout");
  try {
    const line: EventLine = { schema: EVENT_SCHEMA, seq: lastSeq(runDir) + 1, ts: new Date().toISOString(), run, type, data };
    // Reserve the number first: a crash between the two writes leaves a gap, never a duplicate.
    fs.writeFileSync(path.join(runDir, "seq"), String(line.seq));
    fs.appendFileSync(path.join(runDir, "events.jsonl"), JSON.stringify(line) + "\n");
    return line;
  } finally {
    release(lockDir, token);
  }
}

export function readEvents(runDir: string): EventLine[] {
  let text: string;
  try {
    text = fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out: EventLine[] = [];
  for (const l of text.split("\n")) {
    if (l.trim() === "") continue;
    try {
      out.push(JSON.parse(l) as EventLine);
    } catch {
      /* skip a line that does not parse */
    }
  }
  return out;
}
