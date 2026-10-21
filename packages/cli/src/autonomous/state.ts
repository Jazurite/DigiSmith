import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dayOf, fmtUtc7 } from "./clock.ts";
import type { Event, EventKind, Lock } from "./types.ts";

const DAY_MS = 24 * 3600_000;
const EVENT_FILE = /^events-\d{4}-\d{2}-\d{2}\.jsonl$/;
const eventFile = (day: string): string => `events-${day}.jsonl`;

export function autonomousDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.AUTONOMOUS_DIR) return env.AUTONOMOUS_DIR;
  return join(env.DIGISMITH_DEPOT_DIR || join(homedir(), ".digismith-depot"), "autonomous");
}

export function atomicWrite(dir: string, name: string, text: string): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export function acquireLock(dir: string, lock: Lock): "acquired" | "busy" {
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "lock.json"), JSON.stringify(lock), { flag: "wx" });
    return "acquired";
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return "busy";
    throw e;
  }
}

export function readLock(dir: string): Lock | null {
  let text: string;
  try {
    text = readFileSync(join(dir, "lock.json"), "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v === "object" && v !== null && typeof (v as Lock).ticket === "string") return v as Lock;
  } catch {
    // fall through: a corrupt lock keeps the scan busy
  }
  return { ticket: "?", taskId: "?", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "" };
}

export function clearLock(dir: string): void {
  rmSync(join(dir, "lock.json"), { force: true });
}

export function readNotes(dir: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(readFileSync(join(dir, "notes.json"), "utf-8"));
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeNotes(dir: string, notes: Record<string, string>): void {
  atomicWrite(dir, "notes.json", `${JSON.stringify(notes, null, 2)}\n`);
}

export function appendEvent(dir: string, now: Date, kind: EventKind, fields: Record<string, unknown> = {}): void {
  mkdirSync(dir, { recursive: true });
  const ev: Event = { ...fields, ts: now.toISOString(), tsUtc7: fmtUtc7(now), kind };
  appendFileSync(join(dir, eventFile(dayOf(now))), `${JSON.stringify(ev)}\n`);
}

export function readEvents(dir: string, fromMs: number, toMs: number): Event[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) throw new Error("readEvents: fromMs and toMs must be finite numbers");
  if (toMs - fromMs > 400 * DAY_MS) throw new Error("readEvents: the window is longer than 400 days");
  const out: Event[] = [];
  const last = dayOf(new Date(toMs));
  for (let t = fromMs; ; t += DAY_MS) {
    const day = dayOf(new Date(t));
    if (day > last) break;
    let text = "";
    try {
      text = readFileSync(join(dir, eventFile(day)), "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as Event;
        const ms = Date.parse(ev.ts);
        if (Number.isFinite(ms) && ms >= fromMs && ms < toMs) out.push(ev);
      } catch {
        // skip a bad line
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

export function readLastReport(dir: string): Date | null {
  try {
    const v = JSON.parse(readFileSync(join(dir, "last-report.json"), "utf-8")) as { at?: unknown };
    if (typeof v.at !== "string") return null;
    const d = new Date(v.at);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function writeLastReport(dir: string, at: Date): void {
  atomicWrite(dir, "last-report.json", `${JSON.stringify({ at: at.toISOString() })}\n`);
}

/** The day file names in `dir`, oldest first; a missing dir gives none. */
function eventFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => EVENT_FILE.test(f)).sort();
  } catch {
    return [];
  }
}

/** The valid events of one day file, in file order; null when the file cannot be read. */
function readEventFile(dir: string, f: string): Event[] | null {
  let text: string;
  try {
    text = readFileSync(join(dir, f), "utf-8");
  } catch {
    return null;
  }
  const out: Event[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as Event;
      if (Number.isFinite(Date.parse(ev.ts))) out.push(ev);
    } catch {
      // skip a bad line
    }
  }
  return out;
}

/** The newest event whose kind is in `kinds`: day files newest first, stops at the first file with a match; no window limit. */
export function newestEvent(dir: string, kinds: readonly EventKind[]): Event | null {
  const want = new Set<string>(kinds);
  for (const f of eventFiles(dir).reverse()) {
    let best: Event | null = null;
    for (const ev of readEventFile(dir, f) ?? []) {
      if (want.has(ev.kind) && (best === null || Date.parse(ev.ts) >= Date.parse(best.ts))) best = ev;
    }
    if (best) return best;
  }
  return null;
}

/** The first valid event of the oldest day file that has one; an unreadable file is skipped. */
export function firstEvent(dir: string): Event | null {
  for (const f of eventFiles(dir)) {
    const first = readEventFile(dir, f)?.[0];
    if (first) return first;
  }
  return null;
}
