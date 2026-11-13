import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
  try {
    const v = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(v) ? v.filter(isRecord) : [];
  } catch {
    return [];
  }
}

export function recordAttached(ticket: string, rec: AttachedRecord): void {
  const file = fileFor(ticket);
  const next = [...readAttached(ticket).filter((r) => r.name !== rec.name), rec];
  mkdirSync(depotRegistryDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, file);
}
