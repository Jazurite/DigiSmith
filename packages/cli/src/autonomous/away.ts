import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "./state.ts";
import type { Away } from "./types.ts";

function isStringOrNullOrAbsent(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string";
}

function isAwayShape(v: unknown): v is Away {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const a = v as Record<string, unknown>;
  return typeof a.away === "boolean"
    && isStringOrNullOrAbsent(a.since)
    && isStringOrNullOrAbsent(a.until)
    && isStringOrNullOrAbsent(a.endedAt);
}

export function readAway(dir: string): Away | null {
  let text: string;
  try {
    text = readFileSync(join(dir, "away.json"), "utf-8");
  } catch {
    return null;
  }
  try {
    const v: unknown = JSON.parse(text);
    if (isAwayShape(v)) {
      return {
        away: v.away,
        since: v.since ?? "",
        until: v.until ?? null,
        endedAt: v.endedAt ?? null,
      };
    }
  } catch {
    // fall through: a corrupt away file is treated as not away
  }
  return null;
}

export function writeAway(dir: string, a: Away): void {
  atomicWrite(dir, "away.json", `${JSON.stringify(a, null, 2)}\n`);
}

export function isAway(a: Away | null, now: Date): boolean {
  return a !== null && a.away && (a.until === null || now.getTime() < Date.parse(a.until));
}

// An unparseable until is expired (not away), so the next scan clears it the way `back` does.
export function awayExpired(a: Away | null, now: Date): boolean {
  if (a === null || !a.away || a.until === null) return false;
  const until = Date.parse(a.until);
  return Number.isNaN(until) || now.getTime() >= until;
}
