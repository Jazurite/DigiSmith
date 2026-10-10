import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Registry, RegistryEntry } from "./types.ts";

const TICKET_PATTERN = /^[A-Za-z0-9_-]+$/;

export function depotRegistryDir(): string {
  return process.env.DIGISMITH_TOKEN_REGISTRY_DIR ?? join(homedir(), ".digismith-depot", "token-registry");
}

function assertTicket(ticket: string): void {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
}

// Interim default: one append-only JSONL file per ticket in the depot. DGS-220 owns the
// final location and may replace this implementation; callers only use Registry.
export function createDepotRegistry(dir: string = depotRegistryDir()): Registry {
  return {
    append(entry: RegistryEntry): void {
      assertTicket(entry.ticket);
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, `${entry.ticket}.jsonl`), `${JSON.stringify(entry)}\n`);
    },
    read(ticket: string): RegistryEntry[] {
      assertTicket(ticket);
      const file = join(dir, `${ticket}.jsonl`);
      if (!existsSync(file)) return [];
      const out: RegistryEntry[] = [];
      for (const raw of readFileSync(file, "utf-8").split("\n")) {
        if (!raw) continue;
        try {
          out.push(JSON.parse(raw) as RegistryEntry);
        } catch {
          // a torn or hand-edited line never breaks a count
        }
      }
      return out;
    },
  };
}
