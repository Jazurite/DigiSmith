import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_PATTERN, depotRegistryDir } from "./registry.ts";

export interface AttachedRecord { name: string; sha256: string; id: string; attached_at: string }

function fileFor(ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(depotRegistryDir(), `${ticket}.attachments.json`);
}

function isRecord(r: unknown): r is AttachedRecord {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return ["name", "sha256", "id", "attached_at"].every((k) => typeof o[k] === "string");
}

export function readAttached(ticket: string): AttachedRecord[] {
  const file = fileFor(ticket);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    // ENOTDIR: a parent of the state path is a file, so no state file can exist
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw e;
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isRecord) : [];
  } catch (e) {
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

export function recordAttached(ticket: string, rec: AttachedRecord): void {
  const file = fileFor(ticket);
  const next = [...readAttached(ticket).filter((r) => r.name !== rec.name), rec];
  mkdirSync(depotRegistryDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
