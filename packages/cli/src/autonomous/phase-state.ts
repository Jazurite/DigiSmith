import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PHASES, TICKET_RE, type Phase, type TicketState } from "./phase-types.ts";

const lockPath = (dir: string) => join(dir, "lock.json");
export type StateRead = { kind: "none" } | { kind: "corrupt" } | { kind: "ok"; state: TicketState };

function parseRaw(dir: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(readFileSync(lockPath(dir), "utf8"));
    return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readPhaseState(dir: string): StateRead {
  if (!existsSync(lockPath(dir))) return { kind: "none" };
  const raw = parseRaw(dir);
  if (raw === null || typeof raw.ticket !== "string" || !TICKET_RE.test(raw.ticket) || typeof raw.claimedAt !== "string") return { kind: "corrupt" };
  const phase = PHASES.includes(raw.phase as Phase) ? (raw.phase as Phase) : "claimed";
  const runs = (raw.runs ?? {}) as { builder?: unknown };
  return { kind: "ok", state: {
    ticket: raw.ticket,
    claimedAt: raw.claimedAt,
    phase,
    phaseStartedAt: typeof raw.phaseStartedAt === "string" ? raw.phaseStartedAt : raw.claimedAt,
    attempt: typeof raw.attempt === "number" && Number.isInteger(raw.attempt) && raw.attempt >= 1 ? raw.attempt : 1,
    runs: { builder: typeof runs.builder === "string" ? runs.builder : null },
  } };
}

export function writePhaseState(dir: string, patch: Partial<Pick<TicketState, "phase" | "phaseStartedAt" | "attempt" | "runs">>): void {
  const raw = parseRaw(dir);
  if (raw === null) throw new Error("lock.json is missing or corrupt");
  const tmp = `${lockPath(dir)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...raw, ...patch }));
  renameSync(tmp, lockPath(dir));
}
