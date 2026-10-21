import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const EVENT_SCHEMA = "nightwatch-event/v1";
export const HOOK_TYPES = ["started", "blocked", "tool", "turn_end", "ended"] as const;
export const CONDUCTOR_TYPES = ["review_ready", "merged", "pushed", "lost"] as const;
export type EventType = (typeof HOOK_TYPES)[number] | (typeof CONDUCTOR_TYPES)[number];

export type EventLine = { schema: string; seq: number; ts: string; run: string; type: string; data: Record<string, unknown> };

// A lock with no readable owner file this old was left by a crash between mkdir and the owner write, or made by hand.
const STALE_MS = 1000;
// A lock this old is broken whatever its pid says (guards against pid reuse).
const MAX_HOLD_MS = 30_000;

// Seams that exist for the tests only.
export const _testHooks: { beforeBreakRename?: () => void; beforeOwnerWrite?: () => void; beforeOwnerCheck?: () => void } = {};

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readOwner(lockDir: string): string | null {
  try {
    return fs.readFileSync(path.join(lockDir, "owner"), "utf8");
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

// Stale: holder pid gone, or no readable owner and older than STALE_MS, or older than MAX_HOLD_MS.
function isStale(owner: string | null, ageMs: number): boolean {
  if (ageMs > MAX_HOLD_MS) return true;
  const pid = owner === null ? Number.NaN : Number.parseInt(owner.split(":")[0], 10);
  if (Number.isInteger(pid) && pid > 0) return !pidAlive(pid);
  return ageMs > STALE_MS;
}

// Removes aside directories that an earlier breaker dropped.
function sweep(lockDir: string): void {
  try {
    const parent = path.dirname(lockDir);
    const prefix = `${path.basename(lockDir)}.stale-`;
    for (const name of fs.readdirSync(parent)) {
      if (!name.startsWith(prefix)) continue;
      try {
        const p = path.join(parent, name);
        if (Date.now() - fs.statSync(p).mtimeMs > MAX_HOLD_MS) fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  } catch {
    /* best effort */
  }
}

// Tries to break the lock if it is stale. Moves it aside first, then checks that the moved directory is the one
// that was seen as stale; a fresh lock that got moved is put back, never deleted.
// A very small window remains: a process paused between two adjacent syscalls while two others act can still let
// a fresh lock be missing from `lock` for a moment. That is accepted; the holder narrows it by re-reading its
// owner token right before it writes (appendEvent).
function tryBreak(lockDir: string): void {
  let seen: string | null;
  let ageMs: number;
  try {
    seen = readOwner(lockDir);
    ageMs = Date.now() - fs.statSync(lockDir).mtimeMs;
  } catch {
    return; // released or broken by someone else
  }
  if (!isStale(seen, ageMs)) return;
  _testHooks.beforeBreakRename?.();
  const aside = `${lockDir}.stale-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    fs.renameSync(lockDir, aside);
  } catch {
    return;
  }
  const moved = readOwner(aside);
  let same: boolean;
  if (seen !== null || moved !== null) {
    same = moved === seen;
  } else {
    try {
      same = Date.now() - fs.statSync(aside).mtimeMs > STALE_MS;
    } catch {
      same = false;
    }
  }
  if (same) {
    fs.rmSync(aside, { recursive: true, force: true });
    return;
  }
  try {
    fs.renameSync(aside, lockDir);
  } catch {
    /* the name is taken: leave the aside directory for the sweep */
  }
}

// Removes the directory at lockDir only when it is still the one we made (same dev and ino).
function removeIfSame(lockDir: string, ours: fs.Stats | null): void {
  try {
    const now = fs.statSync(lockDir);
    if (ours !== null && now.dev === ours.dev && now.ino === ours.ino) fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* gone already */
  }
}

// Returns the owner content ("<pid>:<token>") on success, null on timeout.
function acquire(lockDir: string, waitMs: number): string | null {
  const deadline = Date.now() + waitMs;
  sweep(lockDir);
  for (;;) {
    let made = false;
    let ours: fs.Stats | null = null;
    try {
      fs.mkdirSync(lockDir);
      made = true;
      ours = fs.statSync(lockDir);
      const owner = `${process.pid}:${randomBytes(8).toString("hex")}`;
      _testHooks.beforeOwnerWrite?.();
      fs.writeFileSync(path.join(lockDir, "owner"), owner);
      return owner;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (made && code !== "ENOENT") {
        removeIfSame(lockDir, ours);
        throw e;
      }
      // ENOENT on the owner write: a breaker moved our fresh lock aside; it puts it back or drops it. Loop again.
      if (!made && code !== "EEXIST") throw e;
    }
    tryBreak(lockDir);
    if (Date.now() >= deadline) return null;
    sleep(5);
  }
}

// Removes the lock only when it still carries our owner content.
function release(lockDir: string, owner: string): void {
  try {
    if (readOwner(lockDir) === owner) fs.rmSync(lockDir, { recursive: true, force: true });
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
  const owner = acquire(lockDir, waitMs);
  if (owner === null) throw new Error("lock timeout");
  try {
    _testHooks.beforeOwnerCheck?.();
    if (readOwner(lockDir) !== owner) throw new Error("lock lost");
    const line: EventLine = { schema: EVENT_SCHEMA, seq: lastSeq(runDir) + 1, ts: new Date().toISOString(), run, type, data };
    // Reserve the number first: a crash between the two writes leaves a gap, never a duplicate.
    fs.writeFileSync(path.join(runDir, "seq"), String(line.seq));
    fs.appendFileSync(path.join(runDir, "events.jsonl"), JSON.stringify(line) + "\n");
    return line;
  } finally {
    release(lockDir, owner);
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
