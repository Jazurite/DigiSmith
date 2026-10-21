import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "./state.ts";

/** problem: a plain sentence saying why the breaker reads open from a damaged file; null when the file is fine. */
export interface Breaker { open: boolean; streak: number; failed: string[]; openedAt: string | null; problem: string | null }

const CLOSED = (): Breaker => ({ open: false, streak: 0, failed: [], openedAt: null, problem: null });
const DAMAGED = (problem: string): Breaker => ({ open: true, streak: 0, failed: [], openedAt: null, problem });
const NAME = "breaker.json";

const errCode = (e: unknown): string => (e as NodeJS.ErrnoException | null)?.code ?? "unknown error";

/**
 * No file (ENOENT): closed. Any other read error, or a file that does not parse or has the wrong shape:
 * open, so a damaged breaker fails closed. The caller reads `problem` to say why.
 */
export function readBreaker(dir: string): Breaker {
  let text: string;
  try {
    text = readFileSync(join(dir, NAME), "utf8");
  } catch (e) {
    if (errCode(e) === "ENOENT") return CLOSED();
    return DAMAGED(`${NAME} cannot be read: ${errCode(e)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DAMAGED(`${NAME} does not parse`);
  }
  if (!isShape(parsed)) return DAMAGED(`${NAME} has the wrong shape`);
  return { open: parsed.open, streak: parsed.streak, failed: parsed.failed, openedAt: parsed.openedAt, problem: null };
}

function isShape(v: unknown): v is Omit<Breaker, "problem"> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.open === "boolean"
    && typeof o.streak === "number"
    && Array.isArray(o.failed) && o.failed.every((t) => typeof t === "string")
    && (o.openedAt === null || typeof o.openedAt === "string");
}

export const isOpen = (dir: string): boolean => readBreaker(dir).open;

/** Writes the five stored fields only; `problem` describes a read and is never persisted. */
function write(dir: string, b: Breaker): void {
  atomicWrite(dir, NAME, `${JSON.stringify({ open: b.open, streak: b.streak, failed: b.failed, openedAt: b.openedAt }, null, 2)}\n`);
}

/** Counts every failed release; a merge resets the streak (open is only changed by closeBreaker or by opening); stopped and awaiting-jack change nothing. */
export function recordRelease(
  dir: string,
  a: { ticket: string; result: "merged" | "failed" | "stopped" | "awaiting-jack" },
  now: Date,
): { opened: boolean; breaker: Breaker } {
  const b = readBreaker(dir);
  if (a.result === "merged") {
    const n: Breaker = { ...b, streak: 0, failed: [] };
    write(dir, n);
    return { opened: false, breaker: n };
  }
  if (a.result !== "failed") return { opened: false, breaker: b };
  const n: Breaker = { ...b, streak: b.streak + 1, failed: [...b.failed, a.ticket] };
  let opened = false;
  if (n.streak >= 2 && !n.open) {
    n.open = true;
    n.openedAt = now.toISOString();
    opened = true;
  }
  write(dir, n);
  return { opened, breaker: n };
}

export function closeBreaker(dir: string): void {
  write(dir, CLOSED());
}
