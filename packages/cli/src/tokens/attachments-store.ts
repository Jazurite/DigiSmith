import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_PATTERN, depotRegistryDir } from "./registry.ts";

export interface AttachedRecord { name: string; sha256: string; id: string; attached_at: string }

function fileFor(ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(depotRegistryDir(), `${ticket}.attachments.json`);
}

export function readAttached(ticket: string): AttachedRecord[] {
  try {
    const v = JSON.parse(readFileSync(fileFor(ticket), "utf8"));
    return Array.isArray(v) ? (v as AttachedRecord[]) : [];
  } catch (e) {
    if ((e as Error).message.startsWith("invalid ticket key")) throw e;
    return [];
  }
}

export function recordAttached(ticket: string, rec: AttachedRecord): void {
  const next = [...readAttached(ticket).filter((r) => r.name !== rec.name), rec];
  mkdirSync(depotRegistryDir(), { recursive: true });
  writeFileSync(fileFor(ticket), JSON.stringify(next, null, 2));
}
