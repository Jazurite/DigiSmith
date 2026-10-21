import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "./state.ts";

export interface Breaker { open: boolean; streak: number; failed: string[]; openedAt: string | null }

const CLOSED = (): Breaker => ({ open: false, streak: 0, failed: [], openedAt: null });
const NAME = "breaker.json";

/** No file: closed. A file that does not parse (or has the wrong shape): open, so a damaged breaker fails closed. */
export function readBreaker(dir: string): Breaker {
  let text: string;
  try {
    text = readFileSync(join(dir, NAME), "utf8");
  } catch {
    return CLOSED();
  }
  try {
    const b = JSON.parse(text) as Partial<Breaker>;
    if (typeof b.open !== "boolean" || typeof b.streak !== "number" || !Array.isArray(b.failed)) throw new Error("shape");
    return { open: b.open, streak: b.streak, failed: b.failed.map(String), openedAt: typeof b.openedAt === "string" ? b.openedAt : null };
  } catch {
    return { open: true, streak: 0, failed: [], openedAt: null };
  }
}

export const isOpen = (dir: string): boolean => readBreaker(dir).open;

function write(dir: string, b: Breaker): void {
  atomicWrite(dir, NAME, `${JSON.stringify(b, null, 2)}\n`);
}

/** Counts every failed release; a merge resets the streak; stopped and awaiting-jack change nothing. */
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
