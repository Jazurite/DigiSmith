import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Away } from "./types.ts";

export function readAway(dir: string): Away | null {
  let text: string;
  try {
    text = readFileSync(join(dir, "away.json"), "utf-8");
  } catch {
    return null;
  }
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Away;
  } catch {
    // fall through: a corrupt away file is treated as not away
  }
  return null;
}

export function writeAway(dir: string, a: Away): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "away.json");
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(a, null, 2)}\n`);
  renameSync(tmp, file);
}

export function isAway(a: Away | null, now: Date): boolean {
  return a !== null && a.away && (a.until === null || now.getTime() < Date.parse(a.until));
}

export function awayExpired(a: Away | null, now: Date): boolean {
  return a !== null && a.away && a.until !== null && now.getTime() >= Date.parse(a.until);
}
